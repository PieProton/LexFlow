const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Sicurezza ---
  onBlur: (cb) => ipcRenderer.on('app-blur', (_, val) => cb(val)),
  onVaultLocked: (cb) => ipcRenderer.on('vault-locked', () => cb()),
  onLock: (cb) => ipcRenderer.on('app-lock', () => cb()),

  // --- Vault ---
  vaultExists: () => ipcRenderer.invoke('vault-exists'),
  unlockVault: (pwd) => ipcRenderer.invoke('vault-unlock', pwd),
  lockVault: () => ipcRenderer.invoke('vault-lock'),
  resetVault: () => ipcRenderer.invoke('vault-reset'),

  // --- Fascicoli (Nomi sincronizzati con App.jsx) ---
  loadPractices: () => ipcRenderer.invoke('vault-load'),
  savePractices: (data) => ipcRenderer.invoke('vault-save', data),

  // --- Agenda ---
  loadAgenda: () => ipcRenderer.invoke('vault-load-agenda'),
  saveAgenda: (data) => ipcRenderer.invoke('vault-save-agenda', data),

  // --- Info Piattaforma ---
  isMac: () => ipcRenderer.invoke('get-is-mac'), // Questa è la riga che causava l'errore
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // --- Controlli Finestra ---
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});