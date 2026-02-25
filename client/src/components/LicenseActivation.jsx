import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core'; // Corretto per Tauri v2
import '../styles/license.css';

/**
 * LicenseActivation
 * Un componente sobrio e professionale, senza icone o emoji.
 */
export default function LicenseActivation({ children, theme }) {
  const defaultTheme = {
    // Preferire le variabili CSS del progetto per coerenza visiva
    primary: 'var(--primary)',
    bg: 'var(--bg)',
    text: 'var(--text)',
    accent: 'var(--success)'
  };
  const t = { ...defaultTheme, ...(theme || {}) };

  const [isActivated, setIsActivated] = useState(null); // null = caricamento
  const [license, setLicense] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    // Controllo iniziale della licenza
    (async () => {
      try {
        const status = await invoke('check_license');
        setIsActivated(status.activated);
      } catch (e) {
        console.error('Errore controllo licenza:', e);
        setIsActivated(false);
      }
    })();
  }, []);

  async function handleActivate(e) {
    if (e) e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      // Nota: passiamo null a _client_name perché il Rust lo estrae dal token firmato
      const response = await invoke('activate_license', { key: license.trim(), _client_name: null });
      
      if (response.success) {
        setMsg({ type: 'success', text: `Attivazione riuscita. Licenza registrata a: ${response.client || 'Utente'}` });
        setTimeout(() => {
          setIsActivated(true);
        }, 1200);
      } else {
        if (response.locked) {
          setMsg({ type: 'error', text: `Troppi tentativi falliti. Riprova tra ${response.remaining} secondi.` });
        } else {
          setMsg({ type: 'error', text: response.error || 'La chiave inserita non è valida o è scaduta.' });
        }
      }
    } catch (err) {
      console.error('Activation error', err);
      setMsg({ type: 'error', text: 'Errore di comunicazione con il sistema di sicurezza.' });
    } finally {
      setLoading(false);
    }
  }

  // Schermata di caricamento iniziale
  if (isActivated === null) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'sans-serif' }}>
        Caricamento in corso...
      </div>
    );
  }

  // Se l'app è attiva, mostra il resto del software
  if (isActivated) return <>{children}</>;

  // Altrimenti mostra il tuo box di attivazione
  return (
    <div className="lf-overlay">
      <div className="lf-card">
        <h2 className="lf-title">Attivazione LexFlow</h2>
        <p className="lf-sub">Il software richiede una licenza valida per funzionare. Inserire la chiave LXFW ricevuta al momento dell'acquisto.</p>

        <form onSubmit={handleActivate}>
          <textarea
            className="lf-textarea"
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            placeholder="Esempio: LXFW.eyJjIjoicGlldHJv..."
            rows={4}
            disabled={loading}
          />
          
          <div className="lf-actions">
            <button
              className="lf-btn lf-btn-primary"
              type="submit"
              disabled={loading || !license.trim()}
            >
              {loading ? 'Verifica...' : 'Attiva Software'}
            </button>

            <div className="lf-info">Sistema di verifica locale<br />Crittografia Ed25519</div>
          </div>
        </form>

        {msg && (
          <div className={"lf-msg " + (msg.type === 'success' ? 'success' : 'error')}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

