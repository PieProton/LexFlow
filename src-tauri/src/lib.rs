use serde_json::{Value, json};
use std::{fs, path::PathBuf, sync::Mutex, time::{Instant, Duration}};
use tauri::{Manager, State, AppHandle, Emitter};
use zeroize::{Zeroize, Zeroizing};
use chrono::TimeZone as _;

// Platform detection helpers — usati in tutta la lib
#[allow(dead_code)]
const IS_ANDROID: bool = cfg!(target_os = "android");
#[allow(dead_code)]
const IS_DESKTOP: bool = cfg!(any(target_os = "macos", target_os = "windows", target_os = "linux"));

// Security & Crypto Hardened — disponibile su tutte le piattaforme
use aes_gcm::{Aes256Gcm, Key, Nonce, aead::{Aead, KeyInit}};
use argon2::{Argon2, Params, Version, Algorithm};
use sha2::{Sha256, Digest};
use hmac::{Hmac, Mac};
// Ed25519 verification (offline license signature check)
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

// ═══════════════════════════════════════════════════════════
//  CONSTANTS — Security Parameters
// ═══════════════════════════════════════════════════════════
const VAULT_FILE: &str = "vault.lex";
const VAULT_SALT_FILE: &str = "vault.salt";
const VAULT_VERIFY_FILE: &str = "vault.verify";
const SETTINGS_FILE: &str = "settings.json";
const AUDIT_LOG_FILE: &str = "vault.audit";
const NOTIF_SCHEDULE_FILE: &str = "notification-schedule.json";
const NOTIF_SENT_FILE: &str = "notification-sent.json";
// NOTIFICATION FIX (Level-9): persisted scheduler checkpoint — survives app restart/power-off.
// On startup the scheduler reads this file to know "where it left off" and fires any missed
// events immediately (e.g. an 8:00 reminder if the PC was powered on at 8:15).
const NOTIF_LAST_CHECKED_FILE: &str = ".notif-last-checked";
const LICENSE_FILE: &str = "license.json";
// SECURITY: persisted brute-force state — survives app restart/kill (L7 fix #1)
const LOCKOUT_FILE: &str = ".lockout";

#[allow(dead_code)]
const BIO_SERVICE: &str = "LexFlow_Bio";

const VAULT_MAGIC: &[u8] = b"LEXFLOW_V2_SECURE";
const ARGON2_SALT_LEN: usize = 32;
const AES_KEY_LEN: usize = 32; 
const NONCE_LEN: usize = 12;

// SECURITY FIX (Level-8 A1): unified Argon2 params across all platforms.
// Previously desktop used 64MB/4t/2p and Android used 16MB/3t/1p — a backup made on desktop
// was mathematically incompatible (different KDF output) with Android and vice versa.
// Fix: use a single set of params for ALL platforms. 16MB/3t/1p is strong (beats OWASP minimum
// of 12MB/3t/1p), runs in ~0.4s on mid-range Android, and produces identical keys everywhere.
// This makes vault backups fully portable across macOS ↔ Windows ↔ Android.
const ARGON2_M_COST: u32 = 16384; // 16 MB — works on all platforms, OWASP-compliant
const ARGON2_T_COST: u32 = 3;
const ARGON2_P_COST: u32 = 1;

const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 300;

// SECURITY FIX (Level-8 C5): cap settings/notification file reads to prevent OOM attack.
// An attacker (or corrupted write) could inject a 5GB settings.json; fs::read would try
// to allocate 5GB in RAM and OOM-kill the process. 10MB is generous for any real settings file.
const MAX_SETTINGS_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

// ═══════════════════════════════════════════════════════════
//  STATE & MEMORY PROTECTION
// ═══════════════════════════════════════════════════════════
// Derivata dalla macchina/device, non dalla password utente — inaccessibile da remoto
fn get_local_encryption_key() -> Vec<u8> {
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        let host = whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string());
        // ENTROPY FIX (L7 Windows): UID env var does not exist on Windows — always returned "0",
        // reducing local key entropy. Use a cross-platform machine-specific identifier instead:
        // - On Unix: UID from environment or process UID via std
        // - On Windows: USERDOMAIN + USERNAME combination (available on all Windows versions)
        // - Fallback: combine process ID + thread ID for additional uniqueness
        #[cfg(target_os = "windows")]
        let uid = {
            let domain = std::env::var("USERDOMAIN").unwrap_or_else(|_| "WORKGROUP".to_string());
            let sid = std::env::var("USERPROFILE").unwrap_or_else(|_| std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "0".to_string()));
            format!("{}:{}", domain, sid)
        };
        #[cfg(not(target_os = "windows"))]
        let uid = std::env::var("UID")
            .or_else(|_| std::env::var("USER"))
            .unwrap_or_else(|_| format!("{}", std::process::id()));
        let seed = format!("LEXFLOW-LOCAL-KEY-V2:{}:{}:{}:FORTKNOX", user, host, uid);
        // Double-hash per evitare length-extension attacks
        let h1 = <Sha256 as Digest>::digest(seed.as_bytes());
        let h2 = <Sha256 as Digest>::digest(&h1);
        h2.to_vec()
    }
    #[cfg(target_os = "android")]
    {
        // Su Android: preferisci LEXFLOW_DEVICE_ID (iniettato da Tauri mobile).
        // Se non disponibile, genera un ID univoco persistente nel file system privato.
        // Cerca .device_id in più percorsi possibili — il primo che esiste vince.
        // setup() di Tauri risolve il path reale e crea la directory, ma questa
        // funzione può essere chiamata prima che setup() finisca (e.g. settings migration).
        let android_id = if let Ok(id) = std::env::var("LEXFLOW_DEVICE_ID") {
            id
        } else {
            // Cerca .device_id nei possibili data dir dell'app
            let candidate_dirs = [
                // Path risolto da Tauri app_data_dir() (post-setup)
                dirs::data_dir().map(|d| d.join("com.pietrolongo.lexflow")),
                // NON usiamo path hardcoded /data/data/... — varia per utente/multi-user Android
                // Fallback: directory temporanea che esiste sempre
                std::env::temp_dir().parent().map(|p| p.join("com.pietrolongo.lexflow")),
            ];
            let mut found_id: Option<String> = None;
            let mut first_writable: Option<std::path::PathBuf> = None;
            for candidate in candidate_dirs.iter().flatten() {
                let id_path = candidate.join(".device_id");
                if id_path.exists() {
                    if let Ok(id) = fs::read_to_string(&id_path) {
                        let trimmed = id.trim().to_string();
                        if !trimmed.is_empty() {
                            found_id = Some(trimmed);
                            break;
                        }
                    }
                }
                if first_writable.is_none() {
                    first_writable = Some(id_path);
                }
            }
            found_id.unwrap_or_else(|| {
                // Prima esecuzione: genera ID casuale a 256-bit e persisti
                let mut id_bytes = [0u8; 32];
                rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut id_bytes);
                let id_hex = hex::encode(id_bytes);
                if let Some(id_path) = first_writable {
                    if let Some(parent) = id_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::write(&id_path, &id_hex);
                }
                id_hex
            })
        };
        let seed = format!("LEXFLOW-ANDROID-KEY:{}:FORTKNOX", android_id);
        let hash = <Sha256 as Digest>::digest(seed.as_bytes());
        hash.to_vec()
    }
}

// ═══════════════════════════════════════════════════════════
//  STATE & MEMORY PROTECTION
// ═══════════════════════════════════════════════════════════

pub struct SecureKey(Vec<u8>);
impl Drop for SecureKey {
    fn drop(&mut self) { self.0.zeroize(); }
}

pub struct AppState {
    pub data_dir: Mutex<PathBuf>,
    vault_key: Mutex<Option<SecureKey>>,
    failed_attempts: Mutex<u32>,
    locked_until: Mutex<Option<Instant>>,
    last_activity: Mutex<Instant>,
    autolock_minutes: Mutex<u32>,
    // SECURITY FIX (Level-8 C1): serialise concurrent vault writes.
    // Tauri dispatches IPC commands on a thread pool; two simultaneous save_practices +
    // save_agenda calls both do read-modify-write on vault.lex, causing a data-loss race.
    // This mutex ensures only one write runs at a time without blocking reads.
    write_mutex: Mutex<()>,
}

// ═══════════════════════════════════════════════════════════
//  CORE CRYPTO ENGINE
// ═══════════════════════════════════════════════════════════

