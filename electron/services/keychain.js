const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { app } = require('electron');

// Il file chiave locale (evita popup del Keychain di sistema)
const KEY_FILE = path.join(app.getPath('userData'), '.lexflow_key');
const APP_SALT = 'LexFlow_Vault_v2_SQLite_2026';

// Ottiene un identificativo hardware univoco
function getHardwareId() {
  try {
    // MACOS
    if (process.platform === 'darwin') {
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID', { encoding: 'utf8' });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    }
    
    // WINDOWS (Fix deprecazione WMIC -> PowerShell)
    if (process.platform === 'win32') {
      try {
        const cmd = 'powershell -NoProfile -Command "Get-CimInstance -Class Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"';
        const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
        const uuid = out.trim();
        if (uuid && uuid.length > 4) return uuid;
      } catch (e) {
        // Fallback su WMIC solo se PowerShell fallisce
        try {
          const out = execSync('wmic csproduct get uuid', { encoding: 'utf8' });
          const lines = out.trim().split('\n');
          if (lines[1]) return lines[1].trim();
        } catch (e2) {
          console.error('HWID Fallback error:', e2);
        }
      }
    }
  } catch (e) {
    console.error('HWID General Error:', e);
  }

  // Fallback estremo (meno sicuro ma permette l'avvio)
  return os.hostname() + os.cpus()[0]?.model;
}

// Deriva una chiave univoca per la macchina (PBKDF2)
let _machineKey = null;
function getMachineKey() {
  if (_machineKey) return _machineKey;
  const hwid = getHardwareId();
  const info = hwid + os.userInfo().username + os.homedir();
  _machineKey = crypto.pbkdf2Sync(info, APP_SALT, 100000, 32, 'sha512');
  return _machineKey;
}

function saveKeyToFile(key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getMachineKey(), iv);
  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  fs.writeFileSync(KEY_FILE, JSON.stringify({ iv: iv.toString('hex'), data: encrypted }), 'utf8');
}

module.exports = {
  async getEncryptionKey() {
    try {
      // 1) Cerca file locale esistente
      if (fs.existsSync(KEY_FILE)) {
        const raw = fs.readFileSync(KEY_FILE, 'utf8');
        const { iv, data } = JSON.parse(raw);
        const decipher = crypto.createDecipheriv('aes-256-cbc', getMachineKey(), Buffer.from(iv, 'hex'));
        let key = decipher.update(data, 'hex', 'utf8');
        key += decipher.final('utf8');
        return key;
      }

      // 2) Prima esecuzione: genera nuova chiave random
      const key = crypto.randomBytes(32).toString('hex');
      saveKeyToFile(key);
      return key;
    } catch (error) {
      console.error('CRITICAL ENCRYPTION FAILURE:', error);
      throw new Error('Impossible to derive secure key.'); 
    }
  }
};