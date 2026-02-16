import React, { useState, useEffect } from 'react';
import { Shield, Eye, Lock, Download, Trash2, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage({ onLock }) {
  const [settings, setSettings] = useState({ privacyBlurEnabled: true });
  const [backupPwd, setBackupPwd] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.api?.getSettings?.().then(setSettings).catch(console.error);
  }, []);

  const togglePrivacy = async () => {
    const newVal = !settings.privacyBlurEnabled;
    const newSettings = { ...settings, privacyBlurEnabled: newVal };
    setSettings(newSettings);
    await window.api?.saveSettings?.(newSettings);
    toast.success(`Privacy Shield ${newVal ? 'Attivato' : 'Disattivato'}`);
  };

  const handleBackup = async () => {
    if (!backupPwd) return toast.error('Inserisci una password per il backup');
    
    setLoading(true);
    try {
      // Chiama la funzione exportVault (assicurati di averla aggiunta al preload.js)
      const res = await window.api.exportVault(backupPwd);
      if (res.success) {
        toast.success('Backup esportato con successo!');
        setBackupPwd('');
      } else if (res.cancelled) {
        // Utente ha annullato, non fare nulla
      } else {
        toast.error('Errore durante il backup: ' + res.error);
      }
    } catch (e) {
      toast.error('Errore imprevisto durante il backup');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const confirmed = confirm("ATTENZIONE: Questa operazione cancellerà TUTTI i dati e chiuderà l'app. Sei sicuro?");
    if (confirmed) {
      const res = await window.api.resetVault();
      if (res.success) {
        window.api.windowClose(); // Chiude l'app dopo il reset
      }
    }
  };

  return (
    <div className="main-content animate-slide-up max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Shield className="text-primary" size={24} />
          Impostazioni & Sicurezza
        </h1>
        <p className="text-text-muted text-sm mt-1">Gestisci la privacy e i dati del tuo studio.</p>
      </div>

      <div className="space-y-6">
        {/* Sezione Privacy */}
        <section className="glass-card p-6 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Eye size={20} className="text-info" /> Privacy Visiva
          </h2>
          <div className="flex items-center justify-between">
            <div className="max-w-md">
              <p className="text-sm text-text font-medium">Oscura applicazione in background</p>
              <p className="text-xs text-text-muted mt-1">
                Se attivato, i contenuti sensibili verranno sfocati quando cambi finestra o riduci l'app a icona.
              </p>
            </div>
            <button
              onClick={togglePrivacy}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                settings.privacyBlurEnabled ? 'bg-primary' : 'bg-[#22263a]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  settings.privacyBlurEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </section>

        {/* Sezione Backup */}
        <section className="glass-card p-6 border border-white/5">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Save size={20} className="text-success" /> Backup Portatile
          </h2>
          <p className="text-sm text-text-muted mb-4">
            Esporta tutti i fascicoli e l'agenda in un unico file criptato `.lex`. 
            Potrai importarlo su un altro computer usando la password che imposti qui.
          </p>
          
          <div className="flex items-end gap-3 bg-[#0c0d14]/50 p-4 rounded-xl border border-white/5">
            <div className="flex-1">
              <label className="text-xs font-bold text-text-dim uppercase mb-1 block">Password per questo backup</label>
              <input 
                type="password" 
                placeholder="Scegli una password forte..."
                className="input-field w-full"
                value={backupPwd}
                onChange={e => setBackupPwd(e.target.value)}
              />
            </div>
            <button 
              onClick={handleBackup}
              disabled={loading || !backupPwd}
              className="btn-primary h-[38px] flex items-center gap-2 px-6"
            >
              {loading ? <span className="animate-spin">⏳</span> : <Download size={16} />}
              <span>Esporta Dati</span>
            </button>
          </div>
        </section>

        {/* Zona Pericolo */}
        <section className="glass-card p-6 border border-red-500/20 bg-red-500/5">
          <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} /> Zona Pericolo
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-red-500/10 transition-colors">
              <div>
                <p className="text-sm font-bold text-white">Blocca Vault Immediatamente</p>
                <p className="text-xs text-text-muted">Richiede la master password per rientrare.</p>
              </div>
              <button onClick={onLock} className="btn-secondary text-xs bg-transparent border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white">
                <Lock size={14} className="mr-1" /> Blocca
              </button>
            </div>

            <div className="h-px bg-red-500/20" />

            <div className="flex items-center justify-between p-3 rounded-lg hover:bg-red-500/10 transition-colors">
              <div>
                <p className="text-sm font-bold text-red-400">Factory Reset</p>
                <p className="text-xs text-red-300/60">Cancella irreversibilmente tutti i dati locali.</p>
              </div>
              <button onClick={handleReset} className="px-3 py-2 rounded bg-red-500/20 text-red-400 hover:bg-red-600 hover:text-white transition-all text-xs font-bold flex items-center gap-2">
                <Trash2 size={14} /> ELIMINA TUTTO
              </button>
            </div>
          </div>
        </section>

        <div className="text-center pt-8 text-xs text-text-dim">
          <p>LexFlow Secure Client • Crittografia AES-256-GCM</p>
          <p className="opacity-50 mt-1">Nessun dato viene inviato al cloud.</p>
        </div>
      </div>
    </div>
  );
}