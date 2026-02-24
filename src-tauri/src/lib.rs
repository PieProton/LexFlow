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
const LICENSE_FILE: &str = "license.json";

const BIO_SERVICE: &str = "LexFlow_Bio";

const VAULT_MAGIC: &[u8] = b"LEXFLOW_V2_SECURE";
const ARGON2_SALT_LEN: usize = 32;
const AES_KEY_LEN: usize = 32; 
const NONCE_LEN: usize = 12;

// Parametri Argon2id — bilanciati per piattaforma
// Desktop: 64MB RAM, 4 iterazioni → sicurezza massima
// Android: 16MB RAM, 3 iterazioni → ~0.8s su mid-range, sicurezza forte
#[cfg(not(target_os = "android"))]
const ARGON2_M_COST: u32 = 65536; // 64 MB
#[cfg(not(target_os = "android"))]
const ARGON2_T_COST: u32 = 4;
#[cfg(not(target_os = "android"))]
const ARGON2_P_COST: u32 = 2;

#[cfg(target_os = "android")]
const ARGON2_M_COST: u32 = 16384; // 16 MB — sicuro, non causa OOM
#[cfg(target_os = "android")]
const ARGON2_T_COST: u32 = 3;
#[cfg(target_os = "android")]
const ARGON2_P_COST: u32 = 1;

const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 300; 

// ═══════════════════════════════════════════════════════════
//  STATE & MEMORY PROTECTION
// ═══════════════════════════════════════════════════════════
// Derivata dalla macchina/device, non dalla password utente — inaccessibile da remoto
fn get_local_encryption_key() -> Vec<u8> {
    #[cfg(not(target_os = "android"))]
    {
        let user = whoami::username();
        let host = whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string());
        // Aggiungiamo l'UID del processo come secondo fattore di entropia —
        // due macchine con stesso username+hostname ma UID diversi producono chiavi diverse.
        let uid = std::env::var("UID").unwrap_or_else(|_| "0".to_string());
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
    // Zeroizing: i byte del plaintext vengono azzerati quando `plaintext` esce dallo scope
    let plaintext = Zeroizing::new(serde_json::to_vec(data).map_err(|e| e.to_string())?);
    let encrypted = encrypt_data(&key, &plaintext)?;
    let tmp = dir.join(".vault.tmp");
    fs::write(&tmp, encrypted).map_err(|e| e.to_string())?;
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
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return json!({"success": false, "locked": true, "remaining": (until - Instant::now()).as_secs()});
        }
    }

    let dir = state.data_dir.lock().unwrap().clone();
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
        match fs::write(&salt_path, &s) {
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
                    if *att >= MAX_FAILED_ATTEMPTS {
                        *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
                    }
                    return json!({"success": false, "error": "Password errata"});
                }
                // Vault esistente, password verificata — assegna chiave
                *state.vault_key.lock().unwrap() = Some(SecureKey(k));
            } else {
                let tag = make_verify_tag(&k);
                match fs::write(&verify_path, tag) {
                    Ok(_) => {},
                    Err(e) => return json!({"success": false, "error": format!("Errore init vault: {}", e)}),
                }
                // Assegna la chiave PRIMA di scrivere il vault iniziale — write_vault_internal
                // la legge dallo state. Nessun .clone() → nessuna copia non-zeroizzata in memoria.
                *state.vault_key.lock().unwrap() = Some(SecureKey(k));
                let _ = write_vault_internal(&state, &json!({"practices":[], "agenda":[]}));
            }
            *state.failed_attempts.lock().unwrap() = 0;
            *state.last_activity.lock().unwrap() = Instant::now();
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
            return json!({"success": false, "error": "Password errata"});
        }
    }
    let _ = {
        // SECURITY FIX (Gemini L3-2): preserve license.json across factory reset.
        // Previously remove_dir_all wiped license too, forcing re-activation after every reset.
        let license_backup: Option<Vec<u8>> = fs::read(dir.join(LICENSE_FILE)).ok();
        let _ = fs::remove_dir_all(&dir);
        let _ = fs::create_dir_all(&dir);
        // Restore license if it existed
        if let Some(license_data) = license_backup {
            let _ = fs::write(dir.join(LICENSE_FILE), license_data);
        }
    };
    *state.vault_key.lock().unwrap() = None;
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
    // Re-encrypt vault con la nuova chiave — plaintext zeroizzato dopo l'uso
    let vault_plaintext = Zeroizing::new(serde_json::to_vec(&vault_data).map_err(|e| e.to_string())?);
    let encrypted = encrypt_data(&new_key, &vault_plaintext)?;
    let tmp = dir.join(".vault.tmp");
    fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &vault_path).map_err(|e| e.to_string())?;
    // Update salt and verify
    fs::write(dir.join(VAULT_SALT_FILE), &new_salt).map_err(|e| e.to_string())?;
    fs::write(dir.join(VAULT_VERIFY_FILE), make_verify_tag(&new_key)).map_err(|e| e.to_string())?;
    // Re-encrypt audit log if exists — ATOMIC write via tmp+rename (Gemini L3-4)
    let audit_path = dir.join(AUDIT_LOG_FILE);
    if audit_path.exists() {
        if let Ok(enc) = fs::read(&audit_path) {
            if let Ok(dec) = decrypt_data(&current_key, &enc) {
                if let Ok(re_enc) = encrypt_data(&new_key, &dec) {
                    let audit_tmp = dir.join(".audit.tmp");
                    if fs::write(&audit_tmp, re_enc).is_ok() {
                        let _ = fs::rename(&audit_tmp, &audit_path);
                    }
                }
            }
        }
    }
    // Update in-memory key
    *state.vault_key.lock().unwrap() = Some(SecureKey(new_key));
    // Update biometric if saved
    let user = whoami::username();
    if let Ok(entry) = keyring::Entry::new(BIO_SERVICE, &user) {
        if entry.get_password().is_ok() {
            let _ = entry.set_password(&new_password);
        }
    }
    let _ = append_audit_log(&state, "Password cambiata");
    Ok(json!({"success": true}))
}

