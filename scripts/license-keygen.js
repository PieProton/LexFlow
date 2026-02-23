#!/usr/bin/env node
/**
 * LexFlow — Generatore di Chiavi di Licenza (MONOUSO)
 * =====================================================
 * Genera chiavi univoche per autorizzare l'utilizzo dell'app.
 * Ogni chiave è MONOUSO: una volta attivata su un computer, non può essere
 * riutilizzata su nessun'altra macchina. Il machine ID viene registrato
 * al primo utilizzo e la chiave viene "bruciata".
 *
 * Formato chiave: LXFW-XXXX-XXXX-XXXX-XXXX
 *
 * Utilizzo:
 *   node license-keygen.js                        → genera 1 chiave perpetua
 *   node license-keygen.js --client "Mario Rossi" → chiave con nome client
 *   node license-keygen.js --expires 2026-12-31   → chiave con scadenza
 *   node license-keygen.js --count 5              → genera 5 chiavi
 *   node license-keygen.js --list                 → mostra tutte le chiavi generate
 *   node license-keygen.js --revoke LXFW-XXXX-…  → revoca una chiave
 *   node license-keygen.js --verify LXFW-XXXX-…  → verifica una chiave
 *   node license-keygen.js --activate LXFW-XXXX-… --machine "ID-MAC" → attiva su macchina
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

// ── MASTER SECRET ──────────────────────────────────────────────────────────
// NON condividere questo file con nessuno! Cambia questa stringa.
const MASTER_SECRET = 'LexFlow-Master-2026-PietroLongo-DO_NOT_SHARE';

// ── File locale delle chiavi (gitignored) ─────────────────────────────────
const KEYS_FILE = path.join(__dirname, '.lexflow-keys.json');

// ── Helpers ───────────────────────────────────────────────────────────────

function hmac(data) {
  return crypto
    .createHmac('sha256', MASTER_SECRET)
    .update(data)
    .digest('hex')
    .toUpperCase()
    .substring(0, 8);
}

/**
 * Genera una chiave nel formato LXFW-XXXX-XXXX-XXXX-XXXX
 * I segmenti S2/S3/S4 sono 6 byte random → 12 hex → 100% unici ad ogni chiamata.
 * L'ultimo segmento è un checksum HMAC-SHA256(MASTER_SECRET, S2+S3+S4) — non
 * falsificabile senza MASTER_SECRET, e verificabile offline da Rust con lo stesso
 * segreto condiviso compilato nel binario.
 */
function generateKey({ client = 'Utente', expires = null } = {}) {
  const id      = crypto.randomBytes(4).toString('hex').toUpperCase();
  const created = new Date().toISOString().slice(0, 10);

  // 6 byte random → 12 caratteri hex HEX (es. "A3F1-9C2B-04E7")
  const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const s2 = randomHex.substring(0, 4);
  const s3 = randomHex.substring(4, 8);
  const s4 = randomHex.substring(8, 12);

  // Checksum HMAC-SHA256 calcolato su S2+S3+S4 con MASTER_SECRET
  const checksum = hmac(s2 + s3 + s4).substring(0, 4);

  const key     = `LXFW-${s2}-${s3}-${s4}-${checksum}`;
  const payload = JSON.stringify({ v: 1, id, client, expires, created, s2, s3, s4 });
  return { key, client, expires: expires || 'perpetua', created, id, payload };
}

function loadKeys() {
  if (!fs.existsSync(KEYS_FILE)) return { keys: [] };
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return { keys: [] }; }
}

function saveKeys(db) {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function isExpired(entry) {
  return entry.expires !== 'perpetua' && new Date(entry.expires) < new Date();
}

function keyStatus(entry) {
  if (entry.revoked)     return '❌ REVOCATA';
  if (isExpired(entry))  return '⚠️  SCADUTA';
  if (entry.activated)   return '🔒 ATTIVATA';
  return '✅ DISPONIBILE';
}

function printKey(entry) {
  console.log(`\n  ${keyStatus(entry)}  ${entry.key}`);
  console.log(`     Client  : ${entry.client}`);
  console.log(`     Scade   : ${entry.expires}`);
  console.log(`     Creata  : ${entry.created}`);
  if (entry.activated) {
    console.log(`     Attivata: ${entry.activatedAt} su macchina ${entry.machineId}`);
  }
  if (entry.revoked) {
    console.log(`     Revocata: ${entry.revokedAt}`);
  }
}

// ── ARGS PARSING ──────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    flags[key] = val;
  }
}

const db = loadKeys();

