const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, dialog, clipboard, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const keychainService = require('./services/keychain'); // Assicurati che questo file esista, altrimenti rimuovilo
const storage = require('./storage');
const biometrics = require('./biometrics');

const IS_MAC = process.platform === 'darwin';

// --- 1. GESTIONE ERRORI GLOBALE ---
process.on('uncaughtException', (error) => {
  console.error('CRITICAL MAIN ERROR:', error);
  // Non uscire dall'app, prova a recuperare
});

// Traduzioni Menu
const menuT = {
  it: { about: 'Informazioni su LexFlow', hide: 'Nascondi LexFlow', hideOthers: 'Nascondi altri', showAll: 'Mostra tutti', quit: 'Esci da LexFlow', edit: 'Modifica', undo: 'Annulla', redo: 'Ripeti', cut: 'Taglia', copy: 'Copia', paste: 'Incolla', selectAll: 'Seleziona tutto', view: 'Vista', zoomIn: 'Zoom avanti', zoomOut: 'Zoom indietro', resetZoom: 'Zoom predefinito', fullscreen: 'Schermo intero', window: 'Finestra', minimize: 'Riduci', close: 'Chiudi' },
  en: { about: 'About LexFlow', hide: 'Hide LexFlow', hideOthers: 'Hide Others', showAll: 'Show All', quit: 'Quit LexFlow', edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All', view: 'View', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', resetZoom: 'Actual Size', fullscreen: 'Toggle Full Screen', window: 'Window', minimize: 'Minimize', close: 'Close' },
};

function getT() { 
  const l = (app.getLocale() || 'en').substring(0, 2); 
  return menuT[l] || menuT.en; 
}

app.setAppUserModelId('com.technojaw.lexflow');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ===== IPC Handlers (Canali di comunicazione) =====

// 1. Security & Vault
ipcMain.handle('get-secure-key', () => keychainService.getEncryptionKey());
ipcMain.handle('vault-exists', () => storage.isVaultCreated());
ipcMain.handle('vault-unlock', (_, pwd) => storage.unlockVault(pwd));
ipcMain.handle('vault-lock', () => storage.lockVault());
ipcMain.handle('vault-load', () => storage.loadData());
ipcMain.handle('vault-save', (_, data) => storage.saveData(data));
ipcMain.handle('vault-load-agenda', () => storage.loadAgenda());
ipcMain.handle('vault-save-agenda', (_, data) => storage.saveAgenda(data));
ipcMain.handle('vault-recovery-reset', (_, code) => storage.resetWithRecovery(code));

// 2. Biometria (Sincronizzato con preload.js e biometrics.js)
ipcMain.handle('bio-check', async () => {
  try { return await biometrics.isAvailable(); } catch { return false; }
});
ipcMain.handle('bio-has-saved', async () => {
  try { return await biometrics.hasSaved(); } catch { return false; }
});
ipcMain.handle('bio-save', async (_, pwd) => {
  try { return await biometrics.savePassword(pwd); } catch (e) { console.error(e); return false; }
});
ipcMain.handle('bio-login', async () => {
  try { 
    // Ritorna la password decifrata o lancia errore se annullato/fallito
    return await biometrics.retrievePassword(); 
  } catch (e) { 
    // Propaghiamo l'errore al frontend in modo che sappia che è fallito
    throw new Error('Auth failed'); 
  }
});
ipcMain.handle('bio-clear', async () => {
  try { return await biometrics.clear(); } catch {}
});

// 3. Reset Vault
ipcMain.handle('vault-reset', async () => {
  if (!mainWindow) return { success: false };
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Annulla', 'Reset Vault'],
    defaultId: 0,
    cancelId: 0,
    title: 'Reset Vault',
    message: 'Sei sicuro? Tutti i dati verranno cancellati permanentemente.',
    detail: 'Questa azione è irreversibile.'
  });
  if (response === 1) {
    storage.lockVault();
    storage.deleteVault();
    await biometrics.clear(); // Pulisce anche la biometria associata
    return { success: true };
  }
  return { success: false };
});

