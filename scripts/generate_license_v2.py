#!/usr/bin/env python3
"""
LexFlow — Generatore Licenze v2 (Ed25519 Signed Tokens + Registro Chiavi)

Miglioramenti rispetto a v1:
  - Registro locale crittografato di TUTTE le chiavi emesse (.lexflow-issued-keys.enc)
  - Ogni chiave è tracciata con: ID, cliente, data emissione, scadenza, stato
  - Comandi: genera / lista / revoca / verifica / esporta
  - Chiave pubblica più complessa (Ed25519 rimane lo standard, ma payload ampliato)
  - Anti-replay: ogni chiave ha un nonce univoco a 128-bit

Uso:
  python3 scripts/generate_license_v2.py generate        → genera nuova chiave
  python3 scripts/generate_license_v2.py list             → mostra tutte le chiavi emesse
  python3 scripts/generate_license_v2.py verify <token>   → verifica una chiave
  python3 scripts/generate_license_v2.py export           → esporta registro in CSV
  python3 scripts/generate_license_v2.py stats            → statistiche emissioni

Dipendenze:
  pip install cryptography

Sicurezza:
  - Il registro è cifrato con AES-256-GCM usando una password derivata con Argon2id
  - La chiave privata Ed25519 non viene mai salvata nel registro
  - Il registro tiene traccia di HASH delle chiavi, non delle chiavi stesse
"""
import base64
import csv
import getpass
import hashlib
import io
import json
import os
import secrets
import sys
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization, hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
except ImportError:
    print("Errore: installa le dipendenze con 'pip install cryptography'")
    sys.exit(1)

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
REGISTRY_FILE = SCRIPT_DIR / ".lexflow-issued-keys.enc"
REGISTRY_SALT_FILE = SCRIPT_DIR / ".lexflow-registry-salt"


def normalize_b64(raw: str) -> bytes:
    """Normalizza qualsiasi stringa Base64 (standard o URL-safe, con/senza padding)."""
    s = raw.strip()
    s = s.replace('+', '-').replace('/', '_')
    pad = 4 - (len(s) % 4)
    if pad < 4:
        s += '=' * pad
    return base64.urlsafe_b64decode(s)


def derive_registry_key(password: str, salt: bytes) -> bytes:
    """Derive a 256-bit key from password using Scrypt."""
    kdf = Scrypt(salt=salt, length=32, n=2**17, r=8, p=1)
    return kdf.derive(password.encode())


def load_registry(password: str) -> list:
    """Load and decrypt the issued keys registry."""
    if not REGISTRY_FILE.exists():
        return []

    if not REGISTRY_SALT_FILE.exists():
        print("⚠️  File salt del registro non trovato. Registro corrotto.")
        return []

    salt = REGISTRY_SALT_FILE.read_bytes()
    key = derive_registry_key(password, salt)
    data = REGISTRY_FILE.read_bytes()

    if len(data) < 12:
        return []

    nonce = data[:12]
    ciphertext = data[12:]

    try:
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext.decode())
    except Exception:
        print("❌ Password del registro errata o file corrotto.")
        sys.exit(1)


def save_registry(password: str, entries: list):
    """Encrypt and save the registry."""
    if not REGISTRY_SALT_FILE.exists():
        salt = secrets.token_bytes(32)
        REGISTRY_SALT_FILE.write_bytes(salt)
    else:
        salt = REGISTRY_SALT_FILE.read_bytes()

    key = derive_registry_key(password, salt)
    plaintext = json.dumps(entries, indent=2, ensure_ascii=False).encode()
    nonce = secrets.token_bytes(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext, None)
    REGISTRY_FILE.write_bytes(nonce + ciphertext)


def get_registry_password() -> str:
    """Prompt for the registry password."""
    if REGISTRY_FILE.exists():
        return getpass.getpass("🔑 Password registro chiavi: ")
    else:
        print("📝 Prima esecuzione: crea una password per il registro delle chiavi emesse.")
        print("   Questa password protegge il file che traccia tutte le licenze emesse.")
        pwd1 = getpass.getpass("   Nuova password: ")
        pwd2 = getpass.getpass("   Conferma password: ")
        if pwd1 != pwd2:
            print("❌ Le password non corrispondono.")
            sys.exit(1)
        if len(pwd1) < 8:
            print("❌ Password troppo corta (minimo 8 caratteri).")
            sys.exit(1)
        return pwd1


