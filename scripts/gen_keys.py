#!/usr/bin/env python3
"""
Genera una coppia Ed25519, stampa i 32 byte della chiave pubblica
in formato lista (per incollarli in `lib.rs`) e stampa la chiave privata
in Base64 (salvala in un posto sicuro, non committarla mai).

Uso:
  python3 scripts/gen_keys.py

Dipendenze:
  pip install cryptography

Attenzione: la chiave privata NON deve essere messa nel repository.
"""
import base64
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

    print("-" * 60)
    print("COPIA QUESTA LISTA IN src-tauri/src/lib.rs nella costante PUBLIC_KEY_BYTES:")
    print(list(public_bytes))
    print("-" * 60)
    print("QUESTA È LA TUA CHIAVE PRIVATA (BASE64 URLSAFE). SALVALA AL SICURO E NON CONDIVIDERLA:")
    print(base64.urlsafe_b64encode(private_bytes).decode())
    print("-" * 60)
    print("NOTE: Non committare la chiave privata. Conserva solo la lista dei 32 byte pubblici nel codice.")


if __name__ == '__main__':
    main()
