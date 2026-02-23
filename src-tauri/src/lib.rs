use serde_json::{Value, json};
use std::{fs, path::PathBuf, sync::Mutex, time::{Instant, Duration}};
use tauri::{Manager, State, AppHandle, Emitter};
use zeroize::{Zeroize, Zeroizing};

// Security & Crypto Hardened
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

const ARGON2_M_COST: u32 = 65536; 
const ARGON2_T_COST: u32 = 4;
const ARGON2_P_COST: u32 = 2;

const MAX_FAILED_ATTEMPTS: u32 = 5;
const LOCKOUT_SECS: u64 = 300; 

// ═══════════════════════════════════════════════════════════
//  STATE & MEMORY PROTECTION
// ═══════════════════════════════════════════════════════════
// Derivata dalla macchina, non dalla password utente — inaccessibile da remoto
fn get_local_encryption_key() -> Vec<u8> {
    let user = whoami::username();
    let host = whoami::fallible::hostname().unwrap_or_else(|_| "unknown".to_string());
    let seed = format!("LEXFLOW-LOCAL-KEY:{}:{}:FORTKNOX", user, host);
    let hash = <Sha256 as Digest>::digest(seed.as_bytes());
    hash.to_vec()
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
    let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(b"LEX_VERIFY_2026").unwrap();
    hmac.update(key);
    hmac.verify_slice(stored).is_ok()
}

// ═══════════════════════════════════════════════════════════
//  INTERNAL DATA HELPERS
// ═══════════════════════════════════════════════════════════