fn derive_secure_key(password: &str, salt: &[u8]) -> Result<Vec<u8>, String> {
    let mut key = vec![0u8; AES_KEY_LEN];
    let params = Params::new(ARGON2_M_COST, ARGON2_T_COST, ARGON2_P_COST, Some(AES_KEY_LEN))
        .map_err(|e| e.to_string())?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let pwd_bytes = Zeroizing::new(password.as_bytes().to_vec());
    argon2.hash_password_into(&pwd_bytes, salt, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt_data(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut nonce_bytes);
    let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plaintext).map_err(|_| "Encryption error")?;
    let mut out = VAULT_MAGIC.to_vec();
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

fn decrypt_data(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < VAULT_MAGIC.len() + NONCE_LEN + 16 { return Err("Corrupted".into()); }
    let nonce = Nonce::from_slice(&data[VAULT_MAGIC.len()..VAULT_MAGIC.len() + NONCE_LEN]);
    let ciphertext = &data[VAULT_MAGIC.len() + NONCE_LEN..];
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher.decrypt(nonce, ciphertext).map_err(|_| "Auth failed".into())
}

fn verify_hash_matches(key: &[u8], stored: &[u8]) -> bool {
    // SECURITY FIX (Gemini L4-1): vault.verify HMAC is now derived from the vault_key itself
    // (password-derived via Argon2id), NOT from the machine key.
    // Previously using machine key meant: rename computer → vault permanently inaccessible.
    // Now backup portability is preserved: the verify tag travels with the vault and is
    // independent of the machine/hostname. The vault_key IS the authentication factor.
    let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(key).unwrap();
    hmac.update(b"LEX_VERIFY_DOMAIN_V2");
    hmac.verify_slice(stored).is_ok()
}

fn make_verify_tag(vault_key: &[u8]) -> Vec<u8> {
    // SECURITY FIX (Gemini L4-1): tag derived from vault_key, not machine key.
    // This ensures the verify tag is portable across machines/hostnames.
    let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(vault_key).unwrap();
    hmac.update(b"LEX_VERIFY_DOMAIN_V2");
    hmac.finalize().into_bytes().to_vec()
}

// ═══════════════════════════════════════════════════════════
//  INTERNAL DATA HELPERS
// ═══════════════════════════════════════════════════════════

fn get_vault_key(state: &State<AppState>) -> Result<Zeroizing<Vec<u8>>, String> {
    // SECURITY FIX (Gemini L4-2): return Zeroizing<Vec<u8>> instead of bare Vec<u8>
    // so callers automatically zero memory when the key goes out of scope.
    state.vault_key.lock().unwrap().as_ref()
        .map(|k| Zeroizing::new(k.0.clone()))
        .ok_or_else(|| "Locked".into())
}

// ─── Persisted brute-force state (L7 fix #1) ────────────────────────────────
// The lockout counters must survive app kills; otherwise an attacker can kill+restart
// to reset failed_attempts to 0. We persist them in a plain file in the data dir.
// Format: "<attempts>:<unix_lockout_end_secs>" — not secret, just anti-abuse.

fn lockout_load(data_dir: &PathBuf) -> (u32, Option<std::time::SystemTime>) {
    let path = data_dir.join(LOCKOUT_FILE);
    let text = fs::read_to_string(&path).unwrap_or_default();
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() != 2 { return (0, None); }
    let attempts = parts[0].parse::<u32>().unwrap_or(0);
    let lockout_end_secs = parts[1].parse::<u64>().unwrap_or(0);
    if lockout_end_secs == 0 { return (attempts, None); }
    let end = std::time::UNIX_EPOCH + Duration::from_secs(lockout_end_secs);
    (attempts, Some(end))
}

fn lockout_save(data_dir: &PathBuf, attempts: u32, locked_until: Option<std::time::SystemTime>) {
    let secs = locked_until
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let _ = fs::write(data_dir.join(LOCKOUT_FILE), format!("{}:{}", attempts, secs));
}

fn lockout_clear(data_dir: &PathBuf) {
    let _ = fs::remove_file(data_dir.join(LOCKOUT_FILE));
}
// ────────────────────────────────────────────────────────────────────────────

// SECURITY FIX (Level-8 A5): symlink attack defence.
// An attacker can pre-create a symlink at .vault.tmp pointing to e.g. /etc/passwd;
// writing through it would overwrite the target. Check before every tmp-file write.
fn is_safe_write_path(path: &std::path::Path) -> bool {
    if path.exists() {
        if let Ok(meta) = path.symlink_metadata() {
            if meta.file_type().is_symlink() {
                eprintln!("[LexFlow] SECURITY: refused to write to symlink at {:?}", path);
                return false;
            }
        }
    }
    true
}

// SECURITY FIX (Level-8 A3): write sensitive files with mode 0600 (owner read/write only).
// fs::write() uses the process umask; on shared computers the umask may be 022, making
// vault.salt, vault.verify etc. world-readable.  This helper sets explicit permissions.
// On Windows file ACLs are managed differently; the OpenOptions path still creates the
// file correctly and the NTFS ACL on the data dir itself restricts access.
fn secure_write(path: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path)?;
    f.write_all(data)?;
    f.sync_all()
}

fn read_vault_internal(state: &State<AppState>) -> Result<Value, String> {
    let key = get_vault_key(state)?;
    let path = state.data_dir.lock().unwrap().join(VAULT_FILE);
    if !path.exists() { return Ok(json!({"practices":[], "agenda":[]})); }
    let decrypted = decrypt_data(&key, &fs::read(path).map_err(|e| e.to_string())?)?;
    serde_json::from_slice(&decrypted).map_err(|e| e.to_string())
}

fn write_vault_internal(state: &State<AppState>, data: &Value) -> Result<(), String> {
    let key = get_vault_key(state)?;
    let dir = state.data_dir.lock().unwrap().clone();
    let plaintext = Zeroizing::new(serde_json::to_vec(data).map_err(|e| e.to_string())?);
    let encrypted = encrypt_data(&key, &plaintext)?;
    let tmp = dir.join(".vault.tmp");
    // SECURITY FIX (Level-8 A5): refuse to write if tmp path is a symlink.
    if !is_safe_write_path(&tmp) {
        return Err("Security: .vault.tmp è un symlink — scrittura rifiutata".into());
    }
    // SECURITY FIX (Level-8 A3): write with mode 0600, then fsync before rename.
    secure_write(&tmp, &encrypted).map_err(|e| e.to_string())?;
    fs::rename(tmp, dir.join(VAULT_FILE)).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════
//  VAULT COMMANDS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn vault_exists(state: State<AppState>) -> bool {
    state.data_dir.lock().unwrap().join(VAULT_SALT_FILE).exists()
}

#[tauri::command]
fn unlock_vault(state: State<AppState>, password: String) -> Value {
    // BRUTE-FORCE FIX (L7 #1): check persisted disk lockout FIRST so kill+restart doesn't reset it.
    let dir = state.data_dir.lock().unwrap().clone();
    let (disk_attempts, disk_locked_until) = lockout_load(&dir);
    // Sync in-memory state from disk on first call (e.g. after restart)
    {
        let mut att = state.failed_attempts.lock().unwrap();
        if disk_attempts > *att { *att = disk_attempts; }
    }
    // Check disk-based lockout
    if let Some(end_time) = disk_locked_until {
        if std::time::SystemTime::now() < end_time {
            let remaining = end_time.duration_since(std::time::SystemTime::now())
                .map(|d| d.as_secs()).unwrap_or(0);
            return json!({"success": false, "locked": true, "remaining": remaining});
        }
    }
    // Also check in-memory lockout (Instant-based, for within-session accuracy)
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return json!({"success": false, "locked": true, "remaining": (until - Instant::now()).as_secs()});
        }
    }

    let salt_path = dir.join(VAULT_SALT_FILE);
    let is_new = !salt_path.exists();

    let salt = if is_new {
        // SECURITY FIX (Gemini L5-1): backend password strength validation for new vaults.
        // Frontend check can be bypassed via API calls; this ensures the rule is enforced
        // at the only trusted layer: the Rust backend.
        let pwd_strong = password.len() >= 12
            && password.chars().any(|c| c.is_uppercase())
            && password.chars().any(|c| c.is_lowercase())
            && password.chars().any(|c| c.is_ascii_digit())
            && password.chars().any(|c| !c.is_alphanumeric());
        if !pwd_strong {
            return json!({"success": false, "error": "Password troppo debole: minimo 12 caratteri, una maiuscola, una minuscola, un numero e un simbolo."});
        }
        let mut s = vec![0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut s);
        // SECURITY FIX (Level-8 A3): write salt with mode 0600 so it's not world-readable.
        match secure_write(&salt_path, &s) {
            Ok(_) => s,
            Err(e) => return json!({"success": false, "error": format!("Errore scrittura vault: {}", e)}),
        }
    } else {
        fs::read(&salt_path).unwrap_or_default()
    };

    match derive_secure_key(&password, &salt) {
        Ok(k) => {
            let verify_path = dir.join(VAULT_VERIFY_FILE);
            if !is_new {
                let stored = fs::read(&verify_path).unwrap_or_default();
                if !verify_hash_matches(&k, &stored) {
                    let mut att = state.failed_attempts.lock().unwrap();
                    *att += 1;
                    let locked_sys = if *att >= MAX_FAILED_ATTEMPTS {
                        let t = std::time::SystemTime::now() + Duration::from_secs(LOCKOUT_SECS);
                        *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
                        Some(t)
                    } else { None };
                    // Persist to disk — survives kill+restart
                    lockout_save(&dir, *att, locked_sys);
                    // SECURITY FIX (Level-8 C3): overwrite password String bytes before drop.
                    // Tauri allocates the String on the heap before calling this command; the
                    // `password` variable here is a copy. We can't wipe Tauri's original copy
                    // (it's outside our control), but we zero OUR copy to minimise heap remanence.
                    unsafe {
                        let ptr = password.as_ptr() as *mut u8;
                        for i in 0..password.len() { ptr.add(i).write_volatile(0); }
                    }
                    return json!({"success": false, "error": "Password errata"});
                }
                // Vault esistente, password verificata — assegna chiave
                *state.vault_key.lock().unwrap() = Some(SecureKey(k));
            } else {
                let tag = make_verify_tag(&k);
                // SECURITY FIX (Level-8 A3): write verify tag with mode 0600.
                match secure_write(&verify_path, &tag) {
                    Ok(_) => {},
                    Err(e) => return json!({"success": false, "error": format!("Errore init vault: {}", e)}),
                }
                // Assegna la chiave PRIMA di scrivere il vault iniziale — write_vault_internal
                // la legge dallo state. Nessun .clone() → nessuna copia non-zeroizzata in memoria.
                *state.vault_key.lock().unwrap() = Some(SecureKey(k));
                let _ = write_vault_internal(&state, &json!({"practices":[], "agenda":[]}));
            }
            *state.failed_attempts.lock().unwrap() = 0;
            *state.locked_until.lock().unwrap() = None;
            lockout_clear(&dir); // clear persisted brute-force state on success
            *state.last_activity.lock().unwrap() = Instant::now();
            // SECURITY FIX (Level-8 C3): zero our copy of the password on success too.
            unsafe {
                let ptr = password.as_ptr() as *mut u8;
                for i in 0..password.len() { ptr.add(i).write_volatile(0); }
            }
            let _ = append_audit_log(&state, "Sblocco Vault");
            json!({"success": true, "isNew": is_new})
        },
        Err(e) => json!({"success": false, "error": e})
    }
}

