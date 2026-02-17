const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Sicurezza ed Eventi (CORRETTI CON CLEANUP) ---
  
  onBlur: (cb) => {
    const subscription = (_, val) => cb(val);
    ipcRenderer.on('app-blur', subscription);
    // Restituiamo una funzione che rimuove correttamente l'ascoltatore
    return () => ipcRenderer.removeListener('app-blur', subscription);
  },

  onVaultLocked: (cb) => {
    const subscription = () => cb();
    ipcRenderer.on('vault-locked', subscription);
    return () => ipcRenderer.removeListener('vault-locked', subscription);
  },

  onLock: (cb) => {
    const subscription = () => cb();
    ipcRenderer.on('app-lock', subscription);
    return () => ipcRenderer.removeListener('app-lock', subscription);
  },

  onUpdateMsg: (cb) => {
    const subscription = (_, msg) => cb(msg);
    ipcRenderer.on('update-msg', subscription);
    return () => ipcRenderer.removeListener('update-msg', subscription);
  },

  // --- Vault Core ---
  vaultExists: () => ipcRenderer.invoke('vault-exists'),
  unlockVault: (pwd) => ipcRenderer.invoke('vault-unlock', pwd),
  lockVault: () => ipcRenderer.invoke('vault-lock'),
  resetVault: () => ipcRenderer.invoke('vault-reset'),
  exportVault: (pwd) => ipcRenderer.invoke('vault-export', pwd),

  // --- Dati (Pratiche) ---
  loadPractices: () => ipcRenderer.invoke('vault-load'),
  savePractices: (data) => ipcRenderer.invoke('vault-save', data),

  // --- Dati (Agenda) ---
  loadAgenda: () => ipcRenderer.invoke('vault-load-agenda'),
  saveAgenda: (data) => ipcRenderer.invoke('vault-save-agenda', data),

  // --- Biometria ---
  checkBio: () => ipcRenderer.invoke('bio-check'),
  hasBioSaved: () => ipcRenderer.invoke('bio-has-saved'),
  saveBio: (pwd) => ipcRenderer.invoke('bio-save', pwd),
  loginBio: () => ipcRenderer.invoke('bio-login'),
  clearBio: () => ipcRenderer.invoke('bio-clear'),

  // --- File System & Export Sicuro ---
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  exportPDF: (buffer, defaultName) => ipcRenderer.invoke('export-pdf', { buffer, defaultName }),

  // --- Info Piattaforma & Impostazioni ---
  isMac: () => ipcRenderer.invoke('get-is-mac'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),

  // --- Controlli Finestra ---
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});