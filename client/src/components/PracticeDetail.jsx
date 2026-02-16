import React, { useState } from 'react';
import { 
  ArrowLeft, Calendar, CheckSquare, FileText, 
  Clock, Plus, X, Trash2, Send, FolderOpen, 
  FolderPlus, Archive, RotateCcw, AlertCircle
} from 'lucide-react';
import { exportPracticePDF } from '../utils/pdfGenerator';
import toast from 'react-hot-toast';

export default function PracticeDetail({ practice, onBack, onUpdate }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview, tasks, diary, deadlines
  
  // Stati per i form
  const [newTask, setNewTask] = useState('');
  const [newNote, setNewNote] = useState('');
  const [newDeadlineLabel, setNewDeadlineLabel] = useState('');
  const [newDeadlineDate, setNewDeadlineDate] = useState('');

  // --- Helpers ---
  const update = (changes) => onUpdate({ ...practice, ...changes });

  const formatDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

  // --- Handlers: Status & Folder ---
  const toggleStatus = () => {
    const newStatus = practice.status === 'active' ? 'closed' : 'active';
    update({ status: newStatus });
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

  // --- Handlers: Tasks ---
  const toggleTask = (idx) => {
    const updatedTasks = [...(practice.tasks || [])];
    updatedTasks[idx].done = !updatedTasks[idx].done;
    update({ tasks: updatedTasks });
  };

  const deleteTask = (idx) => {
    const updatedTasks = (practice.tasks || []).filter((_, i) => i !== idx);
    update({ tasks: updatedTasks });
    toast.success('Attività eliminata');
  };

  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const task = { text: newTask, done: false, date: new Date().toISOString() };
    update({ tasks: [task, ...(practice.tasks || [])] });
    setNewTask('');
    toast.success('Attività aggiunta');
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

  // --- Handlers: Deadlines (RIPRISTINATO) ---
  const addDeadline = (e) => {
    e.preventDefault();
    if (!newDeadlineLabel.trim() || !newDeadlineDate) return;
    
    const deadlines = [...(practice.deadlines || []), { 
      date: newDeadlineDate, 
      label: newDeadlineLabel.trim() 
    }];
    // Ordina per data
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
  const TabButton = ({ id, label, icon: Icon, count }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
        activeTab === id 
          ? 'border-primary text-primary bg-primary/5' 
          : 'border-transparent text-text-dim hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon size={16} />
      {label}
      {count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 ${
          activeTab === id ? 'bg-primary/20 text-primary' : 'bg-[#22263a] text-text-dim'
        }`}>
          {count}
        </span>
      )}
    </button>
  );

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
              <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider border ${
                practice.status === 'active' 
                  ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                  : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
              }`}>
                {practice.status === 'active' ? 'Attivo' : 'Archiviato'}
              </span>
            </div>
            <p className="text-xs text-text-dim mt-0.5">{practice.object}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Pulsanti Cartella */}
          {practice.folderPath ? (
            <button onClick={openFolder} className="btn-secondary text-xs flex items-center gap-2" title={practice.folderPath}>
              <FolderOpen size={14} /> Apri Cartella
            </button>
          ) : (
            <button onClick={linkFolder} className="btn-secondary text-xs flex items-center gap-2">
              <FolderPlus size={14} /> Collega
            </button>
          )}

          {/* Export & Status */}
          <button onClick={handleExport} className="btn-secondary text-xs flex items-center gap-2">
            <FileText size={14} /> PDF
          </button>
          
          <button 
            onClick={toggleStatus} 
            className={`btn-secondary text-xs flex items-center gap-2 ${practice.status === 'active' ? 'hover:text-red-400 hover:border-red-400/30' : 'hover:text-green-400 hover:border-green-400/30'}`}
          >
            {practice.status === 'active' ? <Archive size={14} /> : <RotateCcw size={14} />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#22263a] px-6">
        <TabButton id="overview" label="Panoramica" icon={FileText} />
        <TabButton id="tasks" label="Attività" icon={CheckSquare} count={(practice.tasks || []).filter(t => !t.done).length} />
        <TabButton id="diary" label="Diario" icon={Clock} count={(practice.diary || []).length} />
        <TabButton id="deadlines" label="Scadenze" icon={Calendar} count={(practice.deadlines || []).length} />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        
        {/* VIEW: PANORAMICA */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card p-6">
                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4 border-b border-white/5 pb-2">Dettagli Fascicolo</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                  <div>
                    <span className="block text-xs text-text-dim mb-1">Tipo Materia</span>
                    <span className="text-white font-medium capitalize">{practice.type}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-text-dim mb-1">Controparte</span>
                    <span className="text-white font-medium">{practice.counterparty || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-text-dim mb-1">Tribunale / Sede</span>
                    <span className="text-white font-medium">{practice.court || '—'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-text-dim mb-1">Riferimento / RG</span>
                    <span className="text-white font-medium font-mono bg-white/5 px-2 py-1 rounded inline-block">{practice.code || '—'}</span>
                  </div>
                </div>
              </div>
              
              <div className="glass-card p-6">
                <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Descrizione</h3>
                <p className="text-text-muted text-sm leading-relaxed whitespace-pre-line">
                  {practice.description || "Nessuna descrizione aggiuntiva inserita per questo fascicolo."}
                </p>
              </div>
            </div>

            {/* Side Card: Prossime Scadenze (Solo lettura in Overview) */}
            <div className="glass-card p-5 h-fit border-l-4 border-warning/50">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Calendar size={16} className="text-warning" /> Scadenze Imminenti
              </h3>
              {!practice.deadlines?.length ? (
                <p className="text-xs text-text-dim italic">Nessuna scadenza.</p>
              ) : (
                <div className="space-y-3">
                  {practice.deadlines.slice(0, 3).map((d, i) => (
                    <div key={i} className="flex gap-3 text-sm border-b border-white/5 pb-2 last:border-0">
                      <div className="flex flex-col items-center justify-center bg-[#1a1c28] px-2 py-1 rounded border border-white/10 min-w-[50px]">
                        <span className="text-[10px] text-text-dim uppercase">{new Date(d.date).toLocaleDateString('it-IT', { month: 'short' })}</span>
                        <span className="text-lg font-bold text-white leading-none">{new Date(d.date).getDate()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-white">{d.label}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">Vedi tab Scadenze per dettagli</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: ATTIVITÀ (TASKS) */}
        {activeTab === 'tasks' && (
          <div className="max-w-3xl mx-auto">
            <form onSubmit={addTask} className="mb-6 flex gap-2">
              <div className="relative flex-1">
                <Plus size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <input
                  type="text"
                  className="input-field pl-10 w-full"
                  placeholder="Aggiungi una nuova attività..."
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                />
              </div>
              <button type="submit" disabled={!newTask.trim()} className="btn-primary px-4">Aggiungi</button>
            </form>

            <div className="space-y-2">
              {(!practice.tasks || practice.tasks.length === 0) && (
                <div className="text-center py-10 text-text-dim">
                  <CheckSquare size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Nessuna attività da completare</p>
                </div>
              )}
              {practice.tasks?.map((task, idx) => (
                <div key={idx} className="glass-card p-3 flex items-center gap-3 group hover:border-primary/30 transition-colors">
                  <button
                    onClick={() => toggleTask(idx)}
                    className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                      task.done ? 'bg-primary border-primary text-black' : 'border-text-dim hover:border-primary'
                    }`}
                  >
                    {task.done && <X size={14} strokeWidth={4} />}
                  </button>
                  <span className={`flex-1 text-sm ${task.done ? 'text-text-dim line-through decoration-primary/50' : 'text-white'}`}>
                    {task.text}
                  </span>
                  <button onClick={() => deleteTask(idx)} className="opacity-0 group-hover:opacity-100 p-2 text-text-dim hover:text-red-400 transition-all">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW: DIARIO */}
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

        {/* VIEW: SCADENZE (NUOVO TAB RIPRISTINATO) */}
        {activeTab === 'deadlines' && (
          <div className="max-w-3xl mx-auto">
            {/* Form Scadenze */}
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

            {/* Lista Scadenze */}
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
      </div>
    </div>
  );
}