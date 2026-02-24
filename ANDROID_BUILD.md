# LexFlow — Guida Setup Android SDK + Build APK

## PREREQUISITI GIÀ SODDISFATTI ✅
- Rust target Android installati (`aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`)
- Java OpenJDK 25 installato
- `sdkmanager` disponibile in `/opt/homebrew/bin/sdkmanager`
- Codice Rust adattato con `#[cfg(target_os = "android")]` su ogni blocco desktop-only
- Argon2id ottimizzato per mobile (16 MB / 3 iterazioni → ~0.8s su mid-range)
- Licenza a 30 giorni su Android (vs 24h su desktop)
- `data_dir` adattato per path Android
- Frontend responsive con bottom navigation bar e touch targets 44px
- `Cargo.toml` con `cdylib` per JNI bridge Android

---

## STEP 1 — Installa Android SDK + NDK
Apri un **Terminale macOS nativo** (non VS Code) ed esegui:

```bash
# 1. Accetta le licenze
yes | sdkmanager --sdk_root="$HOME/Library/Android/sdk" --licenses

# 2. Installa piattaforma, build tools e NDK
yes | sdkmanager \
  --sdk_root="$HOME/Library/Android/sdk" \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  "ndk;27.0.12077973"
```
> ⏱ Tempo stimato: 5–10 minuti (scarica ~2 GB)

---

## STEP 2 — Configura variabili d'ambiente
Aggiungi al tuo `~/.zshrc`:

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$PATH"
```

Poi ricarica:
```bash
source ~/.zshrc
```

---

## STEP 3 — Inizializza il progetto Android Tauri

```bash
cd "/Users/pietrolongo/Desktop/sviluppo applicazioni/LexFlow"
npm run android:init
```
Questo genera:
- `src-tauri/gen/android/` — progetto Gradle Android
- `src-tauri/gen/schemas/mobile-schema.json`
- Aggiorna le capabilities

---

## STEP 4 — Build APK (Release)

```bash
cd "/Users/pietrolongo/Desktop/sviluppo applicazioni/LexFlow"
npm run android:build
```

L'APK sarà in:
```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

---

## STEP 5 — Firma l'APK (distribuzione)

```bash
# Genera keystore (una volta sola)
keytool -genkey -v \
  -keystore lexflow-release.keystore \
  -alias lexflow \
  -keyalg RSA -keysize 2048 \
  -validity 10000

# Firma l'APK
jarsigner -verbose \
  -sigalg SHA256withRSA \
  -digestalg SHA-256 \
  -keystore lexflow-release.keystore \
  app-universal-release-unsigned.apk lexflow

# Allinea (ottimizzazione Google Play)
zipalign -v 4 \
  app-universal-release-unsigned.apk \
  LexFlow-2.3.4-release.apk
```

---

## SICUREZZA ANDROID — Misure implementate

| Feature | Desktop | Android |
|---|---|---|
| AES-256-GCM vault | ✅ | ✅ |
| Argon2id key derivation | ✅ | ✅ |
| HMAC-SHA256 verify | ✅ | ✅ |
| Auto-lock inattività | ✅ | ✅ |
| Biometria | TouchID/FaceID | Fingerprint/Face (frontend) |
| Keystore | macOS Keychain / Win Credential | Android Keystore (nativo) |
| FLAG_SECURE (anti-screenshot) | `set_content_protected` | Tauri mobile (automatico) |
| `user-select: none` | ✅ | ✅ |
| `touch-action: manipulation` (no zoom) | N/A | ✅ |
| CSP | ✅ | ✅ |
| minSdkVersion 24 (Android 7+) | N/A | ✅ |

---

## NOTE IMPORTANTI

- **`keyring` su Android**: usa `keyring = { version = "3", features = [] }` senza `apple-native`/`windows-native`. Il keystore Android è gestito nativamente da Tauri mobile.
- **`whoami` su Android**: sostituito con device ID via env `LEXFLOW_DEVICE_ID` (Tauri lo inietta automaticamente).
- **`open::that` su Android**: no-op su Android, il frontend gestisce i file con `ACTION_VIEW`.
- **`swift` biometric su Android**: rimosso, il frontend usa il BiometricPrompt Android nativo.
- **Window controls**: nascosti su mobile via CSS `display: none`.
- **Bottom Nav**: appare automaticamente su schermi ≤768px.