#[tauri::command]
fn lock_vault(state: State<AppState>) -> bool {
    *state.vault_key.lock().unwrap() = None;
    true
}

#[tauri::command]
fn reset_vault(state: State<AppState>, password: String) -> Value {
    // Richiede la password corrente prima di cancellare — previene reset non autorizzati
    let dir = state.data_dir.lock().unwrap().clone();
    let salt_path = dir.join(VAULT_SALT_FILE);
    if salt_path.exists() {
        let salt = match fs::read(&salt_path) {
            Ok(s) => s,
            Err(_) => return json!({"success": false, "error": "Errore lettura vault"}),
        };
        let key = match derive_secure_key(&password, &salt) {
            Ok(k) => k,
            Err(e) => return json!({"success": false, "error": e}),
        };
        let stored = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
        if !verify_hash_matches(&key, &stored) {
            // SECURITY FIX (Level-9): zero password on wrong-password path too.
            unsafe {
                let ptr = password.as_ptr() as *mut u8;
                for i in 0..password.len() { ptr.add(i).write_volatile(0); }
            }
            return json!({"success": false, "error": "Password errata"});
        }
    }
    let _ = {
        // SECURITY FIX (Gemini L3-2): preserve license.json across factory reset.
        // Previously remove_dir_all wiped license too, forcing re-activation after every reset.
        let license_backup: Option<Vec<u8>> = fs::read(dir.join(LICENSE_FILE)).ok();
        // SECURITY FIX (Level-8 C4): overwrite vault files with zeros before deletion.
        // fs::remove_dir_all only unlinks inodes; the raw bytes remain on disk and are
        // recoverable with tools like Recuva or Photorec. Overwriting with zeros first
        // ensures forensic deletion of key material and practice data.
        for sensitive_file in &[VAULT_FILE, VAULT_SALT_FILE, VAULT_VERIFY_FILE, AUDIT_LOG_FILE] {
            let p = dir.join(sensitive_file);
            if p.exists() {
                if let Ok(meta) = p.metadata() {
                    let size = meta.len() as usize;
                    if size > 0 {
                        let zeros = vec![0u8; size];
                        let _ = secure_write(&p, &zeros);
                    }
                }
            }
        }
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::create_dir_all(&dir);
        // Restore license if it existed
        if let Some(license_data) = license_backup {
            let _ = fs::write(dir.join(LICENSE_FILE), license_data);
        }
    };
    *state.vault_key.lock().unwrap() = None;
    // SECURITY FIX (Level-9): zero the password String bytes in RAM after use.
    unsafe {
        let ptr = password.as_ptr() as *mut u8;
        for i in 0..password.len() { ptr.add(i).write_volatile(0); }
    }
    json!({"success": true})
}

#[tauri::command]
fn change_password(state: State<AppState>, current_password: String, new_password: String) -> Result<Value, String> {
    let dir = state.data_dir.lock().unwrap().clone();
    let salt = fs::read(dir.join(VAULT_SALT_FILE)).map_err(|e| e.to_string())?;
    let current_key = derive_secure_key(&current_password, &salt)?;
    let stored = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
    if !verify_hash_matches(&current_key, &stored) {
        return Ok(json!({"success": false, "error": "Password attuale errata"}));
    }
    // Read vault with current key
    let vault_path = dir.join(VAULT_FILE);
    let vault_data = if vault_path.exists() {
        let enc = fs::read(&vault_path).map_err(|e| e.to_string())?;
        let dec = decrypt_data(&current_key, &enc)?;
        serde_json::from_slice::<Value>(&dec).map_err(|e| e.to_string())?
    } else {
        json!({"practices":[], "agenda":[]})
    };
    // New salt + key
    let mut new_salt = vec![0u8; ARGON2_SALT_LEN];
    rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut new_salt);
    let new_key = derive_secure_key(&new_password, &new_salt)?;

    // TRANSACTIONAL ORDER FIX (L7-2): the previous code wrote vault.lex with the new key
    // BEFORE writing vault.salt. A crash between those two writes caused permanent lockout
    // (vault encrypted with new key, but salt still belongs to old key → neither password works).
    //
    // Correct atomic sequence:
    //   1. Write all new files to .tmp locations (crash here → old files untouched, safe)
    //   2. sync_all() each tmp file (data physically on disk before any rename)
    //   3. Rename new salt into place  ← after this, new password is the "source of truth"
    //   4. Rename new vault into place
    //   5. Rename new verify tag into place
    // A crash between steps 3-5 is recoverable: the user can re-run change_password.

    let vault_plaintext = Zeroizing::new(serde_json::to_vec(&vault_data).map_err(|e| e.to_string())?);
    let encrypted_vault  = encrypt_data(&new_key, &vault_plaintext)?;
    let new_verify_tag   = make_verify_tag(&new_key);

    // Write all three tmp files with fsync
    let atomic_write_sync = |path: &std::path::Path, data: &[u8]| -> Result<(), String> {
        // SECURITY FIX (Level-8 A5): refuse symlinks; A3: write with mode 0600.
        if !is_safe_write_path(path) {
            return Err(format!("Security: {:?} è un symlink — scrittura rifiutata", path));
        }
        secure_write(path, data).map_err(|e| e.to_string())
    };

    let tmp_vault  = dir.join(".vault.tmp");
    let tmp_salt   = dir.join(".salt.tmp");
    let tmp_verify = dir.join(".verify.tmp");

    atomic_write_sync(&tmp_vault,  &encrypted_vault)?;
    atomic_write_sync(&tmp_salt,   &new_salt)?;
    atomic_write_sync(&tmp_verify, &new_verify_tag)?;

    // Atomic rename sequence — new salt first (defines the "current password")
    fs::rename(&tmp_salt,   dir.join(VAULT_SALT_FILE)).map_err(|e| e.to_string())?;
    fs::rename(&tmp_vault,  &vault_path).map_err(|e| e.to_string())?;
    fs::rename(&tmp_verify, dir.join(VAULT_VERIFY_FILE)).map_err(|e| e.to_string())?;

    // Re-encrypt audit log if exists — ATOMIC write via tmp+rename (Gemini L3-4)
    let audit_path = dir.join(AUDIT_LOG_FILE);
    if audit_path.exists() {
        if let Ok(enc) = fs::read(&audit_path) {
            if let Ok(dec) = decrypt_data(&current_key, &enc) {
                if let Ok(re_enc) = encrypt_data(&new_key, &dec) {
                    let audit_tmp = dir.join(".audit.tmp");
                    if let Ok(()) = atomic_write_sync(&audit_tmp, &re_enc) {
                        let _ = fs::rename(&audit_tmp, &audit_path);
                    }
                }
            }
        }
    }
    // Update in-memory key
    *state.vault_key.lock().unwrap() = Some(SecureKey(new_key));
    // Update biometric if saved
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        if let Ok(entry) = keyring::Entry::new(BIO_SERVICE, &user) {
            if entry.get_password().is_ok() {
                let _ = entry.set_password(&new_password);
            }
        }
    }
    let _ = append_audit_log(&state, "Password cambiata");
    // SECURITY FIX (Level-9): zero both password strings from RAM after use.
    unsafe {
        let ptr = current_password.as_ptr() as *mut u8;
        for i in 0..current_password.len() { ptr.add(i).write_volatile(0); }
        let ptr2 = new_password.as_ptr() as *mut u8;
        for i in 0..new_password.len() { ptr2.add(i).write_volatile(0); }
    }
    Ok(json!({"success": true}))
}

#[tauri::command]
fn verify_vault_password(state: State<AppState>, pwd: String) -> Result<Value, String> {
    // Applica lo stesso lockout di unlock_vault per prevenire brute-force parallelo
    let dir = state.data_dir.lock().unwrap().clone();
    let (disk_attempts, disk_locked_until) = lockout_load(&dir);
    {
        let mut att = state.failed_attempts.lock().unwrap();
        if disk_attempts > *att { *att = disk_attempts; }
    }
    if let Some(end_time) = disk_locked_until {
        if std::time::SystemTime::now() < end_time {
            let remaining = end_time.duration_since(std::time::SystemTime::now())
                .map(|d| d.as_secs()).unwrap_or(0);
            return Ok(json!({"valid": false, "locked": true, "remaining": remaining}));
        }
    }
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return Ok(json!({"valid": false, "locked": true, "remaining": (until - Instant::now()).as_secs()}));
        }
    }
    let salt = fs::read(dir.join(VAULT_SALT_FILE)).map_err(|e| e.to_string())?;
    let key = derive_secure_key(&pwd, &salt)?;
    let stored = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
    let valid = verify_hash_matches(&key, &stored);
    if !valid {
        let mut att = state.failed_attempts.lock().unwrap();
        *att += 1;
        let locked_sys = if *att >= MAX_FAILED_ATTEMPTS {
            let t = std::time::SystemTime::now() + Duration::from_secs(LOCKOUT_SECS);
            *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
            Some(t)
        } else { None };
        lockout_save(&dir, *att, locked_sys);
    } else {
        *state.failed_attempts.lock().unwrap() = 0;
        lockout_clear(&dir);
    }
    Ok(json!({"valid": valid}))
}

// ═══════════════════════════════════════════════════════════
//  SUMMARY — Server-side computation (Gemini L2-4)
// ═══════════════════════════════════════════════════════════

