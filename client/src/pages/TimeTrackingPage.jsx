import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Play, Square, Plus, Trash2, Briefcase, ChevronDown, ChevronLeft, ChevronRight, Edit3, Check, X, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

function genId() { return 'tl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fmtDuration(min) {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtHours(min) { return (min / 60).toFixed(1); }
function toDateStr(d) { return d.toISOString().slice(0, 10); }
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const DAYS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export default function TimeTrackingPage({ practices }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null); // { practiceId, description, startedAt }
  const [elapsed, setElapsed] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const intervalRef = useRef(null);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const data = await window.api.loadTimeLogs();
        setLogs(data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  // Timer interval
  useEffect(() => {
    if (activeTimer) {
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000));
      }, 1000);
    } else {
      setElapsed(0);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [activeTimer]);

  const saveLogs = useCallback(async (newLogs) => {
    setLogs(newLogs);
    try { await window.api.saveTimeLogs(newLogs); } catch (e) { console.error(e); toast.error('Errore salvataggio'); }
  }, []);

  const startTimer = (practiceId, description = '') => {
    const practice = practices.find(p => p.id === practiceId);
    setActiveTimer({
      practiceId,
      practiceName: practice ? `${practice.client} — ${practice.object}` : '',
      description: description || 'Sessione di lavoro',
      startedAt: new Date().toISOString(),
    });
    toast.success('Timer avviato');
  };

  const stopTimer = async () => {
    if (!activeTimer) return;
    const endedAt = new Date().toISOString();
    const startMs = new Date(activeTimer.startedAt).getTime();
    const durationMin = Math.round((Date.now() - startMs) / 60000);
    if (durationMin < 1) {
      toast('Sessione troppo breve (< 1 min), ignorata');
      setActiveTimer(null);
      return;
    }
    const newLog = {
      id: genId(),
      practiceId: activeTimer.practiceId,
      practiceName: activeTimer.practiceName || '',
      description: activeTimer.description,
      startedAt: activeTimer.startedAt,
      endedAt,
      durationMin,
      billable: true,
      hourlyRate: 150,
    };
    await saveLogs([newLog, ...logs]);
    setActiveTimer(null);
    toast.success(`Registrate ${fmtDuration(durationMin)}`);
  };

  const deleteLog = async (id) => {
    await saveLogs(logs.filter(l => l.id !== id));
    toast.success('Voce eliminata');
  };

  const saveEditedLog = async (updated) => {
    await saveLogs(logs.map(l => l.id === updated.id ? updated : l));
    setEditingLog(null);
    toast.success('Voce aggiornata');
  };

  const addManualLog = async (log) => {
    await saveLogs([log, ...logs]);
    setShowAddModal(false);
    toast.success('Voce aggiunta');
  };

  // Week navigation
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  const weekLabel = `${weekDays[0].getDate()} ${MONTHS_IT[weekDays[0].getMonth()].slice(0,3)} — ${weekDays[6].getDate()} ${MONTHS_IT[weekDays[6].getMonth()].slice(0,3)} ${weekDays[6].getFullYear()}`;

  // Group logs by day for the week
  const logsByDay = {};
  weekDays.forEach(d => { logsByDay[toDateStr(d)] = []; });
  logs.forEach(l => {
    const ds = l.startedAt?.slice(0, 10);
    if (ds && logsByDay[ds] !== undefined) logsByDay[ds].push(l);
  });

  // Week stats
  const weekTotalMin = weekDays.reduce((sum, d) => {
    return sum + (logsByDay[toDateStr(d)] || []).reduce((s, l) => s + (l.durationMin || 0), 0);
  }, 0);
  const weekBillableMin = weekDays.reduce((sum, d) => {
    return sum + (logsByDay[toDateStr(d)] || []).filter(l => l.billable).reduce((s, l) => s + (l.durationMin || 0), 0);
  }, 0);
  const weekRevenue = weekDays.reduce((sum, d) => {
    return sum + (logsByDay[toDateStr(d)] || []).filter(l => l.billable).reduce((s, l) => s + ((l.durationMin || 0) / 60 * (l.hourlyRate || 0)), 0);
  }, 0);

  const activePractices = (practices || []).filter(p => p.status === 'active');

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20">
            <Clock size={28} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Time Tracking</h1>
            <p className="text-text-dim text-sm mt-0.5">Registra le ore di lavoro per fascicolo</p>
          </div>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm font-bold">
          <Plus size={16} /> Aggiungi Manuale
        </button>
      </div>

      {/* Active Timer */}
      {activeTimer ? (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center animate-pulse">
                <Clock size={24} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-lg font-mono tracking-wider">
                  {Math.floor(elapsed / 3600).toString().padStart(2, '0')}:{Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-text-dim text-xs truncate">{activeTimer.description}</p>
              </div>
            </div>
            <button onClick={stopTimer} className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl font-bold text-sm flex items-center gap-2 border border-red-500/20 transition-all active:scale-95">
              <Square size={16} fill="currentColor" /> Ferma
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-5">
          <p className="text-[11px] font-black text-text-dim uppercase tracking-[2px] mb-3">Avvia Timer per Fascicolo</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activePractices.slice(0, 9).map(p => (
              <button
                key={p.id}
                onClick={() => startTimer(p.id, `${p.client} — ${p.object}`)}
                className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] hover:bg-primary/10 border border-white/[0.06] hover:border-primary/30 rounded-xl transition-all text-left group active:scale-[0.98]"
              >
                <Play size={14} className="text-text-dim group-hover:text-primary flex-shrink-0" />
                <span className="text-sm text-white truncate">{p.client}</span>
              </button>
            ))}
          </div>
          {activePractices.length === 0 && (
            <p className="text-text-dim text-sm text-center py-4">Nessun fascicolo attivo. Crea un fascicolo per iniziare.</p>
          )}
        </div>
      )}

      {/* Week Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white font-mono">{fmtHours(weekTotalMin)}h</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Ore Totali Settimana</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400 font-mono">{fmtHours(weekBillableMin)}h</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Ore Fatturabili</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400 font-mono">€{weekRevenue.toFixed(0)}</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Ricavo Stimato</p>
        </div>
      </div>

      {/* Week Navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-90">
          <ChevronLeft size={20} className="text-text-dim" />
        </button>
        <div className="text-center">
          <button onClick={() => setWeekOffset(0)} className="text-white font-bold text-sm hover:text-primary transition-colors">
            {weekLabel}
          </button>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors active:scale-90">
          <ChevronRight size={20} className="text-text-dim" />
        </button>
      </div>

      {/* Week Grid */}
      <div className="space-y-2">
        {weekDays.map(d => {
          const ds = toDateStr(d);
          const dayLogs = logsByDay[ds] || [];
          const isToday = ds === toDateStr(today);
          const dayTotal = dayLogs.reduce((s, l) => s + (l.durationMin || 0), 0);

          return (
            <div key={ds} className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all ${isToday ? 'border-primary/30 bg-primary/[0.03]' : 'border-white/[0.06]'}`}>
              {/* Day header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-primary' : 'text-text-dim'}`}>
                    {DAYS_IT[d.getDay()]}
                  </span>
                  <span className={`text-sm font-mono ${isToday ? 'text-white font-bold' : 'text-text-muted'}`}>
                    {d.getDate()}/{(d.getMonth() + 1).toString().padStart(2, '0')}
                  </span>
                  {isToday && <span className="text-[8px] font-bold uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">Oggi</span>}
                </div>
                {dayTotal > 0 && (
                  <span className="text-xs font-mono font-bold text-text-muted">{fmtDuration(dayTotal)}</span>
                )}
              </div>
              {/* Entries */}
              {dayLogs.length > 0 ? (
                <div className="divide-y divide-white/[0.04]">
                  {dayLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors group">
                      <span className="text-[10px] font-mono text-text-muted w-12 flex-shrink-0">
                        {l.startedAt?.slice(11, 16)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{l.description || l.practiceName}</p>
                        {l.practiceName && l.description !== l.practiceName && (
                          <p className="text-[10px] text-text-dim truncate">{l.practiceName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {l.billable && <DollarSign size={12} className="text-green-400" />}
                        <span className="text-xs font-mono font-bold text-white bg-white/5 px-2 py-0.5 rounded-md">{fmtDuration(l.durationMin)}</span>
                        <button onClick={() => setEditingLog({ ...l })} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all">
                          <Edit3 size={12} className="text-text-dim" />
                        </button>
                        <button onClick={() => deleteLog(l.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 rounded transition-all">
                          <Trash2 size={12} className="text-red-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-center">
                  <span className="text-text-dim text-xs opacity-40">—</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Manual Modal */}
      {showAddModal && (
        <ManualLogModal
          practices={activePractices}
          onSave={addManualLog}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Modal */}
      {editingLog && (
        <EditLogModal
          log={editingLog}
          onSave={saveEditedLog}
          onClose={() => setEditingLog(null)}
        />
      )}
    </div>
  );
}

/* ──── Manual Add Modal ──── */
function ManualLogModal({ practices, onSave, onClose }) {
  const [form, setForm] = useState({
    practiceId: practices[0]?.id || '',
    description: '',
    date: toDateStr(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    billable: true,
    hourlyRate: 150,
  });

  const handleSubmit = () => {
    const start = new Date(`${form.date}T${form.startTime}:00`);
    const end = new Date(`${form.date}T${form.endTime}:00`);
    const durationMin = Math.max(1, Math.round((end - start) / 60000));
    const practice = practices.find(p => p.id === form.practiceId);
    onSave({
      id: genId(),
      practiceId: form.practiceId,
      practiceName: practice ? `${practice.client} — ${practice.object}` : '',
      description: form.description || 'Sessione di lavoro',
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      durationMin,
      billable: form.billable,
      hourlyRate: form.hourlyRate,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-[#0f1016] border border-white/10 rounded-2xl w-full max-w-lg shadow-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Aggiungi Sessione Manuale</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} className="text-text-dim" /></button>
        </div>
        <div className="p-6 space-y-5">
          {/* Practice selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Fascicolo</label>
            <select value={form.practiceId} onChange={e => setForm({ ...form, practiceId: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-primary/50 outline-none appearance-none">
              {practices.map(p => <option key={p.id} value={p.id}>{p.client} — {p.object}</option>)}
            </select>
          </div>
          {/* Description */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Descrizione attività</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Es. Redazione atto di citazione"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/50 focus:border-primary/50 outline-none" />
          </div>
          {/* Date + Times */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Data</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Inizio</label>
              <input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Fine</label>
              <input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:border-primary/50 outline-none" />
            </div>
          </div>
          {/* Billable + Rate */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })}
                className="w-4 h-4 rounded accent-primary" />
              <span className="text-sm text-white">Fatturabile</span>
            </label>
            {form.billable && (
              <div className="flex items-center gap-2">
                <span className="text-text-dim text-sm">€</span>
                <input type="number" value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:border-primary/50 outline-none" />
                <span className="text-text-dim text-xs">/ora</span>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-text-dim hover:text-white hover:bg-white/5 rounded-xl text-sm font-bold transition-all">Annulla</button>
          <button onClick={handleSubmit} className="btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2">
            <Check size={16} /> Salva
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──── Edit Log Modal ──── */
function EditLogModal({ log, onSave, onClose }) {
  const [form, setForm] = useState({
    description: log.description || '',
    durationMin: log.durationMin || 0,
    billable: log.billable !== false,
    hourlyRate: log.hourlyRate || 150,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-[#0f1016] border border-white/10 rounded-2xl w-full max-w-md shadow-3xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Modifica Sessione</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} className="text-text-dim" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Descrizione</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-primary/50 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Durata (minuti)</label>
            <input type="number" value={form.durationMin} onChange={e => setForm({ ...form, durationMin: Math.max(1, Number(e.target.value)) })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono focus:border-primary/50 outline-none" />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.billable} onChange={e => setForm({ ...form, billable: e.target.checked })}
                className="w-4 h-4 rounded accent-primary" />
              <span className="text-sm text-white">Fatturabile</span>
            </label>
            {form.billable && (
              <div className="flex items-center gap-2">
                <span className="text-text-dim text-sm">€</span>
                <input type="number" value={form.hourlyRate} onChange={e => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-mono focus:border-primary/50 outline-none" />
                <span className="text-text-dim text-xs">/ora</span>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-text-dim hover:text-white hover:bg-white/5 rounded-xl text-sm font-bold transition-all">Annulla</button>
          <button onClick={() => onSave({ ...log, ...form })} className="btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2">
            <Check size={16} /> Salva
          </button>
        </div>
      </div>
    </div>
  );
}
