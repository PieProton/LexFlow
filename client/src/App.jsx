import React, { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'react-hot-toast';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react'; // Importiamo l'icona Lock

import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import WindowControls from './components/WindowControls';
import Dashboard from './pages/Dashboard';
import PracticesList from './pages/PracticesList';
import DeadlinesPage from './pages/DeadlinesPage';
import AgendaPage from './pages/AgendaPage';
import SettingsPage from './pages/SettingsPage';
import PracticeDetail from './components/PracticeDetail';
import CreatePracticeModal from './components/CreatePracticeModal';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [isLocked, setIsLocked] = useState(true);
  const [blurred, setBlurred] = useState(false);
  const [privacyEnabled, setPrivacyEnabled] = useState(true);
  
  const [practices, setPractices] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [version, setVersion] = useState('');

  // 1. Init
  useEffect(() => {
    window.api?.getSettings?.().then(s => {
      if (s && typeof s.privacyBlurEnabled === 'boolean') {
        setPrivacyEnabled(s.privacyBlurEnabled);
      }
    }).catch(() => {});
    
    window.api?.getAppVersion?.().then(v => setVersion(v || ''));
  }, []);

  // 2. Privacy Blur Listener
  useEffect(() => {
    if (!window.api?.onBlur) return;
    window.api.onBlur((val) => {
      if (privacyEnabled) setBlurred(val);
    });
  }, [privacyEnabled]);

  // 3. Lock Logic
  const handleLockLocal = useCallback(async () => {
    setBlurred(false);
    setPractices([]);
    setAgendaEvents([]);
    setSelectedId(null);
    setIsLocked(true);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (!window.api?.onLock) return;
    window.api.onLock(() => {
      if (privacyEnabled) handleLockLocal();
    });
  }, [privacyEnabled, handleLockLocal]);

  useEffect(() => {
    if (!window.api?.onVaultLocked) return;
    window.api.onVaultLocked(handleLockLocal);
  }, [handleLockLocal]);

  // 4. Sync
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

  // 5. Load/Save
  const loadAllData = useCallback(async () => {
    try {
      const pracs = await window.api.loadPractices().catch(() => []) || [];
      const agenda = await window.api.loadAgenda().catch(() => []) || [];
      setPractices(pracs);
      const synced = syncDeadlinesToAgenda(pracs, agenda);
      setAgendaEvents(synced);
      await window.api.saveAgenda(synced);
    } catch (e) { console.error(e); }
  }, [syncDeadlinesToAgenda]);

  const savePractices = async (newPractices) => {
    setPractices(newPractices);
    await window.api.savePractices(newPractices);
    const currentAgenda = await window.api.loadAgenda().catch(() => []) || [];
    const synced = syncDeadlinesToAgenda(newPractices, currentAgenda);
    setAgendaEvents(synced);
    await window.api.saveAgenda(synced);
  };

  const saveAgenda = async (newEvents) => {
    setAgendaEvents(newEvents);
    await window.api.saveAgenda(newEvents);
  };

  // 6. Actions
  const handleUnlock = async () => {
    setBlurred(false);
    setIsLocked(false);
    await loadAllData();
  };

  const handleLock = async () => {
    await window.api.lockVault();
    handleLockLocal();
  };

  const handleSelectPractice = (id) => {
    setSelectedId(id);
    navigate('/pratiche');
  };

  if (isLocked) {
    return (
      <>
        <WindowControls />
        <LoginScreen onUnlock={handleUnlock} />
      </>
    );
  }

  const selectedPractice = practices.find(p => p.id === selectedId);

  return (
    <div className="app-layout">
      {/* Privacy Shield (Blur protettivo) AGGIORNATO CON ICONA */}
      {privacyEnabled && blurred && (
        <div 
          className="fixed inset-0 z-[9999] bg-[#0c0d14]/80 backdrop-blur-3xl flex items-center justify-center transition-opacity duration-300 cursor-pointer"
          onClick={handleLock}
        >
          <div className="text-center">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse border border-primary/20">
              <Lock size={40} className="text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">LexFlow Protetto</h2>
            <p className="text-text-muted text-sm mt-2">L'applicazione è offuscata per privacy.<br/>Clicca per bloccare completamente.</p>
          </div>
        </div>
      )}

      <Sidebar 
        version={version} 
        onLock={handleLock} 
      />

      <main className="flex-1 h-screen overflow-hidden relative flex flex-col">
        <WindowControls />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { background: '#13141e', color: '#e2e4ef', border: '1px solid #22263a', fontSize: '13px' }
          }}
        />

        <div className="flex-1 overflow-hidden relative">
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
            
            <Route path="/settings" element={<SettingsPage onLock={handleLock} />} />
            <Route path="/sicurezza" element={<SettingsPage onLock={handleLock} />} />
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
  );
}