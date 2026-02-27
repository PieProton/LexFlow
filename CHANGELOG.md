# 📝 Changelog — LexFlow

Formato: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`

---

## [3.5.0] — 2026-02-27

### Aggiunto
- **CRM Legale completo** — 4 nuove pagine: Time Tracking, Fatturazione, Rubrica Contatti, Conflict Check
- **Time Tracking** — Timer live con pratica associata, inserimento manuale, griglia settimanale ore, esportazione sessioni. `practiceName` salvato al momento dello start (fix: lookup post-autolock rimosso)
- **Fatturazione** — CRUD fatture, calcolo automatico CPA 4% + IVA 22%, generazione PDF via jsPDF/autotable. `calcTotals` refactored in funzione standalone (fix: spread overwrite)
- **Rubrica Contatti** — 6 tipologie (cliente, controparte, teste, CTU, avvocato, altro), ricerca/filtro, panel dettaglio, pratiche collegate
- **Conflict Check** — Ricerca debounced su parti di tutte le pratiche + rubrica contatti, con indicazione del ruolo
- **8 nuovi comandi Rust** — `load_time_logs`, `save_time_logs`, `load_invoices`, `save_invoices`, `load_contacts`, `save_contacts`, `check_conflict` (fix tipo di ritorno), `select_folder` separato da `select_file`
- **`select_folder`** — Nuovo comando distinto che apre picker directory (fix: usava il picker file)

### Fix (Security Audit — 10 bug totali confermati)
- **`check_conflict("")`** — restituiva tipo errato su stringa vuota; ora ritorna `[]` correttamente
- **`BillingPage.calcTotals`** — spread overwrite azzerava i totali; refactored in funzione standalone
- **`TimeTrackingPage` practiceName** — lookup post-autolock restituiva undefined; salvato al momento dello start
- **Autolock biometric popup** — focus rubato al login manuale; gate popup solo se `!autoLocked`
- **HamburgerButton posizione** — era bottom-right; spostato top-right per standard UX mobile
- **Mobile sidebar overflow** — contenuto fuori schermo; aggiunto `overflow-y-auto` + `max-h-screen`
- **Sidebar ordine non gerarchico** — riordinato: Quotidiano → Studio → Amministrazione → Configurazione
- **PracticeDetail nessun fallback password** — biometric gate senza fallback; aggiunto input password
- **`select_folder` usava picker file** — apertura errata; separato in comando dedicato `select_folder`
- **Desktop sidebar spacing** — spazio eccessivo tra voci; ridotto a layout compatto

### Audit Finale
- **~9.600+ righe analizzate** su 29 file — 0 nuovi bug trovati

---

## [3.0.0] — 2026-02-26

### ⚠️ Breaking Changes
- **Rotazione chiavi Ed25519** — Nuova coppia di chiavi per firma licenze (le vecchie licenze non sono più valide)

### Aggiunto
- **Architettura ibrida notifiche** — Desktop usa Tokio cron job (60s interval) per notifiche affidabili; Mobile mantiene `Schedule::At` nativo AOT
- **Prevenzione App Nap macOS** — FFI `NSProcessInfo.beginActivityWithOptions` impedisce a macOS di sospendere il cron job in background
- **Capability `notification:default`** — Permessi notifiche allineati per Desktop e Mobile

### Fix
- **Notifiche Desktop ignorate** — `notify-rust` (backend Desktop di `tauri-plugin-notification`) ignora silenziosamente `Schedule::At`; risolto con cron job Tokio
- **Dead code warnings** — `notif_id`, `Schedule`, `TimeZone` gated con `#[cfg(target_os = "android/ios")]`

### Dipendenze
- Aggiunto `tokio` feature `time` per `tokio::time::interval`
- Aggiunto `objc 0.2.7` + `cocoa 0.24.1` (macOS only) per App Nap prevention

---

## [2.6.0] — 2026-02-26

