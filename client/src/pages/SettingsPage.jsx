import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  FileText, 
  HardDrive, 
  LogOut,
  RefreshCw,
  Bell,
  Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

const PREAVVISO_OPTIONS = [
  { value: 0, label: 'Al momento' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 ora' },
  { value: 120, label: '2 ore' },
  { value: 1440, label: '1 giorno' },
];

export default function SettingsPage({ onLock }) {
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(false);

  // Stato per le Notifiche
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState(30);

  useEffect(() => {
    if (window.api) {
      window.api.getAppVersion().then(setAppVersion);
      window.api.isMac().then(isMac => setPlatform(isMac ? 'macOS' : 'Windows'));
      
      window.api.getSettings().then(settings => {
        if (settings) {
          if (typeof settings.privacyBlurEnabled === 'boolean') setPrivacyEnabled(settings.privacyBlurEnabled);
          if (typeof settings.notifyEnabled === 'boolean') setNotifyEnabled(settings.notifyEnabled);
          if (settings.notificationTime) setNotificationTime(settings.notificationTime);
        }
      });
    }
  }, []);

  const handlePrivacyToggle = async () => {
    const newValue = !privacyEnabled;
    setPrivacyEnabled(newValue);
    try {
      await window.api.saveSettings({ privacyBlurEnabled: newValue });
      toast.success(newValue ? 'Privacy Blur Attivato' : 'Privacy Blur Disattivato');
    } catch (error) {
      toast.error('Errore salvataggio');
      setPrivacyEnabled(!newValue); 
    }
  };

  // Funzione per salvare le impostazioni delle notifiche
  const saveNotifySettings = async (updates) => {
    try {
      await window.api.saveSettings(updates);
      toast.success("Preferenze notifiche aggiornate");
    } catch (e) {
      toast.error("Errore nel salvataggio");
    }
  };

  const handleExportBackup = async () => {
    if (!window.api || !window.api.exportVault) {
      toast.error("Servizio di backup non disponibile");
      return;
    }
    const pwd = prompt("Inserisci una password per cifrare il file di backup:");
    if (!pwd) return;
    if (pwd.length < 4) {
      toast.error("Password troppo corta (min. 4 caratteri)");
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Generazione backup in corso...');
    try {
      const result = await window.api.exportVault(pwd);
      if (result && result.success) {
        toast.success('Backup esportato con successo!', { id: toastId });
      } else if (result && result.cancelled) {
        toast.dismiss(toastId);
      } else {
        toast.error('Errore: ' + (result?.error || 'Sconosciuto'), { id: toastId });
      }
    } catch (e) {
      toast.error('Errore critico durante il backup', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-10">
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Impostazioni</h1>
          <p className="text-text-muted text-sm">Gestisci sicurezza e preferenze di LexFlow.</p>
        </div>
        <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 text-xs font-mono text-text-dim">
          v{appVersion} • {platform}
        </div>
      </div>

      <div className="grid gap-6">
        
        {/* SEZIONE NOTIFICHE (AGGIUNTA) */}
        <section className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-4">
            <Bell className="text-primary" size={20} />
            <h2 className="text-lg font-bold text-white">Notifiche di Sistema</h2>
          </div>

          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <span className="font-medium text-white">Avvisi Agenda e Scadenze</span>
                <p className="text-xs text-text-muted max-w-md">
                  Ricevi notifiche desktop per udienze, scadenze e impegni in agenda.
                </p>
              </div>
              <button 
                onClick={() => {
                  const val = !notifyEnabled;
                  setNotifyEnabled(val);
                  saveNotifySettings({ notifyEnabled: val });
                }}
                className={`w-12 h-6 rounded-full transition-colors relative ${notifyEnabled ? 'bg-primary' : 'bg-white/10'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${notifyEnabled ? 'left-7' : 'left-1'}`} />
              </button>
            </div>

            {notifyEnabled && (
              <div className="pt-4 border-t border-white/5">
                <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-3 block">Preavviso Standard</label>
                <div className="flex flex-wrap gap-2">
                  {PREAVVISO_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setNotificationTime(opt.value);
                        saveNotifySettings({ notificationTime: opt.value });
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        notificationTime === opt.value
                          ? 'bg-primary text-black border-primary shadow-[0_0_12px_rgba(212,169,64,0.3)]'
                          : 'bg-white/[0.04] text-text-muted border-white/5 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Sezione Sicurezza */}
        <section className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-4">
            <Shield className="text-primary" size={20} />
            <h2 className="text-lg font-bold text-white">Sicurezza & Privacy</h2>
          </div>

          <div className="flex items-center justify-between group">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">Privacy Blur</span>
                <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/20">CONSIGLIATO</span>
              </div>
              <p className="text-xs text-text-muted max-w-md">
                Sfoca automaticamente il contenuto dell'app quando perdi il focus.
              </p>
            </div>
            <button 
              onClick={handlePrivacyToggle}
              className={`w-12 h-6 rounded-full transition-colors relative ${privacyEnabled ? 'bg-primary' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${privacyEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <button 
              onClick={onLock}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 transition-all group"
            >
              <Lock size={18} className="transition-transform group-hover:-rotate-12" />
              <span className="text-sm font-bold uppercase tracking-wider">Blocca Vault Ora</span>
            </button>
            <button 
              onClick={() => {
                if(window.confirm("Cancellare le credenziali biometriche salvate?")) {
                  window.api.clearBio().then(() => toast.success("Biometria resettata"));
                }
              }}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-text transition-all group"
            >
              <RefreshCw size={18} className="text-text-dim group-hover:rotate-180 transition-transform duration-500" />
              <span className="text-sm font-medium">Resetta Biometria</span>
            </button>
          </div>
        </section>

        {/* Sezione Dati */}
        <section className="glass-card p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4 mb-4">
            <HardDrive className="text-emerald-500" size={20} />
            <h2 className="text-lg font-bold text-white">Gestione Dati</h2>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="font-medium text-white">Backup Crittografato</span>
              <p className="text-xs text-text-muted max-w-lg">
                Esporta fascicoli e agenda in un file <code className="text-emerald-400">.lex</code> cifrato.
              </p>
            </div>
            <button 
              onClick={handleExportBackup} 
              disabled={loading}
              className={`btn-primary px-6 py-2.5 text-sm flex items-center gap-2 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={16} />}
              {loading ? 'Esportazione...' : 'Esporta Backup'}
            </button>
          </div>
        </section>
      </div>

      <div className="pt-12 text-center">
        <button 
          onClick={async () => {
            if(window.confirm("Cancellare l'intero database? Questa azione è irreversibile.")) {
               const res = await window.api.resetVault();
               if(res.success) window.location.reload();
            }
          }}
          className="text-[10px] font-black text-red-500/30 hover:text-red-500 uppercase tracking-[4px] transition-all flex items-center justify-center gap-3 mx-auto py-4 border border-transparent hover:border-red-500/10 rounded-full px-8"
        >
          <LogOut size={14} />
          Factory Reset Vault
        </button>
      </div>
    </div>
  );
}