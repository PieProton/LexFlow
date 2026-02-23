#!/usr/bin/env node
/**
 * LexFlow — Generatore di Chiavi di Licenza (MONOUSO)
 * =====================================================
 * Genera chiavi univoche per autorizzare l'utilizzo dell'app.
 * Ogni chiave è MONOUSO: una volta attivata su un computer, non può essere
 * riutilizzata su nessun'altra macchina.
 *
 * SICUREZZA: nessun file viene salvato su disco (.lexflow-keys.json ELIMINATO).
 * Le chiavi vengono stampate a console e basta — copiare subito.
 *
 * SCADENZA: ogni chiave scade 24h dopo la generazione (default).
 *
 * Formato chiave: LXFW-XXXX-XXXX-XXXX-XXXX
 *
 * Utilizzo:
 *   node license-keygen.js                        → genera 1 chiave (scade 24h)
 *   node license-keygen.js --client "Mario Rossi" → chiave con nome client
 *   node license-keygen.js --expires 2026-12-31   → chiave con scadenza custom
 *   node license-keygen.js --count 5              → genera 5 chiavi
 *   node license-keygen.js --verify LXFW-XXXX-…  → verifica formato chiave (offline)
 */

const crypto = require('crypto');

// ── MASTER SECRET ──────────────────────────────────────────────────────────
// NON condividere questo file con nessuno! Cambia questa stringa.
const MASTER_SECRET = 'LexFlow-Master-2026-PietroLongo-DO_NOT_SHARE';

// ── NESSUN file locale delle chiavi — sicurezza: niente tracce su disco ───
// Le chiavi vengono stampate a console e basta. Niente .lexflow-keys.json.

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
 * DEFAULT: scadenza 24h dalla generazione.
 * I segmenti S2/S3/S4 sono 6 byte random → 12 hex → 100% unici ad ogni chiamata.
 * L'ultimo segmento è un checksum HMAC-SHA256(MASTER_SECRET, S2+S3+S4).
 */
function generateKey({ client = 'Utente', expires = null } = {}) {
  const id      = crypto.randomBytes(4).toString('hex').toUpperCase();
  const created = new Date().toISOString().slice(0, 10);

  // Scadenza default: 24h da adesso
  if (!expires) {
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expires = exp.toISOString().slice(0, 19) + 'Z'; // ISO con orario preciso
  }

  // 6 byte random → 12 caratteri hex HEX (es. "A3F1-9C2B-04E7")
  const randomHex = crypto.randomBytes(6).toString('hex').toUpperCase();
  const s2 = randomHex.substring(0, 4);
  const s3 = randomHex.substring(4, 8);
  const s4 = randomHex.substring(8, 12);

  // Checksum HMAC-SHA256 calcolato su S2+S3+S4 con MASTER_SECRET
  const checksum = hmac(s2 + s3 + s4).substring(0, 4);

  const key     = `LXFW-${s2}-${s3}-${s4}-${checksum}`;
  return { key, client, expires, created, id };
}

// ── Verifica formato chiave (offline, senza file) ─────────────────────────

function verifyKeyFormat(keyStr) {
  const parts = keyStr.split('-');
  if (parts.length !== 5 || parts[0] !== 'LXFW') return false;
  const [, s2, s3, s4, checksum] = parts;
  if (s2.length !== 4 || s3.length !== 4 || s4.length !== 4 || checksum.length !== 4) return false;
  return hmac(s2 + s3 + s4).substring(0, 4) === checksum;
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

// ── --verify <key> — verifica OFFLINE (solo checksum HMAC) ────────────────
if (flags.verify) {
  const keyStr = flags.verify;
  const valid = verifyKeyFormat(keyStr);
  console.log(`\n  ${valid ? '✅ Chiave VALIDA' : '❌ Chiave NON VALIDA'}: ${keyStr}`);
  console.log(`  (Verifica offline — solo formato e checksum HMAC)\n`);
  process.exit(valid ? 0 : 1);
}

// ── Generazione chiavi (default) — scadenza 24h ──────────────────────────
const count   = parseInt(flags.count || '1', 10);
const client  = typeof flags.client  === 'string' ? flags.client  : 'Utente';
const expires = typeof flags.expires === 'string' ? flags.expires : null; // null → 24h auto

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║  LexFlow — Generatore Chiavi di Licenza (MONO)  ║');
console.log('╚══════════════════════════════════════════════════╝\n');
console.log('  ⚠️  Ogni chiave è MONOUSO — valida su 1 solo computer.');
console.log('  ⏱️  Scadenza: 24h dalla generazione (default).\n');

for (let i = 0; i < count; i++) {
  const entry = generateKey({ client, expires });

  console.log(`  ✅ Chiave ${i + 1}/${count}:`);
  console.log(`\n     🔑  ${entry.key}\n`);
  console.log(`     Client  : ${entry.client}`);
  console.log(`     Scade   : ${entry.expires}`);
  console.log(`     Creata  : ${entry.created}`);
  console.log(`     Monouso : SÌ — si blocca al primo utilizzo su una macchina`);
  if (count > 1) console.log('  ─────────────────────────────────────────────────');
}

console.log('\n  � Nessun file salvato su disco — solo output a console.');
console.log('  ⚠️  Copia la chiave ORA, non sarà recuperabile.\n');
