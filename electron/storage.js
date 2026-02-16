const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');

const DB_PATH = path.join(app.getPath('userData'), 'lexflow_vault.db');
const SETTINGS_PATH = path.join(app.getPath('userData'), 'lexflow_settings.json');

let db = null;
let ENCRYPTED_SESSION_KEY = null;

// Helper per proteggere la chiave in RAM
function protectKey(rawKeyString) {
  if (safeStorage.isEncryptionAvailable()) {
    ENCRYPTED_SESSION_KEY = safeStorage.encryptString(rawKeyString);
  } else {
    ENCRYPTED_SESSION_KEY = rawKeyString;
  }
}

function getUnprotectedKey() {
  if (!ENCRYPTED_SESSION_KEY) throw new Error('Vault locked');
  if (safeStorage.isEncryptionAvailable() && Buffer.isBuffer(ENCRYPTED_SESSION_KEY)) {
    return safeStorage.decryptString(ENCRYPTED_SESSION_KEY);
  }
  return ENCRYPTED_SESSION_KEY;
}

module.exports = {
  isVaultCreated() {
    return fs.existsSync(DB_PATH);
  },

  // Inizializza connessione SQLCipher
  initDB(key) {
    try {
      db = new Database(DB_PATH);
      db.pragma(`key='${key}'`);
      
      // Crea schema
      db.exec(`
        CREATE TABLE IF NOT EXISTS practices (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agenda (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          date TEXT
        );
      `);
      
      // Test validità chiave
      db.prepare('SELECT count(*) FROM sqlite_master').get();
      return true;
    } catch (e) {
      if (db) { try { db.close(); } catch {} }
      db = null;
      return false;
    }
  },

  async unlockVault(password) {
    try {
      // Nota: In prod, il salt dovrebbe essere univoco per utente e salvato in settings.
      // Qui usiamo un salt statico per semplicità di migrazione, ma meglio settings.salt
      let settings = await this.getSettings();
      let salt = settings.vaultSalt;
      
      let isNew = false;
      if (!fs.existsSync(DB_PATH)) {
        isNew = true;
        salt = crypto.randomBytes(16).toString('hex');
        settings.vaultSalt = salt;
        await this.saveSettings(settings);
      }

      if (!salt) {
          // Fallback per vecchi vault se necessario, o rigenera
          salt = 'LEXFLOW_DEFAULT_SALT';
      }

      const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      const success = this.initDB(key);
      
      if (!success) throw new Error('Password errata o database corrotto');
      
      protectKey(key);

      let recoveryCode = null;
      if (isNew) {
        // Genera codice di recupero SOLO alla creazione
        recoveryCode = crypto.randomBytes(8).toString('hex').toUpperCase(); // Es: A1B2-C3D4...
        const recoverySalt = crypto.randomBytes(32).toString('hex');
        const recoveryHash = crypto.pbkdf2Sync(recoveryCode, recoverySalt, 100000, 64, 'sha512').toString('hex');
        
        settings.recoveryHash = recoveryHash;
        settings.recoverySalt = recoverySalt;
        await this.saveSettings(settings);
      }

      return { success: true, isNew, recoveryCode };
    } catch (e) {
      console.error(e);
      return { success: false, error: 'Password errata.' };
    }
  },

  lockVault() {
    if (db) {
      try { db.close(); } catch {}
      db = null;
    }
    ENCRYPTED_SESSION_KEY = null;
    return { success: true };
  },

  // --- API DATI ---

  async loadData() {
    if (!db) throw new Error('Vault locked');
    try {
      const rows = db.prepare('SELECT data FROM practices').all();
      return rows.map(r => JSON.parse(r.data));
    } catch { return []; }
  },

  async saveData(practices) {
    if (!db) throw new Error('Vault locked');
    const insert = db.prepare('INSERT OR REPLACE INTO practices (id, data) VALUES (@id, @data)');
    const deleteOld = db.prepare('DELETE FROM practices WHERE id NOT IN (' + practices.map(() => '?').join(',') + ')');
    
    const transaction = db.transaction((items) => {
      if (items.length > 0) deleteOld.run(...items.map(p => p.id));
      else db.prepare('DELETE FROM practices').run();

      for (const p of items) {
        insert.run({ id: p.id, data: JSON.stringify(p) });
      }
    });
    
    transaction(practices);
    return { success: true };
  },

  async loadAgenda() {
    if (!db) throw new Error('Vault locked');
    try {
      const rows = db.prepare('SELECT data FROM agenda').all();
      return rows.map(r => JSON.parse(r.data));
    } catch { return []; }
  },

  async saveAgenda(events) {
    if (!db) throw new Error('Vault locked');
    const insert = db.prepare('INSERT OR REPLACE INTO agenda (id, data, date) VALUES (@id, @data, @date)');
    const deleteAll = db.prepare('DELETE FROM agenda');
    
    const transaction = db.transaction((items) => {
      deleteAll.run();
      for (const ev of items) {
        insert.run({ id: ev.id, data: JSON.stringify(ev), date: ev.date });
      }
    });

    transaction(events);
    return { success: true };
  },

  // --- SETTINGS & RECOVERY ---

  async getSettings() {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        return JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf8'));
      }
    } catch {}
    return { privacyBlurEnabled: true };
  },

  async saveSettings(settings) {
    await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
    return { success: true };
  },

  async resetWithRecovery(code) {
    try {
      const settings = await this.getSettings();
      if (!settings.recoveryHash || !settings.recoverySalt) {
        return { success: false, error: 'Nessun codice di recupero impostato.' };
      }

      const hash = crypto.pbkdf2Sync(code.toUpperCase(), settings.recoverySalt, 100000, 64, 'sha512').toString('hex');
      
      if (hash === settings.recoveryHash) {
        this.deleteVault();
        // Reset settings ma mantieni preferenze UI se vuoi
        delete settings.recoveryHash;
        delete settings.recoverySalt;
        delete settings.vaultSalt;
        await this.saveSettings(settings);
        return { success: true };
      }
      return { success: false, error: 'Codice non valido.' };
    } catch (e) {
      return { success: false, error: 'Errore durante il recupero.' };
    }
  },

  deleteVault() {
    this.lockVault();
    if (fs.existsSync(DB_PATH)) {
      try { fs.unlinkSync(DB_PATH); } catch(e) { console.error('Delete error', e); }
    }
  }
};