// ── --list ────────────────────────────────────────────────────────────────
if (flags.list) {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║    LexFlow — Chiavi di Licenza Generate          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  if (db.keys.length === 0) {
    console.log('\n  Nessuna chiave generata.\n');
  } else {
    db.keys.forEach(printKey);
    const disponibili = db.keys.filter(k => !k.revoked && !k.activated && !isExpired(k)).length;
    const attivate    = db.keys.filter(k => k.activated && !k.revoked).length;
    const revocate    = db.keys.filter(k => k.revoked).length;
    console.log(`\n  Totale: ${db.keys.length}  (Disponibili: ${disponibili}  Attivate: ${attivate}  Revocate: ${revocate})\n`);
  }
  process.exit(0);
}

// ── --revoke <key> ────────────────────────────────────────────────────────
if (flags.revoke) {
  const keyStr = flags.revoke;
  const entry  = db.keys.find(k => k.key === keyStr);
  if (!entry) { console.error(`\n  ❌ Chiave non trovata: ${keyStr}\n`); process.exit(1); }
  entry.revoked   = true;
  entry.revokedAt = new Date().toISOString().slice(0, 10);
  saveKeys(db);
  console.log(`\n  ✅ Chiave revocata: ${keyStr}`);
  if (entry.activated) console.log(`     (era attivata su macchina: ${entry.machineId})`);
  console.log();
  process.exit(0);
}

// ── --verify <key> ────────────────────────────────────────────────────────
if (flags.verify) {
  const keyStr = flags.verify;
  const entry  = db.keys.find(k => k.key === keyStr);
  if (!entry) {
    console.log(`\n  ❓ Chiave sconosciuta (non generata da questo keygen): ${keyStr}\n`);
    process.exit(0);
  }
  printKey(entry);
  console.log();
  process.exit(0);
}

// ── --activate <key> --machine <machine_id> ───────────────────────────────
// Usato dall'app LexFlow per registrare l'attivazione (monouso)
if (flags.activate) {
  const keyStr   = flags.activate;
  const machineId = typeof flags.machine === 'string' ? flags.machine : 'UNKNOWN';
  const entry    = db.keys.find(k => k.key === keyStr);

  if (!entry) {
    console.log(JSON.stringify({ valid: false, error: 'Chiave non trovata' }));
    process.exit(1);
  }
  if (entry.revoked) {
    console.log(JSON.stringify({ valid: false, error: 'Chiave revocata' }));
    process.exit(1);
  }
  if (isExpired(entry)) {
    console.log(JSON.stringify({ valid: false, error: 'Chiave scaduta' }));
    process.exit(1);
  }
  if (entry.activated) {
    // Monouso: controlla se è la stessa macchina (ri-attivazione OK) o macchina diversa (BLOCCATA)
    if (entry.machineId === machineId) {
      // Stessa macchina — ok (reinstall, aggiornamento app)
      console.log(JSON.stringify({ valid: true, client: entry.client, expires: entry.expires, sameDevice: true }));
    } else {
      console.log(JSON.stringify({ valid: false, error: `Chiave già attivata su un altro computer` }));
      process.exit(1);
    }
  } else {
    // Prima attivazione — registra machine ID (MONOUSO)
    entry.activated   = true;
    entry.activatedAt = new Date().toISOString().slice(0, 10);
    entry.machineId   = machineId;
    saveKeys(db);
    console.log(JSON.stringify({ valid: true, client: entry.client, expires: entry.expires, sameDevice: false }));
  }
  process.exit(0);
}

// ── Generazione chiavi (default) ──────────────────────────────────────────
const count   = parseInt(flags.count || '1', 10);
const client  = typeof flags.client  === 'string' ? flags.client  : 'Utente';
const expires = typeof flags.expires === 'string' ? flags.expires : null;

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║  LexFlow — Generatore Chiavi di Licenza (MONO)  ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log('  ⚠️  Ogni chiave è MONOUSO — valida su 1 solo computer.\n');

for (let i = 0; i < count; i++) {
  const entry = generateKey({ client, expires });
  db.keys.push(entry);

  console.log(`  ✅ Chiave ${i + 1}/${count}:`);
  console.log(`\n     🔑  ${entry.key}\n`);
  console.log(`     Client  : ${entry.client}`);
  console.log(`     Scade   : ${entry.expires}`);
  console.log(`     Creata  : ${entry.created}`);
  console.log(`     Monouso : SÌ — si blocca al primo utilizzo su una macchina`);
  if (count > 1) console.log('  ─────────────────────────────────────────────────');
}

saveKeys(db);
console.log(`\n  📁 Salvate in: ${KEYS_FILE}`);
console.log('  ⚠️  NON condividere il file .lexflow-keys.json\n');
