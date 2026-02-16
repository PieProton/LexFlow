const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // --- Security & Eventi Sistema ---
  getSecureKey: () => ipcRenderer.invoke('get-secure-key'),
  onBlur: (cb) => ipcRenderer.on('app-blur', (_, val) => cb(val)),
  onVaultLocked: (cb) => ipcRenderer.on('vault-locked', () => cb()),
  onLock: (cb) => ipcRenderer.on('app-lock', () => cb()),

  // --- Vault (Gestione Dati Criptati) ---
  vaultExists: () => ipcRenderer.invoke('vault-exists'),
  unlockVault: (pwd) => ipcRenderer.invoke('vault-unlock', pwd),
  lockVault: () => ipcRenderer.invoke('vault-lock'),
  
  // Gestione Fascicoli
  loadPractices: () => ipcRenderer.invoke('vault-load'),
  savePractices: (data) => ipcRenderer.invoke('vault-save', data),
  
  // Gestione Backup e Reset (Nuove funzioni)
  resetVault: () => ipcRenderer.invoke('vault-reset'),
  recoveryReset: (code) => ipcRenderer.invoke('vault-recovery-reset', code),
  exportVault: (pwd) => ipcRenderer.invoke('vault-export', pwd), 

  // --- Agenda ---
  loadAgenda: () => ipcRenderer.invoke('vault-load-agenda'),
  saveAgenda: (data) => ipcRenderer.invoke('vault-save-agenda', data),

  // --- Biometria (FaceID / TouchID / Hello) ---
  checkBio: () => ipcRenderer.invoke('bio-check'),
  hasBioSaved: () => ipcRenderer.invoke('bio-has-saved'),
  saveBio: (pwd) => ipcRenderer.invoke('bio-save', pwd),
  loginBio: () => ipcRenderer.invoke('bio-login'),
  clearBio: () => ipcRenderer.invoke('bio-clear'),

  // --- Impostazioni ---
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),

  // --- File System & Dialogs ---
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  
  // Export PDF & File Generici (Gestione sicura Buffer)
  showSaveDialog: (opts) => ipcRenderer.invoke('show-save-dialog', opts),
  saveFileBuffer: (filePath, buffer) => ipcRenderer.invoke('save-file-buffer', { filePath, buffer }),

  // --- Info Piattaforma ---
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  isMac: () => ipcRenderer.invoke('get-is-mac'),

  // --- Controlli Finestra ---
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});