import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';

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
  const [version, setVersion] = useState('');
  
  // --- STATI DEI DATI (LIFTED STATE) ---
  const [practices, setPractices] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // --- 1. INIZIALIZZAZIONE ---
  useEffect(() => {
    if (!window.api) return;

    // Carica Versione App
    window.api.getAppVersion?.().then(v => setVersion(v || '')).catch(() => {});
    
    // Carica Impostazioni Privacy
    window.api.getSettings?.().then(s => {
      if (s && typeof s.privacyBlurEnabled === 'boolean') {
        setPrivacyEnabled(s.privacyBlurEnabled);
      }
    }).catch(() => {});
  }, []);

  // --- 2. GESTIONE SICUREZZA (BLUR & LOCK) ---
  const handleLockLocal = useCallback(() => {
    setBlurred(false);
    setPractices([]);      // Svuota la RAM per sicurezza
    setAgendaEvents([]);
    setSelectedId(null);
    setIsLocked(true);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!window.api) return;

    // Sottoscrizione ai listener IPC (restituiscono funzioni di cleanup)
    const removeBlurListener = window.api.onBlur?.((val) => {
      if (privacyEnabled) setBlurred(val);
    });

    const removeLockListener = window.api.onLock?.(() => handleLockLocal());
    
    const removeVaultLockedListener = window.api.onVaultLocked?.(() => handleLockLocal());

    // CLEANUP: Qui risolviamo l'errore "e is not a function"
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

  // --- 3. LOGICA DATI & SINCRONIZZAZIONE ---
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
      const pracs = await window.api.loadPractices().catch(() => []) || [];
      const agenda = await window.api.loadAgenda().catch(() => []) || [];
      
      setPractices(pracs);
      const synced = syncDeadlinesToAgenda(pracs, agenda);
      setAgendaEvents(synced);
      
      // Salva l'agenda sincronizzata nel vault
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

  // --- 4. RENDER ---
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
        
        {/* Privacy Shield (Overlay Sfocato) */}
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

        <main className="flex-1 h-screen overflow-hidden relative flex flex-col bg-gradient-to-br from-background to-[#13141f]">
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
                <DeadlinesPage practices={practices} onSelectPractice={handleSelectPractice} />
              } />
              
              <Route path="/agenda" element={
                <AgendaPage
                  agendaEvents={agendaEvents}
                  onSaveAgenda={saveAgenda}
                  practices={practices}
                  onSelectPractice={handleSelectPractice}
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