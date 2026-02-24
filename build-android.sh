#!/bin/bash
set -e

# Forza Java 21 — Kotlin 1.9.x non supporta Java 25
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
echo "→ Java: $(java -version 2>&1 | head -1)"

# Carica variabili d'ambiente per la firma release
if [ -f "$(dirname "$0")/.env.android" ]; then
    source "$(dirname "$0")/.env.android"
    echo "→ Keystore: $TAURI_ANDROID_KEYSTORE_PATH"
else
    echo "Errore: .env.android non trovato!"
    exit 1
fi

# Build APK firmato
echo "→ Avvio build Android APK firmato..."
npm run tauri android build -- --apk