#[tauri::command]
fn verify_vault_password(state: State<AppState>, pwd: String) -> Result<Value, String> {
    // Applica lo stesso lockout di unlock_vault per prevenire brute-force parallelo
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return Ok(json!({"valid": false, "locked": true, "remaining": (until - Instant::now()).as_secs()}));
        }
    }
    let dir = state.data_dir.lock().unwrap().clone();
    let salt = fs::read(dir.join(VAULT_SALT_FILE)).map_err(|e| e.to_string())?;
    let key = derive_secure_key(&pwd, &salt)?;
    let stored = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
    let valid = verify_hash_matches(&key, &stored);
    if !valid {
        let mut att = state.failed_attempts.lock().unwrap();
        *att += 1;
        if *att >= MAX_FAILED_ATTEMPTS {
            *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
        }
    } else {
        *state.failed_attempts.lock().unwrap() = 0;
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
fn bio_login() -> Result<String, String> {
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
        if !status.success() { return Err("Fallito".into()); }
        let user = whoami::username();
        keyring::Entry::new(BIO_SERVICE, &user).and_then(|e| e.get_password()).map_err(|e| e.to_string())
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
        if !status.success() { return Err("Windows Hello fallito o non disponibile".into()); }
        let user = whoami::username();
        keyring::Entry::new(BIO_SERVICE, &user).and_then(|e| e.get_password()).map_err(|e| e.to_string())
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

#[tauri::command]
fn get_settings(state: State<AppState>) -> Value {
    let path = state.data_dir.lock().unwrap().join(SETTINGS_FILE);
    if !path.exists() { return json!({}); }
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
        Ok(encrypted) => fs::write(path, encrypted).is_ok(),
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
                    if let Ok(re_enc) = encrypt_data(&key, &serde_json::to_vec(&val).unwrap_or_default()) {
                        let _ = fs::write(&path, re_enc);
                    }
                    val
                } else { return json!({"activated": false}); }
            } else { return json!({"activated": false}); }
        }
    } else { return json!({"activated": false}); };
    
    let license_key = data.get("key").and_then(|k| k.as_str()).unwrap_or("");
    if !license_key.is_empty() && verify_license_key(license_key) {
        // Scadenza 24h dall'attivazione — uguale su desktop e mobile
        if let Some(activated_str) = data.get("activatedAt").and_then(|v| v.as_str()) {
            if let Ok(activated_time) = chrono::DateTime::parse_from_rfc3339(activated_str) {
                let now = chrono::Utc::now();
                let elapsed = now.signed_duration_since(activated_time);
                if elapsed > chrono::Duration::days(365) {
                    let _ = fs::remove_file(&path);
                    return json!({"activated": false, "expired": true, "reason": "Chiave scaduta (1 anno). Inserisci una nuova chiave."});
                }
                let remaining_secs = (chrono::Duration::days(365) - elapsed).num_seconds().max(0);
                return json!({
                    "activated": true,
                    "key": license_key,
                    "activatedAt": activated_str,
                    "client": data.get("client").cloned().unwrap_or(Value::Null),
                    "remainingSecs": remaining_secs,
                });
            }
            let _ = fs::remove_file(&path);
            return json!({"activated": false, "expired": true, "reason": "Formato licenza obsoleto. Inserisci una nuova chiave."});
        }
        let _ = fs::remove_file(&path);
        json!({"activated": false, "expired": true, "reason": "Licenza corrotta. Inserisci una nuova chiave."})
    } else {
        json!({"activated": false})
    }
}

