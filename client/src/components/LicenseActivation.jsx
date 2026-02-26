import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ShieldCheck, KeyRound, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';
import '../styles/license.css';

/**
 * LicenseActivation — Gate di attivazione licenza LexFlow
 *
 * Flow:
 *  1. Controlla se la licenza è già attiva (check_license)
 *  2. Se no → mostra schermata di attivazione con input chiave LXFW
 *  3. Dopo attivazione → children (LoginScreen → App)
 *
 * Sicurezza:
 *  - Anti brute-force: lockout dopo 5 tentativi (gestito lato Rust)
 *  - La chiave viene trimata e sanitizzata prima dell'invio
 *  - Nessun dato sensibile in console.log in produzione
 */
export default function LicenseActivation({ children }) {
  const [isActivated, setIsActivated] = useState(null); // null = loading
  const [license, setLicense] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', text, detail? }
  const [showKey, setShowKey] = useState(false);
  const [shakeInput, setShakeInput] = useState(false);
  const inputRef = useRef(null);
  const toastTimer = useRef(null);

  // ── Check iniziale ────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const status = await invoke('check_license');
        setIsActivated(!!status.activated);
      } catch {
        setIsActivated(false);
      }
    })();
  }, []);

  // ── Auto-dismiss toast ────────────────────────────────────────────────────
  useEffect(() => {
    if (toast) {
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), toast.type === 'success' ? 2500 : 5000);
    }
    return () => clearTimeout(toastTimer.current);
  }, [toast]);

  // ── Sanitizza input ───────────────────────────────────────────────────────
  function handleInputChange(e) {
    // Rimuovi spazi, newline, tabs — le chiavi LXFW sono una stringa continua
    const cleaned = e.target.value.replace(/[\s\n\r\t]/g, '');
    setLicense(cleaned);
    if (toast?.type === 'error') setToast(null);
  }

  // ── Paste handler ─────────────────────────────────────────────────────────
  function handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = text.replace(/[\s\n\r\t]/g, '');
    setLicense(cleaned);
    if (toast?.type === 'error') setToast(null);
  }

  // ── Attivazione ───────────────────────────────────────────────────────────
  async function handleActivate(e) {
    if (e) e.preventDefault();
    const key = license.trim();

    if (!key) {
      setToast({ type: 'error', text: 'Inserisci la chiave di licenza.' });
      triggerShake();
      return;
    }

    if (!key.startsWith('LXFW.') || key.split('.').length !== 3) {
      setToast({ type: 'error', text: 'Formato non valido.', detail: 'La chiave deve iniziare con LXFW. e contenere 3 segmenti separati da punto.' });
      triggerShake();
      return;
    }

    setLoading(true);
    setToast(null);

    try {
      const response = await invoke('activate_license', { key, _client_name: null });

      if (response.success) {
        setToast({
          type: 'success',
          text: 'Licenza attivata con successo',
          detail: response.client ? `Registrata a: ${response.client}` : undefined,
        });
        setTimeout(() => setIsActivated(true), 1800);
      } else {
        if (response.locked) {
          setToast({
            type: 'error',
            text: 'Account temporaneamente bloccato',
            detail: `Troppi tentativi falliti. Riprova tra ${response.remaining} secondi.`,
          });
        } else {
          setToast({ type: 'error', text: response.error || 'Chiave non valida o scaduta.' });
          triggerShake();
        }
      }
    } catch {
      setToast({ type: 'error', text: 'Errore di comunicazione con il sistema.' });
    } finally {
      setLoading(false);
    }
  }

  function triggerShake() {
    setShakeInput(true);
    setTimeout(() => setShakeInput(false), 500);
  }

  // ── Loading splash ────────────────────────────────────────────────────────
  if (isActivated === null) {
    return (
      <div className="lic-splash">
        <div className="lic-splash-logo">
          <ShieldCheck size={32} strokeWidth={1.5} />
        </div>
        <span className="lic-splash-text">Verifica licenza…</span>
      </div>
    );
  }

  // ── App sbloccata ─────────────────────────────────────────────────────────
  if (isActivated) return <>{children}</>;

  // ── Schermata di attivazione ──────────────────────────────────────────────
  const hasInput = license.trim().length > 0;
  const maskedKey = showKey
    ? license
    : license.length > 20
      ? license.slice(0, 8) + '•'.repeat(Math.min(license.length - 16, 40)) + license.slice(-8)
      : license;

  return (
    <div className="lic-overlay">
      <div className="lic-card">
        {/* Header */}
        <div className="lic-header">
          <div className="lic-icon-ring">
            <KeyRound size={24} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="lic-title">Attivazione LexFlow</h1>
            <p className="lic-subtitle">Inserisci la chiave di licenza per sbloccare il software</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleActivate} className="lic-form">
          <label className="lic-label" htmlFor="license-key">Chiave di licenza</label>

          <div className={`lic-input-wrap ${shakeInput ? 'lic-shake' : ''} ${hasInput ? 'has-value' : ''}`}>
            <textarea
              ref={inputRef}
              id="license-key"
              className="lic-textarea"
              value={showKey ? license : maskedKey}
              onChange={handleInputChange}
              onPaste={handlePaste}
              onFocus={() => setShowKey(true)}
              placeholder="LXFW.eyJjIjoiLi4u..."
              rows={3}
              disabled={loading}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />

            {hasInput && (
              <button
                type="button"
                className="lic-eye-btn"
                onClick={() => setShowKey(!showKey)}
                tabIndex={-1}
                aria-label={showKey ? 'Nascondi chiave' : 'Mostra chiave'}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
          </div>

          <div className="lic-hint">
            Formato: <code>LXFW.&lt;payload&gt;.&lt;firma&gt;</code> — ricevuta al momento dell'acquisto
          </div>

          <button
            className="lic-btn-activate"
            type="submit"
            disabled={loading || !hasInput}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="lic-spinner" />
                Verifica in corso…
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                Attiva Licenza
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="lic-footer">
          <ShieldCheck size={12} />
          <span>Verifica crittografica locale — Ed25519</span>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className={`lic-toast ${toast.type} ${toast ? 'lic-toast-in' : ''}`} role="alert">
          <div className="lic-toast-icon">
            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          </div>
          <div className="lic-toast-body">
            <span className="lic-toast-title">{toast.text}</span>
            {toast.detail && <span className="lic-toast-detail">{toast.detail}</span>}
          </div>
          <button className="lic-toast-close" onClick={() => setToast(null)}>&times;</button>
        </div>
      )}
    </div>
  );
}

