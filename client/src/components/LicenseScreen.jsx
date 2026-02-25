import React, { useState, useRef } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

/**
 * LicenseScreen — schermata di attivazione licenza
 * Appare solo al primo avvio, prima del login con password.
 * La chiave viene verificata matematicamente (HMAC offline, no internet).
 * Una volta attivata, non viene più chiesta.
 */
export default function LicenseScreen({ onActivated, expiredMessage }) {
  const [key, setKey] = useState('LXFW-');
  const [error, setError] = useState(expiredMessage || '');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Formatta automaticamente la chiave mentre l'utente scrive (LXFW-XXXX-XXXX-XXXX-XXXX)
  function handleKeyInput(e) {
    let raw = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    // Rimuovi i trattini e lavora sul contenuto grezzo
    const base = raw.replace(/-/g, '');
    // Inserisce i trattini nelle posizioni corrette: LXFW(4)-XXXX(4)-XXXX(4)-XXXX(4)-XXXXXXXX(8)
    const segments = [];
    segments.push(base.slice(0, 4));
    if (base.length > 4)  segments.push(base.slice(4, 8));
    if (base.length > 8)  segments.push(base.slice(8, 12));
    if (base.length > 12) segments.push(base.slice(12, 16));
    if (base.length > 16) segments.push(base.slice(16, 24));
    const formatted = segments.join('-');
    setKey(formatted);
    setError('');
  }

  async function handleActivate() {
    const trimmed = key.trim();
    if (!trimmed || trimmed === 'LXFW-') {
      setError('Inserisci la chiave di licenza ricevuta.');
      return;
    }
    // Formato: LXFW-XXXX-XXXX-XXXX-XXXXXXXX (28 caratteri con trattini)
    const parts = trimmed.split('-');
    if (parts.length !== 5 || parts[0] !== 'LXFW' ||
        parts[1].length !== 4 || parts[2].length !== 4 || parts[3].length !== 4 || parts[4].length !== 8) {
      setError('Formato chiave non valido. Esempio: LXFW-AB12-CD34-EF56-GH78AB90');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.api?.activateLicense(trimmed);
      if (result?.success) {
        onActivated();
      } else {
        setError(result?.error || 'Chiave non valida. Controlla di averla copiata correttamente.');
      }
    } catch (e) {
      setError('Errore di sistema. Riprova.');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleActivate();
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#08090f',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-sans, system-ui)',
      userSelect: 'none',
    }}>
      {/* Sfondo decorativo */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(212,169,64,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: '#13141e',
        border: '1px solid rgba(212,169,64,0.25)',
        borderRadius: 24,
        padding: '40px 44px',
        width: '100%', maxWidth: 440,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,169,64,0.1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* Icona */}
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, #d4a940, #b8912e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(212,169,64,0.4)',
        }}>
          <KeyRound size={34} color="#fff" strokeWidth={1.8} />
        </div>

        {/* Titolo */}
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.03em' }}>
            LexFlow
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '6px 0 0', fontWeight: 500 }}>
            Inserisci la tua chiave di licenza per continuare
          </p>
        </div>

        {/* Input chiave */}
        <div style={{ width: '100%' }}>
          <input
            ref={inputRef}
            value={key}
            onChange={handleKeyInput}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            placeholder="LXFW-XXXX-XXXX-XXXX-XXXXXXXX"
            maxLength={28}
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 15,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.12em',
              background: '#0c0d14',
              color: error ? '#f87171' : '#d4a940',
              border: `1.5px solid ${error ? 'rgba(248,113,113,0.5)' : 'rgba(212,169,64,0.3)'}`,
              borderRadius: 12,
              outline: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(212,169,64,0.7)'; }}
            onBlur={e => { if (!error) e.target.style.borderColor = 'rgba(212,169,64,0.3)'; }}
          />

          {/* Errore */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginTop: 8, color: '#f87171', fontSize: 12, fontWeight: 500,
            }}>
              <AlertCircle size={13} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Bottone attiva */}
        <button
          onClick={handleActivate}
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            background: loading ? 'rgba(212,169,64,0.5)' : 'linear-gradient(135deg, #d4a940, #b8912e)',
            color: '#0c0d14',
            border: 'none',
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
            boxShadow: loading ? 'none' : '0 4px 20px rgba(212,169,64,0.35)',
          }}
        >
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Verifica in corso…</>
            : <><ShieldCheck size={16} /> Attiva LexFlow</>
          }
        </button>

        {/* Footer info */}
        <p style={{
          fontSize: 11, color: 'rgba(255,255,255,0.2)',
          textAlign: 'center', margin: 0, lineHeight: 1.6,
        }}>
          La verifica avviene offline — nessun dato inviato a server.
          <br />Chiave generata con <code style={{ color: 'rgba(255,255,255,0.3)' }}>npm run keygen</code> nella cartella LexFlow.
        </p>
      </div>
    </div>
  );
}