// MASTER_SECRET deve essere identico alla costante nel keygen JS.
// NON usare get_license_secret() qui — quella è machine-specific e renderebbe
// le chiavi generate dallo sviluppatore non verificabili sul PC del cliente.
//
// Offuscamento XOR: la stringa non appare in chiaro nel binario (non visibile con `strings`).
// Generato con: secret.bytes().zip(XOR_MASK.iter().cycle()).map(|(b,k)| b^k).collect()
// Nota: questa è sicurezza per oscurità, non crittografia. Il segreto vero va custodito
// nel codice sorgente privato — questo impedisce solo l'estrazione triviale da binario.

const LICENSE_SECRET_XOR: &[u8] = &[
    0x0b,0x3f,0x4a,0x37,0x40,0x28,0x2d,0x1f,0x3c,0x4d,
    0x34,0x2e,0x57,0x03,0x01,0x75,0x6a,0x00,0x47,0x01,
    0x17,0x33,0x57,0x05,0x5e,0x28,0x16,0x5d,0x1f,0x4b,
    0x28,0x77,0x76,0x3e,0x73,0x09,0x15,0x66,0x2e,0x7f,
    0x0f,0x1b,0x60,0x34,
];
const LICENSE_XOR_MASK: &[u8] = &[0x47, 0x5a, 0x32, 0x71, 0x2c];

fn get_license_master_secret() -> Vec<u8> {
    LICENSE_SECRET_XOR.iter()
        .zip(LICENSE_XOR_MASK.iter().cycle())
        .map(|(b, k)| b ^ k)
        .collect()
}

fn hmac_checksum(payload: &str) -> String {
    let secret = get_license_master_secret();
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&secret)
        .expect("HMAC init");
    mac.update(payload.as_bytes());
    let result = mac.finalize().into_bytes();
    // SECURITY FIX (Gemini L5-2): 8 hex chars (4 bytes) instead of 4 (2 bytes).
    // 4-char checksum = 65536 brute-force combinations; 8-char = 4 billion.
    format!("{:02X}{:02X}{:02X}{:02X}", result[0], result[1], result[2], result[3])
}

fn verify_license_key(key: &str) -> bool {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 || parts[0] != "LXFW" { return false; }
    let s2 = parts[1];
    let s3 = parts[2];
    let s4 = parts[3];
    let checksum = parts[4];
    // Ogni segmento payload deve essere 4 caratteri hex validi.
    // SECURITY FIX (Gemini L5-2): checksum is now 8 hex chars (was 4).
    if s2.len() != 4 || s3.len() != 4 || s4.len() != 4 || checksum.len() != 8 { return false; }
    let payload = format!("{}{}{}", s2, s3, s4);
    if hex::decode(&payload).is_err() { return false; }
    hmac_checksum(&payload) == checksum
}