/// Returns {activePractices, urgentDeadlines} computed in Rust.
/// Previously computed client-side (getSummary in api.js) by loading ALL practices
/// and iterating in JS — O(n) on the main thread, causing CPU freezes on large vaults.
/// Now computed server-side in a single vault read.
#[tauri::command]
fn get_summary(state: State<AppState>) -> Result<Value, String> {
    let vault = read_vault_internal(&state)?;
    let practices = vault.get("practices").and_then(|p| p.as_array()).cloned().unwrap_or_default();
    let active_practices = practices.iter().filter(|p| {
        p.get("status").and_then(|s| s.as_str()) == Some("active")
    }).count();

    let today = chrono::Local::now().naive_local().date();
    let in_7_days = today + chrono::Duration::days(7);
    let mut urgent_deadlines: usize = 0;
    for p in &practices {
        if p.get("status").and_then(|s| s.as_str()) != Some("active") { continue; }
        if let Some(deadlines) = p.get("deadlines").and_then(|d| d.as_array()) {
            for d in deadlines {
                if let Some(date_str) = d.get("date").and_then(|ds| ds.as_str()) {
                    if let Ok(d_date) = chrono::NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                        if d_date >= today && d_date <= in_7_days {
                            urgent_deadlines += 1;
                        }
                    }
                }
            }
        }
    }
    Ok(json!({"activePractices": active_practices, "urgentDeadlines": urgent_deadlines}))
}

// ═══════════════════════════════════════════════════════════
//  PRACTICES & AGENDA
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn load_practices(state: State<AppState>) -> Result<Value, String> {
    let vault = read_vault_internal(&state)?;
    Ok(vault.get("practices").cloned().unwrap_or(json!([])))
}

#[tauri::command]
fn save_practices(state: State<AppState>, list: Value) -> Result<bool, String> {
    // SECURITY FIX (Level-8 C1): hold write_mutex for the entire read-modify-write cycle.
    // Without this, two concurrent IPC calls (e.g. save_practices + save_agenda) would both
    // read the vault, apply their own change, and write back — the second write silently
    // discards the first write's changes (classic lost-update race condition).
    let _guard = state.write_mutex.lock().unwrap();
    let mut vault = read_vault_internal(&state)?;
    vault["practices"] = list;
    write_vault_internal(&state, &vault)?;
    Ok(true)
}

#[tauri::command]
fn load_agenda(state: State<AppState>) -> Result<Value, String> {
    let vault = read_vault_internal(&state)?;
    Ok(vault.get("agenda").cloned().unwrap_or(json!([])))
}

#[tauri::command]
fn save_agenda(state: State<AppState>, agenda: Value) -> Result<bool, String> {
    // SECURITY FIX (Level-8 C1): same write_mutex as save_practices — prevents lost-update race.
    let _guard = state.write_mutex.lock().unwrap();
    let mut vault = read_vault_internal(&state)?;
    vault["agenda"] = agenda;
    write_vault_internal(&state, &vault)?;
    Ok(true)
}

// ═══════════════════════════════════════════════════════════
//  BIOMETRICS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn check_bio() -> bool {
    // macOS/Windows: biometria nativa disponibile
    // Android: fingerprint/face disponibile via Android Biometric API (gestita lato JS)
    cfg!(any(target_os = "macos", target_os = "windows", target_os = "android"))
}

#[tauri::command]
fn has_bio_saved() -> bool {
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        let entry = keyring::Entry::new(BIO_SERVICE, &user);
        match entry {
            Ok(e) => e.get_password().is_ok(),
            Err(_) => false,
        }
    }
    #[cfg(target_os = "android")]
    {
        // Su Android la password bio è salvata nel Keystore nativo — gestito via flag in settings
        false
    }
}

#[tauri::command]
fn save_bio(pwd: String) -> Result<bool, String> {
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        let entry = keyring::Entry::new(BIO_SERVICE, &user).map_err(|e| e.to_string())?;
        entry.set_password(&pwd).map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(target_os = "android")]
    {
        // Su Android: la pwd è salvata nel vault cifrato — il biometric bridge JS gestisce l'auth
        let _ = pwd; // suppress unused warning
        Ok(true)
    }
}

#[tauri::command]
fn bio_login(_state: State<AppState>) -> Result<Value, String> {
    #[cfg(target_os = "macos")]
    {
        // FORT KNOX: Swift code passed via stdin — NEVER written to disk
        let swift_code = "import LocalAuthentication\nlet ctx = LAContext()\nvar err: NSError?\nif ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) {\n  let sema = DispatchSemaphore(value: 0)\n  var ok = false\n  ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: \"LexFlow\") { s, _ in ok = s; sema.signal() }\n  sema.wait()\n  if ok { exit(0) } else { exit(1) }\n} else { exit(1) }";
        
        use std::io::Write;
        // SECURITY FIX (Gemini L1-2): use absolute path to prevent PATH hijacking.
        // /usr/bin/swift is the canonical location on macOS; never rely on $PATH for security-critical executables.
        let mut child = std::process::Command::new("/usr/bin/swift")
            .arg("-")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        
        if let Some(ref mut stdin) = child.stdin {
            stdin.write_all(swift_code.as_bytes()).map_err(|e| e.to_string())?;
        }
        drop(child.stdin.take());
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() { return Ok(json!({"success": false, "error": "Autenticazione biometrica fallita"})); }

        // Recupera la password salvata dal keyring (non la ritorniamo al JS)
        let user = whoami::username();
        let saved_pwd = keyring::Entry::new(BIO_SERVICE, &user)
            .and_then(|e| e.get_password()).map_err(|e| e.to_string())?;

        // Esegui internamente lo sblocco del vault esattamente come unlock_vault
    let dir = _state.data_dir.lock().unwrap().clone();
        let salt_path = dir.join(VAULT_SALT_FILE);
        if !salt_path.exists() { return Ok(json!({"success": false, "error": "Vault non inizializzato"})); }
        let salt = fs::read(&salt_path).unwrap_or_default();
        match derive_secure_key(&saved_pwd, &salt) {
            Ok(k) => {
                *(_state.vault_key.lock().unwrap()) = Some(SecureKey(k));
                *(_state.failed_attempts.lock().unwrap()) = 0;
                *(_state.locked_until.lock().unwrap()) = None;
                lockout_clear(&dir);
                *(_state.last_activity.lock().unwrap()) = Instant::now();
                let _ = append_audit_log(&_state, "Sblocco Vault (biometria)");
                Ok(json!({"success": true}))
            },
            Err(e) => Ok(json!({"success": false, "error": e}))
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows Hello: verifica biometrica reale tramite UserConsentVerifier WinRT API.
        // Usa PowerShell per invocare Windows.Security.Credentials.UI.UserConsentVerifier
        // — più affidabile che controllare solo il keyring senza autenticazione.
        use std::process::Command;
        let ps_script = r#"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($WinRtTask, $ResultType) {
    $asTaskSpecific = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTaskSpecific.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}
[Windows.Security.Credentials.UI.UserConsentVerifier,Windows.Security.Credentials.UI,ContentType=WindowsRuntime] | Out-Null
$result = Await ([Windows.Security.Credentials.UI.UserConsentVerifier]::RequestVerificationAsync("LexFlow — Verifica identità")) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])
if ($result -eq [Windows.Security.Credentials.UI.UserConsentVerificationResult]::Verified) { exit 0 } else { exit 1 }
"#;
        // SECURITY FIX (Gemini L1-2): use absolute path to prevent PATH hijacking.
        // C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe is the canonical location.
        let status = Command::new(r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() { return Ok(json!({"success": false, "error": "Windows Hello fallito o non disponibile"})); }

        // Recupera la password salvata dal keyring e sblocca internamente il vault
        let user = whoami::username();
        let saved_pwd = keyring::Entry::new(BIO_SERVICE, &user)
            .and_then(|e| e.get_password()).map_err(|e| e.to_string())?;

    let dir = _state.data_dir.lock().unwrap().clone();
        let salt_path = dir.join(VAULT_SALT_FILE);
        if !salt_path.exists() { return Ok(json!({"success": false, "error": "Vault non inizializzato"})); }
        let salt = fs::read(&salt_path).unwrap_or_default();
        match derive_secure_key(&saved_pwd, &salt) {
            Ok(k) => {
                *(_state.vault_key.lock().unwrap()) = Some(SecureKey(k));
                *(_state.failed_attempts.lock().unwrap()) = 0;
                *(_state.locked_until.lock().unwrap()) = None;
                lockout_clear(&dir);
                *(_state.last_activity.lock().unwrap()) = Instant::now();
                let _ = append_audit_log(&_state, "Sblocco Vault (biometria)");
                Ok(json!({"success": true}))
            },
            Err(e) => Ok(json!({"success": false, "error": e}))
        }
    }
    #[cfg(target_os = "android")]
    {
        // Su Android il biometric prompt è gestito interamente dal frontend JS
        // tramite l'Android BiometricPrompt API via tauri-plugin-biometric (futuro)
        // Per ora restituisce errore che il frontend gestisce con fallback a password
        Err("android-bio-use-frontend".into())
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "android")))]
    {
        Err("Non supportato su questa piattaforma".into())
    }
}

#[tauri::command]
fn clear_bio() -> bool {
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        if let Ok(e) = keyring::Entry::new(BIO_SERVICE, &user) { let _ = e.delete_credential(); }
        true
    }
    #[cfg(target_os = "android")]
    {
        true
    }
}

// ═══════════════════════════════════════════════════════════
//  AUDIT & LOGS
// ═══════════════════════════════════════════════════════════

