# 📝 Changelog — LexFlow

Formato: [SemVer](https://semver.org/) — `MAJOR.MINOR.PATCH`

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
