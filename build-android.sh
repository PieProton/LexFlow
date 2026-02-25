#!/bin/bash
set -e

# Forza Java 21 — Kotlin 1.9.x non supporta Java 25
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
echo "→ Java: $(java -version 2>&1 | head -1)"

# Carica variabili d'ambiente per la firma release
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env.android" ]; then
    source "$SCRIPT_DIR/.env.android"
    echo "→ Keystore: $TAURI_ANDROID_KEYSTORE_PATH"
else
    echo "Errore: .env.android non trovato!"
    exit 1
fi

# Build APK firmato
echo "→ Avvio build Android APK firmato..."
cd "$SCRIPT_DIR"
npm run tauri android build -- --apk

# Copia APK in "Le Mie App/LexFlow"
APK_SRC=$(find "$SCRIPT_DIR/src-tauri/gen/android/app/build/outputs/apk/universal/release" -name "*.apk" | head -1)
if [ -n "$APK_SRC" ]; then
    VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "2.4.0")
    DISTRIB_DIR="$HOME/Desktop/Le Mie App/LexFlow"
    mkdir -p "$DISTRIB_DIR"
    find "$DISTRIB_DIR" -name "LexFlow_*Android*.apk" -delete 2>/dev/null || true
    cp "$APK_SRC" "$DISTRIB_DIR/LexFlow_${VERSION}_Android.apk"
    echo "→ ✓ APK copiato in ~/Desktop/Le Mie App/LexFlow/LexFlow_${VERSION}_Android.apk"
fi
