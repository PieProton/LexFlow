import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';

// Componenti
import LoginScreen from './components/LoginScreen';
import LicenseActivation from './components/LicenseActivation';
import Sidebar, { HamburgerButton, useIsMobile } from './components/Sidebar';
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
import ConflictCheckPage from './pages/ConflictCheckPage';
import TimeTrackingPage from './pages/TimeTrackingPage';
import BillingPage from './pages/BillingPage';
import ContactsPage from './pages/ContactsPage';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // --- STATI GLOBALI DI SICUREZZA ---
  // License gating is handled by the LicenseActivation component
  const [isLocked, setIsLocked] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const e2eFlag = params.get('e2e');
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      // If ?e2e=1 on localhost (or NODE env is test), start unlocked so tests can hit LicenseActivation.
      if (e2eFlag === '1' && (isLocalhost || process.env.NODE_ENV === 'test')) return false;
    } catch (e) { /* ignore */ }
    return true;
  });
  const [autoLocked, setAutoLocked] = useState(false); // true = lock automatico (no bio auto-trigger)
  const [blurred, setBlurred] = useState(false);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  const [screenshotProtection, setScreenshotProtection] = useState(true);
  const [autolockMinutes, setAutolockMinutes] = useState(5);
  const [version, setVersion] = useState('');

  // --- STATO SIDEBAR MOBILE ---
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile(1024); // false su desktop → non monta il burger
  
  // --- STATI DEI DATI & NOTIFICHE ---
  const [practices, setPractices] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // --- 1. INIZIALIZZAZIONE ---
  useEffect(() => {
    if (!window.api) return;

    // Carichiamo informazioni non-legate alla licenza (version, settings)

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
    
    // Solo eventi intenzionali — mousemove e scroll generano troppi eventi
    // e thrashano il main thread (specialmente su Android). mousedown/keydown/touchstart
    // sono sufficienti per rilevare attività utente reale.
    const events = ['mousedown', 'keydown', 'touchstart'];
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

  // --- 2. LOGICA NOTIFICHE DI SISTEMA ---
  // Le notifiche sono gestite ESCLUSIVAMENTE dal backend Rust (start_notification_scheduler).
  // Il backend legge il file notif-schedule cifrato ogni 60s, controlla la finestra temporale
  // (epoch-based, catchup dopo sleep/wake) e emette "show-notification" al frontend.
  // NON serve un secondo poller qui nel React — causerebbe notifiche doppie/triple
  // perché send_notification() nativo + show-notification event + backend scheduler
  // scatterebbero tutti per lo stesso evento.
  //
  // Il sync avviene tramite saveAgenda() → syncNotificationSchedule() che scrive
  // gli items + briefingTimes nel file cifrato letto dal backend.

  // --- 3. GESTIONE SICUREZZA (BLUR & LOCK) ---
  const handleLockLocal = useCallback((isAuto = false) => {
    setBlurred(false);
    setPractices([]); 
    setAgendaEvents([]);
    setSelectedId(null);
    setAutoLocked(isAuto); // memorizza se è autolock
    setIsLocked(true);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!window.api) return;

    const removeBlurListener = window.api.onBlur?.((val) => {
      if (privacyEnabled) setBlurred(val);
    });

    const removeLockListener = window.api.onLock?.(() => handleLockLocal(true));        // autolock backend
    const removeVaultLockedListener = window.api.onVaultLocked?.(() => handleLockLocal(true)); // autolock backend

    return () => {
      if (typeof removeBlurListener === 'function') removeBlurListener();
      if (typeof removeLockListener === 'function') removeLockListener();
      if (typeof removeVaultLockedListener === 'function') removeVaultLockedListener();
    };
  }, [privacyEnabled, handleLockLocal]);

  const handleManualLock = async () => {
    if (window.api?.lockVault) await window.api.lockVault();
    handleLockLocal(false); // lock manuale: bio auto-trigger abilitato
  };

  // --- 4. LOGICA DATI & SINCRONIZZAZIONE ---
  const syncDeadlinesToAgenda = useCallback((newPractices, currentAgenda) => {
    const manualEvents = currentAgenda.filter(e => !e.autoSync);
    // Mappa degli eventi auto-sincronizzati esistenti per preservare le modifiche utente
    // (es. orario personalizzato, note aggiuntive, completamento)
    const existingSyncedMap = new Map();
    currentAgenda.filter(e => e.autoSync).forEach(e => existingSyncedMap.set(e.id, e));
    
    const syncedEvents = [];
    
    newPractices.filter(p => p.status === 'active').forEach(p => {
      (p.deadlines || []).forEach(d => {
        const syncId = `deadline_${p.id}_${d.date}_${d.label.replace(/\s/g, '_')}`;
        const existing = existingSyncedMap.get(syncId);
        syncedEvents.push({
          // Valori default per nuovi eventi
          id: syncId,
          title: `📋 ${d.label}`,
          date: d.date,
          timeStart: '09:00',
          timeEnd: '10:00',
          category: 'scadenza',
          notes: `Fascicolo: ${p.client} — ${p.object}`,
          completed: false,
          autoSync: true,
          practiceId: p.id,
          // Sovrascrivi con eventuali modifiche utente (orario, note, completamento)
          ...(existing ? {
            timeStart: existing.timeStart,
            timeEnd: existing.timeEnd,
            notes: existing.notes,
            completed: existing.completed,
          } : {}),
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

      // Sync schedule al backend subito dopo il load — così lo scheduler Rust
      // ha dati freschi immediatamente (events + deadlines + briefing times)
      if (window.api?.syncNotificationSchedule) {
        const agendaItems = synced
          .filter(e => !e.completed && e.timeStart)
          .map(e => ({
            id: e.id, date: e.date, time: e.timeStart, title: e.title,
            // FIX: remindMinutes can be the string "custom" from UI — coerce to integer.
            // When "custom", use 0 (the actual fire time comes from customRemindTime).
            remindMinutes: (typeof e.remindMinutes === 'number') ? e.remindMinutes
              : (e.remindMinutes === 'custom' ? 0 : (parseInt(e.remindMinutes, 10) || (currentSettings?.preavviso || 30))),
            customRemindTime: e.customRemindTime || null,
          }));
        const deadlineItems = [];
        pracs.filter(p => p.status === 'active').forEach(p => {
          (p.deadlines || []).forEach(d => {
            deadlineItems.push({
              id: `deadline-${p.id}-${d.date}`, date: d.date, time: '09:00',
              title: `Scadenza: ${d.label} — ${p.client}`, remindMinutes: 0,
            });
          });
        });
        const briefingTimes = [
          currentSettings?.briefingMattina || '08:30',
          currentSettings?.briefingPomeriggio || '14:30',
          currentSettings?.briefingSera || '19:30',
        ];
        await window.api.syncNotificationSchedule({ briefingTimes, items: [...agendaItems, ...deadlineItems] });
      }
    } catch (e) { 
      console.error("Errore caricamento dati:", e); 
    }
  }, [syncDeadlinesToAgenda]);

  const handleUnlock = async () => {
    setBlurred(false);
    setAutoLocked(false);
    setIsLocked(false);
    await loadAllData();

    // Request notification permission on first unlock (macOS requires explicit grant)
    try {
      const notifAPI = window.__TAURI__?.notification;
      if (notifAPI) {
        const granted = await notifAPI.isPermissionGranted();
        if (!granted) {
          await notifAPI.requestPermission();
        }
      }
    } catch (e) { /* ignore — notification permission is non-critical */ }
  };

  // E2E bypass: when testing, make it easy to skip the login gate.
  // This is guarded so it only activates on localhost or in test builds.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const e2eFlag = params.get('e2e');
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      if (e2eFlag === '1' && (isLocalhost || process.env.NODE_ENV === 'test')) {
        // Give the app a tick to finish initial mounts
        setTimeout(() => { handleUnlock(); }, 50);
      }
    } catch (e) { /* ignore in environments without window */ }
  }, [handleUnlock]);

  const savePractices = async (newList) => {
    setPractices(newList);
    if (window.api?.savePractices) {
      await window.api.savePractices(newList);
      const synced = syncDeadlinesToAgenda(newList, agendaEvents);
      setAgendaEvents(synced);
      await window.api.saveAgenda(synced);
      // Sync schedule col backend (include scadenze fascicoli aggiornate)
      syncScheduleToBackend(synced, newList);
    }
  };

  const saveAgenda = async (newEvents) => {
    setAgendaEvents(newEvents);
    if (window.api?.saveAgenda) await window.api.saveAgenda(newEvents);
    // Sync notification schedule with updated items for backend scheduler
    syncScheduleToBackend(newEvents, practices);
  };

  // Centralizza il sync dello schedule verso il backend Rust scheduler
  const syncScheduleToBackend = async (events, pList) => {
    if (!window.api?.syncNotificationSchedule) return;
    // A. Eventi agenda
    const agendaItems = (events || [])
      .filter(e => !e.completed && e.timeStart)
      .map(e => ({
        id: e.id,
        date: e.date,
        time: e.timeStart,
        title: e.title,
        // FIX: remindMinutes can be the string "custom" from UI — coerce to integer.
        // When "custom", use 0 (the actual fire time comes from customRemindTime).
        remindMinutes: (typeof e.remindMinutes === 'number') ? e.remindMinutes
          : (e.remindMinutes === 'custom' ? 0 : (parseInt(e.remindMinutes, 10) || (settings?.preavviso || 30))),
        customRemindTime: e.customRemindTime || null,
      }));
    // B. Scadenze fascicoli attivi (notifica alle 09:00 del giorno della scadenza)
    const deadlineItems = [];
    (pList || []).filter(p => p.status === 'active').forEach(p => {
      (p.deadlines || []).forEach(d => {
        deadlineItems.push({
          id: `deadline-${p.id}-${d.date}`,
          date: d.date,
          time: '09:00',
          title: `Scadenza: ${d.label} — ${p.client}`,
          remindMinutes: 0, // notify at 09:00 sharp
        });
      });
    });
    const items = [...agendaItems, ...deadlineItems];
    const briefingTimes = [
      settings?.briefingMattina || '08:30',
      settings?.briefingPomeriggio || '14:30',
      settings?.briefingSera || '19:30',
    ];
    await window.api.syncNotificationSchedule({ briefingTimes, items });
  };

  const handleSelectPractice = (id) => {
    setSelectedId(id);
    navigate('/pratiche');
  };

  // --- 5. RENDER ---

  // License gating is handled by the LicenseActivation component mounted below

  // Gate 2: Vault — richiede password (o biometria)
  if (isLocked) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        <WindowControls />
        <LoginScreen onUnlock={handleUnlock} autoLocked={autoLocked} />
      </div>
    );
  }

  const selectedPractice = practices.find(p => p.id === selectedId);

  return (
    <LicenseActivation>
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

        {/* Sidebar desktop (≥1024px) + Liquid Curtain mobile (<1024px) */}
        <Sidebar 
          version={version} 
          onLock={handleManualLock}
          isOpen={sidebarOpen}
          onToggle={setSidebarOpen}
        />

        {/* Hamburger button — solo su mobile/Android (<1024px) */}
        {isMobile && <HamburgerButton onClick={() => setSidebarOpen(true)} />}

        <main className="flex-1 h-screen overflow-hidden relative flex flex-col bg-background">
          <WindowControls />
          <Toaster
            position="bottom-right"
            toastOptions={{
              // base class so we can target in CSS, plus inline style fallback
              className: 'lexflow-toast',
              style: {
                background: 'rgba(19,20,30,0.9)',
                color: '#e2e4ef',
                border: '1px solid rgba(34,38,58,0.6)',
                fontSize: '13px',
                padding: '12px 14px',
                borderRadius: '12px',
                boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minWidth: 240,
                maxWidth: 420,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              },
              success: {
                duration: 3500,
                icon: null,
                style: {
                  borderLeft: '3px solid #22c55e',
                }
              },
              error: {
                duration: 6000,
                icon: '⚠️'
              },
              loading: {
                duration: 10000,
              }
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
                <DeadlinesPage practices={practices} onSelectPractice={handleSelectPractice} settings={settings} agendaEvents={agendaEvents} onNavigate={navigate} />
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
              
              <Route path="/conflitti" element={
                <ConflictCheckPage onSelectPractice={handleSelectPractice} />
              } />
              
              <Route path="/ore" element={
                <TimeTrackingPage practices={practices} />
              } />
              
              <Route path="/parcelle" element={
                <BillingPage practices={practices} />
              } />
              
              <Route path="/contatti" element={
                <ContactsPage practices={practices} onSelectPractice={handleSelectPractice} />
              } />
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
    </LicenseActivation>
  );
}