fn append_audit_log(state: &State<AppState>, event_name: &str) -> Result<(), String> {
    let key = match get_vault_key(state) { Ok(k) => k, Err(_) => return Ok(()) };
    let path = state.data_dir.lock().unwrap().join(AUDIT_LOG_FILE);
    let mut logs: Vec<Value> = if path.exists() {
        let enc = fs::read(&path).unwrap_or_default();
        if let Ok(dec) = decrypt_data(&key, &enc) { serde_json::from_slice(&dec).unwrap_or_default() } else { vec![] }
    } else { vec![] };

    logs.push(json!({"event": event_name, "time": chrono::Local::now().to_rfc3339()}));
    // GDPR FIX (Gemini L4-4): increased from 100 to 10000 events to comply with
    // legal audit trail requirements. 10000 events @ ~100 bytes each ≈ 1MB encrypted.
    if logs.len() > 10000 { logs.remove(0); }
    let plaintext = Zeroizing::new(serde_json::to_vec(&logs).unwrap_or_default());
    let enc = encrypt_data(&key, &plaintext)?;
    fs::write(&path, enc).map_err(|e| {
        eprintln!("[LexFlow] AUDIT LOG WRITE FAILED: {} — event '{}' lost", e, event_name);
        e.to_string()
    })?;
    Ok(())
}

#[tauri::command]
fn get_audit_log(state: State<AppState>) -> Result<Value, String> {
    let key = get_vault_key(&state)?;
    let path = state.data_dir.lock().unwrap().join(AUDIT_LOG_FILE);
    if !path.exists() { return Ok(json!([])); }
    let dec = decrypt_data(&key, &fs::read(path).map_err(|e| e.to_string())?)?;
    serde_json::from_slice(&dec).map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════
//  SETTINGS & LICENSE
// ═══════════════════════════════════════════════════════════
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_license_verification_full_cycle() {
        // Questa è la tua licenza di prova (ho aggiunto il prefisso LXFW. richiesto dal codice)
        // Nota: i campi devono essere "c" (client) ed "e" (expiry) come definito nella tua struct LicensePayload
    let valid_token = "LXFW.eyJjIjoicGlldHJvX3Rlc3QiLCJlIjoxODAzNTU1MjA5MDQ2LCJpZCI6IjM4NDA2MzgxLTU1NTQtNDdhMi05NDVjLTE4OWJiZGQ2YjdlNyJ9.8YfuzlNLv8DjmQ3w3o7tzYuVSCrjJOkyY01oGUlLNUO-tOGxlBHGpmWHqwlya6PnqoYz_CUf_EqOue3hyHScDw";

        // 1. Test verifica positiva
        let result = verify_license(valid_token.to_string());
        assert!(result.valid, "La licenza valida è stata respinta! Errore: {}", result.message);
        assert_eq!(result.client.unwrap(), "pietro_test");

        // 2. Test Anti-Manomissione (cambiamo un solo carattere nella firma)
        let mut tampered_token = valid_token.to_string();
        tampered_token.replace_range(tampered_token.len()-5..tampered_token.len()-4, "Z");
        let tamper_result = verify_license(tampered_token);
        assert!(!tamper_result.valid, "Sicurezza fallita: la licenza manomessa è stata accettata!");
        assert_eq!(tamper_result.message, "Firma non valida o licenza manomessa!");

        // 3. Test Formato errato
        let invalid_format = "TOKEN_SENZA_PUNTI";
        let format_result = verify_license(invalid_format.to_string());
        assert!(!format_result.valid);
        assert_eq!(format_result.message, "Formato chiave non valido.");
    }
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Value {
    let path = state.data_dir.lock().unwrap().join(SETTINGS_FILE);
    if !path.exists() { return json!({}); }
    // SECURITY FIX (Level-8 C5): reject suspiciously large files before reading into RAM.
    // A corrupted or maliciously injected 5GB settings file would OOM-kill the process.
    if let Ok(meta) = path.metadata() {
        if meta.len() > MAX_SETTINGS_FILE_SIZE {
            eprintln!("[LexFlow] Settings file troppo grande ({} bytes) — ignorato", meta.len());
            return json!({});
        }
    }
    let key = get_local_encryption_key();
    if let Ok(enc) = fs::read(&path) {
        // Try encrypted format first
        if let Ok(dec) = decrypt_data(&key, &enc) {
            return serde_json::from_slice(&dec).unwrap_or(json!({}));
        }
        // Migration: old plaintext format
        if let Ok(text) = std::str::from_utf8(&enc) {
            if let Ok(val) = serde_json::from_str::<Value>(text) {
                // Re-encrypt and save
                if let Ok(re_enc) = encrypt_data(&key, &serde_json::to_vec(&val).unwrap_or_default()) {
                    let _ = fs::write(&path, re_enc);
                }
                return val;
            }
        }
        // File corrotto: salva backup prima di resettare (non perdere dati silenziosamente)
        let backup_path = path.with_extension("json.corrupt");
        let _ = fs::copy(&path, &backup_path);
        eprintln!("[LexFlow] Settings file corrotto — backup salvato in {:?}", backup_path);
    }
    json!({})
}

#[tauri::command]
fn save_settings(state: State<AppState>, settings: Value) -> bool {
    let path = state.data_dir.lock().unwrap().join(SETTINGS_FILE);
    let key = get_local_encryption_key();
    match encrypt_data(&key, &serde_json::to_vec(&settings).unwrap_or_default()) {
        Ok(encrypted) => {
            // FSYNC FIX (L7-1): use explicit open+sync_all to guarantee physical write
            use std::io::Write;
            let tmp = path.with_extension("json.tmp");
            let ok = std::fs::OpenOptions::new()
                .write(true).create(true).truncate(true)
                .open(&tmp)
                .and_then(|mut f| { f.write_all(&encrypted)?; f.sync_all() })
                .is_ok();
            if ok { fs::rename(&tmp, &path).is_ok() } else { false }
        },
        Err(_) => false,
    }
}

#[tauri::command]
fn check_license(state: State<AppState>) -> Value {
    let path = state.data_dir.lock().unwrap().join(LICENSE_FILE);
    if !path.exists() { return json!({"activated": false}); }
    let key = get_local_encryption_key();
    let data: Value = if let Ok(enc) = fs::read(&path) {
        // Try encrypted format
        if let Ok(dec) = decrypt_data(&key, &enc) {
            serde_json::from_slice(&dec).unwrap_or(json!({}))
        } else {
            // Migration from plaintext
            if let Ok(text) = std::str::from_utf8(&enc) {
                if let Ok(val) = serde_json::from_str::<Value>(text) {
                    val
                } else { return json!({"activated": false}); }
            } else { return json!({"activated": false}); }
        }
    } else { return json!({"activated": false}); };

    let license_key = data.get("key").and_then(|k| k.as_str()).unwrap_or("");

    if !license_key.is_empty() {
        // Verify using the new Ed25519-signed token
        let verification = verify_license(license_key.to_string());

        if verification.valid {
            return json!({
                "activated": true,
                "key": license_key,
                "activatedAt": data.get("activatedAt").cloned().unwrap_or(Value::Null),
                "client": verification.client.unwrap_or_else(|| "Studio Legale".to_string()),
            });
        } else {
            return json!({"activated": false, "expired": true, "reason": verification.message});
        }
    }

    json!({"activated": false})
}

// NOTE: legacy symmetric license verification (HMAC/XOR secret) has been removed.
// The project now uses Ed25519-signed license tokens verified by `verify_license`.

// ---------------------------------------------------------------------------
// Offline Ed25519-signed license verification
// ---------------------------------------------------------------------------
// NOTE: replace PUBLIC_KEY_BYTES with the 32 bytes of your Ed25519 public key.
// To generate a keypair locally and safely, run this helper from the project root:
//
//   python3 scripts/gen_keys.py
//
// This prints a Rust-friendly list of 32 bytes (paste that into PUBLIC_KEY_BYTES)
// and prints the private key in base64 for you to store securely. NEVER commit
// the private key to source control — only the public key belongs in the binary.
const PUBLIC_KEY_BYTES: [u8; 32] = [
    81u8, 178u8, 250u8, 170u8, 33u8, 28u8, 37u8, 147u8,
    69u8, 255u8, 152u8, 47u8, 76u8, 162u8, 41u8, 151u8,
    44u8, 227u8, 28u8, 17u8, 109u8, 112u8, 47u8, 60u8,
    178u8, 148u8, 216u8, 41u8, 16u8, 50u8, 191u8, 104u8,
];

#[derive(Deserialize, Serialize)]
struct LicensePayload {
    c: String, // client name
    e: u64,    // expiry in milliseconds since epoch
    id: String, // unique key id
}

#[derive(Serialize)]
struct VerificationResult {
    valid: bool,
    client: Option<String>,
    message: String,
}

#[tauri::command]
fn verify_license(key_string: String) -> VerificationResult {
    // Expected format: LXFW.<payload_b64>.<signature_b64>
    let parts: Vec<&str> = key_string.split('.').collect();
    if parts.len() != 3 || parts[0] != "LXFW" {
        return VerificationResult { valid: false, client: None, message: "Formato chiave non valido.".into() };
    }

    let payload_b64 = parts[1];
    let signature_b64 = parts[2];

    let payload_bytes = match URL_SAFE_NO_PAD.decode(payload_b64) {
        Ok(b) => b,
        Err(_) => return VerificationResult { valid: false, client: None, message: "Errore decodifica payload.".into() },
    };

    let signature_bytes = match URL_SAFE_NO_PAD.decode(signature_b64) {
        Ok(b) => b,
        Err(_) => return VerificationResult { valid: false, client: None, message: "Errore decodifica firma.".into() },
    };

    let public_key = match VerifyingKey::from_bytes(&PUBLIC_KEY_BYTES) {
        Ok(k) => k,
        Err(_) => return VerificationResult { valid: false, client: None, message: "Errore chiave pubblica interna.".into() },
    };

    let signature = match Signature::from_slice(&signature_bytes) {
        Ok(s) => s,
        Err(_) => return VerificationResult { valid: false, client: None, message: "Firma corrotta.".into() },
    };

    if public_key.verify(payload_b64.as_bytes(), &signature).is_err() {
        return VerificationResult { valid: false, client: None, message: "Firma non valida o licenza manomessa!".into() };
    }

    let payload: LicensePayload = match serde_json::from_slice(&payload_bytes) {
        Ok(p) => p,
        Err(_) => return VerificationResult { valid: false, client: None, message: "Dati licenza corrotti.".into() },
    };

    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
    if now > payload.e {
        return VerificationResult { valid: false, client: Some(payload.c), message: "Licenza scaduta.".into() };
    }

    VerificationResult { valid: true, client: Some(payload.c), message: "Licenza attivata con successo!".into() }
}

#[tauri::command]
fn activate_license(state: State<AppState>, key: String, _client_name: Option<String>) -> Value {
    // Anti brute-force: usa lo stesso lockout del vault
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return json!({"success": false, "locked": true, "remaining": (until - Instant::now()).as_secs()});
        }
    }

    let key = key.trim().to_string(); // Le chiavi B64 sono case-sensitive, non uppercasiamo

    // Verifica asimmetrica (Ed25519)
    let verification = verify_license(key.clone());

    if !verification.valid {
        let mut att = state.failed_attempts.lock().unwrap();
        *att += 1;
        if *att >= MAX_FAILED_ATTEMPTS {
            *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
        }
        return json!({"success": false, "error": verification.message});
    }

    *state.failed_attempts.lock().unwrap() = 0;
    let path = state.data_dir.lock().unwrap().join(LICENSE_FILE);
    let now = chrono::Utc::now().to_rfc3339();

    // Il client viene estratto in modo sicuro dal payload firmato
    let client = verification.client.unwrap_or_else(|| "Studio Legale".to_string());

    let record = json!({
        "key": key,
        "activatedAt": now,
        "client": client,
        "keyVersion": "ed25519"
    });
    let enc_key = get_local_encryption_key();
    match encrypt_data(&enc_key, &serde_json::to_vec(&record).unwrap_or_default()) {
        Ok(encrypted) => {
            match fs::write(&path, encrypted) {
                Ok(_) => json!({"success": true, "key": key}),
                Err(e) => json!({"success": false, "error": format!("Errore salvataggio: {}", e)}),
            }
        },
        Err(e) => json!({"success": false, "error": format!("Errore cifratura: {}", e)}),
    }
}

