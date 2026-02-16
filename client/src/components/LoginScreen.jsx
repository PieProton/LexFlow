import React, { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, Fingerprint, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import logoSrc from '../assets/logo.png';

export default function LoginScreen({ onUnlock }) {
  const { t } = useTranslation();
  
  // Refs per evitare re-render continui della password (Sicurezza Memoria)
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isNew, setIsNew] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  
  // Stati UI
  const [bioAvailable, setBioAvailable] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [pwdStrength, setPwdStrength] = useState({ score: 0, label: '', color: '' });
  
  // Fix Race Condition React 18
  const bioEffectRan = useRef(false);

  useEffect(() => {
    // Check esistenza Vault
    window.api.vaultExists().then(exists => setIsNew(!exists));

    // Check Biometria
    const initBio = async () => {
      if (bioEffectRan.current) return;
      bioEffectRan.current = true;

      const available = await window.api.checkBio();
      setBioAvailable(available);

      if (available) {
        const saved = await window.api.hasBioSaved();
        const exists = await window.api.vaultExists();
        // Auto-login solo se vault esiste e credenziali salvate
        if (saved && exists) handleBioLogin();
      }
    };
    initBio();
  }, []);

  // Calcolo forza password (solo visivo, non salva nello state la pwd)
  const handlePwdInput = () => {
    if (!isNew || !passwordRef.current) return;
    const val = passwordRef.current.value;
    
    let score = 0;
    if (val.length >= 8) score++;
    if (val.length >= 12) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    let label = t('weak'); // Assicurati di avere le chiavi nel file json
    let color = '#f87171'; // Red
    
    if (score > 2) { label = t('fair'); color = '#fbbf24'; }
    if (score > 3) { label = t('good'); color = '#60a5fa'; }
    if (score > 4) { label = t('strong'); color = '#34d399'; }
    
    setPwdStrength({ score, label, color });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const pwd = passwordRef.current.value;

    if (!pwd) { setError(t('insertPassword')); return; }

    if (isNew) {
      const conf = confirmRef.current.value;
      if (pwd !== conf) { setError(t('passwordsDoNotMatch')); return; }
      if (pwdStrength.score < 3) { setError(t('passwordTooWeak')); return; }
    }

    setLoading(true);
    try {
      // Unlock chiama il backend SQLite
      const result = await window.api.unlockVault(pwd);

      if (result.success) {
        // Salvataggio Biometria opzionale
        if (bioAvailable) {
          try { await window.api.saveBio(pwd); } catch {}
        }

        if (result.isNew && result.recoveryCode) {
          // MOSTRA IL CODICE DI RECUPERO
          setRecoveryCode(result.recoveryCode);
          setLoading(false); // Aspettiamo che l'utente copi il codice
        } else {
          // Pulizia memoria immediata (best effort)
          if(passwordRef.current) passwordRef.current.value = '';
          if(confirmRef.current) confirmRef.current.value = '';
          onUnlock();
        }
      } else {
        setError(result.error || t('wrongPassword'));
        setLoading(false);
      }
    } catch (err) {
      setError(t('systemError'));
      setLoading(false);
    }
  };

  const handleBioLogin = async () => {
    setLoading(true);
    try {
      const savedPwd = await window.api.loginBio();
      if (savedPwd) {
        const result = await window.api.unlockVault(savedPwd);
        if (result.success) {
          onUnlock();
          return;
        }
      }
      setError(t('bioAuthFailed'));
    } catch {
      setError(t('bioError'));
    } finally {
      setLoading(false);
    }
  };

  // UI CARICAMENTO INIZIALE
  if (isNew === null) return (
    <div className="flex items-center justify-center min-h-screen bg-background text-text-muted animate-pulse">
      {t('loadingSystem')}
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-background relative drag-region">
      
      {/* MODALE CODICE DI RECUPERO (SOLO CREAZIONE) */}
      {recoveryCode && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div className="bg-card border border-primary/30 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl no-drag animate-in fade-in zoom-in">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock size={28} className="text-primary" />
            </div>
            <h2 className="text-xl font-bold text-text mb-2">{t('recoveryCodeTitle')}</h2>
            <p className="text-text-muted text-xs mb-6">
              {t('recoveryCodeWarning')} <strong className="text-danger">{t('shownOnce')}</strong>.
            </p>
            <div className="bg-black/30 border border-white/10 rounded-xl p-4 mb-6 select-all cursor-text">
              <p className="font-mono text-xl text-primary tracking-[4px] font-bold">{recoveryCode}</p>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(recoveryCode);
                setRecoveryCode(null);
                onUnlock();
              }} 
              className="btn-primary w-full justify-center"
            >
              {t('copyAndContinue')}
            </button>
          </div>
        </div>
      )}

      {/* FORM DI LOGIN / CREAZIONE */}
      <div className="glass-card p-8 w-[400px] relative z-10 no-drag animate-slide-up">
        <div className="text-center mb-8">
          <img src={logoSrc} alt="LexFlow" className="w-16 h-16 object-contain mx-auto mb-4" />
          <h1 className="text-xl font-bold text-text">LexFlow</h1>
          <p className="text-text-muted text-xs mt-1">
            {isNew ? t('setupVault') : (bioAvailable ? t('welcomeBack') : t('enterPassword'))}
          </p>
        </div>

        {!isNew && bioAvailable && !recoveryCode && (
          <button onClick={handleBioLogin} className="w-full py-3 mb-6 bg-primary/10 border border-primary/20 hover:bg-primary/20 rounded-lg flex items-center justify-center gap-2 transition group">
            <Fingerprint className="text-primary group-hover:scale-110 transition-transform" />
            <span className="text-primary text-sm font-semibold">{t('useBiometrics')}</span>
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input 
              ref={passwordRef}
              onChange={handlePwdInput}
              type={showPwd ? 'text' : 'password'} 
              className="input-field pl-10 pr-10" 
              placeholder={isNew ? t('createMasterPassword') : t('masterPassword')} 
              autoFocus 
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text">
              {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* MISURATORE FORZA PASSWORD (SOLO CREAZIONE) */}
          {isNew && (
            <div className="space-y-1">
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div 
                  className="h-full transition-all duration-300" 
                  style={{ width: `${pwdStrength.score * 20}%`, backgroundColor: pwdStrength.color }} 
                />
              </div>
              <p className="text-[10px] text-right" style={{ color: pwdStrength.color }}>{pwdStrength.label}</p>
            </div>
          )}

          {isNew && (
            <div className="relative">
              <ShieldCheck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input 
                ref={confirmRef}
                type={showPwd ? 'text' : 'password'} 
                className="input-field pl-10" 
                placeholder={t('confirmPassword')} 
              />
            </div>
          )}

          {error && <p className="text-danger text-xs text-center animate-shake">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? <Activity className="animate-spin" size={18} /> : (isNew ? t('createVault') : t('unlock'))}
          </button>
        </form>

        {!isNew && (
          <button 
            type="button" 
            onClick={async () => {
              // Trigger reset dialog (gestito nel main process o qui)
              const res = await window.api.resetVault();
              if(res?.success) window.location.reload();
            }} 
            className="block mx-auto mt-4 text-[11px] text-text-dim hover:text-danger underline transition"
          >
            {t('forgotPasswordReset')}
          </button>
        )}
      </div>
    </div>
  );
}