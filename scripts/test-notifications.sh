#!/bin/bash
# ═══════════════════════════════════════════════════════
# LexFlow — Test Notifiche (macOS / Linux)
#
# Uso:
#   ./scripts/test-notifications.sh          # test rapido
#   ./scripts/test-notifications.sh --full   # test completo
#
# Prerequisiti:
#   - L'app LexFlow deve essere in esecuzione (dev o release)
#   - Le notifiche devono essere abilitate in:
#     macOS: Impostazioni di Sistema → Notifiche → LexFlow
# ═══════════════════════════════════════════════════════

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "════════════════════════════════════════════"
echo "  LexFlow — Test Sistema Notifiche"
echo "════════════════════════════════════════════"
echo ""

# ── Test 1: macOS Notification Center ──
echo "▶ Test 1: Notifica nativa macOS (osascript)"
osascript -e 'display notification "Questo è un test del sistema notifiche." with title "LexFlow — Test" subtitle "Se vedi questo, le notifiche funzionano."' 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✅ Notifica macOS inviata — controlla il Centro Notifiche"
else
    echo "  ❌ Errore: osascript non disponibile"
fi
echo ""

# ── Test 2: Verifica permessi notifiche ──
echo "▶ Test 2: Stato permessi notifiche macOS"
# Check if notification center is available
if defaults read com.apple.notificationcenterui 2>/dev/null | grep -q "bannerStyle"; then
    echo "  ✅ Centro Notifiche attivo"
else
    echo "  ℹ️  Non è possibile verificare i permessi da terminale."
    echo "     Vai in: Impostazioni di Sistema → Notifiche → LexFlow"
fi
echo ""

# ── Test 3: Verifica che LexFlow sia in esecuzione ──
echo "▶ Test 3: LexFlow in esecuzione?"
if pgrep -f "lexflow" > /dev/null 2>&1; then
    PID=$(pgrep -f "lexflow" | head -1)
    echo "  ✅ LexFlow in esecuzione (PID: $PID)"
else
    echo "  ❌ LexFlow non è in esecuzione."
    echo "     Avvia con: cd '$PROJECT_DIR' && npx tauri dev"
    echo ""
    echo "  Provo ad inviare comunque una notifica nativa..."
    osascript -e 'display notification "LexFlow non è in esecuzione ma le notifiche macOS funzionano." with title "LexFlow — Test Fallback"' 2>/dev/null
    exit 1
fi
echo ""

# ── Test 4: File schedule notifiche ──
echo "▶ Test 4: File schedule notifiche"
SCHEDULE_FILE="$HOME/Library/Application Support/com.pietrolongo.lexflow/lexflow-vault/notif-schedule.enc"
SCHEDULE_FILE_ALT="$HOME/Library/Application Support/com.pietrolongo.lexflow/lexflow-vault/notif-schedule"
if [ -f "$SCHEDULE_FILE" ] || [ -f "$SCHEDULE_FILE_ALT" ]; then
    SIZE=$(stat -f%z "$SCHEDULE_FILE" 2>/dev/null || stat -f%z "$SCHEDULE_FILE_ALT" 2>/dev/null || echo "?")
    echo "  ✅ File schedule presente ($SIZE bytes)"
else
    echo "  ⚠️  File schedule non trovato — nessun evento schedulato"
    echo "     Il file viene creato quando salvi un evento in agenda."
fi
echo ""

# ── Test 5: File notifiche inviate (sent log) ──
echo "▶ Test 5: Log notifiche inviate"
SENT_FILE="$HOME/Library/Application Support/com.pietrolongo.lexflow/lexflow-vault/notif-sent.enc"
SENT_FILE_ALT="$HOME/Library/Application Support/com.pietrolongo.lexflow/lexflow-vault/notif-sent"
if [ -f "$SENT_FILE" ] || [ -f "$SENT_FILE_ALT" ]; then
    SIZE=$(stat -f%z "$SENT_FILE" 2>/dev/null || stat -f%z "$SENT_FILE_ALT" 2>/dev/null || echo "?")
    echo "  ✅ File sent-log presente ($SIZE bytes)"
    echo "     → Notifiche sono state inviate in passato"
else
    echo "  ℹ️  Nessun log di notifiche inviate — primo avvio o nessuna notifica ancora"
fi
echo ""

# ── Test 6: Last-checked timestamp ──
echo "▶ Test 6: Ultimo check scheduler"
LAST_CHECKED="$HOME/Library/Application Support/com.pietrolongo.lexflow/lexflow-vault/notif-last-checked"
if [ -f "$LAST_CHECKED" ]; then
    TS=$(cat "$LAST_CHECKED" 2>/dev/null)
    echo "  ✅ Ultimo check: $TS"
    echo "     → Lo scheduler backend è attivo e sta controllando"
else
    echo "  ⚠️  File last-checked non trovato — lo scheduler potrebbe non essere partito"
fi
echo ""

# ── Test 7 (--full): Notifica programmata ──
if [ "$1" = "--full" ]; then
    echo "▶ Test 7: Notifica programmata (attende 70 secondi)"
    echo "  Invio una notifica nativa adesso come baseline..."
    osascript -e 'display notification "Baseline: questa notifica arriva subito." with title "LexFlow — Test Baseline"' 2>/dev/null
    echo "  ✅ Baseline inviata"
    echo ""
    echo "  Ora attendo 65 secondi (1 ciclo dello scheduler backend)..."
    echo "  Se lo scheduler funziona, entro ~60s dovresti ricevere"
    echo "  la notifica per gli eventi schedulati in questo minuto."
    echo ""
    
    # Monitor last-checked to see if scheduler ticks
    BEFORE=$(cat "$LAST_CHECKED" 2>/dev/null || echo "N/A")
    sleep 65
    AFTER=$(cat "$LAST_CHECKED" 2>/dev/null || echo "N/A")
    
    if [ "$BEFORE" != "$AFTER" ]; then
        echo "  ✅ Scheduler attivo! Last-checked aggiornato:"
        echo "     Prima: $BEFORE"
        echo "     Dopo:  $AFTER"
    else
        echo "  ⚠️  Last-checked non è cambiato in 65s"
        echo "     Possibili cause:"
        echo "     - LexFlow non è in esecuzione"
        echo "     - Lo scheduler non è partito (controlla i log)"
    fi
fi

echo ""
echo "════════════════════════════════════════════"
echo "  Test completato"
echo "════════════════════════════════════════════"
echo ""
echo "  Se non ricevi notifiche:"
echo "  1. Vai in Impostazioni di Sistema → Notifiche"
echo "  2. Cerca 'LexFlow' nella lista"
echo "  3. Abilita 'Consenti notifiche'"
echo "  4. Scegli stile: Banner o Avviso"
echo ""
