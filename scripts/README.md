# 🔑 Gestione Licenze LexFlow

Questo documento descrive come generare chiavi e emettere licenze per LexFlow in modo sicuro.

## ⚠️ Avvisi di sicurezza (LEGGI PRIMA DI USARE)

1. CHIAVE PRIVATA: la chiave privata è segreta. Non salvarla nel repository in nessuna forma (file, commenti, screenshot).
2. GITIGNORE: aggiungi a `.gitignore` qualsiasi file temporaneo creato dagli script (es. `*.key`, `*.bak`, `*.priv`).
3. BACKUP: conserva la chiave privata in un posto protetto (Keychain, password manager, HSM). Se la perdi, non potrai più emettere licenze per la release corrente.
4. ROTAZIONE: se la chiave privata viene compromessa, genera una nuova coppia e rilascia una nuova versione dell'app con la nuova `PUBLIC_KEY_BYTES`.

## Script disponibili

- `gen_keys.py` — genera una coppia Ed25519. Stampa la lista dei 32 byte della chiave pubblica (da incollare in `src-tauri/src/lib.rs`) e la chiave privata in Base64 (salvala offline).
- `generate_license.py` — genera token di licenza firmati (prefisso `LXFW.`). Usa la chiave privata per firmare payload con i campi `c` (client), `e` (expiry ms), `id`.

Possono essere eseguiti dalla root del progetto:

```bash
python3 scripts/gen_keys.py
python3 scripts/generate_license.py
```

## Formato token

Il token prodotto da `generate_license.py` ha la forma:

```
LXFW.<payload_b64_no_pad>.<signature_b64_no_pad>
```

dove `payload_b64_no_pad` è la codifica Base64 URL-safe senza padding del JSON compatto con i campi `c`, `e`, `id` e `signature_b64_no_pad` è la firma Ed25519 (URL-safe, senza padding) della stringa `payload_b64_no_pad`.

Esempio payload JSON (compattato):

```json
{"c":"Studio Rossi","e":1793329920000,"id":"001"}
```

## Best practices operative

1. Non usare mai il keygen o il generatore di licenze su macchine poco sicure o condivise.
2. Usa una passphrase sicura se memorizzi la chiave privata in un file, e conserva il file fuori dal repo.
3. Firma le licenze solo dal tuo ambiente di release (staging/prod) e documenta quale chiave è usata per ogni ambiente.

## Recupero e rotazione

- Se la chiave privata è compromessa: genera una nuova coppia (`gen_keys.py`), aggiorna `PUBLIC_KEY_BYTES` in `src-tauri/src/lib.rs` e rilascia una nuova versione. Tutte le licenze firmate con la chiave precedente devono essere considerate invalide.

## Esempio rapido: emettere una licenza

1. Esegui `python3 scripts/generate_license.py`.
2. Incolla la tua chiave privata (Base64 urlsafe) quando richiesto.
3. Fornisci `Nome Cliente`, `ID` e `Scadenza`.
4. Copia la stringa `LXFW....` risultante e consegnala al cliente.

## Domande frequenti

- D: Posso salvare la chiave privata nel mio password manager?
  - R: Sì — è fortemente raccomandato. Non conservarla in chiaro su dischi condivisi.

- D: Il token contiene dati sensibili?
  - R: Il payload contiene soltanto `client`, `expiry` e `id`. Non inserire informazioni sensibili non necessarie.

---

Se vuoi, posso aggiungere una modalità CLI non-interattiva a `generate_license.py` (argparse) per l'automazione CI/CD, oppure creare un piccolo script che esporta le licenze in un CSV per l'invio ai clienti.
# 🛠️ Scripts — LexFlow

## `generate-icons.py`
Genera tutte le icone da `assets/icon-master.png`. Requisiti: `pip3 install Pillow`

```bash
python3 scripts/generate-icons.py
```
