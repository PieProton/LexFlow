# ⚖️ LexFlow

> Gestionale Studio Legale con Crittografia Zero-Knowledge

**Versione:** 2.7.0  
**Piattaforma:** Tauri v2 (macOS, Windows, Android)  
**Bundle ID:** `com.pietrolongo.lexflow`

---

## ✨ Funzionalità

- **Gestione Pratiche** — crea, archivia e monitora fascicoli legali
- **Scadenzario** — deadline, udienze, termini processuali
- **Anagrafiche** — clienti, controparti, tribunali
- **Documenti** — allegati per pratica con preview
- **Crittografia Zero-Knowledge** — dati crittografati localmente
- **Notifiche native** — avvisi scadenze anche ad app chiusa
- **Tray icon** — resta attiva in background
- **Multilingua** — italiano/inglese (i18next)

## 🛠 Stack Tecnologico

| Layer | Tecnologia |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Backend | Rust (Tauri v2) |
| Dati | tauri-plugin-store (JSON locale crittografato) |
| i18n | i18next + react-i18next |
| Font | Inter Variable |

## 📁 Struttura Progetto

```
LexFlow/
├── assets/              ← Sorgente icone e branding
│   └── icon-master.png
├── scripts/             ← Automazione
├── client/              ← Frontend React + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── utils/
│   │   └── api.js
│   └── public/
├── src-tauri/           ← Backend Rust + Tauri v2
│   ├── src/lib.rs
│   ├── icons/           ← Generate (NON editare)
│   └── tauri.conf.json
└── releases/
```

## 🚀 Sviluppo

```bash
npm run dev          # Avvia dev
npm run install      # Build + Deploy Desktop
npm run icons        # Rigenera icone
```