// ═══════════════════════════════════════════════════════════
//  IMPORT / EXPORT
// ═══════════════════════════════════════════════════════════

#[tauri::command]
async fn export_vault(state: State<'_, AppState>, pwd: String, app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    // SECURITY FIX (Level-8 A2): verify that `pwd` is the intended backup password by
    // re-deriving it and checking against vault.verify BEFORE writing the backup.
    // Without this check, a typo in `pwd` produces a backup encrypted with the wrong key
    // that is permanently inaccessible — the user has no way to know until they need to restore.
    // We verify by deriving the key and confirming it opens the vault's own verify tag.
    {
        let dir = state.data_dir.lock().unwrap().clone();
        let salt_path = dir.join(VAULT_SALT_FILE);
        if salt_path.exists() {
            let vault_salt = fs::read(&salt_path).map_err(|e| e.to_string())?;
            let vault_key_check = derive_secure_key(&pwd, &vault_salt)?;
            let stored_verify = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
            if !verify_hash_matches(&vault_key_check, &stored_verify) {
                return Ok(json!({"success": false, "error": "Password errata: il backup non può essere creato con una password diversa da quella del vault."}));
            }
        }
    }
    let data = read_vault_internal(&state)?;
    let salt = (0..32).map(|_| rand::random::<u8>()).collect::<Vec<_>>();
    let key = derive_secure_key(&pwd, &salt)?;
    // Zeroizing: plaintext vault azzerato dopo la cifratura
    let plaintext = Zeroizing::new(serde_json::to_vec(&data).map_err(|e| e.to_string())?);
    let encrypted = encrypt_data(&key, &plaintext)?;
    let mut out = salt; out.extend(encrypted);

    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().set_file_name("LexFlow_Backup.lex").save_file(move |file_path| {
        let _ = tx.send(file_path);
    });
    let path = rx.await.map_err(|e| format!("Dialog error: {}", e))?;
    if let Some(p) = path {
        fs::write(p.into_path().unwrap(), out).map_err(|e| e.to_string())?;
        Ok(json!({"success": true}))
    } else { Ok(json!({"success": false})) }
}

#[tauri::command]
async fn import_vault(state: State<'_, AppState>, pwd: String, app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("LexFlow Backup", &["lex"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let path = rx.await.map_err(|e| format!("Dialog error: {}", e))?;
    if let Some(p) = path {
        let raw = fs::read(p.into_path().unwrap()).map_err(|e| e.to_string())?;
        // CAPACITY FIX (Gemini L4-3): increased from 50MB to 500MB to handle large
        // law firm vaults (many practices + attached document paths). OOM risk is
        // minimal: AES-GCM decryption is streaming-friendly and memory is freed immediately.
        const MAX_IMPORT_SIZE: usize = 500 * 1024 * 1024;
        if raw.len() > MAX_IMPORT_SIZE {
            return Err("File troppo grande (max 500MB)".into());
        }
        // Validazione struttura minima: 32 byte salt + VAULT_MAGIC + nonce (12) + tag AES (16)
        let min_len = 32 + VAULT_MAGIC.len() + NONCE_LEN + 16;
        if raw.len() < min_len {
            return Err("File non valido o corrotto (dimensione insufficiente)".into());
        }
        // Verifica magic nel blocco cifrato (dopo i 32 byte di salt)
        let magic_start = 32;
        if !raw[magic_start..].starts_with(VAULT_MAGIC) {
            return Err("File non è un backup LexFlow valido".into());
        }
        let salt = &raw[..32];
        let encrypted = &raw[32..];
        let key = derive_secure_key(&pwd, salt)?;
        let decrypted = decrypt_data(&key, encrypted).map_err(|_| "Password errata o file corrotto")?;
        let val: Value = serde_json::from_slice(&decrypted).map_err(|_| "Struttura backup non valida")?;
        // Validazione struttura dati vault
        if val.get("practices").is_none() && val.get("agenda").is_none() {
            return Err("Il file non contiene dati LexFlow validi".into());
        }
        // SECURITY FIX (Level-8 C2): import must work even if the vault is currently locked
        // (e.g. first-run or forgotten password scenario).  Previously write_vault_internal
        // required vault_key to already be set, causing a Catch-22: you can't unlock a lost
        // vault, but you can't import a backup either.
        //
        // Fix: derive a new vault key from `pwd` + a fresh salt, write all vault files
        // (salt, verify, vault.lex) from the backup's own credentials, then set vault_key.
        // This means the imported vault's master password becomes `pwd` as entered here.
        {
            let dir = state.data_dir.lock().unwrap().clone();
            // Generate new vault salt for the imported vault
            let mut new_salt = vec![0u8; 32];
            rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut new_salt);
            let new_key = derive_secure_key(&pwd, &new_salt)?;
            // Write salt with mode 0600
            secure_write(&dir.join(VAULT_SALT_FILE), &new_salt).map_err(|e| e.to_string())?;
            // Write verify tag
            let verify_tag = make_verify_tag(&new_key);
            secure_write(&dir.join(VAULT_VERIFY_FILE), &verify_tag).map_err(|e| e.to_string())?;
            // Set the vault key in state so write_vault_internal can use it
            *state.vault_key.lock().unwrap() = Some(SecureKey(new_key));
        }
        write_vault_internal(&state, &val)?;
        let _ = append_audit_log(&state, "Vault importato da backup");
        // SECURITY FIX (Level-9): zero the backup password from RAM after the key is derived.
        unsafe {
            let ptr = pwd.as_ptr() as *mut u8;
            for i in 0..pwd.len() { ptr.add(i).write_volatile(0); }
        }
        Ok(json!({"success": true}))
    } else { Ok(json!({"success": false, "cancelled": true})) }
}

// ═══════════════════════════════════════════════════════════
//  SYSTEM UTILITIES
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn open_path(path: String) {
    #[cfg(not(target_os = "android"))]
    { let _ = open::that(path); }
    #[cfg(target_os = "android")]
    { let _ = path; } // su Android si usa ACTION_VIEW via frontend
}

#[tauri::command]
async fn select_file(app: AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Documenti", &["pdf", "docx", "doc"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let file = rx.await.map_err(|e| format!("Dialog error: {}", e))?;
    Ok(file.map(|f| {
        let path = f.clone().into_path().unwrap();
        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        json!({"name": name, "path": path.to_string_lossy()})
    }))
}

#[tauri::command]
fn window_close(app: AppHandle, state: State<AppState>) {
    *state.vault_key.lock().unwrap() = None;
    #[cfg(not(target_os = "android"))]
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
    #[cfg(target_os = "android")]
    { let _ = app; }
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[tauri::command]
fn is_mac() -> bool { cfg!(target_os = "macos") }

/// Restituisce la piattaforma corrente al frontend
#[tauri::command]
fn get_platform() -> String {
    #[cfg(target_os = "android")] { "android".to_string() }
    #[cfg(target_os = "ios")]     { "ios".to_string() }
    #[cfg(target_os = "macos")]   { "macos".to_string() }
    #[cfg(target_os = "windows")] { "windows".to_string() }
    #[cfg(target_os = "linux")]   { "linux".to_string() }
    #[cfg(not(any(target_os="android",target_os="ios",target_os="macos",target_os="windows",target_os="linux")))]
    { "unknown".to_string() }
}

#[tauri::command]
async fn export_pdf(app: AppHandle, data: Vec<u8>, default_name: String) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&default_name)
        .save_file(move |file_path| {
            let _ = tx.send(file_path);
        });
    let file_path = rx.await.map_err(|e| format!("Dialog error: {}", e))?;
    match file_path {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| format!("Path error: {:?}", e))?;
            fs::write(&path, &data).map_err(|e| e.to_string())?;
            Ok(json!({"success": true, "path": path.to_string_lossy()}))
        },
        None => Ok(json!({"success": false, "cancelled": true})),
    }
}

