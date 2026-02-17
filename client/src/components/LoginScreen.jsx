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
  ArrowRight 
} from 'lucide-react';
import logoSrc from '../assets/logo.png';

export default function LoginScreen({ onUnlock }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Sblocco...');
  const [isNew, setIsNew] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioSaved, setBioSaved] = useState(false);
  const [bioFailed, setBioFailed] = useState(0);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState(null);
  
  const bioTriggered = useRef(false);
  const MAX_BIO_ATTEMPTS = 3;

  useEffect(() => {
    window.api.vaultExists().then(exists => {
      const newVault = !exists;
      setIsNew(newVault);
      if (newVault) setShowPasswordField(true);
    });
    window.api.checkBio().then(available => {
      setBioAvailable(available);
      if (available) {
        window.api.hasBioSaved().then(saved => {
          setBioSaved(saved);
          if (saved && !bioTriggered.current) {
            bioTriggered.current = true;
            setTimeout(() => {
              window.api.vaultExists().then(exists => {
                if (exists) handleBioLogin(true);
                else setShowPasswordField(true);
              });
            }, 400);
          } else if (!saved) {
            setShowPasswordField(true);
          }
        });
      } else {
        setShowPasswordField(true);
      }
    });
  }, []);

  const getStrength = (pwd) => {
    if (!pwd) return { label: '', color: 'bg-white/10', pct: 0, segments: 0 };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    
    if (score <= 1) return { label: 'Debole', color: 'bg-danger', pct: 20, segments: 1 };
    if (score <= 2) return { label: 'Sufficiente', color: 'bg-warning', pct: 40, segments: 2 };
    if (score <= 3) return { label: 'Buona', color: 'bg-info', pct: 60, segments: 3 };
    if (score <= 4) return { label: 'Forte', color: 'bg-primary', pct: 80, segments: 4 };
    return { label: 'Eccellente', color: 'bg-success', pct: 100, segments: 5 };
  };

  const isPasswordStrong = (pwd) => {
    return pwd.length >= 12 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /[0-9]/.test(pwd) && /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      const result = await window.api.unlockVault(password);
      if (result.success) {
        if (bioAvailable) { try { await window.api.saveBio(password); } catch {} }
        if (result.isNew && result.recoveryCode) {
          setRecoveryCode(result.recoveryCode);
        } else {
          onUnlock();
        }
      } else {
        setError(result.error || 'Password errata');
        setLoading(false);
      }
    } catch {
      setError('Errore di sistema');
      setLoading(false);
    }
  };

  const handleBioLogin = async (isAutomatic = false) => {
    setLoading(true);
    setLoadingText('Autenticazione...');
    try {
      const savedPassword = await window.api.loginBio();
      if (savedPassword) {
        const result = await window.api.unlockVault(savedPassword);
        if (result.success) {
          onUnlock();
          return;
        }
      }
      setBioFailed(prev => prev + 1);
      if (bioFailed + 1 >= MAX_BIO_ATTEMPTS) setShowPasswordField(true);
      if (!isAutomatic) setError('Accesso biometrico fallito.');
    } catch {
      setBioFailed(prev => prev + 1);
      if (!isAutomatic) setError('Riconoscimento annullato.');
    } finally {
      if (!isAutomatic) setLoading(false);
    }
  };

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
      
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />

      {/* Recovery Code Modal */}
      {recoveryCode && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="glass-card p-10 max-w-md w-full text-center shadow-2xl no-drag animate-slide-up border-primary/30">
            <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-primary/20">
              <ShieldAlert size={40} className="text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Backup di Emergenza</h2>
            <p className="text-text-muted text-sm mb-8 leading-relaxed">
              Questo codice è l'unico modo per recuperare i tuoi dati se dimentichi la password. 
              <span className="text-warning font-bold block mt-1 uppercase text-[10px] tracking-widest">Salvalo ora, non verrà più mostrato.</span>
            </p>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 select-all group hover:border-primary/40 transition-colors">
              <p className="font-mono text-xl text-primary tracking-[4px] font-bold break-all uppercase">
                {recoveryCode}
              </p>
            </div>
            <button 
              onClick={() => { navigator.clipboard?.writeText(recoveryCode); setRecoveryCode(null); onUnlock(); }} 
              className="btn-primary w-full py-4 text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2 group"
            >
              Copia Codice e Inizia
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      )}

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

        {(isNew || showPasswordField) && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="relative group">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-[2px] ml-1 mb-2 block">Master Password</label>
              <div className="relative">
                <KeyRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" />
                <input 
                  type={showPwd ? 'text' : 'password'} 
                  className="input-field pl-12 pr-12 py-4 rounded-2xl bg-white/5 border-white/10 hover:border-white/20 transition-all" 
                  placeholder="Minimo 12 caratteri..." 
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
                  <span className="text-xs font-bold" style={{ color: `var(--color-${strength.label === 'Eccellente' || strength.label === 'Forte' ? 'success' : 'warning'})` }}>
                    {strength.label}
                  </span>
                </div>
                <div className="flex gap-1.5 h-1.5">
                  {[1, 2, 3, 4, 5].map((s) => (
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
                    className="input-field pl-12 py-4 rounded-2xl bg-white/5 border-white/10" 
                    placeholder="Ripeti la password..." 
                    value={confirm} 
                    onChange={e => setConfirm(e.target.value)} 
                  />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 p-3 rounded-xl flex items-center gap-2 animate-shake">
              <ShieldAlert size={16} className="text-danger flex-shrink-0" />
              <p className="text-danger text-[11px] font-semibold leading-tight">{error}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading} 
            className="btn-primary w-full py-4 rounded-2xl justify-center font-bold text-sm tracking-widest shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span className="uppercase">{loadingText}</span>
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
              onClick={async () => {
                const result = await window.api.resetVault();
                if (result?.success) { setIsNew(true); setPassword(''); setConfirm(''); setError(''); }
              }} 
              className="text-text-dim hover:text-danger text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              Password dimenticata? Reset Vault
            </button>
          )}

          <div className="flex items-center gap-4 opacity-40">
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-dim uppercase tracking-widest">
              <CheckCircle2 size={12} className="text-success" />
              AES-256 GCM
            </div>
            <div className="w-1 h-1 bg-text-dim rounded-full" />
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-text-dim uppercase tracking-widest">
              <CheckCircle2 size={12} className="text-success" />
              Zero-Knowledge
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}