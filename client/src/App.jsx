import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';

// Componenti
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import WindowControls from './components/WindowControls';
import PracticeDetail from './components/PracticeDetail';
import CreatePracticeModal from './components/CreatePracticeModal';
import ErrorBoundary from './ErrorBoundary';

// Pagine
import Dashboard from './pages/Dashboard';
import PracticesList from './pages/PracticesList';
import DeadlinesPage from './pages/DeadlinesPage';
import AgendaPage from './pages/AgendaPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- STATI GLOBALI DI SICUREZZA ---
  const [isLocked, setIsLocked] = useState(true);
  const [blurred, setBlurred] = useState(false);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [screenshotProtection, setScreenshotProtection] = useState(true);
  const [autolockMinutes, setAutolockMinutes] = useState(5);
  const [version, setVersion] = useState('');
  
  // --- STATI DEI DATI & NOTIFICHE ---
  const [practices, setPractices] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [sentNotifications, setSentNotifications] = useState(new Set());

  // --- 1. INIZIALIZZAZIONE ---
  useEffect(() => {
    if (!window.api) return;

    window.api.getAppVersion?.().then(v => setVersion(v || '')).catch(() => {});
    
    // Carichiamo le impostazioni (incluso il tempo di notifica)
    window.api.getSettings?.().then(s => {
      if (s) {
        setSettings(s);
        if (typeof s.privacyBlurEnabled === 'boolean') setPrivacyEnabled(s.privacyBlurEnabled);
        if (typeof s.screenshotProtection === 'boolean') {
          setScreenshotProtection(s.screenshotProtection);
          window.api.setContentProtection?.(s.screenshotProtection);
        }
        if (s.autolockMinutes !== undefined) {
          setAutolockMinutes(s.autolockMinutes);
          window.api.setAutolockMinutes?.(s.autolockMinutes);
        }
      }
    }).catch(() => {});
  }, []);

  // --- 1b. ACTIVITY TRACKER (Anti-Inattività) ---
  useEffect(() => {
    if (isLocked || !window.api) return;

    const pingBackend = () => window.api.pingActivity?.();
    
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    let lastPing = 0;
    const throttledPing = () => {
      const now = Date.now();
      if (now - lastPing > 30000) { // Ping every 30s max
        lastPing = now;
        pingBackend();
      }
    };

    events.forEach(e => document.addEventListener(e, throttledPing, { passive: true }));
    pingBackend(); // Ping immediately on unlock

    return () => {
      events.forEach(e => document.removeEventListener(e, throttledPing));
    };
  }, [isLocked]);

  // --- 2. LOGICA NOTIFICHE DI SISTEMA (Monitoraggio Attivo) ---
  useEffect(() => {
    // Non controllare se l'app è bloccata o le notifiche sono disattivate
    if (isLocked || settings.notifyEnabled === false) return;

    const checkAndNotify = () => {
      const now = new Date();
      // Preavviso in millisecondi (default 30 min se non impostato)
      const leadTimeMs = (settings.notificationTime || 30) * 60 * 1000;

      // A. Controllo Agenda
      agendaEvents.forEach(event => {
        if (event.completed || event.category === 'scadenza') return; // Evitiamo doppioni se già sincronizzato

        const eventTime = new Date(`${event.date}T${event.timeStart}`);
        const diff = eventTime - now;

        // Se l'evento è nel futuro e rientra nella finestra di preavviso
        if (diff > 0 && diff <= leadTimeMs) {
          const nId = `agenda-${event.id}`;
          if (!sentNotifications.has(nId)) {
            window.api.sendNotification({
              title: `📅 Impegno tra poco: ${event.title}`,
              body: `L'evento inizierà alle ore ${event.timeStart}.`
            });
            setSentNotifications(prev => new Set(prev).add(nId));
          }
        }
      });

      // B. Controllo Scadenze Fascicoli
      practices.forEach(p => {
        if (p.status !== 'active') return;
        (p.deadlines || []).forEach(d => {
          const dDate = new Date(d.date);
          const isToday = dDate.toDateString() === now.toDateString();

          if (isToday) {
            const nId = `deadline-${p.id}-${d.label}-${d.date}`;
            if (!sentNotifications.has(nId)) {
              window.api.sendNotification({
                title: `📋 Scadenza Oggi: ${d.label}`,
                body: `Fascicolo: ${p.client} - Rif: ${p.code || 'N/D'}`
              });
              setSentNotifications(prev => new Set(prev).add(nId));
            }
          }
        });
      });
    };

    // Controllo ogni 60 secondi
    const interval = setInterval(checkAndNotify, 60000);
    checkAndNotify(); // Primo controllo immediato allo sblocco

    return () => clearInterval(interval);
  }, [isLocked, practices, agendaEvents, settings, sentNotifications]);

  // --- 3. GESTIONE SICUREZZA (BLUR & LOCK) ---
  const handleLockLocal = useCallback(() => {
    setBlurred(false);
    setPractices([]); 
    setAgendaEvents([]);
    setSentNotifications(new Set()); // Resettiamo le notifiche inviate per la prossima sessione
    setSelectedId(null);
    setIsLocked(true);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!window.api) return;

    const removeBlurListener = window.api.onBlur?.((val) => {
      if (privacyEnabled) setBlurred(val);
    });

    const removeLockListener = window.api.onLock?.(() => handleLockLocal());
    const removeVaultLockedListener = window.api.onVaultLocked?.(() => handleLockLocal());

    return () => {
      if (typeof removeBlurListener === 'function') removeBlurListener();
      if (typeof removeLockListener === 'function') removeLockListener();
      if (typeof removeVaultLockedListener === 'function') removeVaultLockedListener();
    };
  }, [privacyEnabled, handleLockLocal]);

  const handleManualLock = async () => {
    if (window.api?.lockVault) await window.api.lockVault();
    handleLockLocal();
  };

  // --- 4. LOGICA DATI & SINCRONIZZAZIONE ---
  const syncDeadlinesToAgenda = useCallback((newPractices, currentAgenda) => {
    const manualEvents = currentAgenda.filter(e => !e.autoSync);
    const syncedEvents = [];
    
    newPractices.filter(p => p.status === 'active').forEach(p => {
      (p.deadlines || []).forEach(d => {
        syncedEvents.push({
          id: `deadline_${p.id}_${d.date}_${d.label.replace(/\s/g, '_')}`,
          title: `📋 ${d.label}`,
          date: d.date,
          timeStart: '09:00',
          timeEnd: '10:00',
          category: 'scadenza',
          notes: `Fascicolo: ${p.client} — ${p.object}`,
          completed: false,
          autoSync: true,
          practiceId: p.id,
        });
      });
    });
    return [...manualEvents, ...syncedEvents];
  }, []);

  const loadAllData = useCallback(async () => {
    if (!window.api) return;
    try {
      const pracs = (await window.api.loadPractices().catch(() => []) || []).map(p => ({
        ...p,
        biometricProtected: p.biometricProtected !== false, // default true per tutti
      }));
      const agenda = await window.api.loadAgenda().catch(() => []) || [];
      const currentSettings = await window.api.getSettings().catch(() => ({}));
      
      setPractices(pracs);
      setSettings(currentSettings);
      const synced = syncDeadlinesToAgenda(pracs, agenda);
      setAgendaEvents(synced);
      
      await window.api.saveAgenda(synced);
    } catch (e) { 
      console.error("Errore caricamento dati:", e); 
    }
  }, [syncDeadlinesToAgenda]);

  const handleUnlock = async () => {
    setBlurred(false);
    setIsLocked(false);
    await loadAllData();
  };

  const savePractices = async (newList) => {
    setPractices(newList);
    if (window.api?.savePractices) {
      await window.api.savePractices(newList);
      const synced = syncDeadlinesToAgenda(newList, agendaEvents);
      setAgendaEvents(synced);
      await window.api.saveAgenda(synced);
    }
  };

  const saveAgenda = async (newEvents) => {
    setAgendaEvents(newEvents);
    if (window.api?.saveAgenda) await window.api.saveAgenda(newEvents);
  };

  const handleSelectPractice = (id) => {
    setSelectedId(id);
    navigate('/pratiche');
  };

  // --- 5. RENDER ---
  if (isLocked) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        <WindowControls />
        <LoginScreen onUnlock={handleUnlock} />
      </div>
    );
  }

  const selectedPractice = practices.find(p => p.id === selectedId);

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-background text-text-primary overflow-hidden border border-white/5 rounded-lg shadow-2xl relative">
        
        {/* Privacy Shield */}
        {privacyEnabled && blurred && (
          <div 
            className="fixed inset-0 z-[9999] bg-[#0c0d14]/80 backdrop-blur-3xl flex items-center justify-center transition-opacity duration-300 cursor-pointer animate-fade-in"
            onClick={handleManualLock}
          >
            <div className="text-center">
              <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse border border-primary/20">
                <Lock size={40} className="text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">LexFlow Protetto</h2>
              <p className="text-text-muted text-sm mt-2">Contenuto nascosto per privacy.<br/>Clicca per bloccare il Vault.</p>
            </div>
          </div>
        )}

        <Sidebar 
          version={version} 
          onLock={handleManualLock} 
          activePage={location.pathname}
        />

        <main className="flex-1 h-screen overflow-hidden relative flex flex-col bg-background">
          <WindowControls />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: { background: '#13141e', color: '#e2e4ef', border: '1px solid #22263a', fontSize: '13px' }
            }}
          />

          <div className="flex-1 overflow-auto p-8 pt-4">
            <Routes>
              <Route path="/" element={
                <Dashboard
                  practices={practices}
                  agendaEvents={agendaEvents}
                  onNavigate={navigate}
                  onSelectPractice={handleSelectPractice}
                  onNewPractice={() => setShowCreate(true)}
                />
              } />
              
              <Route path="/pratiche" element={
                selectedId && selectedPractice ? (
                  <PracticeDetail
                    practice={selectedPractice}
                    onBack={() => setSelectedId(null)}
                    onUpdate={(up) => {
                      const newList = practices.map(p => p.id === up.id ? up : p);
                      savePractices(newList);
                    }}
                  />
                ) : (
                  <PracticesList
                    practices={practices}
                    onSelect={handleSelectPractice}
                    onNewPractice={() => setShowCreate(true)}
                  />
                )
              } />
              
              <Route path="/scadenze" element={
                <DeadlinesPage practices={practices} onSelectPractice={handleSelectPractice} settings={settings} />
              } />
              
              <Route path="/agenda" element={
                <AgendaPage
                  agendaEvents={agendaEvents}
                  onSaveAgenda={saveAgenda}
                  practices={practices}
                  onSelectPractice={handleSelectPractice}
                  settings={settings}
                />
              } />
              
              <Route path="/settings" element={<SettingsPage onLock={handleManualLock} />} />
              <Route path="/sicurezza" element={<SettingsPage onLock={handleManualLock} />} />
            </Routes>
          </div>
        </main>

        {showCreate && (
          <CreatePracticeModal
            onClose={() => setShowCreate(false)}
            onSave={(p) => savePractices([p, ...practices])}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}