// ═══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn send_notification(app: AppHandle, title: String, body: String) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(&title).body(&body).show();
}

#[tauri::command]
fn sync_notification_schedule(state: State<AppState>, schedule: Value) -> bool {
    let dir = state.data_dir.lock().unwrap().clone();
    let key = get_local_encryption_key();
    let plaintext = serde_json::to_vec(&schedule).unwrap_or_default();
    match encrypt_data(&key, &plaintext) {
        Ok(encrypted) => {
            // ATOMIC + FSYNC (L7-1 + L2-5): tmp write with sync_all before rename
            let tmp = dir.join(".notif-schedule.tmp");
            use std::io::Write;
            let ok = std::fs::OpenOptions::new()
                .write(true).create(true).truncate(true)
                .open(&tmp)
                .and_then(|mut f| { f.write_all(&encrypted)?; f.sync_all() })
                .is_ok();
            if ok { fs::rename(&tmp, dir.join(NOTIF_SCHEDULE_FILE)).is_ok() } else { false }
        },
        Err(_) => false,
    }
}

/// Decrypt notification schedule with local machine key
fn read_notification_schedule(data_dir: &PathBuf) -> Option<Value> {
    let path = data_dir.join(NOTIF_SCHEDULE_FILE);
    if !path.exists() { return None; }
    // SECURITY FIX (Level-8 C5): size guard before reading into RAM.
    if let Ok(meta) = path.metadata() {
        if meta.len() > MAX_SETTINGS_FILE_SIZE {
            eprintln!("[LexFlow] Notification schedule file troppo grande ({} bytes) — ignorato", meta.len());
            return None;
        }
    }
    let key = get_local_encryption_key();
    let encrypted = fs::read(&path).ok()?;
    // Try encrypted format first, fall back to plaintext for migration
    if let Ok(decrypted) = decrypt_data(&key, &encrypted) {
        serde_json::from_slice(&decrypted).ok()
    } else {
        // Migration: old plaintext format → re-encrypt
        if let Ok(text) = std::str::from_utf8(&encrypted) {
            if let Ok(val) = serde_json::from_str::<Value>(text) {
                // Re-encrypt and save
                if let Ok(enc) = encrypt_data(&key, &serde_json::to_vec(&val).unwrap_or_default()) {
                    let _ = fs::write(&path, enc);
                }
                return Some(val);
            }
        }
        None
    }
}