fn get_vault_key(state: &State<AppState>) -> Result<Vec<u8>, String> {
    state.vault_key.lock().unwrap().as_ref().map(|k| k.0.clone()).ok_or_else(|| "Locked".into())
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
    let encrypted = encrypt_data(&key, &serde_json::to_vec(data).unwrap())?;
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
        let mut s = vec![0u8; 32];
        rand::RngCore::fill_bytes(&mut rand::thread_rng(), &mut s);
        fs::write(&salt_path, &s).unwrap();
        s
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
            } else {
                let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(b"LEX_VERIFY_2026").unwrap();
                hmac.update(&k);
                fs::write(&verify_path, hmac.finalize().into_bytes()).unwrap();
                *state.vault_key.lock().unwrap() = Some(SecureKey(k.clone()));
                let _ = write_vault_internal(&state, &json!({"practices":[], "agenda":[]}));
            }
            *state.vault_key.lock().unwrap() = Some(SecureKey(k));
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
fn reset_vault(state: State<AppState>) -> Value {
    let dir = state.data_dir.lock().unwrap().clone();
    let _ = fs::remove_dir_all(&dir);
    let _ = fs::create_dir_all(&dir);
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
    // Re-encrypt vault
    let encrypted = encrypt_data(&new_key, &serde_json::to_vec(&vault_data).unwrap())?;
    let tmp = dir.join(".vault.tmp");
    fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &vault_path).map_err(|e| e.to_string())?;
    // Update salt and verify
    fs::write(dir.join(VAULT_SALT_FILE), &new_salt).map_err(|e| e.to_string())?;
    let mut hmac = <Hmac<Sha256> as Mac>::new_from_slice(b"LEX_VERIFY_2026").unwrap();
    hmac.update(&new_key);
    fs::write(dir.join(VAULT_VERIFY_FILE), hmac.finalize().into_bytes()).map_err(|e| e.to_string())?;
    // Re-encrypt audit log if exists
    let audit_path = dir.join(AUDIT_LOG_FILE);
    if audit_path.exists() {
        if let Ok(enc) = fs::read(&audit_path) {
            if let Ok(dec) = decrypt_data(&current_key, &enc) {
                if let Ok(re_enc) = encrypt_data(&new_key, &dec) {
                    let _ = fs::write(&audit_path, re_enc);
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
    let dir = state.data_dir.lock().unwrap().clone();
    let salt = fs::read(dir.join(VAULT_SALT_FILE)).map_err(|e| e.to_string())?;
    let key = derive_secure_key(&pwd, &salt)?;
    let stored = fs::read(dir.join(VAULT_VERIFY_FILE)).unwrap_or_default();
    Ok(json!({"valid": verify_hash_matches(&key, &stored)}))
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
fn check_bio() -> bool { cfg!(any(target_os = "macos", target_os = "windows")) }

#[tauri::command]
fn has_bio_saved() -> bool {
    let user = whoami::username();
    let entry = keyring::Entry::new(BIO_SERVICE, &user);
    match entry {
        Ok(e) => e.get_password().is_ok(),
        Err(_) => false,
    }
}

#[tauri::command]
fn save_bio(pwd: String) -> Result<bool, String> {
    let user = whoami::username();
    let entry = keyring::Entry::new(BIO_SERVICE, &user).map_err(|e| e.to_string())?;
    entry.set_password(&pwd).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
fn bio_login() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        // FORT KNOX: Swift code passed via stdin — NEVER written to disk
        let swift_code = "import LocalAuthentication\nlet ctx = LAContext()\nvar err: NSError?\nif ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) {\n  let sema = DispatchSemaphore(value: 0)\n  var ok = false\n  ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: \"LexFlow\") { s, _ in ok = s; sema.signal() }\n  sema.wait()\n  if ok { exit(0) } else { exit(1) }\n} else { exit(1) }";
        
        use std::io::Write;
        let mut child = std::process::Command::new("swift")
            .arg("-")  // Read from stdin
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        
        if let Some(ref mut stdin) = child.stdin {
            stdin.write_all(swift_code.as_bytes()).map_err(|e| e.to_string())?;
        }
        // Drop stdin to signal EOF
        drop(child.stdin.take());
        
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() { return Err("Fallito".into()); }
    }
    let user = whoami::username();
    keyring::Entry::new(BIO_SERVICE, &user).and_then(|e| e.get_password()).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_bio() -> bool {
    let user = whoami::username();
    if let Ok(e) = keyring::Entry::new(BIO_SERVICE, &user) { let _ = e.delete_credential(); }
    true
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
    if logs.len() > 100 { logs.remove(0); }
    let enc = encrypt_data(&key, &serde_json::to_vec(&logs).unwrap())?;
    let _ = fs::write(path, enc);
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
        json!({
            "activated": true,
            "key": license_key,
            "activatedAt": data.get("activatedAt").cloned().unwrap_or(Value::Null),
            "client": data.get("client").cloned().unwrap_or(Value::Null),
        })
    } else {
        json!({"activated": false})
    }
}

// MASTER_SECRET deve essere identico alla costante nel keygen JS.
// NON usare get_license_secret() qui — quella è machine-specific e renderebbe
// le chiavi generate dallo sviluppatore non verificabili sul PC del cliente.
const LICENSE_MASTER_SECRET: &str = "LexFlow-Master-2026-PietroLongo-DO_NOT_SHARE";

fn hmac_checksum(payload: &str) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(LICENSE_MASTER_SECRET.as_bytes())
        .expect("HMAC init");
    mac.update(payload.as_bytes());
    let result = mac.finalize().into_bytes();
    // 4 caratteri HEX maiuscolo (stessa logica del keygen JS)
    format!("{:02X}{:02X}", result[0], result[1]).chars().take(4).collect::<String>()
}

fn verify_license_key(key: &str) -> bool {
    let parts: Vec<&str> = key.split('-').collect();
    if parts.len() != 5 || parts[0] != "LXFW" { return false; }
    let s2 = parts[1];
    let s3 = parts[2];
    let s4 = parts[3];
    let checksum = parts[4];
    // Ogni segmento deve essere 4 caratteri hex validi
    if s2.len() != 4 || s3.len() != 4 || s4.len() != 4 || checksum.len() != 4 { return false; }
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
    let now = chrono::Utc::now().format("%Y-%m-%d").to_string();
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
fn export_vault(state: State<AppState>, pwd: String, app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let data = read_vault_internal(&state)?;
    let salt = (0..32).map(|_| rand::random::<u8>()).collect::<Vec<_>>();
    let key = derive_secure_key(&pwd, &salt)?;
    let encrypted = encrypt_data(&key, &serde_json::to_vec(&data).unwrap())?;
    let mut out = salt; out.extend(encrypted);

    let path = app.dialog().file().set_file_name("LexFlow_Backup.lex").blocking_save_file();
    if let Some(p) = path {
        fs::write(p.into_path().unwrap(), out).map_err(|e| e.to_string())?;
        Ok(json!({"success": true}))
    } else { Ok(json!({"success": false})) }
}

#[tauri::command]
fn import_vault(state: State<AppState>, pwd: String, app: AppHandle) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog().file().blocking_pick_file();
    if let Some(p) = path {
        let raw = fs::read(p.into_path().unwrap()).map_err(|e| e.to_string())?;
        let salt = &raw[..32];
        let encrypted = &raw[32..];
        let key = derive_secure_key(&pwd, salt)?;
        let decrypted = decrypt_data(&key, encrypted).map_err(|_| "Password errata")?;
        let val: Value = serde_json::from_slice(&decrypted).map_err(|e| e.to_string())?;
        write_vault_internal(&state, &val)?;
        Ok(json!({"success": true}))
    } else { Ok(json!({"success": false})) }
}

// ═══════════════════════════════════════════════════════════
//  SYSTEM UTILITIES
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn open_path(path: String) { let _ = open::that(path); }

#[tauri::command]
fn select_file(app: AppHandle) -> Result<Option<Value>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app.dialog().file().add_filter("Documenti", &["pdf","docx","doc"]).blocking_pick_file();
    Ok(file.map(|f| json!({"name": f.clone().into_path().unwrap().file_name().unwrap().to_string_lossy(), "path": f.into_path().unwrap().to_string_lossy()})))
}

#[tauri::command]
fn window_close(app: AppHandle, state: State<AppState>) {
    *state.vault_key.lock().unwrap() = None;
    if let Some(w) = app.get_webview_window("main") { let _ = w.hide(); }
}

#[tauri::command]
fn get_app_version(app: AppHandle) -> String { app.package_info().version.to_string() }

#[tauri::command]
fn is_mac() -> bool { cfg!(target_os = "macos") }

#[tauri::command]
fn export_pdf(app: AppHandle, data: Vec<u8>, default_name: String) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_path = app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .set_file_name(&default_name)
        .blocking_save_file();
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
        Ok(encrypted) => fs::write(dir.join(NOTIF_SCHEDULE_FILE), encrypted).is_ok(),
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
        let mut last_minute = String::new();
        let local_key = get_local_encryption_key();
        loop {
            std::thread::sleep(Duration::from_secs(60));
            let now = chrono::Local::now();
            let current_minute = now.format("%H:%M").to_string();
            if current_minute == last_minute { continue; }
            last_minute = current_minute.clone();
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
                    // Try encrypted first
                    if let Ok(dec) = decrypt_data(&local_key, &enc) {
                        serde_json::from_slice(&dec).unwrap_or_default()
                    } else {
                        // Migration from plaintext
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
            // Briefing times (daily summary)
            for bt in &briefing_times {
                if let Some(time_str) = bt.as_str() {
                    if time_str == current_minute {
                        let key = format!("briefing-{}-{}", today, time_str);
                        if !sent.contains(&key) {
                            let today_count = items.iter()
                                .filter(|i| i.get("date").and_then(|d| d.as_str()) == Some(&today))
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
                if (item_date == today || item_date == tomorrow) && !item_time.is_empty() && item_time.len() >= 5 {
                    if let (Ok(h), Ok(m)) = (item_time[..2].parse::<i64>(), item_time[3..5].parse::<i64>()) {
                        let item_minutes = h * 60 + m;
                        let now_minutes = now.format("%H").to_string().parse::<i64>().unwrap_or(0) * 60
                            + now.format("%M").to_string().parse::<i64>().unwrap_or(0);
                        let diff = if item_date == today { item_minutes - now_minutes }
                            else { item_minutes + 1440 - now_minutes };
                        if diff >= 0 && diff <= remind_min {
                            let key = format!("remind-{}-{}-{}", item_date, item_id, item_time);
                            if !sent.contains(&key) {
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
            // Persist encrypted sent log (keep last 500)
            if new_sent {
                if sent.len() > 500 { sent.drain(..sent.len() - 500); }
                if let Ok(enc) = encrypt_data(&local_key, &serde_json::to_vec(&sent).unwrap_or_default()) {
                    let _ = fs::write(&sent_path, enc);
                }
            }
            // Daily cleanup at midnight
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
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_content_protected(enabled);
        true
    } else { false }
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
//  WINDOW CONTROLS
// ═══════════════════════════════════════════════════════════

#[tauri::command]
fn window_minimize(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") { let _ = w.minimize(); }
}

#[tauri::command]
fn window_maximize(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); }
        else { let _ = w.maximize(); }
    }
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// ═══════════════════════════════════════════════════════════
//  APP RUNNER
// ═══════════════════════════════════════════════════════════

pub fn run() {
    let data_dir = dirs::data_dir().unwrap().join("com.technojaw.lexflow").join("lexflow-vault");
    let _ = fs::create_dir_all(&data_dir);
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
            // Start notification scheduler
            start_notification_scheduler(app.handle().clone(), data_dir_for_scheduler.clone());

            // Anti-Screenshot: enable content protection by default
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_content_protected(true);
            }

            // Auto-lock thread: checks inactivity every 30 seconds
            let autolock_handle = app.handle().clone();
            let _state_ref = app.state::<AppState>();
            let ah = autolock_handle.clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_secs(30));
                    let state = ah.state::<AppState>();
                    // Only auto-lock if vault is currently unlocked
                    let is_unlocked = state.vault_key.lock().unwrap().is_some();
                    if !is_unlocked { continue; }
                    
                    let minutes = *state.autolock_minutes.lock().unwrap();
                    if minutes == 0 { continue; } // 0 = disabled
                    let last = *state.last_activity.lock().unwrap();
                    let elapsed = Instant::now().duration_since(last);
                    if elapsed >= Duration::from_secs(minutes as u64 * 60) {
                        // Auto-lock: wipe vault key and notify frontend
                        *state.vault_key.lock().unwrap() = None;
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
                    match event {
                        tauri::WindowEvent::Focused(focused) => {
                            let _ = app_handle.emit("lf-blur", !focused);
                        },
                        _ => {}
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