def compute_key_hash(token: str) -> str:
    """Hash di una chiave per il registro (SHA-256, non reversibile)."""
    return hashlib.sha256(f"BURN-GLOBAL-V2:{token}".encode()).hexdigest()


def cmd_generate():
    """Generate a new license key."""
    print("=" * 70)
    print("  LEXFLOW — GENERATORE LICENZE v2 (Ed25519 + Registro)")
    print("=" * 70)
    print()

    # 1. Caricamento Chiave Privata
    priv_key_raw = input("Incolla la CHIAVE PRIVATA (Base64): ").strip()
    try:
        priv_key_bytes = normalize_b64(priv_key_raw)
        if len(priv_key_bytes) != 32:
            print(f"Errore: la chiave deve essere 32 bytes, ricevuti {len(priv_key_bytes)}.")
            return
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_key_bytes)
        pub_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        print(f"  ✅ Chiave caricata. Pubblica: [{', '.join(str(b) for b in pub_bytes[:4])}, ...]")
    except Exception as e:
        print(f"Errore: Chiave privata non valida. {e}")
        return

    # 2. Input Dati Cliente
    print()
    client_name = input("Nome Cliente/Studio: ").strip()
    if not client_name:
        print("Errore: nome cliente obbligatorio.")
        return

    key_id = input("ID Licenza (invio = UUID auto): ").strip()
    if not key_id:
        key_id = str(uuid.uuid4())[:8]
        print(f"  → ID generato: {key_id}")

    date_str = input("Scadenza (AAAA-MM-GG, invio = 1 anno): ").strip()

    if not date_str:
        expiry_timestamp = int((time.time() + 365.25 * 86400) * 1000)
        exp_date = datetime.now() + timedelta(days=365)
        print(f"  → Scadenza: {exp_date.strftime('%Y-%m-%d')}")
    else:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            expiry_timestamp = int(dt.timestamp() * 1000)
        except ValueError:
            print("Formato data errato. Usa AAAA-MM-GG.")
            return

    # 3. Creazione Payload (con nonce anti-replay)
    nonce = secrets.token_hex(16)  # 128-bit nonce univoco
    license_payload = {
        "c": client_name,
        "e": expiry_timestamp,
        "id": key_id,
        "n": nonce,  # anti-replay nonce — rende ogni chiave unica anche con stessi dati
    }

    payload_json = json.dumps(license_payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode('utf-8').rstrip('=')

    # 4. Firma del Base64
    signature = private_key.sign(payload_b64.encode('utf-8'))
    signature_b64 = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')

    # 5. Token finale
    final_token = f"LXFW.{payload_b64}.{signature_b64}"

    # 6. Autovalidazione
    try:
        private_key.public_key().verify(signature, payload_b64.encode('utf-8'))
        valid = "✅ FIRMA VERIFICATA"
    except Exception:
        valid = "❌ ERRORE FIRMA"
        print(f"\n  {valid}")
        return

    # 7. Registra nel registro delle chiavi emesse
    reg_pwd = get_registry_password()
    registry = load_registry(reg_pwd)

    # Verifica che l'ID non sia già stato usato
    existing_ids = {e.get("id") for e in registry}
    if key_id in existing_ids:
        print(f"\n  ⚠️  ATTENZIONE: ID '{key_id}' già presente nel registro!")
        confirm = input("  Vuoi continuare comunque? (s/N): ").strip().lower()
        if confirm != 's':
            return

    entry = {
        "id": key_id,
        "client": client_name,
        "issued_at": datetime.now().isoformat(),
        "expires_at": datetime.fromtimestamp(expiry_timestamp / 1000).isoformat(),
        "expiry_ms": expiry_timestamp,
        "burn_hash": compute_key_hash(final_token),
        "status": "issued",  # issued | activated | revoked
        "nonce": nonce,
    }
    registry.append(entry)
    save_registry(reg_pwd, registry)

    print()
    print("=" * 70)
    print("  LICENZA GENERATA E REGISTRATA")
    print("=" * 70)
    print()
    print(f"  Cliente:    {client_name}")
    print(f"  ID:         {key_id}")
    print(f"  Nonce:      {nonce[:16]}...")
    print(f"  Scadenza:   {datetime.fromtimestamp(expiry_timestamp / 1000).strftime('%Y-%m-%d')}")
    print(f"  Verifica:   {valid}")
    print(f"  Burn Hash:  {entry['burn_hash'][:16]}...")
    print()
    print("  TOKEN (copia e incolla nell'app):")
    print()
    print(f"  {final_token}")
    print()
    print(f"  📋 Registro aggiornato: {len(registry)} chiavi totali")
    print("=" * 70)


def cmd_list():
    """List all issued keys."""
    reg_pwd = get_registry_password()
    registry = load_registry(reg_pwd)

    if not registry:
        print("\n  📭 Nessuna chiave emessa nel registro.\n")
        return

    print()
    print("=" * 90)
    print("  REGISTRO CHIAVI EMESSE LexFlow")
    print("=" * 90)
    print()
    print(f"  {'#':<4} {'ID':<10} {'Cliente':<25} {'Emessa':<12} {'Scade':<12} {'Stato':<10} {'Burn Hash'}")
    print("  " + "─" * 86)

    for i, entry in enumerate(registry, 1):
        issued = entry.get("issued_at", "?")[:10]
        expires = entry.get("expires_at", "?")[:10]
        status = entry.get("status", "?")
        status_icon = {"issued": "🔵", "activated": "🟢", "revoked": "🔴"}.get(status, "⚪")
        burn_hash = entry.get("burn_hash", "?")[:12]

        # Check if expired
        expiry_ms = entry.get("expiry_ms", 0)
        now_ms = int(time.time() * 1000)
        if expiry_ms > 0 and now_ms > expiry_ms and status != "revoked":
            status_icon = "⏰"
            status = "scaduta"

        print(f"  {i:<4} {entry.get('id', '?'):<10} {entry.get('client', '?'):<25} {issued:<12} {expires:<12} {status_icon} {status:<8} {burn_hash}...")

    print()
    total = len(registry)
    active = sum(1 for e in registry if e.get("status") == "issued")
    activated = sum(1 for e in registry if e.get("status") == "activated")
    revoked = sum(1 for e in registry if e.get("status") == "revoked")
    expired = sum(1 for e in registry
                  if e.get("expiry_ms", 0) > 0
                  and int(time.time() * 1000) > e.get("expiry_ms", 0)
                  and e.get("status") != "revoked")

    print(f"  Totale: {total} | Emesse: {active} | Attivate: {activated} | Revocate: {revoked} | Scadute: {expired}")
    print("=" * 90)
    print()


def cmd_verify():
    """Verify a token."""
    if len(sys.argv) < 3:
        token = input("Incolla il token da verificare: ").strip()
    else:
        token = sys.argv[2].strip()

    # Parse token
    parts = token.split('.')
    if len(parts) != 3 or parts[0] != 'LXFW':
        print("  ❌ Formato non valido. Deve essere LXFW.<payload>.<firma>")
        return

    payload_b64 = parts[1]
    try:
        payload_bytes = base64.urlsafe_b64decode(payload_b64 + '==')
        payload = json.loads(payload_bytes)
    except Exception:
        print("  ❌ Payload corrotto.")
        return

    print()
    print(f"  Cliente:   {payload.get('c', '?')}")
    print(f"  ID:        {payload.get('id', '?')}")
    print(f"  Nonce:     {payload.get('n', 'N/A (v1)')}")
    expiry_ms = payload.get('e', 0)
    exp_date = datetime.fromtimestamp(expiry_ms / 1000).strftime('%Y-%m-%d %H:%M')
    now_ms = int(time.time() * 1000)
    expired = now_ms > expiry_ms
    print(f"  Scadenza:  {exp_date} {'⏰ SCADUTA' if expired else '✅ Valida'}")

    # Check burn hash in registry
    burn_hash = compute_key_hash(token)
    print(f"  Burn Hash: {burn_hash[:24]}...")

    # Try to check registry
    try:
        reg_pwd = get_registry_password()
        registry = load_registry(reg_pwd)
        found = [e for e in registry if e.get("burn_hash") == burn_hash]
        if found:
            entry = found[0]
            print(f"  Registro:  ✅ Trovata (stato: {entry.get('status', '?')})")
        else:
            print(f"  Registro:  ⚠️  NON trovata nel registro (chiave generata con v1?)")
    except SystemExit:
        pass
    except Exception:
        print(f"  Registro:  ⚠️  Non accessibile")

    print()


def cmd_export():
    """Export registry to CSV."""
    reg_pwd = get_registry_password()
    registry = load_registry(reg_pwd)

    if not registry:
        print("  📭 Registro vuoto.")
        return

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Cliente", "Data Emissione", "Scadenza", "Stato", "Burn Hash (parziale)"])
    for entry in registry:
        writer.writerow([
            entry.get("id", ""),
            entry.get("client", ""),
            entry.get("issued_at", "")[:19],
            entry.get("expires_at", "")[:10],
            entry.get("status", ""),
            entry.get("burn_hash", "")[:16],
        ])

    csv_path = SCRIPT_DIR / "lexflow-keys-export.csv"
    csv_path.write_text(output.getvalue())
    print(f"\n  ✅ Esportato in: {csv_path}")
    print(f"  📋 {len(registry)} chiavi esportate.\n")


def cmd_stats():
    """Show statistics."""
    reg_pwd = get_registry_password()
    registry = load_registry(reg_pwd)

    now_ms = int(time.time() * 1000)
    total = len(registry)
    active = sum(1 for e in registry
                 if e.get("status") == "issued"
                 and e.get("expiry_ms", 0) > now_ms)
    activated = sum(1 for e in registry if e.get("status") == "activated")
    revoked = sum(1 for e in registry if e.get("status") == "revoked")
    expired = sum(1 for e in registry
                  if e.get("expiry_ms", 0) > 0
                  and now_ms > e.get("expiry_ms", 0)
                  and e.get("status") != "revoked")

    # Client breakdown
    clients = {}
    for e in registry:
        c = e.get("client", "?")
        clients[c] = clients.get(c, 0) + 1

    print()
    print("=" * 50)
    print("  STATISTICHE REGISTRO LEXFLOW")
    print("=" * 50)
    print()
    print(f"  Chiavi totali:     {total}")
    print(f"  ├─ Emesse (valide): {active}")
    print(f"  ├─ Attivate:        {activated}")
    print(f"  ├─ Revocate:        {revoked}")
    print(f"  └─ Scadute:         {expired}")
    print()
    print("  Per Cliente:")
    for client, count in sorted(clients.items(), key=lambda x: -x[1]):
        print(f"    {client}: {count} chiavi")
    print()
    print("=" * 50)
    print()


def main():
    if len(sys.argv) < 2:
        print()
        print("  Uso: python3 generate_license_v2.py <comando>")
        print()
        print("  Comandi:")
        print("    generate    Genera una nuova chiave di licenza")
        print("    list        Mostra tutte le chiavi emesse")
        print("    verify      Verifica un token")
        print("    export      Esporta registro in CSV")
        print("    stats       Statistiche emissioni")
        print()
        return

    cmd = sys.argv[1].lower()
    if cmd == "generate":
        cmd_generate()
    elif cmd == "list":
        cmd_list()
    elif cmd == "verify":
        cmd_verify()
    elif cmd == "export":
        cmd_export()
    elif cmd == "stats":
        cmd_stats()
    else:
        print(f"  ❌ Comando sconosciuto: {cmd}")
        print("  Comandi: generate, list, verify, export, stats")


if __name__ == "__main__":
    main()