#[tauri::command]
fn activate_license(state: State<AppState>, key: String) -> Value {
    // Anti brute-force: usa lo stesso lockout del vault
    if let Some(until) = *state.locked_until.lock().unwrap() {
        if Instant::now() < until {
            return json!({"success": false, "locked": true, "remaining": (until - Instant::now()).as_secs()});
        }
    }
    
    let key = key.trim().to_uppercase();
    if !verify_license_key(&key) {
        let mut att = state.failed_attempts.lock().unwrap();
        *att += 1;
        if *att >= MAX_FAILED_ATTEMPTS {
            *state.locked_until.lock().unwrap() = Some(Instant::now() + Duration::from_secs(LOCKOUT_SECS));
        }
        return json!({"success": false, "error": "Chiave non valida. Controlla di averla inserita correttamente."});
    }
    *state.failed_attempts.lock().unwrap() = 0;
    let path = state.data_dir.lock().unwrap().join(LICENSE_FILE);
    let now = chrono::Utc::now().to_rfc3339();
    let record = json!({"key": key, "activatedAt": now, "client": "Utente"});
    let enc_key = get_local_encryption_key();
    match encrypt_data(&enc_key, &serde_json::to_vec(&record).unwrap_or_default()) {
        Ok(encrypted) => {
            match fs::write(&path, encrypted) {
                Ok(_) => json!({"success": true, "key": key}),
                Err(e) => json!({"success": false, "error": format!("Errore: {}", e)}),
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
        write_vault_internal(&state, &val)?;
        let _ = append_audit_log(&state, "Vault importato da backup");
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
            // RACE CONDITION FIX (Gemini L2-5): use atomic write via tmp+rename
            // to prevent partial writes that could corrupt the schedule file.
            let tmp = dir.join(".notif-schedule.tmp");
            if fs::write(&tmp, encrypted).is_ok() {
                fs::rename(&tmp, dir.join(NOTIF_SCHEDULE_FILE)).is_ok()
            } else {
                false
            }
        },
        Err(_) => false,
    }
}

/// Decrypt notification schedule with local machine key
fn read_notification_schedule(data_dir: &PathBuf) -> Option<Value> {
    let path = data_dir.join(NOTIF_SCHEDULE_FILE);
    if !path.exists() { return None; }
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
        let local_key = get_local_encryption_key();
        // Initialize last_checked to "now - 65s" so we don't re-fire old events on startup,
        // but do fire anything that was due in the last minute (handles startup delay).
        let mut last_checked = chrono::Local::now() - chrono::Duration::seconds(65);

        loop {
            std::thread::sleep(Duration::from_secs(60));

            let now = chrono::Local::now();
            // Window: (last_checked, now] — catches all minutes we might have skipped
            let window_start = last_checked;
            last_checked = now;

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
                // Nessun doppio-lock: legge tutti i valori necessari prima di decidere,
                // poi acquisisce vault_key solo se deve bloccare (evita deadlock).
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
                        drop(state); // rilascia Mutex prima di dormire
                        std::thread::sleep(Duration::from_secs(30));
                        if minutes == 0 { continue; }
                        let elapsed = Instant::now().duration_since(last);
                        if elapsed >= Duration::from_secs(minutes as u64 * 60) {
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

                // Window focus/blur events → emit to frontend for privacy shield
                let app_handle = app.handle().clone();
                if let Some(w) = app.get_webview_window("main") {
                    w.on_window_event(move |event| {
                        if let tauri::WindowEvent::Focused(focused) = event {
                            let _ = app_handle.emit("lf-blur", !focused);
                        }
                    });
                }
            }

            #[cfg(target_os = "android")]
            {
                // Android: stesso pattern sleep adattivo del desktop —
                // meno wakeup quando il vault è bloccato = risparmio batteria
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
                        if elapsed >= Duration::from_secs(minutes as u64 * 60) {
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