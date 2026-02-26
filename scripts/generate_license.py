#!/usr/bin/env python3
"""
Generatore Licenze LexFlow — Ed25519 Signed Tokens

Uso:
  python3 scripts/generate_license.py

Accetta la chiave privata in qualsiasi formato Base64:
  - URL-safe (con _ e -)
  - Standard (con + e /)
  - Con o senza padding =
"""
import base64
import json
import time
import uuid
from datetime import datetime
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization


def normalize_b64(raw: str) -> bytes:
    """Normalizza qualsiasi stringa Base64 (standard o URL-safe, con/senza padding)."""
    # Rimuovi spazi/newline
    s = raw.strip()
    # Converti standard Base64 (+/) in URL-safe (-_)
    s = s.replace('+', '-').replace('/', '_')
    # Aggiungi padding se necessario
    pad = 4 - (len(s) % 4)
    if pad < 4:
        s += '=' * pad
    return base64.urlsafe_b64decode(s)


def generate_license():
    print("=" * 60)
    print("  LEXFLOW — GENERATORE LICENZE (Ed25519)")
    print("=" * 60)
    print()

    # 1. Caricamento Chiave Privata
    priv_key_raw = input("Incolla la CHIAVE PRIVATA (Base64, qualsiasi formato): ").strip()
    try:
        priv_key_bytes = normalize_b64(priv_key_raw)
        if len(priv_key_bytes) != 32:
            print(f"Errore: la chiave deve essere 32 bytes, ricevuti {len(priv_key_bytes)}.")
            return
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_key_bytes)

        # Verifica: mostra i primi 4 byte della pubblica per conferma visiva
        pub_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        print(f"  ✅ Chiave caricata. Pubblica: [{', '.join(str(b) for b in pub_bytes[:4])}, ...]")
    except Exception as e:
        print(f"Errore: Chiave privata non valida. {e}")
        print("  Formati accettati: Base64 standard (a+b/c=) o URL-safe (a-b_c=)")
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
        from datetime import timedelta
        exp_date = datetime.now() + timedelta(days=365)
        print(f"  → Scadenza: {exp_date.strftime('%Y-%m-%d')}")
    else:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            expiry_timestamp = int(dt.timestamp() * 1000)
        except ValueError:
            print("Formato data errato. Usa AAAA-MM-GG.")
            return

    # 3. Creazione Payload
    license_payload = {
        "c": client_name,
        "e": expiry_timestamp,
        "id": key_id
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

    print()
    print("=" * 60)
    print("  LICENZA GENERATA")
    print("=" * 60)
    print()
    print(f"  Cliente:   {client_name}")
    print(f"  ID:        {key_id}")
    print(f"  Scadenza:  {datetime.fromtimestamp(expiry_timestamp/1000).strftime('%Y-%m-%d')}")
    print(f"  Verifica:  {valid}")
    print()
    print("  TOKEN (copia e incolla nell'app):")
    print()
    print(f"  {final_token}")
    print()
    print("=" * 60)


if __name__ == "__main__":
    generate_license()
