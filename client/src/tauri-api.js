/* LexFlow — Tauri API Bridge (auto-generated) */
const { invoke } = window.__TAURI__?.core ?? { invoke: null };
const { listen } = window.__TAURI__?.event ?? { listen: null };

function safeInvoke(cmd, args = {}) {
  if (!invoke) return Promise.reject(new Error(`Tauri invoke not available: ${cmd}`));
  return invoke(cmd, args).catch(err => {
    console.error(`[LexFlow] ${cmd} failed:`, err);
    throw typeof err === 'string' ? new Error(err) : err;
  });
}

function toBytes(arrayBuffer) {
  if (!arrayBuffer) return [];
  return Array.from(new Uint8Array(arrayBuffer));
}

window.api = {
  // Vault / Auth
  vaultExists: () => safeInvoke('vault_exists'),
  unlockVault: (pwd) => safeInvoke('unlock_vault', { password: pwd }),
  lockVault: () => safeInvoke('lock_vault'),
  resetVault: () => safeInvoke('reset_vault'),
  exportVault: (pwd) => safeInvoke('export_vault', { pwd }),
  importVault: (pwd) => safeInvoke('import_vault', { pwd }),
  changePassword: (currentPassword, newPassword) => safeInvoke('change_password', { currentPassword, newPassword }),
  verifyVaultPassword: (pwd) => safeInvoke('verify_vault_password', { pwd }),

  // Biometrics
  checkBio: () => safeInvoke('check_bio'),
  hasBioSaved: () => safeInvoke('has_bio_saved'),
  saveBio: (pwd) => safeInvoke('save_bio', { pwd }),
  bioLogin: () => safeInvoke('bio_login'),
  // legacy alias used in some components
  loginBio: () => safeInvoke('bio_login'),
  clearBio: () => safeInvoke('clear_bio'),

  // Data
  loadPractices: () => safeInvoke('load_practices'),
  savePractices: (list) => safeInvoke('save_practices', { list }),
  loadAgenda: () => safeInvoke('load_agenda'),
  saveAgenda: (agenda) => safeInvoke('save_agenda', { agenda }),

  // Settings
  getSettings: () => safeInvoke('get_settings'),
  saveSettings: (settings) => safeInvoke('save_settings', { settings }),

  // Files
  // select_file returns { name, path } or null — normalize to path string or null
  selectFolder: () => safeInvoke('select_file').then(res => (res && res.path) ? res.path : null),
  openPath: (path) => safeInvoke('open_path', { path }),
  exportPDF: (arrayBuffer, defaultName) => safeInvoke('export_pdf', { data: toBytes(arrayBuffer), defaultName }),

  // Notifications
  sendNotification: ({ title, body }) => safeInvoke('send_notification', { title, body }),
  syncNotificationSchedule: (schedule) => safeInvoke('sync_notification_schedule', { schedule }),

  // Licensing
  checkLicense: () => safeInvoke('check_license'),
  activateLicense: (key) => safeInvoke('activate_license', { key }),

  // Platform / App
  isMac: () => safeInvoke('is_mac'),
  getAppVersion: () => safeInvoke('get_app_version'),

  // Window controls
  windowMinimize: () => safeInvoke('window_minimize'),
  windowMaximize: () => safeInvoke('window_maximize'),
  windowClose: () => safeInvoke('window_close'),

  // Security & Content Protection
  setContentProtection: (enabled) => safeInvoke('set_content_protection', { enabled }),
  pingActivity: () => safeInvoke('ping_activity'),
  setAutolockMinutes: (minutes) => safeInvoke('set_autolock_minutes', { minutes }),
  getAutolockMinutes: () => safeInvoke('get_autolock_minutes'),

  // Listeners — return an unsubscribe function
  onBlur: (cb) => {
    if (!listen) return () => {};
    let unlisten = null;
    listen('lf-blur', event => {
      // payload is boolean: true = blurred (window lost focus), false = focused
      cb(event.payload === true || event.payload === undefined);
    }).then(f => { unlisten = f; }).catch(() => {});
    return () => unlisten?.();
  },
  onLock: (cb) => {
    if (!listen) return () => {};
    let unlisten = null;
    listen('lf-lock', () => cb()).then(f => { unlisten = f; }).catch(() => {});
    return () => unlisten?.();
  },
  onVaultLocked: (cb) => {
    if (!listen) return () => {};
    let unlisten = null;
    listen('lf-vault-locked', () => cb()).then(f => { unlisten = f; }).catch(() => {});
    return () => unlisten?.();
  },
};

// Global listener for Rust-initiated notifications — try to forward to browser Notification API
if (listen) {
  listen('show-notification', async (event) => {
    try {
      const notificationAPI = window.__TAURI__?.notification ?? null;
      if (notificationAPI) {
        const { isPermissionGranted, requestPermission, sendNotification } = notificationAPI;
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === 'granted';
        }
        if (granted) {
          sendNotification({ title: event.payload.title, body: event.payload.body });
        }
      } else if (window.Notification) {
        if (Notification.permission === 'granted') {
          new Notification(event.payload.title, { body: event.payload.body });
        } else if (Notification.permission !== 'denied') {
          const p = await Notification.requestPermission();
          if (p === 'granted') new Notification(event.payload.title, { body: event.payload.body });
        }
      }
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }).catch(() => {});
}
