#!/usr/bin/env python3
"""
Genera una coppia Ed25519, stampa i 32 byte della chiave pubblica
in formato Rust (per incollarli in `lib.rs`) e stampa la chiave privata
in Base64 URL-safe (salvala in un posto sicuro, non committarla mai).

Uso:
  python3 scripts/gen_keys.py

Dipendenze:
  pip install cryptography

Attenzione: la chiave privata NON deve essere messa nel repository.
"""
import base64, json
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives import serialization


def main():
    # Genera una nuova chiave privata Ed25519
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # Estrai i byte raw (32 bytes ciascuno)
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    # Formato Rust per lib.rs
    rust_lines = []
    for i in range(0, 32, 8):
        chunk = public_bytes[i:i+8]
        rust_lines.append("    " + ", ".join(f"{b}u8" for b in chunk) + ",")
    rust_block = "const PUBLIC_KEY_BYTES: [u8; 32] = [\n" + "\n".join(rust_lines) + "\n];"

    # Chiave privata in Base64 URL-safe (con padding)
    priv_b64 = base64.urlsafe_b64encode(private_bytes).decode()

    # ── Autovalidazione ──
    # Ricostruisci da Base64 e verifica che le chiavi corrispondano
    priv_check = base64.urlsafe_b64decode(priv_b64)
    assert priv_check == private_bytes, "ERRORE: round-trip Base64 fallito!"
    pk_check = ed25519.Ed25519PrivateKey.from_private_bytes(priv_check)
    pub_check = pk_check.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    assert pub_check == public_bytes, "ERRORE: chiave pubblica derivata non corrisponde!"

    # Test firma/verifica
    test_payload = b"LEXFLOW_KEY_VALIDATION_TEST"
    test_sig = private_key.sign(test_payload)
    public_key.verify(test_sig, test_payload)  # raise se fallisce

    print("=" * 60)
    print("  LEXFLOW — NUOVA COPPIA Ed25519 GENERATA")
    print("=" * 60)
    print()
    print("┌─ CHIAVE PUBBLICA (copia in src-tauri/src/lib.rs)")
    print("│")
    print(f"│  {rust_block.replace(chr(10), chr(10) + '│  ')}")
    print("│")
    print("└─────────────────────────────────────────────")
    print()
    print("┌─ CHIAVE PRIVATA (Base64 URL-safe — SALVA AL SICURO)")
    print("│")
    print(f"│  {priv_b64}")
    print("│")
    print(f"│  Lunghezza: {len(private_bytes)} bytes, Base64: {len(priv_b64)} chars")
    print("│  Formato: Base64 URL-safe (usa - e _ invece di + e /)")
    print("│  ⚠️  NON committare questa chiave. NON condividerla.")
    print("│")
    print("└─────────────────────────────────────────────")
    print()
    print("✅ Autovalidazione: chiave pubblica ↔ privata ↔ firma OK")
    print()


if __name__ == '__main__':
    main()
