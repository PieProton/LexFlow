#!/usr/bin/env python3
import base64
import json
import time
from datetime import datetime
from cryptography.hazmat.primitives.asymmetric import ed25519

def generate_license():
    print("--- GENERATORE LICENZE LEXFLOW (v2 Ed25519) ---")
    
    # 1. Caricamento Chiave Privata
    priv_key_base64 = input("Incolla la tua CHIAVE PRIVATA (Base64): ").strip()
    try:
        # Gestisce sia chiavi con che senza padding '='
        padding = 4 - (len(priv_key_base64) % 4)
        if padding < 4:
            priv_key_base64 += "=" * padding
            
        priv_key_bytes = base64.urlsafe_b64decode(priv_key_base64)
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(priv_key_bytes)
    except Exception as e:
        print(f"Errore: Chiave privata non valida. {e}")
        return

    # 2. Input Dati Cliente
    client_name = input("Nome Cliente/Studio: ").strip()
    key_id = input("ID Univoco Licenza (es. 001): ").strip() or "1"
    
    date_str = input("Scadenza (AAAA-MM-GG, premi invio per 1 anno): ").strip()
    
    if not date_str:
        # Default: 1 anno da oggi
        expiry_timestamp = int((time.time() + 31536000) * 1000)
    else:
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            expiry_timestamp = int(dt.timestamp() * 1000)
        except:
            print("Formato data errato. Usa AAAA-MM-GG.")
            return

    # 3. Creazione Payload (allineato alla struct Rust LicensePayload)
    # Usiamo separatori compatti per evitare spazi bianchi nel JSON che invaliderebbero la firma
    license_payload = {
        "c": client_name,
        "e": expiry_timestamp,
        "id": key_id
    }
    
    payload_json = json.dumps(license_payload, separators=(',', ':')).encode('utf-8')
    payload_b64 = base64.urlsafe_b64encode(payload_json).decode('utf-8').rstrip('=')

    # 4. Firma del Base64 (importante: Rust verifica la firma della stringa B64)
    signature = private_key.sign(payload_b64.encode('utf-8'))
    signature_b64 = base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')

    # 5. Token finale: LXFW.Payload.Firma
    final_token = f"LXFW.{payload_b64}.{signature_b64}"
    
    print("\n" + "="*60)
    print("LICENZA DA CONSEGNARE AL CLIENTE:")
    print(final_token)
    print("="*60 + "\n")

if __name__ == "__main__":
    generate_license()
