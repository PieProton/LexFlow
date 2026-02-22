import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, Calendar, FileText, 
  Clock, Plus, X, Trash2, Send, FolderOpen, 
  FolderPlus, Archive, RotateCcw, Lock, ChevronDown,
  FilePlus, Info, Fingerprint, ShieldCheck
} from 'lucide-react';
import { exportPracticePDF } from '../utils/pdfGenerator';
import toast from 'react-hot-toast';

export default function PracticeDetail({ practice, onBack, onUpdate }) {
  const [activeTab, setActiveTab] = useState('diary'); // diary, docs, deadlines, info
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [bioAttempted, setBioAttempted] = useState(false);
  
  // Stati per i form
  const [newNote, setNewNote] = useState('');
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('');
  const [newDeadlineDate, setNewDeadlineDate] = useState('');

  // --- Helpers ---
  const update = (changes) => onUpdate({ ...practice, ...changes });

  const formatDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

  // --- Sblocco biometrico AUTOMATICO al mount ---
  useEffect(() => {
    if (practice.biometricProtected && !biometricVerified && !bioAttempted) {
      setBioAttempted(true);
      (async () => {
        try {
          const result = await window.api.bioLogin();
          if (result) {
            setBiometricVerified(true);
          }
        } catch (e) {
          // L'utente ha rifiutato o fallito, resta sulla schermata di blocco
        }
      })();
    }
  }, [practice.biometricProtected, biometricVerified, bioAttempted]);

  const retryBiometric = async () => {
    try {
      const result = await window.api.bioLogin();
      if (result) {
        setBiometricVerified(true);
      } else {
        toast.error('Autenticazione non riuscita');
      }
    } catch (e) {
      toast.error('Autenticazione fallita');
    }
  };

  // Se il fascicolo è protetto e non verificato, mostra schermata di blocco
  if (practice.biometricProtected && !biometricVerified) {
    return (
      <div className="h-full flex flex-col bg-[#0c0d14] animate-fade-in">
        <div className="flex items-center px-6 py-4 border-b border-[#22263a]">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-dim hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div className="ml-4">
            <h1 className="text-xl font-bold text-white">{practice.client}</h1>
            <p className="text-xs text-text-dim mt-0.5">{practice.code ? `RG ${practice.code}` : practice.object}</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto border border-primary/20 animate-pulse">
              <Fingerprint size={36} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-2">Verifica Identità</h2>
              <p className="text-sm text-text-muted max-w-xs">
                {bioAttempted ? 'Autenticazione non riuscita. Riprova.' : 'Autenticazione biometrica in corso...'}
              </p>
            </div>
            {bioAttempted && (
              <button onClick={retryBiometric} className="btn-primary px-8 py-3 text-sm">
                <Fingerprint size={18} /> Riprova
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Handlers: Status & Folder ---
  const setStatus = (newStatus) => {
    update({ status: newStatus });
    setShowStatusMenu(false);
    toast.success(newStatus === 'active' ? 'Fascicolo riaperto' : 'Fascicolo archiviato');
  };

  const linkFolder = async () => {
    const folder = await window.api.selectFolder();
    if (folder) {
      update({ folderPath: folder });
      toast.success('Cartella collegata');
    }
  };

  const openFolder = () => {
    if (practice.folderPath) window.api.openPath(practice.folderPath);
  };

  const handleExport = async () => {
    const success = await exportPracticePDF(practice);
    if (success) toast.success('PDF salvato correttamente');
  };

  // --- Handlers: PDF Upload ---
  const handleUploadPDF = async () => {
    try {
      const result = await window.api.selectFolder(); // uses select_file which returns {name, path}
      if (result) {
        const attachments = [...(practice.attachments || []), { name: result.split('/').pop(), path: result, addedAt: new Date().toISOString() }];
        update({ attachments });
        toast.success('Documento aggiunto al vault');
      }
    } catch (e) {
      toast.error('Errore nel caricamento');
    }
  };

  const removeAttachment = (idx) => {
    const attachments = (practice.attachments || []).filter((_, i) => i !== idx);
    update({ attachments });
    toast.success('Documento rimosso');
  };

  // --- Handlers: Diary ---
  const addNote = (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const note = { text: newNote, date: new Date().toISOString() };
    update({ diary: [note, ...(practice.diary || [])] });
    setNewNote('');
    toast.success('Nota aggiunta');
  };

  const deleteNote = (idx) => {
    const updatedDiary = (practice.diary || []).filter((_, i) => i !== idx);
    update({ diary: updatedDiary });
    toast.success('Nota eliminata');
  };

  // --- Handlers: Deadlines ---
  const addDeadline = (e) => {
    e.preventDefault();
    if (!newDeadlineLabel.trim() || !newDeadlineDate) return;
    
    const deadlines = [...(practice.deadlines || []), { 
      date: newDeadlineDate, 
      label: newDeadlineLabel.trim() 
    }];
    deadlines.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    update({ deadlines });
    setNewDeadlineLabel('');
    setNewDeadlineDate('');
    toast.success('Scadenza aggiunta');
  };

  const deleteDeadline = (idx) => {
    const deadlines = (practice.deadlines || []).filter((_, i) => i !== idx);
    update({ deadlines });
    toast.success('Scadenza eliminata');
  };

  // --- Components ---
  const TABS = [
    { id: 'diary', label: 'Diario', icon: Clock, count: (practice.diary || []).length },
    { id: 'docs', label: 'Documenti', icon: FileText, count: (practice.attachments || []).length },
    { id: 'deadlines', label: 'Scadenze', icon: Calendar, count: (practice.deadlines || []).length },
    { id: 'info', label: 'Info', icon: Info, count: 0 },
  ];

  return (
    <div className="h-full flex flex-col bg-[#0c0d14] animate-fade-in">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#22263a] bg-[#0c0d14]/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors text-text-dim hover:text-white">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{practice.client}</h1>
              {practice.biometricProtected && (
                <ShieldCheck size={16} className="text-primary/60" title="Protetto con biometria" />
              )}
            </div>
            <p className="text-xs text-text-dim mt-0.5">
              {practice.code ? `RG ${practice.code}` : practice.object}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Dropdown Status — Design moderno */}
          <div className="relative">
            <button 
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                practice.status === 'active' 
                  ? 'bg-white/5 text-white border-white/10 hover:bg-white/10' 
                  : 'bg-white/5 text-text-dim border-white/10 hover:bg-white/10'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${practice.status === 'active' ? 'bg-emerald-400' : 'bg-text-dim'}`} />
              {practice.status === 'active' ? 'Attivo' : 'Archiviato'}
              <ChevronDown size={14} className="text-text-dim" />
            </button>
            
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-2 bg-[#14151d] border border-white/10 rounded-xl shadow-2xl z-50 py-1 min-w-[200px] animate-fade-in">
                <button 
                  onClick={() => setStatus('active')}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-white/5 transition-colors text-left ${practice.status === 'active' ? 'bg-white/[0.03]' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-white font-medium">Attivo</span>
                </button>
                <button 
                  onClick={() => setStatus('closed')}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-white/5 transition-colors text-left ${practice.status === 'closed' ? 'bg-white/[0.03]' : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-text-dim" />
                  <span className="text-white font-medium">Archiviato</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs — Segmented Control moderno */}
      <div className="px-6 py-3 border-b border-[#22263a]">
        <div className="inline-flex bg-white/[0.04] rounded-xl p-1 border border-white/5">
          {TABS.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
                activeTab === id 
                  ? 'bg-primary text-black shadow-[0_0_12px_rgba(212,169,64,0.25)]' 
                  : 'text-text-dim hover:text-white hover:bg-white/[0.06]'
              }`}
            >
              <Icon size={14} />
              {label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === id ? 'bg-black/20 text-black' : 'bg-white/10 text-text-dim'
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        
        {/* ═══ TAB: DIARIO CRONOLOGICO ═══ */}
        {activeTab === 'diary' && (
          <div className="max-w-3xl mx-auto h-full flex flex-col">
            <div className="flex-1 space-y-6 mb-6">
               {(!practice.diary || practice.diary.length === 0) && (
                <div className="text-center py-10 text-text-dim">
                  <Clock size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Il diario è vuoto. Aggiungi note o verbali.</p>
                </div>
              )}
              {practice.diary?.map((note, idx) => (
                <div key={idx} className="flex gap-4 group">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                    <div className="w-px h-full bg-[#22263a] my-1" />
                  </div>
                  <div className="flex-1 glass-card p-4 relative">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                        {new Date(note.date).toLocaleDateString('it-IT')} • {new Date(note.date).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'})}
                      </span>
                      <button onClick={() => deleteNote(idx)} className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-400 transition-opacity">
                         <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-text-muted whitespace-pre-wrap">{note.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={addNote} className="sticky bottom-0 bg-[#0c0d14] pt-4 border-t border-[#22263a]">
              <div className="relative">
                <textarea
                  className="input-field w-full min-h-[80px] pr-12 resize-none"
                  placeholder="Scrivi una nota di udienza, una telefonata o un appunto..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addNote(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={!newNote.trim()}
                  className="absolute right-3 bottom-3 p-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ═══ TAB: DOCUMENTI ═══ */}
        {activeTab === 'docs' && (
          <div className="max-w-3xl mx-auto">
            {/* 2 Card azione */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div 
                onClick={handleUploadPDF}
                className="glass-card p-6 flex items-center gap-4 cursor-pointer hover:bg-white/5 hover:border-white/15 transition-all border border-white/5 group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <FilePlus size={24} className="text-primary" />
                </div>
                <div>
                  <p className="text-base font-bold text-white">Carica Documento</p>
                  <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Aggiungi file al vault crittografato</p>
                </div>
              </div>

              {practice.folderPath ? (
                <div 
                  onClick={openFolder}
                  className="glass-card p-6 flex items-center gap-4 border border-white/5 cursor-pointer hover:bg-white/5 hover:border-white/15 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FolderOpen size={24} className="text-text-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white">Apri Cartella</p>
                    <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1 truncate">{practice.folderPath.split('/').pop()}</p>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={linkFolder}
                  className="glass-card p-6 flex items-center gap-4 border border-dashed border-white/10 cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <FolderPlus size={24} className="text-text-dim group-hover:text-white transition-colors" />
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">Collega Cartella</p>
                    <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Associa una cartella locale al fascicolo</p>
                  </div>
                </div>
              )}
            </div>

            {/* Lista allegati crittografati */}
            <div>
              <h3 className="text-[10px] font-black text-text-dim uppercase tracking-[2px] mb-4">Documenti Allegati</h3>
              {(!practice.attachments || practice.attachments.length === 0) ? (
                <div className="glass-card p-8 flex flex-col items-center justify-center text-center border border-dashed border-white/10">
                  <FileText size={28} className="text-text-dim/30 mb-3" />
                  <p className="text-sm text-text-dim">Nessun documento allegato</p>
                  <p className="text-xs text-text-dim/60 mt-1">Carica PDF o documenti nel vault crittografato</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {practice.attachments.map((att, idx) => (
                    <div key={idx} className="glass-card p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors">
                      <FileText size={16} className="text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{att.name}</p>
                        <p className="text-[10px] text-text-dim">
                          {att.addedAt ? formatDate(att.addedAt) : ''}
                        </p>
                      </div>
                      <button onClick={() => att.path && window.api.openPath(att.path)} className="btn-ghost text-xs p-2">
                        <FolderOpen size={14} />
                      </button>
                      <button onClick={() => removeAttachment(idx)} className="opacity-0 group-hover:opacity-100 p-2 text-text-dim hover:text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: SCADENZE ═══ */}
        {activeTab === 'deadlines' && (
          <div className="max-w-3xl mx-auto">
            <form onSubmit={addDeadline} className="mb-6 flex gap-2">
              <input
                className="input-field flex-1"
                placeholder="Descrizione scadenza..."
                value={newDeadlineLabel}
                onChange={e => setNewDeadlineLabel(e.target.value)}
              />
              <input
                type="date"
                className="input-field w-40"
                value={newDeadlineDate}
                onChange={e => setNewDeadlineDate(e.target.value)}
              />
              <button
                type="submit"
                className="btn-primary px-3"
                disabled={!newDeadlineLabel.trim() || !newDeadlineDate}
              >
                <Plus size={16} />
              </button>
            </form>

            <div className="space-y-2">
              {(!practice.deadlines || practice.deadlines.length === 0) ? (
                 <div className="text-center py-10 text-text-dim">
                  <Calendar size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Nessuna scadenza impostata</p>
                </div>
              ) : (
                practice.deadlines.map((d, idx) => {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const dDate = new Date(d.date); dDate.setHours(0,0,0,0);
                  const diff = Math.ceil((dDate - today) / (1000 * 60 * 60 * 24));
                  const isPast = diff < 0;
                  const isToday = diff === 0;
                  const isUrgent = diff > 0 && diff <= 3;
                  
                  return (
                    <div key={idx} className="glass-card p-3 flex items-center gap-4 group hover:border-primary/30 transition-colors">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                         isPast ? 'bg-red-500' : isToday ? 'bg-orange-500' : isUrgent ? 'bg-yellow-500' : 'bg-blue-500'
                      }`} />
                      
                      <div className="flex-1">
                         <p className="text-sm text-white font-medium">{d.label}</p>
                         <p className="text-xs text-text-dim">{formatDate(d.date)}</p>
                      </div>

                      <div className="text-xs font-bold px-2 py-1 rounded bg-white/5 text-text-muted">
                        {isPast ? `Scaduta da ${Math.abs(diff)}gg` : isToday ? 'OGGI' : diff === 1 ? 'Domani' : `tra ${diff}gg`}
                      </div>

                      <button onClick={() => deleteDeadline(idx)} className="opacity-0 group-hover:opacity-100 p-2 text-text-dim hover:text-red-400 transition-all">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ═══ TAB: INFO PRATICA ═══ */}
        {activeTab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Dati Generali */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-5 border-b border-white/5 pb-2">Dati Generali</h3>
              <div className="grid grid-cols-2 gap-y-5 gap-x-8 text-sm">
                <div>
                  <span className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">Materia</span>
                  <span className="text-white font-medium capitalize">{
                    {civile:'Civile', penale:'Penale', lavoro:'Lavoro', amm:'Amministrativo', stra:'Stragiudiziale'}[practice.type] || practice.type
                  }</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">Controparte</span>
                  <span className="text-white font-medium">{practice.counterparty || 'N/A'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">Tribunale</span>
                  <span className="text-white font-medium">{practice.court || 'N/A'}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-text-dim uppercase tracking-wider mb-1">Apertura</span>
                  <span className="text-white font-medium">
                    {practice.createdAt ? new Date(practice.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Note Strategiche */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-5 border-b border-white/5 pb-2">Note Strategiche</h3>
              <p className="text-sm text-text-muted whitespace-pre-line leading-relaxed">
                {practice.description || 'Nessun appunto registrato.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}