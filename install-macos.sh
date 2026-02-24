#!/bin/bash
# install-macos.sh — Build LexFlow e aggiorna in-place in /Applications e Desktop
# Uso: ./install-macos.sh
set -e

BUNDLE_DIR="$(cd "$(dirname "$0")" && pwd)/src-tauri/target/universal-apple-darwin/release/bundle"
DMG_DIR="$BUNDLE_DIR/dmg"
APP_SRC="$BUNDLE_DIR/macos/LexFlow.app"
APP_DEST="/Applications/LexFlow.app"
DESKTOP_APP="$HOME/Desktop/LexFlow.app"

echo "╔══════════════════════════════════════╗"
echo "║   LexFlow — Build + Install macOS    ║"
echo "╚══════════════════════════════════════╝"

# ── 1. Pulisci DMG temporanei residui ────────────────────────────────────────
echo "→ Pulizia DMG temporanei..."
for disk in /dev/disk{6,7,8,9,10,11}; do
    hdiutil detach "$disk" -force 2>/dev/null || true
done
find "$DMG_DIR" -name "rw.*.dmg" -delete 2>/dev/null || true

# ── 2. Build Tauri universal ─────────────────────────────────────────────────
echo "→ Build in corso (arm64 + x86_64)..."
cd "$(dirname "$0")"
npm run tauri build -- --target universal-apple-darwin

# ── 3. Verifica che il .app sia stato prodotto ────────────────────────────────
if [ ! -d "$APP_SRC" ]; then
    echo "✗ ERRORE: $APP_SRC non trovato dopo la build"
    exit 1
fi

VERSION=$(defaults read "$APP_SRC/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
echo "→ Versione builtata: $VERSION"

# ── 4. Aggiorna /Applications in-place ───────────────────────────────────────
echo "→ Installazione in /Applications..."
if [ -d "$APP_DEST" ]; then
    # Termina eventuale istanza in esecuzione
    pkill -x "LexFlow" 2>/dev/null || true
    sleep 0.5
    rm -rf "$APP_DEST"
fi
cp -R "$APP_SRC" "$APP_DEST"
echo "   ✓ /Applications/LexFlow.app aggiornata (v$VERSION)"

# ── 5. Aggiorna Desktop in-place se esiste già un .app sul Desktop ────────────
if [ -d "$DESKTOP_APP" ]; then
    echo "→ Aggiornamento LexFlow.app sul Desktop..."
    pkill -x "LexFlow" 2>/dev/null || true
    sleep 0.3
    rm -rf "$DESKTOP_APP"
    cp -R "$APP_SRC" "$DESKTOP_APP"
    echo "   ✓ Desktop/LexFlow.app aggiornata (v$VERSION)"
fi

# ── 6. Mostra percorso DMG finale ─────────────────────────────────────────────
DMG_FILE=$(find "$DMG_DIR" -name "*.dmg" ! -name "rw.*.dmg" 2>/dev/null | head -1)
if [ -n "$DMG_FILE" ]; then
    DMG_SIZE=$(du -sh "$DMG_FILE" | cut -f1)
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║ ✅ Build completata!                                         ║"
    printf  "║    App:  %-50s ║\n" "/Applications/LexFlow.app (v$VERSION)"
    printf  "║    DMG:  %-50s ║\n" "$(basename "$DMG_FILE") ($DMG_SIZE)"
    echo "╚══════════════════════════════════════════════════════════════╝"
fi
