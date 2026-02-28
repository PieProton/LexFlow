import React, { useState, useRef, useEffect } from 'react';
import { 
  Lock, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Fingerprint, 
  KeyRound, 
  ShieldAlert, 
  CheckCircle2,
  Timer
} from 'lucide-react';
import logoSrc from '../assets/logo.png';

export default function LoginScreen({ onUnlock, autoLocked = false }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Sblocco...');
  const [isNew, setIsNew] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  
  // Brute-force lockout countdown
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutTimer = useRef(null);
  
  // Stati per la Biometria
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [bioFailed, setBioFailed] = useState(0);
  const [showPasswordField, setShowPasswordField] = useState(false);
  
  // Modal per Reset Vault (sostituisce window.prompt — non mostra password in chiaro)
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  
  const bioTriggered = useRef(false);
  const bioAutoTriggeredOnReturn = useRef(false);
  const MAX_BIO_ATTEMPTS = 3;

  useEffect(() => {
    // Controllo sicurezza: se l'API non è esposta, mostra errore o fallback
    if (!window.api) {
      console.error("API Electron non trovata");
      setIsNew(false);
      setShowPasswordField(true);
      return;
    }

    const init = async () => {
      try {
        // 1. Controlla esistenza Vault
        const exists = await window.api.vaultExists();
        setIsNew(!exists);

        if (!exists) {
          setShowPasswordField(true);
          return;
        }

        // 2. Controlla disponibilità Biometria
        try {
          const available = await window.api.checkBio();
          setBioAvailable(available);

          if (available) {
            const saved = await window.api.hasBioSaved();
            setBioSaved(saved);

            // Auto-trigger biometria SOLO all'avvio manuale (non dopo autolock).
            // Dopo autolock, la biometria si trigghera al ritorno sulla finestra
            // (visibilitychange) — così non disturbiamo l'utente su altre app.
            if (saved && !bioTriggered.current && !autoLocked) {
              bioTriggered.current = true;
              // Nascondi il form mentre il popup biometrico di sistema appare
              setShowPasswordField(false);
              setTimeout(() => handleBioLogin(true), 400);
            } else if (saved && autoLocked) {
              // Autolock: mostra il pulsante biometria, NON triggera il popup.
              // Il trigger avverrà via visibilitychange quando l'utente torna.
              setShowPasswordField(false);
            } else if (!saved) {
              setShowPasswordField(true);
            }
          } else {
            setShowPasswordField(true);
          }
        } catch (err) {
          console.warn("Errore inizializzazione bio:", err);
          setShowPasswordField(true);
        }
      } catch (err) {
        console.error("Errore inizializzazione vault:", err);
        setError("Errore critico di sistema");
      }
    };

    init();
  }, []);

  // ─── Auto-trigger biometria quando l'utente torna sulla finestra (autolock) ──
  useEffect(() => {
    // Solo se: autoLocked + biometria disponibile e salvata + pochi tentativi falliti
    if (!autoLocked || !bioAvailable || !bioSaved || bioFailed >= MAX_BIO_ATTEMPTS) return;
    if (isNew) return;

    const handleVisibility = () => {
      // document.visibilityState === 'visible' → l'utente è tornato su LexFlow
      if (document.visibilityState === 'visible' && !bioAutoTriggeredOnReturn.current && !showPasswordField) {
        bioAutoTriggeredOnReturn.current = true;
        // Breve delay per dare tempo al focus della finestra
        setTimeout(() => handleBioLogin(true), 300);
      }
    };

    // Se la finestra è già visibile (l'utente è davanti a LexFlow), triggera subito
    if (document.visibilityState === 'visible' && !bioAutoTriggeredOnReturn.current && !showPasswordField) {
      bioAutoTriggeredOnReturn.current = true;
      setTimeout(() => handleBioLogin(true), 600);
    }

    document.addEventListener('visibilitychange', handleVisibility);
    // Anche su focus della finestra (più affidabile su macOS con Tauri)
    const handleFocus = () => {
      if (!bioAutoTriggeredOnReturn.current && !showPasswordField) {
        bioAutoTriggeredOnReturn.current = true;
        setTimeout(() => handleBioLogin(true), 300);
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [autoLocked, bioAvailable, bioSaved, bioFailed, isNew, showPasswordField]);

  // ─── Countdown timer per lockout brute-force ───────────────────────────────
  useEffect(() => {
    if (lockoutSeconds <= 0) {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
      return;
    }
    lockoutTimer.current = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) {
          clearInterval(lockoutTimer.current);
          lockoutTimer.current = null;
          setError('');
          return 0;
        }
        const next = prev - 1;
        const mm = String(Math.floor(next / 60)).padStart(2, '0');
        const ss = String(next % 60).padStart(2, '0');
        setError(`Troppi tentativi falliti. Riprova tra ${mm}:${ss}`);
        return next;
      });
    }, 1000);
    return () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); };
  }, [lockoutSeconds > 0]); // re-trigger only on transition 0→positive

  const getStrength = (pwd) => {
    if (!pwd) return { label: '', color: 'bg-white/10', pct: 0, segments: 0 };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    // 6 criteri → 6 segmenti. "Eccellente" (6/6) = isPasswordStrong soddisfatto
    if (score <= 1) return { label: 'Debole', color: 'bg-red-500', pct: 17, segments: 1 };
    if (score <= 2) return { label: 'Insufficiente', color: 'bg-orange-500', pct: 33, segments: 2 };
    if (score <= 3) return { label: 'Sufficiente', color: 'bg-yellow-500', pct: 50, segments: 3 };
    if (score <= 4) return { label: 'Buona', color: 'bg-amber-400', pct: 67, segments: 4 };
    if (score <= 5) return { label: 'Forte', color: 'bg-primary', pct: 83, segments: 5 };
    return { label: 'Eccellente', color: 'bg-emerald-500', pct: 100, segments: 6 };
  };

  const isPasswordStrong = (pwd) => {
    return pwd.length >= 12 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return; // bloccato dal countdown
    setError('');

    if (isNew) {
      if (!isPasswordStrong(password)) {
        setError('Usa almeno 12 caratteri, una maiuscola, un numero e un simbolo.');
        return;
      }
      if (password !== confirm) { setError('Le password non corrispondono'); return; }
    }

    setLoading(true);
    setLoadingText(isNew ? 'Creazione database sicuro...' : 'Verifica crittografica...');

    try {
      if (!window.api) throw new Error("API non disponibile");
      const providedPwd = password; // keep local copy for potential saveBio before clearing state
      const result = await window.api.unlockVault(providedPwd);

      if (result.success) {
        // If this is a new vault and user wants biometrics, save with the original provided password
        if (result.isNew && bioAvailable && !bioSaved) {
          const consent = window.confirm("Vuoi abilitare l'accesso biometrico (Face ID / Touch ID / impronta) per accedere più velocemente?");
          if (consent) {
            try { await window.api.saveBio(providedPwd); } catch (e) { console.error(e); }
          }
        }

        // SECURITY FIX (Gemini L1-3): clear password from React state immediately after use.
        // JS GC does not zero memory on collection, but at least the reference is removed
        // so the GC can collect it. The field is also cleared to prevent it persisting in
        // the virtual DOM tree longer than necessary.
        setPassword('');
        setConfirm('');

        onUnlock();
      } else {
        if (result.locked && result.remaining) {
          const secs = Math.ceil(Number(result.remaining));
          setLockoutSeconds(secs);
          const mm = String(Math.floor(secs / 60)).padStart(2, '0');
          const ss = String(secs % 60).padStart(2, '0');
          setError(`Troppi tentativi falliti. Riprova tra ${mm}:${ss}`);
        } else {
          setError(result.error || 'Password errata');
        }
        setLoading(false);
      }
    } catch (err) {
      console.error(err);
      setError('Errore di sistema durante lo sblocco');
      setLoading(false);
    }
  };

  const handleBioLogin = async (isAutomatic = false) => {
    setError(''); // pulisce eventuali errori precedenti
    setLoading(true);
    setLoadingText('Autenticazione...');
    let unlocked = false;

    try {
      if (!window.api) throw new Error("API non disponibile");

      // 1. Recupera la password dal secure storage (Keychain/Keystore)
      const bioResult = await window.api.loginBio();

      // Possibili ritorni normalizzati:
      // - string: la password (legacy)
      // - { success: true }: il backend ha già sbloccato il vault
      // - null: fallito / annullato
      if (!bioResult) throw new Error("Autenticazione annullata o fallita");

      if (typeof bioResult === 'object' && bioResult.success) {
        // Backend ha già effettuato lo sblocco: chiamiamo onUnlock direttamente
        setPassword('');
        setShowPasswordField(false);
        setLoading(false);
        unlocked = true;
        onUnlock();
        return;
      }

      // Altrimenti bioResult è la password in chiaro (string)
      const savedPassword = String(bioResult);
      // 2. Usa la password recuperata per sbloccare il vault
      const result = await window.api.unlockVault(savedPassword);
      if (result.success) {
        // Pulizia e callback di successo: non mostrare più il form
        setPassword('');
        setShowPasswordField(false);
        // Assicuriamoci di disabilitare il loading PRIMA di smontare il componente
        setLoading(false);
        unlocked = true; // segnala che abbiamo effettuato l'unlock con successo
        onUnlock();
        return; // esce subito
      }
      throw new Error(result.error || "Errore decifratura vault");
    } catch (err) {
      const errMsg = err?.message || String(err);
      const isAndroidHandoff = errMsg.includes('android-bio-use-frontend');

      console.warn("Login bio fallito:", isAndroidHandoff ? "(Android handoff)" : err);

      // Calcola next failed count senza dipendere da aggiornamenti asincroni dello state
      const nextFailed = bioFailed + (isAndroidHandoff ? 0 : 1);
      if (!isAndroidHandoff) {
        setBioFailed(prev => prev + 1);
      }

      // Mostriamo il campo password come fallback PRIMA di ogni altra cosa
      setShowPasswordField(true);

      if (nextFailed >= MAX_BIO_ATTEMPTS) {
        setError('Troppi tentativi falliti. Usa la password.');
      } else if (!isAutomatic && !isAndroidHandoff) {
        setError('Riconoscimento fallito o annullato.');
      }
    } finally {
      // Se non abbiamo già fatto l'unlock (che chiama onUnlock e può smontare il componente),
      // assicuriamoci di stoppare il loading. Evitiamo setState su componenti smontati.
      if (!unlocked) setLoading(false);
    }
  };

  // Loading Iniziale
  if (isNew === null) return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20">
          <ShieldCheck className="text-primary animate-spin-slow" size={24} />
        </div>
        <div className="text-text-muted text-xs font-medium tracking-widest uppercase">Initializing Secure Environment</div>
      </div>
    </div>
  );

  const strength = getStrength(password);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background relative drag-region overflow-hidden">
      
      {/* Background Decor — no blur-[120px] che killava la GPU su Android */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full opacity-30" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full opacity-30" />

      {/* Login / Setup Card */}
      <div className="glass-card p-10 w-[440px] relative z-10 no-drag animate-slide-up shadow-2xl border-white/10">
        
        <div className="flex flex-col items-center mb-10">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
            <img src={logoSrc} alt="LexFlow" className="w-20 h-20 object-contain relative z-10" draggable={false} />
          </div>
          
          <h1 className="text-2xl font-black text-white tracking-tight">LexFlow</h1>
          
          {isNew ? (
            <div className="text-center mt-3 space-y-2">
              <div className="px-3 py-1 bg-primary/10 border border-primary/20 rounded-full inline-block">
                <span className="text-[10px] font-bold text-primary uppercase tracking-[2px]">Configurazione Iniziale</span>
              </div>
              <p className="text-text-muted text-sm max-w-[280px]">Proteggi il tuo studio con una cifratura di grado militare.</p>
            </div>
          ) : (
            <p className="text-text-muted text-sm mt-2 font-medium uppercase tracking-widest opacity-60">
              {showPasswordField ? 'Accesso Protetto' : 'Autenticazione...'}
            </p>
          )}
        </div>

        {/* Pulsante Biometria (Visibile solo se configurata e non in modalità password forzata) */}
        {!isNew && bioAvailable && bioSaved && bioFailed < MAX_BIO_ATTEMPTS && !showPasswordField && (
          <div className="space-y-4">
            <button 
              type="button" 
              onClick={() => handleBioLogin(false)} 
              disabled={loading} 
              className="w-full py-4 bg-primary text-white rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] shadow-xl shadow-primary/20 font-bold"
            >
              <Fingerprint size={24} />
              Accedi con Biometria
            </button>
            <button 
              onClick={() => setShowPasswordField(true)} 
              className="w-full text-text-dim hover:text-white text-xs font-semibold transition-colors py-2"
            >
              Usa invece la Master Password
            </button>
          </div>
        )}

        {/* Form Password (Setup o Fallback) */}
        {(isNew || showPasswordField) && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-[2px] ml-1 mb-2 block">Master Password</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" />
                <input 
                  type={showPwd ? 'text' : 'password'} 
                  className="input-field pl-12 pr-12 py-4 rounded-2xl bg-white/5 border-white/10 hover:border-white/20 transition-all text-white placeholder:text-white/20" 
                  placeholder="Inserisci la password..." 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  autoFocus 
                />
                <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim hover:text-white transition-colors" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isNew && password && (
              <div className="space-y-2 px-1">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Sicurezza</span>
                  <span className={`text-xs font-bold ${strength.color.replace('bg-', 'text-')}`}>
                    {strength.label}
                  </span>
                </div>
                <div className="flex gap-1.5 h-1.5">
                  {[1, 2, 3, 4, 5, 6].map((s) => (
                    <div 
                      key={s} 
                      className={`h-full flex-1 rounded-full transition-all duration-500 ${s <= strength.segments ? strength.color : 'bg-white/10'}`} 
                    />
                  ))}
                </div>
              </div>
            )}

            {isNew && (
              <div className="relative animate-fade-in">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-[2px] ml-1 mb-2 block">Conferma Password</label>
                <div className="relative">
                  <ShieldCheck size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input 
                    type={showPwd ? 'text' : 'password'} 
                    className="input-field pl-12 py-4 rounded-2xl bg-white/5 border-white/10 text-white placeholder:text-white/20" 
                    placeholder="Ripeti la password..." 
                    value={confirm} 
                    onChange={e => setConfirm(e.target.value)} 
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className={`${lockoutSeconds > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'} border p-3 rounded-xl flex items-center gap-2 animate-shake`}>
              {lockoutSeconds > 0 ? (
                <Timer size={16} className="text-amber-500 flex-shrink-0 animate-pulse" />
              ) : (
                <ShieldAlert size={16} className="text-red-500 flex-shrink-0" />
              )}
              <p className={`${lockoutSeconds > 0 ? 'text-amber-500' : 'text-red-500'} text-[11px] font-semibold leading-tight`}>{error}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading || lockoutSeconds > 0} 
            className="btn-primary w-full py-4 rounded-2xl justify-center font-bold text-sm tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {loading ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="uppercase">{loadingText}</span>
              </span>
            ) : lockoutSeconds > 0 ? (
              <span className="flex items-center gap-3 opacity-60">
                <Timer size={18} className="animate-pulse" />
                <span className="uppercase">Bloccato {String(Math.floor(lockoutSeconds / 60)).padStart(2, '0')}:{String(lockoutSeconds % 60).padStart(2, '0')}</span>
              </span>
            ) : (
              <span className="uppercase">{isNew ? 'Crea il mio Studio Digitale' : 'Accedi al Vault'}</span>
            )}
          </button>
        </form>
        )}

        <div className="mt-8 pt-6 border-t border-white/5 flex flex-col items-center gap-4">
          {!isNew && (
            <button 
              type="button" 
              onClick={() => { setShowResetModal(true); setResetPassword(''); setResetError(''); }}
              className="text-text-dim hover:text-red-500 text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              Password dimenticata? Reset Vault
            </button>
          )}

          <div className="flex items-center gap-4 opacity-40">
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-dim uppercase tracking-widest">
              <CheckCircle2 size={12} className="text-emerald-500" />
              AES-256 GCM
            </div>
            <div className="w-1 h-1 bg-text-dim rounded-full" />
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-dim uppercase tracking-widest">
              <CheckCircle2 size={12} className="text-emerald-500" />
              Zero-Knowledge
            </div>
          </div>
        </div>
      </div>

      {/* Reset Vault Modal — sostituisce window.prompt (no password in chiaro nel UI) */}
      {showResetModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card p-8 max-w-sm w-full shadow-2xl no-drag animate-slide-up border-red-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
                <ShieldAlert size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Factory Reset</h3>
                <p className="text-text-dim text-[10px]">Tutti i dati verranno eliminati</p>
              </div>
            </div>
            <p className="text-text-muted text-xs mb-4 leading-relaxed">
              Inserisci la password attuale per confermare il reset completo del Vault. 
              <span className="text-red-400 font-semibold"> Questa azione è irreversibile.</span>
            </p>
            <div className="relative mb-4">
              <input 
                type="password"
                className="input-field w-full py-3 px-4 rounded-xl bg-white/5 border-white/10 text-white placeholder:text-white/20 text-sm"
                placeholder="Password attuale..."
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && resetPassword) {
                    const result = await window.api.resetVault(resetPassword);
                    if (result?.success) {
                      setShowResetModal(false);
                      setIsNew(true); setPassword(''); setConfirm(''); setError(''); setBioSaved(false);
                    } else {
                      setResetError(result?.error || 'Password errata.');
                    }
                  }
                }}
              />
            </div>
            {resetError && (
              <div className="bg-red-500/10 border border-red-500/20 p-2 rounded-lg mb-4">
                <p className="text-red-400 text-[11px] font-semibold">{resetError}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-muted text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={async () => {
                  if (!resetPassword) { setResetError('Password richiesta.'); return; }
                  const result = await window.api.resetVault(resetPassword);
                  if (result?.success) {
                    setShowResetModal(false);
                    setIsNew(true); setPassword(''); setConfirm(''); setError(''); setBioSaved(false);
                  } else {
                    setResetError(result?.error || 'Password errata.');
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-widest hover:bg-red-500/30 transition-colors"
              >
                Conferma Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}