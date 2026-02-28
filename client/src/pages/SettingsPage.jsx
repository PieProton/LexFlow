import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Lock, 
  HardDrive, 
  LogOut,
  RefreshCw,
  Bell,
  Camera,
  Timer,
  Upload,
  Download,
  Smartphone,
  Monitor,
  ArrowLeftRight,
  KeyRound,
  Eye,
  EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import LicenseSettings from '../components/LicenseSettings';
import * as api from '../tauri-api';

const PREAVVISO_OPTIONS = [
  { value: 0, label: 'Al momento' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '1 ora' },
  { value: 120, label: '2 ore' },
  { value: 1440, label: '1 giorno' },
];

const AUTOLOCK_OPTIONS = [
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 0, label: 'Mai' },
];

export default function SettingsPage({ onLock }) {
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [appVersion, setAppVersion] = useState('');
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(false);

  // Stato per le Notifiche
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [notificationTime, setNotificationTime] = useState(30);

  // Stato per Sicurezza Avanzata
  const [screenshotProtection, setScreenshotProtection] = useState(true);
  const [autolockMinutes, setAutolockMinutes] = useState(5);
  
  // Modal Factory Reset
  const [showFactoryReset, setShowFactoryReset] = useState(false);
  const [factoryResetPwd, setFactoryResetPwd] = useState('');
  const [factoryResetError, setFactoryResetError] = useState('');
  const [showFactoryPwd, setShowFactoryPwd] = useState(false);

  // Modal Export Backup
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPwd, setExportPwd] = useState('');
  const [exportPwdConfirm, setExportPwdConfirm] = useState('');
  const [showExportPwd, setShowExportPwd] = useState(false);
  const [exportError, setExportError] = useState('');

  // Modal Import Backup
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPwd, setImportPwd] = useState('');
  const [showImportPwd, setShowImportPwd] = useState(false);
  const [importError, setImportError] = useState('');

  useEffect(() => {
    api.getAppVersion().then(setAppVersion);
    api.isMac().then(isMac => setPlatform(isMac ? 'macOS' : 'Windows'));
    api.getSettings().then(settings => {
      if (settings) {
        if (typeof settings.privacyBlurEnabled === 'boolean') setPrivacyEnabled(settings.privacyBlurEnabled);
        if (typeof settings.notifyEnabled === 'boolean') setNotifyEnabled(settings.notifyEnabled);
        if (settings.notificationTime) setNotificationTime(settings.notificationTime);
        if (typeof settings.screenshotProtection === 'boolean') setScreenshotProtection(settings.screenshotProtection);
        if (settings.autolockMinutes !== undefined) setAutolockMinutes(settings.autolockMinutes);
      }
    });
  }, []);

  const handlePrivacyToggle = async () => {
    const newValue = !privacyEnabled;
    setPrivacyEnabled(newValue);
    try {
      await api.saveSettings({ privacyBlurEnabled: newValue });
      toast.success(newValue ? 'Privacy Blur Attivato' : 'Privacy Blur Disattivato');
    } catch (error) {
      toast.error('Errore salvataggio');
      setPrivacyEnabled(!newValue); 
    }
  };

  // Funzione per salvare le impostazioni delle notifiche
  const saveNotifySettings = async (updates) => {
    try {
      await api.saveSettings(updates);
      toast.success("Preferenze notifiche aggiornate");
    } catch (e) {
      toast.error("Errore nel salvataggio");
    }
  };

  const handleExportBackup = async () => {
    setExportError('');
    if (!exportPwd) { setExportError('Inserisci una password per il backup.'); return; }
    if (exportPwd.length < 4) { setExportError('Password troppo corta (min. 4 caratteri).'); return; }
    if (exportPwd !== exportPwdConfirm) { setExportError('Le password non corrispondono.'); return; }
    if (!api.exportVault) { toast.error('Servizio backup non disponibile'); return; }

    setLoading(true);
    const toastId = toast.loading('Generazione backup…');
    try {
      const result = await api.exportVault(exportPwd);
      if (result?.success) {
        toast.success('Backup esportato con successo!', { id: toastId });
        setShowExportModal(false);
        setExportPwd(''); setExportPwdConfirm('');
      } else if (result?.cancelled) {
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

  const handleImportBackup = async () => {
    setImportError('');
    if (!importPwd) { setImportError('Inserisci la password del backup.'); return; }
    if (!api.importVault) { toast.error('Servizio importazione non disponibile'); return; }

    setLoading(true);
    const toastId = toast.loading('Importazione in corso…');
    try {
      const result = await api.importVault(importPwd);
      if (result?.success) {
        toast.success('Vault importato! Ricarico…', { id: toastId });
        setShowImportModal(false);
        setImportPwd('');
        setTimeout(() => window.location.reload(), 1500);
      } else if (result?.cancelled) {
        toast.dismiss(toastId);
      } else {
        toast.error('Errore: ' + (result?.error || 'Password errata o file non valido'), { id: toastId });
      }
    } catch (e) {
      toast.error("Errore critico durante l'importazione", { id: toastId });
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

          {/* Anti-Screenshot */}
          <div className="flex items-center justify-between group pt-4 border-t border-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-primary" />
                <span className="font-medium text-white">Blocco Screenshot</span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">SICUREZZA</span>
              </div>
              <p className="text-xs text-text-muted max-w-md">
                Impedisce la cattura dello schermo (screenshot, registrazioni, condivisione schermo).
              </p>
            </div>
            <button 
              onClick={async () => {
                const val = !screenshotProtection;
                setScreenshotProtection(val);
                try {
                  await api.setContentProtection(val);
                  await api.saveSettings({ screenshotProtection: val });
                  toast.success(val ? 'Blocco Screenshot Attivato' : 'Blocco Screenshot Disattivato');
                } catch (e) {
                  toast.error('Errore');
                  setScreenshotProtection(!val);
                }
              }}
              className={`w-12 h-6 rounded-full transition-colors relative ${screenshotProtection ? 'bg-primary' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${screenshotProtection ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {/* Auto-Lock Timer */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Timer size={16} className="text-primary" />
              <span className="font-medium text-white">Blocco Automatico</span>
            </div>
            <p className="text-xs text-text-muted max-w-md mb-4">
              Blocca automaticamente il Vault dopo un periodo di inattività.
            </p>
            <div className="flex flex-wrap gap-2">
              {AUTOLOCK_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={async () => {
                    setAutolockMinutes(opt.value);
                    try {
                      await api.setAutolockMinutes(opt.value);
                      await api.saveSettings({ autolockMinutes: opt.value });
                      toast.success(opt.value === 0 ? 'Blocco automatico disabilitato' : `Blocco dopo ${opt.label} di inattività`);
                    } catch (e) {
                      toast.error('Errore');
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    autolockMinutes === opt.value
                      ? 'bg-primary text-black border-primary shadow-[0_0_12px_rgba(212,169,64,0.3)]'
                      : 'bg-white/[0.04] text-text-muted border-white/5 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <button 
              onClick={onLock}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-all group"
            >
              <Lock size={18} className="text-primary transition-transform group-hover:-rotate-12" />
              <span className="text-sm font-bold uppercase tracking-wider">Blocca Vault Ora</span>
            </button>
            <button 
              onClick={() => {
                if(window.confirm("Cancellare le credenziali biometriche salvate?")) {
                  api.clearBio().then(() => toast.success("Biometria resettata"));
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
            <HardDrive className="text-primary" size={20} />
            <h2 className="text-lg font-bold text-white">Gestione Dati</h2>
          </div>

          {/* Banner sistema chiuso */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
            <ArrowLeftRight size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary uppercase tracking-wider">Sistema Chiuso — Vault Indipendenti</p>
              <p className="text-xs text-text-muted leading-relaxed">
                Il vault su <span className="text-white font-medium inline-flex items-center gap-1"><Monitor size={11} /> desktop</span> e
                su <span className="text-white font-medium inline-flex items-center gap-1"><Smartphone size={11} /> Android</span> sono 
                cifrati con chiavi distinte, legate al singolo dispositivo. Non condividono dati in automatico.
                <br />
                Per portare i dati da un dispositivo all'altro: <span className="text-primary font-semibold">Esporta</span> sul dispositivo sorgente,
                poi <span className="text-primary font-semibold">Importa</span> su quello di destinazione con la stessa password di backup.
              </p>
            </div>
          </div>

          {/* Export */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Download size={15} className="text-primary" />
                <span className="font-medium text-white">Esporta Backup</span>
              </div>
              <p className="text-xs text-text-muted max-w-lg">
                Salva fascicoli e agenda in un file <code className="text-primary">.lex</code> cifrato con una password a tua scelta.
                Usalo per trasferire i dati su un altro dispositivo o per un backup sicuro.
              </p>
            </div>
            <button 
              onClick={() => { setExportError(''); setExportPwd(''); setExportPwdConfirm(''); setShowExportModal(true); }}
              disabled={loading}
              className={`btn-primary px-6 py-2.5 text-sm flex items-center gap-2 shrink-0 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Download size={16} />
              Esporta .lex
            </button>
          </div>

          <div className="border-t border-white/5" />

          {/* Import */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Upload size={15} className="text-primary" />
                <span className="font-medium text-white">Importa Backup</span>
              </div>
              <p className="text-xs text-text-muted max-w-lg">
                Ripristina un file <code className="text-primary">.lex</code> esportato in precedenza.
                <span className="text-text-muted font-medium"> Attenzione: sovrascrive i dati attuali.</span>
              </p>
            </div>
            <button 
              onClick={() => { setImportError(''); setImportPwd(''); setShowImportModal(true); }}
              disabled={loading}
              className={`btn-primary px-6 py-2.5 text-sm flex items-center gap-2 shrink-0 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Upload size={16} />
              Importa .lex
            </button>
          </div>
        </section>
      </div>

      {/* License information card inserted at the end of settings */}
      <LicenseSettings />

      <div className="pt-12 text-center">
        <button 
          onClick={() => { setShowFactoryReset(true); setFactoryResetPwd(''); setFactoryResetError(''); }}
          className="text-[10px] font-black text-red-500/30 hover:text-red-500 uppercase tracking-[4px] transition-all flex items-center justify-center gap-3 mx-auto py-4 border border-transparent hover:border-red-500/10 rounded-full px-8"
        >
          <LogOut size={14} />
          Factory Reset Vault
        </button>
      </div>

      {/* Factory Reset Modal */}
      {showFactoryReset && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#13141e] border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <LogOut size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Factory Reset</h3>
                <p className="text-text-dim text-[10px]">Tutti i dati verranno eliminati</p>
              </div>
            </div>
            <p className="text-text-muted text-xs mb-4 leading-relaxed">
              Stai per cancellare <span className="text-white font-bold">tutti i dati del Vault</span>. 
              Inserisci la password per confermare. <span className="font-semibold">Azione irreversibile.</span>
            </p>
            <div className="relative mb-4">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input 
                type={showFactoryPwd ? 'text' : 'password'}
                className="w-full py-3 pl-10 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:border-primary/40 outline-none transition-colors"
                placeholder="Password vault…"
                value={factoryResetPwd}
                onChange={e => { setFactoryResetPwd(e.target.value); setFactoryResetError(''); }}
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && factoryResetPwd) {
                    const res = await api.resetVault(factoryResetPwd);
                    if (res?.success) { setShowFactoryReset(false); window.location.reload(); }
                    else { setFactoryResetError(res?.error || 'Password errata.'); }
                  }
                }}
              />
              <button type="button" onClick={() => setShowFactoryPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-white transition-colors">
                {showFactoryPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {factoryResetError && <p className="text-red-400 text-[11px] font-semibold mb-4">{factoryResetError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowFactoryReset(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-muted text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors">
                Annulla
              </button>
              <button
                onClick={async () => {
                  if (!factoryResetPwd) { setFactoryResetError('Password richiesta.'); return; }
                  const res = await api.resetVault(factoryResetPwd);
                  if (res?.success) { setShowFactoryReset(false); window.location.reload(); }
                  else { setFactoryResetError(res?.error || 'Password errata.'); }
                }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors">
                Conferma Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#13141e] border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <Download size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Esporta Backup</h3>
                <p className="text-text-dim text-[10px]">Crea un file .lex cifrato</p>
              </div>
            </div>
            <p className="text-text-muted text-xs mb-4 leading-relaxed">
              Scegli una password per proteggere il file di backup. Ti servirà per importarlo su un altro dispositivo.
            </p>
            <div className="space-y-3 mb-4">
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input type={showExportPwd ? 'text' : 'password'}
                  className="w-full py-3 pl-10 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:border-primary/40 outline-none transition-colors"
                  placeholder="Password backup…"
                  value={exportPwd}
                  onChange={e => { setExportPwd(e.target.value); setExportError(''); }}
                  autoFocus />
                <button type="button" onClick={() => setShowExportPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-white transition-colors">
                  {showExportPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input type={showExportPwd ? 'text' : 'password'}
                  className="w-full py-3 pl-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:border-primary/40 outline-none transition-colors"
                  placeholder="Conferma password…"
                  value={exportPwdConfirm}
                  onChange={e => { setExportPwdConfirm(e.target.value); setExportError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') handleExportBackup(); }} />
              </div>
            </div>
            {exportError && <p className="text-red-400 text-[11px] font-semibold mb-4">{exportError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowExportModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-muted text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors">
                Annulla
              </button>
              <button onClick={handleExportBackup} disabled={loading}
                className={`flex-1 py-2.5 rounded-xl btn-primary text-xs font-bold uppercase tracking-widest ${loading ? 'opacity-50' : ''}`}>
                {loading ? 'Esporto…' : 'Esporta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#13141e] border border-white/10 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                <Upload size={18} className="text-primary" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Importa Backup</h3>
                <p className="text-text-dim text-[10px]">Sovrascrive i dati attuali</p>
              </div>
            </div>
            <p className="text-text-muted text-xs mb-4 leading-relaxed">
              Inserisci la password con cui è stato cifrato il file di backup. 
              <span className="text-white font-semibold"> I dati attuali verranno sovrascritti.</span>
            </p>
            <div className="relative mb-4">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <input type={showImportPwd ? 'text' : 'password'}
                className="w-full py-3 pl-10 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/20 text-sm focus:border-primary/40 outline-none transition-colors"
                placeholder="Password backup…"
                value={importPwd}
                onChange={e => { setImportPwd(e.target.value); setImportError(''); }}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleImportBackup(); }} />
              <button type="button" onClick={() => setShowImportPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-white transition-colors">
                {showImportPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {importError && <p className="text-red-400 text-[11px] font-semibold mb-4">{importError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowImportModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-text-muted text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors">
                Annulla
              </button>
              <button onClick={handleImportBackup} disabled={loading}
                className={`flex-1 py-2.5 rounded-xl btn-primary text-xs font-bold uppercase tracking-widest ${loading ? 'opacity-50' : ''}`}>
                {loading ? 'Importo…' : 'Importa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}