// LexFlow — Biometric Authentication (TouchID / FaceID / Windows Hello)
// AES-256-GCM + Hardware ID Binding
const { systemPreferences, app } = require('electron');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Percorso del file delle credenziali biometriche
const BIO_FILE = path.join(app.getPath('userData'), '.lexflow_bio');
const APP_SALT = 'LexFlow_Bio_v2_2026_GCM';
const ALGORITHM = 'aes-256-gcm';

// Ottiene un identificativo hardware univoco per legare i dati alla macchina
function getHardwareId() {
  try {
    if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { encoding: 'utf8', stdio: 'pipe' });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    }
    if (process.platform === 'win32') {
      const out = execSync('wmic csproduct get uuid', { encoding: 'utf8', stdio: 'pipe' });
      const lines = out.trim().split('\n');
      if (lines[1]) return lines[1].trim();
    }
  } catch (e) {
    // Fallback silenzioso in caso di errore nel comando
  }
  // Fallback basato su parametri OS (meno univoco ma stabile)
  return os.hostname() + (os.cpus()[0]?.model || '') + os.totalmem();
}

let _machineKey = null;
function getMachineKey() {
  if (_machineKey) return _machineKey;
  const hwid = getHardwareId();
  const info = hwid + os.userInfo().username + os.homedir();
  // Derivazione chiave robusta
  _machineKey = crypto.pbkdf2Sync(info, APP_SALT, 100000, 32, 'sha512');
  return _machineKey;
}

function encryptToFile(plaintext) {
  try {
    const iv = crypto.randomBytes(16);
    const key = getMachineKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let enc = cipher.update(plaintext, 'utf8', 'hex');
    enc += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    const tempPath = `${BIO_FILE}.tmp`;
    const payload = JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: enc,
      v: 2
    });

    fs.writeFileSync(tempPath, payload, 'utf8');
    fs.renameSync(tempPath, BIO_FILE); // Scrittura atomica
    return true;
  } catch (err) {
    console.error('Errore salvataggio biometria:', err);
    return false;
  }
}

function decryptFromFile() {
  if (!fs.existsSync(BIO_FILE)) return null;
  try {
    const content = fs.readFileSync(BIO_FILE, 'utf8');
    const file = JSON.parse(content);
    const key = getMachineKey();

    // Versione 2 (GCM)
    if (file.v === 2 && file.authTag && file.iv) {
      const iv = Buffer.from(file.iv, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(Buffer.from(file.authTag, 'hex'));
      
      let dec = decipher.update(file.data, 'hex', 'utf8');
      dec += decipher.final('utf8');
      return dec;
    } 
    // Legacy CBC (se presente da vecchie versioni)
    else if (file.data && !file.authTag) {
      const iv = Buffer.from(file.iv || '', 'hex'); // Gestione caso IV mancante in legacy
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let dec = decipher.update(file.data, 'hex', 'utf8');
      dec += decipher.final('utf8');
      
      // Aggiorna subito al nuovo formato sicuro
      encryptToFile(dec);
      return dec;
    }
  } catch (err) {
    console.error('Errore decifratura biometria:', err);
    return null;
  }
  return null;
}

module.exports = {
  async isAvailable() {
    if (process.platform === 'darwin') {
      try {
        return systemPreferences.canPromptTouchID ? systemPreferences.canPromptTouchID() : false;
      } catch { return false; }
    }
    // Su Windows restituiamo true solo se necessario, ma attenzione:
    // Electron non supporta nativamente Windows Hello UI senza moduli esterni.
    // Qui manteniamo la logica originale ma sii consapevole che su Windows è un "auto-login" se il file esiste.
    if (process.platform === 'win32') return true; 
    return false;
  },

  async prompt() {
    if (process.platform === 'darwin') {
      try {
        // Questa chiamata mostra il prompt nativo di macOS (TouchID / Password)
        await systemPreferences.promptTouchID('Sblocca LexFlow');
        return true;
      } catch (err) {
        // L'utente ha annullato o il riconoscimento è fallito
        return false; 
      }
    }
    // Su Windows, senza moduli nativi, approviamo implicitamente se la piattaforma è supportata
    if (process.platform === 'win32') return true;
    
    return false;
  },

  async savePassword(password) {
    if (!password) return;
    encryptToFile(password);
  },

  async retrievePassword() {
    // Prima chiediamo l'autorizzazione biometrica
    const authorized = await this.prompt();
    if (!authorized) throw new Error('Biometria non autorizzata o annullata');
    
    // Se autorizzato, decifriamo il file
    return decryptFromFile();
  },

  async hasSaved() {
    return fs.existsSync(BIO_FILE);
  },

  async clear() {
    try { 
      if (fs.existsSync(BIO_FILE)) fs.unlinkSync(BIO_FILE); 
    } catch {}
  }
};