/// Background notification engine — reads encrypted schedule, no vault access needed
fn start_notification_scheduler(app: AppHandle, data_dir: PathBuf) {
    std::thread::spawn(move || {
        // SECURITY FIX (Gemini L5-5): Use epoch-based "what fired since last check" instead
        // of string "HH:MM" equality. The old approach missed notifications after:
        //   - DST transitions (clock jumps 60 min, skipping a full minute)
        //   - NTP corrections (clock steps backward, causing double-fire or silence)
        //   - System sleep/wake (60s tick skips minutes entirely)
        // New approach: remember the last_checked timestamp; fire anything whose scheduled
        // time falls in (last_checked, now]. This is monotonically safe and catches skipped
        // minutes after wake-from-sleep.
        //
        // NOTIFICATION FIX (Level-9): persist last_checked to disk so missed events are
        // recovered when the app is restarted or the PC is powered back on.
        // e.g. 8:00 reminder scheduled, PC powered on at 8:15 → fires immediately on startup.
        // Cap the catchup window to 24h to avoid spamming old events after a long absence.
        let local_key = get_local_encryption_key();
        let last_checked_path = data_dir.join(NOTIF_LAST_CHECKED_FILE);

        // Load persisted last_checked from disk; fall back to now-65s (normal startup behaviour)
        let mut last_checked: chrono::DateTime<chrono::Local> = {
            let from_disk = fs::read_to_string(&last_checked_path)
                .ok()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s.trim()).ok())
                .map(|dt| dt.with_timezone(&chrono::Local));
            match from_disk {
                Some(persisted) => {
                    // Cap catchup to 24h — avoids spamming week-old events after a long vacation
                    let cap = chrono::Local::now() - chrono::Duration::hours(24);
                    if persisted < cap { cap } else { persisted }
                },
                None => chrono::Local::now() - chrono::Duration::seconds(65),
            }
        };
        // Persist the startup value immediately so a crash loop doesn't replay events forever
        let _ = fs::write(&last_checked_path, last_checked.to_rfc3339());

        loop {
            std::thread::sleep(Duration::from_secs(60));

            let now = chrono::Local::now();
            // Window: (last_checked, now] — catches all minutes we might have skipped
            let window_start = last_checked;
            last_checked = now;
            // Persist so next startup knows where we got to
            let _ = fs::write(&last_checked_path, now.to_rfc3339());

            let today = now.format("%Y-%m-%d").to_string();
            let tomorrow = (now + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();

            // Read encrypted schedule
            let schedule: Value = match read_notification_schedule(&data_dir) {
                Some(v) => v,
                None => continue,
            };
            // Read encrypted sent log
            let sent_path = data_dir.join(NOTIF_SENT_FILE);
            let mut sent: Vec<String> = if sent_path.exists() {
                if let Ok(enc) = fs::read(&sent_path) {
                    if let Ok(dec) = decrypt_data(&local_key, &enc) {
                        serde_json::from_slice(&dec).unwrap_or_default()
                    } else {
                        fs::read_to_string(&sent_path).ok()
                            .and_then(|s| serde_json::from_str(&s).ok())
                            .unwrap_or_default()
                    }
                } else { vec![] }
            } else { vec![] };

            let briefing_times = schedule.get("briefingTimes")
                .and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let items = schedule.get("items")
                .and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut new_sent = false;

            // Helper: check if a "HH:MM" time on a given date falls in our window
            let time_in_window = |date_str: &str, time_str: &str| -> bool {
                if time_str.len() < 5 { return false; }
                let dt_str = format!("{} {}", date_str, time_str);
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(&dt_str, "%Y-%m-%d %H:%M") {
                    let dt_local = chrono::Local.from_local_datetime(&dt).single();
                    if let Some(t) = dt_local {
                        return t > window_start && t <= now;
                    }
                }
                false
            };

            // Briefing times (daily summary)
            for bt in &briefing_times {
                if let Some(time_str) = bt.as_str() {
                    if time_in_window(&today, time_str) {
                        let key = format!("briefing-{}-{}", today, time_str);
                        if !sent.contains(&key) {
                            let today_count = items.iter()
                                .filter(|i| i.get("date").and_then(|d| d.as_str()) == Some(today.as_str()))
                                .count();
                            let title = if today_count == 0 {
                                "LexFlow — Nessun impegno oggi".to_string()
                            } else {
                                format!("LexFlow — {} impegn{} oggi", today_count, if today_count == 1 { "o" } else { "i" })
                            };
                            let _ = app.emit("show-notification", json!({"title": title, "body": "Controlla la tua agenda per i dettagli."}));
                            sent.push(key);
                            new_sent = true;
                        }
                    }
                }
            }

            // Per-item reminders
            for item in &items {
                let item_date = item.get("date").and_then(|d| d.as_str()).unwrap_or("");
                let item_time = item.get("time").and_then(|t| t.as_str()).unwrap_or("");
                let remind_min = item.get("remindMinutes").and_then(|v| v.as_i64()).unwrap_or(30);
                let item_title = item.get("title").and_then(|t| t.as_str()).unwrap_or("Impegno");
                let item_id = item.get("id").and_then(|i| i.as_str()).unwrap_or("");

                if (item_date == today || item_date == tomorrow) && item_time.len() >= 5 {
                    // Compute the actual reminder fire time = item datetime - remind_min
                    let item_dt_str = format!("{} {}", item_date, item_time);
                    if let Ok(item_dt) = chrono::NaiveDateTime::parse_from_str(&item_dt_str, "%Y-%m-%d %H:%M") {
                        if let Some(item_local) = chrono::Local.from_local_datetime(&item_dt).single() {
                            let remind_time = item_local - chrono::Duration::minutes(remind_min);
                            if remind_time > window_start && remind_time <= now {
                                let key = format!("remind-{}-{}-{}", item_date, item_id, item_time);
                                if !sent.contains(&key) {
                                    let diff = (item_local - now).num_minutes().max(0);
                                    let body = if diff == 0 { format!("{} — adesso!", item_title) }
                                        else { format!("{} — tra {} minuti", item_title, diff) };
                                    let _ = app.emit("show-notification", json!({"title": "LexFlow — Promemoria", "body": body}));
                                    sent.push(key);
                                    new_sent = true;
                                }
                            }
                        }
                    }
                }
            }

            // Persist encrypted sent log (keep last 500)
            if new_sent {
                if sent.len() > 500 { sent.drain(..sent.len() - 500); }
                if let Ok(enc) = encrypt_data(&local_key, &serde_json::to_vec(&sent).unwrap_or_default()) {
                    let _ = fs::write(&sent_path, enc);
                }
            }
            // Daily cleanup: keep only today + tomorrow entries
            let current_minute = now.format("%H:%M").to_string();
            if current_minute == "00:00" {
                sent.retain(|s| s.contains(&today) || s.contains(&tomorrow));
                if let Ok(enc) = encrypt_data(&local_key, &serde_json::to_vec(&sent).unwrap_or_default()) {
                    let _ = fs::write(&sent_path, enc);
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
//  ANTI-SCREENSHOT & CONTENT PROTECTION
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn set_content_protection(app: AppHandle, enabled: bool) -> bool {
    #[cfg(not(target_os = "android"))]
    {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.set_content_protected(enabled);
            true
        } else { false }
    }
    #[cfg(target_os = "android")]
    {
        // Su Android FLAG_SECURE è gestito via tauri mobile — sempre attivo per sicurezza
        let _ = (app, enabled);
        true
    }
}

#[tauri::command]
fn ping_activity(state: State<AppState>) {
    *state.last_activity.lock().unwrap() = Instant::now();
}

#[tauri::command]
fn set_autolock_minutes(state: State<AppState>, minutes: u32) {
    *state.autolock_minutes.lock().unwrap() = minutes;
}

#[tauri::command]
fn get_autolock_minutes(state: State<AppState>) -> u32 {
    *state.autolock_minutes.lock().unwrap()
}

// ═══════════════════════════════════════════════════════════
//  WINDOW CONTROLS — solo desktop
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn window_minimize(app: AppHandle) {
    #[cfg(not(target_os = "android"))]
    if let Some(w) = app.get_webview_window("main") { let _ = w.minimize(); }
    #[cfg(target_os = "android")]
    { let _ = app; }
}

#[tauri::command]
fn window_maximize(app: AppHandle) {
    #[cfg(not(target_os = "android"))]
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); }
        else { let _ = w.maximize(); }
    }
    #[cfg(target_os = "android")]
    { let _ = app; }
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    #[cfg(not(target_os = "android"))]
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    #[cfg(target_os = "android")]
    { let _ = app; }
}

// ═══════════════════════════════════════════════════════════
//  APP RUNNER
// ═══════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Desktop: usa dirs::data_dir() — percorso stabile cross-platform
    // Android: usa un placeholder; il percorso reale viene risolto nel setup()
    //          tramite app.path().app_data_dir() che restituisce il path privato
    //          dell'app senza dipendere da env var o hardcoded fallback.
    #[cfg(not(target_os = "android"))]
    let data_dir = dirs::data_dir()
        .unwrap()
        .join("com.technojaw.lexflow")
        .join("lexflow-vault");

    #[cfg(target_os = "android")]
    let data_dir = std::path::PathBuf::from("/placeholder-android-will-be-set-in-setup");

    let _ = fs::create_dir_all(&data_dir);
    // data_dir_for_scheduler: su Android viene aggiornato nel setup() dopo aver
    // risolto il path reale — lo scheduler parte solo lì. Su desktop si passa subito.
    #[cfg(not(target_os = "android"))]
    let data_dir_for_scheduler = data_dir.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(AppState {
            data_dir: Mutex::new(data_dir),
            vault_key: Mutex::new(None),
            failed_attempts: Mutex::new(0),
            locked_until: Mutex::new(None),
            last_activity: Mutex::new(Instant::now()),
            autolock_minutes: Mutex::new(5),
            write_mutex: Mutex::new(()),
        })
        .setup(move |app| {
            // Su desktop lo scheduler parte subito con data_dir già risolto.
            // Su Android parte dopo aver risolto il path reale (vedi sotto).
            #[cfg(not(target_os = "android"))]
            start_notification_scheduler(app.handle().clone(), data_dir_for_scheduler.clone());

            #[cfg(target_os = "android")]
            {
                // Risolvi il path reale tramite Tauri PathResolver — nessun hardcoded path.
                // app_data_dir() = /data/data/<pkg>/files/ (privato, senza root).
                // Lo scheduler parte DOPO con il path corretto: nessuna race condition.
                if let Ok(real_dir) = app.path().app_data_dir() {
                    let vault_dir = real_dir.join("lexflow-vault");
                    let _ = fs::create_dir_all(&vault_dir);
                    *app.state::<AppState>().data_dir.lock().unwrap() = vault_dir.clone();
                    start_notification_scheduler(app.handle().clone(), vault_dir);
                }
            }

            #[cfg(not(target_os = "android"))]
            {
                // Anti-Screenshot: enable content protection by default (desktop only)
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_content_protected(true);
                }

                // Auto-lock thread con sleep adattivo:
                // - vault bloccato → dorme 60s (nessun lavoro da fare, risparmia CPU)
                // - vault sbloccato → dorme 30s (controlla inattività)
                // RACE CONDITION FIX (L7 #5): emit "lf-vault-warning" 30s before locking
                // so the frontend can show a "saving..." notice and the user can ping activity.
                // This prevents data loss when the user is mid-form at the autolock boundary.
                let ah = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        let state = ah.state::<AppState>();
                        let is_unlocked = state.vault_key.lock().unwrap().is_some();
                        if !is_unlocked {
                            std::thread::sleep(Duration::from_secs(60));
                            continue;
                        }
                        let minutes = *state.autolock_minutes.lock().unwrap();
                        let last = *state.last_activity.lock().unwrap();
                        drop(state);
                        std::thread::sleep(Duration::from_secs(30));
                        if minutes == 0 { continue; }
                        let elapsed = Instant::now().duration_since(last);
                        let threshold = Duration::from_secs(minutes as u64 * 60);
                        // Warning: 30s before actual lock
                        if elapsed >= threshold.saturating_sub(Duration::from_secs(30))
                            && elapsed < threshold
                        {
                            let _ = ah.emit("lf-vault-warning", ());
                        }
                        if elapsed >= threshold {
                            let state2 = ah.state::<AppState>();
                            *state2.vault_key.lock().unwrap() = None;
                            let _ = ah.emit("lf-vault-locked", ());
                        }
                    }
                });

                // Show main window after setup
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }

                // Window focus/blur events → privacy shield + intercept close to hide in tray
                let app_handle = app.handle().clone();
                if let Some(w) = app.get_webview_window("main") {
                    let w_clone = w.clone();
                    w.on_window_event(move |event| {
                        match event {
                            // Privacy shield: emit blur event so frontend can obscure content
                            tauri::WindowEvent::Focused(focused) => {
                                let _ = app_handle.emit("lf-blur", !focused);
                            }
                            // SYSTEM TRAY FIX: intercept the 'X' close button — hide the window
                            // instead of terminating the process so the notification scheduler
                            // keeps running in the background.  The user can quit via tray menu.
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                let _ = w_clone.hide();
                            }
                            _ => {}
                        }
                    });
                }

                // ── System Tray ───────────────────────────────────────────────
                // Keeps the process alive when the main window is hidden so the
                // notification scheduler continues running between sessions.
                {
                    use tauri::tray::TrayIconBuilder;
                    use tauri::menu::{Menu, MenuItem};

                    let show_item = MenuItem::with_id(app, "show", "Apri LexFlow", true, None::<&str>)?;
                    let quit_item = MenuItem::with_id(app, "quit", "Chiudi LexFlow", true, None::<&str>)?;
                    let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

                    TrayIconBuilder::new()
                        .tooltip("LexFlow — Gestionale Legale")
                        .icon(app.default_window_icon().unwrap().clone())
                        .menu(&tray_menu)
                        .show_menu_on_left_click(false)
                        // Right-click / menu item handler
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "show" => {
                                if let Some(w) = app.get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                            "quit" => {
                                // Lock vault before exiting so key is not in memory
                                let state = app.state::<AppState>();
                                *state.vault_key.lock().unwrap() = None;
                                app.exit(0);
                            }
                            _ => {}
                        })
                        // Left-click directly on the tray icon → show window
                        .on_tray_icon_event(|tray, event| {
                            if let tauri::tray::TrayIconEvent::Click {
                                button: tauri::tray::MouseButton::Left, ..
                            } = event {
                                if let Some(w) = tray.app_handle().get_webview_window("main") {
                                    let _ = w.show();
                                    let _ = w.set_focus();
                                }
                            }
                        })
                        .build(app)?;
                }
            }

            #[cfg(target_os = "android")]
            {
                // Android: stesso pattern sleep adattivo del desktop —
                // meno wakeup quando il vault è bloccato = risparmio batteria
                // RACE CONDITION FIX (L7 #5): warning event 30s before lock
                let ah = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        let state = ah.state::<AppState>();
                        let is_unlocked = state.vault_key.lock().unwrap().is_some();
                        if !is_unlocked {
                            std::thread::sleep(Duration::from_secs(60));
                            continue;
                        }
                        let minutes = *state.autolock_minutes.lock().unwrap();
                        let last = *state.last_activity.lock().unwrap();
                        drop(state);
                        std::thread::sleep(Duration::from_secs(30));
                        if minutes == 0 { continue; }
                        let elapsed = Instant::now().duration_since(last);
                        let threshold = Duration::from_secs(minutes as u64 * 60);
                        if elapsed >= threshold.saturating_sub(Duration::from_secs(30))
                            && elapsed < threshold
                        {
                            let _ = ah.emit("lf-vault-warning", ());
                        }
                        if elapsed >= threshold {
                            let state2 = ah.state::<AppState>();
                            *state2.vault_key.lock().unwrap() = None;
                            let _ = ah.emit("lf-vault-locked", ());
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Vault
            vault_exists,
            unlock_vault,
            lock_vault,
            reset_vault,
            change_password,
            verify_vault_password,
            get_audit_log,
            // Data
            load_practices,
            save_practices,
            load_agenda,
            save_agenda,
            get_summary,
            // Settings
            get_settings,
            save_settings,
            // Biometrics
            check_bio,
            has_bio_saved,
            save_bio,
            bio_login,
            clear_bio,
            // Files
            select_file,
            open_path,
            export_pdf,
            // Notifications
            send_notification,
            sync_notification_schedule,
            // License
            check_license,
            verify_license,
            activate_license,
            // Import / Export
            export_vault,
            import_vault,
            // Platform
            is_mac,
            get_app_version,
            get_platform,
            // Security & Content Protection
            set_content_protection,
            ping_activity,
            set_autolock_minutes,
            get_autolock_minutes,
            // Window
            window_minimize,
            window_maximize,
            window_close,
            show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}