// 4. App Info & Utilities
ipcMain.handle('get-is-mac', () => IS_MAC);
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('vault-export', async (_, exportPassword) => {
  if (!mainWindow) return { success: false };
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Esporta Backup Portatile',
    defaultPath: `LexFlow_Backup_${new Date().toISOString().split('T')[0]}.lex`,
    filters: [{ name: 'LexFlow Backup', extensions: ['lex'] }]
  });

  if (!filePath) return { success: false, cancelled: true };

  try {
    // Logica di export (semplificata per leggibilità, assumendo storage.js gestisca il caricamento)
    const practices = await storage.loadData();
    const agenda = await storage.loadAgenda();
    const backupData = JSON.stringify({ 
      practices, agenda, exportedAt: new Date().toISOString(), appVersion: app.getVersion() 
    });

    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(exportPassword, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(backupData, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const output = JSON.stringify({
      v: 1, salt: salt.toString('hex'), iv: iv.toString('hex'), authTag: authTag.toString('hex'), data: encrypted
    });
    await fs.promises.writeFile(filePath, output, 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Window Controls
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => { if (mainWindow) mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// ===== Window Management =====
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1000, minHeight: 700,
    title: 'LexFlow',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    ...(IS_MAC ? { trafficLightPosition: { x: 16, y: 18 } } : {}),
    frame: IS_MAC,
    backgroundColor: '#0c0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
      spellcheck: false,
    },
    icon: path.join(__dirname, '..', 'build', IS_MAC ? 'lexflow-icon.icns' : 'lexflow-icon.png'),
    show: false,
  });

  mainWindow.setContentProtection(true); // Anti-Screenshot

  // Caricamento interfaccia
  // Assicurati che il percorso dist sia corretto
  const startUrl = process.env.ELECTRON_START_URL || path.join(__dirname, '..', 'client', 'dist', 'index.html');
  
  if (startUrl.startsWith('http')) {
    mainWindow.loadURL(startUrl);
  } else {
    mainWindow.loadFile(startUrl);
  }
  
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (app.isPackaged) {
    mainWindow.webContents.on('devtools-opened', () => mainWindow.webContents.closeDevTools());
    autoUpdater.checkForUpdatesAndNotify();
  }

  // Navigazione sicura
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  // Logica Privacy Blur
  let blurTimer = null;
  let blurTimestamp = 0;
  
  mainWindow.on('blur', () => {
    blurTimestamp = Date.now();
    mainWindow.webContents.send('app-blur', true);
    // Blocca il vault dopo 5 minuti di inattività (o meno, a seconda delle preferenze)
    blurTimer = setTimeout(() => { 
        if(mainWindow) mainWindow._shouldLockOnFocus = true; 
    }, 5 * 60 * 1000);
  });

  mainWindow.on('focus', () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    // Togli il blur solo se è passato poco tempo o se l'utente torna
    if (Date.now() - blurTimestamp < 200) {
        // Debounce per evitare flicker immediati
    }
    mainWindow.webContents.send('app-blur', false);

    if (mainWindow._shouldLockOnFocus) {
      mainWindow._shouldLockOnFocus = false;
      mainWindow.webContents.send('app-lock');
    }
  });

  mainWindow.on('close', (e) => {
    clipboard.clear(); 
    storage.lockVault();
    if (IS_MAC && !isQuitting) {
      e.preventDefault();
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
        setTimeout(() => mainWindow.hide(), 100);
      } else {
        mainWindow.hide();
      }
    }
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, '..', 'build', 'lexflow-tray.png');
  // Se l'icona non esiste, non creare la tray per evitare errori
  if (!fs.existsSync(trayIconPath)) return;
  
  const icon = nativeImage.createFromPath(trayIconPath).resize({ width: 18, height: 18 });
  tray = new Tray(icon);
  tray.setToolTip('LexFlow');
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Apri LexFlow', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else createWindow(); } },
    { type: 'separator' },
    { label: '🔒 Blocca Vault', click: () => {
      storage.lockVault();
      if (mainWindow) {
        mainWindow.webContents.send('vault-locked');
        mainWindow.show();
      }
    }},
    { type: 'separator' },
    { label: 'Esci', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else createWindow(); });
}

function buildMenu() {
  const t = getT();
  const template = [
    ...(IS_MAC ? [{ label: 'LexFlow', submenu: [{ role: 'about', label: t.about }, { type: 'separator' }, { role: 'hide', label: t.hide }, { role: 'hideOthers', label: t.hideOthers }, { role: 'unhide', label: t.showAll }, { type: 'separator' }, { role: 'quit', label: t.quit }] }] : []),
    { label: t.edit, submenu: [{ role: 'undo', label: t.undo }, { role: 'redo', label: t.redo }, { type: 'separator' }, { role: 'cut', label: t.cut }, { role: 'copy', label: t.copy }, { role: 'paste', label: t.paste }, { role: 'selectAll', label: t.selectAll }] },
    { label: t.view, submenu: [{ role: 'zoomIn', label: t.zoomIn }, { role: 'zoomOut', label: t.zoomOut }, { role: 'resetZoom', label: t.resetZoom }, { type: 'separator' }, { role: 'togglefullscreen', label: t.fullscreen }] },
    ...(IS_MAC ? [{ label: t.window, submenu: [{ role: 'minimize', label: t.minimize }, { role: 'close', label: t.close }] }] : []),
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('before-quit', () => { isQuitting = true; });

app.whenReady().then(() => {
  // Sicurezza CSP e Headers
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; font-src 'self' data:;"]
      }
    });
  });

  buildMenu();
  createWindow();
  createTray();
});

app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
app.on('activate', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } else createWindow(); });

autoUpdater.on('update-available', () => { if(mainWindow) mainWindow.webContents.send('update-msg', 'Aggiornamento disponibile...'); });
autoUpdater.on('update-downloaded', () => { if(mainWindow) mainWindow.webContents.send('update-msg', 'Riavvia per installare.'); });