### Pulizia Progetto
- **Root cause fix**: rimosso `src-tauri/src/bin/keygen.rs` (Tauri bundlava il binario sbagliato)
- Rimosso `patches/tao/` (~200 file non necessari)
- Rimosso `scripts/license-keygen.js` (sistema licenze HMAC vecchio, sostituito da Ed25519)
- Rimosso `scripts/gen_keys.py` (monouso, chiave pubblica già embedded)
- Rimosso `install-macos.sh`, `build-android.sh` (duplicati di script npm)
- Rimosso `ANDROID_BUILD.md` (guida SDK obsoleta)
- Rimosso `client/e2e/` (test Playwright non integrati)
- Rimosso `client/src/api.js` (dead code, mai importato)
- Rimosso `lexflow-release.keystore` e `.env.android` (segreti rimossi dal disco)
- Rimosso dipendenze Rust inutilizzate: `uuid`, `image`
- Rimosso config Electron residue da `package.json`
- Rimosso README ridondanti (client, assets, scripts)
- Pulito `.gitignore` da voci fantasma (electron/, build/, supabase/, .next/)
- Allineata versione `Cargo.toml` a 2.6.0

### Fix
- `tauri.conf.json`: `visible: true`, CSP rimossa, identifier allineato
- `vite.config.js`: `base: '/'` (era `'./'` stile Electron)
- Build macOS produce correttamente `LexFlow.app` (8MB) con binario `lexflow` arm64
- DMG funzionante: `LexFlow_2.6.0_aarch64.dmg` (4.5MB)

---

## [2.4.0] — 2026-02-24

### Sicurezza (Audit L7 · L8 · L9)
- **Argon2**: costo memoria unificato a 16 MB su tutte le piattaforme (anti-downgrade)
- **Permessi file**: scrittura vault con `0600` (owner-only), `sync_all()` garantita
- **Difesa symlink**: `is_safe_write_path()` previene attacchi di path traversal
- **`write_mutex`**: serializzazione scrittura vault, elimina race condition
- **`secure_write()`**: scrittura atomica con `rename()` e sync disco
- **`zeroize`**: cancellazione sicura password in RAM dopo unlock/reset/change/import vault
- **Scheduler persistente**: `NOTIF_LAST_CHECKED_FILE` sopravvive a riavvii, catchup capped a 24h
- **OOM guard**: limite dimensione file settings a 10 MB prima del parse
- **Difesa symlink su export**: `is_safe_write_path()` applicato a tutti i path di scrittura
- **`main.rs`**: rimosso codice WebView2/PowerShell, solo `run()` minimo
- **License**: rimosso comando `delete_license` (prevenzione manomissione)
- **`offlineInstaller`**: WebView2 bundled, nessuna connessione a runtime richiesta

### Funzionalità
- **System Tray**: chiudere la finestra nasconde l'app (non la termina), lo scheduler rimane attivo
- **Tray menu**: voci "Mostra LexFlow" e "Esci" con icone native
- **ExportWarningModal**: avviso sicurezza prima di ogni export PDF (GDPR / segreto professionale)
- **Conferma password export**: verifica vault prima di procedere con `exportPracticePDF()`

### Build & Distribuzione
- **macOS**: DMG universale `LexFlow_2.4.0_universal.dmg` (arm64 + x86_64)
- **Windows**: installer WiX MSI (sostituisce NSIS) — si installa in `Program Files`, supporta GPO/Intune
- **Android**: APK universale firmato V2+V3, keystore RSA-4096, validità 27 anni
- **Android permessi**: `POST_NOTIFICATIONS`, `VIBRATE`, `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK`
- **GitHub Actions**: workflow `build-windows.yml` aggiornato NSIS→MSI, build on tag `v*`
- **`build-android.sh`**: script locale con Java 21 auto-select e caricamento keystore
- **`upgradeCode` WiX**: UUID fisso `8166B188-49AA-4B0E-BAE7-31D8DA09BA84` per upgrade Windows

### Fix
- `BIO_SERVICE`: aggiunto `#[allow(dead_code)]` per warning falso positivo su target macOS
- `package.json` root e client allineati alla versione Tauri (erano rimasti a 2.3.24)
- `versionCode` Android: 240

---

## [1.9.7] — 2026-02-18

### Cambiato
- Icone tray arrotondate stile macOS
- Notifiche native via `send_notification`
- Migrazione completa a Tauri v2

### Struttura
- Riorganizzazione completa cartelle secondo BUILD_MASTER
- Rimossa cartella `build/` (residuo Electron)
- Aggiunto `assets/icon-master.png` come sorgente unica
- Aggiunto `scripts/generate-icons.py`
- Aggiunto `releases/`
- Script npm standardizzati
- .gitignore aggiornato
