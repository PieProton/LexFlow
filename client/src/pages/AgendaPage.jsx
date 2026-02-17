import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays, 
  Clock, 
  X, 
  Trash2, 
  ExternalLink, 
  Calendar, 
  Filter, 
  AlertCircle, 
  BarChart3 
} from 'lucide-react';
import toast from 'react-hot-toast';

const DAYS_IT = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const DAYS_SHORT = ['DOM','LUN','MAR','MER','GIO','VEN','SAB'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

const CAT_COLORS = {
  udienza: '#d4a940',
  studio: '#8B7CF6',
  scadenza: '#EF6B6B',
  riunione: '#5B8DEF',
  personale: '#2DD4BF',
  altro: '#7c8099',
};

const CAT_LABELS = {
  udienza: 'Udienza',
  studio: 'Studio',
  scadenza: 'Scadenza',
  riunione: 'Riunione',
  personale: 'Personale',
  altro: 'Altro',
};

const HOURS = Array.from({length: 17}, (_, i) => i + 7); // 07:00 - 23:00

function genId() { return Date.now().toString(36) + Math.random().toString(36).substring(2, 7); }
function toDateStr(d) { return d.toISOString().split('T')[0]; }
function parseDate(s) { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
function fmtTime(h, m) { return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); }

// --- Componente Empty State ---
function EmptyState({ message, sub, onAdd, date }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-10 opacity-60">
      <div className="w-24 h-24 rounded-3xl bg-white/5 flex items-center justify-center mb-6 shadow-inner border border-white/5">
        <CalendarDays size={40} className="text-white/40" />
      </div>
      <p className="text-white font-bold text-lg mb-2">{message}</p>
      <p className="text-text-dim text-sm mb-6 text-center max-w-[280px]">{sub}</p>
      {onAdd && (
        <button onClick={() => onAdd(date || toDateStr(new Date()))} className="btn-primary">
          <Plus size={16} /> Aggiungi Impegno
        </button>
      )}
    </div>
  );
}

// --- Componente Modal ---
function EventModal({ event, date, onSave, onDelete, onClose }) {
  const isEdit = !!event?.id;
  const [title, setTitle] = useState(event?.title || '');
  const [evDate, setEvDate] = useState(event?.date || date || toDateStr(new Date()));
  const [timeStart, setTimeStart] = useState(event?.timeStart || '09:00');
  const [timeEnd, setTimeEnd] = useState(event?.timeEnd || '10:00');
  const [category, setCategory] = useState(event?.category || 'udienza');
  const [notes, setNotes] = useState(event?.notes || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      id: event?.id || genId(),
      title: title.trim(),
      date: evDate,
      timeStart,
      timeEnd,
      category,
      notes,
      completed: event?.completed || false,
      autoSync: event?.autoSync || false,
      practiceId: event?.practiceId || null,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-white">{isEdit ? 'Modifica Impegno' : 'Nuovo Impegno'}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-white transition"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="text-xs font-bold text-text-dim uppercase tracking-wider mb-1.5 block">Titolo</label>
            <input className="input-field bg-black/20 border-white/5 focus:border-primary/50 text-lg font-semibold" 
              placeholder="Es. Udienza Tribunale..." value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
               <label className="text-[10px] font-bold text-text-dim uppercase mb-1 block">Data</label>
               <input type="date" className="input-field bg-black/20 border-white/5" value={evDate} onChange={e => setEvDate(e.target.value)} />
            </div>
            <div>
               <label className="text-[10px] font-bold text-text-dim uppercase mb-1 block">Inizio</label>
               <input type="time" className="input-field bg-black/20 border-white/5" value={timeStart} onChange={e => {
                 setTimeStart(e.target.value);
                 const [h,m] = e.target.value.split(':').map(Number);
                 setTimeEnd(fmtTime(Math.min(h+1,23), m));
               }} />
            </div>
            <div>
               <label className="text-[10px] font-bold text-text-dim uppercase mb-1 block">Fine</label>
               <input type="time" className="input-field bg-black/20 border-white/5" value={timeEnd} onChange={e => setTimeEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-text-dim uppercase mb-2 block">Categoria</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(CAT_LABELS).map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => setCategory(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    category === key
                      ? 'border-transparent text-white shadow-lg scale-105'
                      : 'border-white/10 text-text-muted hover:bg-white/5'
                  }`}
                  style={category === key ? { background: CAT_COLORS[key] } : {}}
                >{label}</button>
              ))}
            </div>
          </div>

          <textarea className="input-field bg-black/20 border-white/5" placeholder="Note aggiuntive..." rows={3} value={notes} onChange={e => setNotes(e.target.value)} />

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1 py-2.5 text-sm">{isEdit ? 'Salva Modifiche' : 'Crea Impegno'}</button>
            {isEdit && !event?.autoSync && (
              <button type="button" onClick={() => onDelete(event.id)} className="btn-danger px-3 py-2.5">
                <Trash2 size={18}/>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Componente Stats ---
function StatsCard({ events }) {
  const now = new Date();
  const todayStr = toDateStr(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const wsStr = toDateStr(weekStart), weStr = toDateStr(weekEnd);

  const weekEvts = events.filter(e => e.date >= wsStr && e.date <= weStr);
  const weekDone = weekEvts.filter(e => e.completed).length;
  const todayEvts = events.filter(e => e.date === todayStr);
  const todayDone = todayEvts.filter(e => e.completed).length;
  const todayPct = todayEvts.length > 0 ? Math.round((todayDone / todayEvts.length) * 100) : 0;

  const catCounts = {};
  weekEvts.forEach(ev => { catCounts[ev.category] = (catCounts[ev.category] || 0) + 1; });
  const sortedCats = Object.entries(catCounts).sort((a,b) => b[1] - a[1]);

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="glass-card p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10"><BarChart3 size={60} /></div>
        <div className="flex items-center gap-5 relative z-10">
          <div className="relative flex-shrink-0">
            <svg width={72} height={72} className="transform -rotate-90">
              <circle cx={36} cy={36} r={28} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6}/>
              <circle cx={36} cy={36} r={28} fill="none" stroke="var(--primary)" strokeWidth={6}
                strokeLinecap="round" strokeDasharray={2*Math.PI*28}
                strokeDashoffset={2*Math.PI*28*(1 - todayPct/100)}
                className="transition-all duration-1000 ease-out"
                style={{ filter: todayPct > 0 ? 'drop-shadow(0 0 6px var(--primary))' : 'none' }}/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
                 <span className="text-sm font-bold text-white">{todayPct}%</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted font-bold mb-1">Produttività Oggi</p>
            <p className="text-lg font-bold text-white">{todayDone} <span className="text-sm font-normal text-text-dim">/ {todayEvts.length} compiti</span></p>
          </div>
        </div>
      </div>

      {sortedCats.length > 0 && (
        <div className="glass-card p-4">
          <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-3">Questa Settimana</p>
          <div className="space-y-3">
            {sortedCats.map(([cat, count]) => {
              const pct = weekEvts.length > 0 ? (count / weekEvts.length) * 100 : 0;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-text-muted flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{background: CAT_COLORS[cat]}}/>
                      {CAT_LABELS[cat]}
                    </span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{width: `${pct}%`, background: CAT_COLORS[cat]}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Componente Upcoming ---
function UpcomingPanel({ events, onEdit, onToggle }) {
  const now = new Date();
  const todayStr = toDateStr(now);
  const upcoming = useMemo(() => events.filter(e => e.date >= todayStr && !e.completed).sort((a,b) => a.date === b.date ? a.timeStart.localeCompare(b.timeStart) : a.date.localeCompare(b.date)).slice(0, 8), [events, todayStr]);
  const overdue = useMemo(() => events.filter(e => e.date < todayStr && !e.completed), [events, todayStr]);

  if (upcoming.length === 0 && overdue.length === 0) return null;

  const formatRelDay = (dateStr) => {
    if (dateStr === todayStr) return 'Oggi';
    const d = parseDate(dateStr);
    const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
    if (dateStr === toDateStr(tmr)) return 'Domani';
    return `${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0,3)}`;
  };

  return (
    <div className="space-y-4 animate-slide-up" style={{animationDelay: '0.1s'}}>
      {overdue.length > 0 && (
        <div className="glass-card p-4 border border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={14} className="text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-wide">In Ritardo ({overdue.length})</span>
          </div>
          <div className="space-y-2">
            {overdue.slice(0, 3).map(ev => (
              <div key={ev.id} onClick={() => onEdit(ev)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-red-500/10 cursor-pointer transition border border-transparent hover:border-red-500/20">
                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: CAT_COLORS[ev.category] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{ev.title}</p>
                  <p className="text-[10px] text-red-300">{formatRelDay(ev.date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
          <Calendar size={14} className="text-primary" />
          <span className="text-xs font-bold text-white uppercase tracking-wide">Prossimi</span>
        </div>
        <div className="space-y-1">
          {upcoming.map(ev => (
            <div key={ev.id} onClick={() => onEdit(ev)} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition border border-transparent hover:border-white/5">
              <button onClick={e => { e.stopPropagation(); onToggle(ev.id); }} className="w-4 h-4 rounded-full border border-text-muted/50 flex items-center justify-center flex-shrink-0 hover:border-primary hover:bg-primary/10 transition">
                 <div className="w-2 h-2 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text group-hover:text-white transition-colors truncate">{ev.title}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{background: CAT_COLORS[ev.category]}} />
                    <p className="text-[10px] text-text-dim">{formatRelDay(ev.date)} · {ev.timeStart}</p>
                </div>
              </div>
              {ev.autoSync && <ExternalLink size={10} className="text-text-dim flex-shrink-0 opacity-50" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Vista Oggi ---
function TodayView({ events, onToggle, onEdit, onAdd, activeFilters }) {
  const now = new Date();
  const todayStr = toDateStr(now);
  const allToday = events.filter(e => e.date === todayStr).sort((a,b) => a.timeStart.localeCompare(b.timeStart));
  const todayEvts = activeFilters.length > 0 ? allToday.filter(e => activeFilters.includes(e.category)) : allToday;
  const timelineRef = useRef(null);

  useEffect(() => {
    if (timelineRef.current) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const scrollTo = Math.max(0, ((nowMin - 7*60) / 60) * 60 - 150);
      timelineRef.current.scrollTop = scrollTo;
    }
  }, []);

  return (
    <div className="space-y-5 h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
             {DAYS_IT[now.getDay()]} <span className="text-primary">{now.getDate()}</span> {MONTHS_IT[now.getMonth()]}
          </h2>
          <p className="text-text-muted text-xs mt-1 font-medium">Panoramica giornaliera</p>
        </div>
        <button onClick={() => onAdd(todayStr)} className="btn-primary">
          <Plus size={16} strokeWidth={2.5}/> Nuovo Impegno
        </button>
      </div>

      <div className="glass-card flex-1 overflow-hidden relative border-t border-white/5">
         {todayEvts.length === 0 ? (
            <EmptyState 
              message={allToday.length === 0 ? "Giornata Libera" : "Nessun impegno trovato"}
              sub={allToday.length === 0 ? "Non hai impegni in programma per oggi. Goditi un po' di relax." : "Prova a modificare i filtri per vedere altri impegni."}
              onAdd={allToday.length === 0 ? onAdd : null}
              date={todayStr}
            />
         ) : (
             <div ref={timelineRef} className="overflow-y-auto h-full no-scrollbar relative p-4">
                <div className="absolute top-4 left-16 right-4 bottom-4 pointer-events-none">
                     {HOURS.map((h, i) => (
                        <div key={h} className="absolute w-full border-t border-white/[0.04]" style={{top: i * 60, height: 60}}></div>
                     ))}
                </div>
                <div className="relative" style={{height: HOURS.length * 60 + 20}}>
                  {HOURS.map((h, i) => (
                    <div key={h} className="absolute left-0 w-12 text-right text-[11px] font-medium text-text-dim pt-1.5" style={{top: i * 60}}>
                      {String(h).padStart(2,'0')}:00
                    </div>
                  ))}
                  {(() => {
                    const nowMin = now.getHours() * 60 + now.getMinutes();
                    if (nowMin >= 7*60 && nowMin <= 23*60) {
                      const top = ((nowMin - 7*60) / 60) * 60;
                      return (
                          <div className="absolute left-14 right-0 z-30 flex items-center" style={{top}}>
                             <div className="text-[9px] font-bold text-primary w-10 text-right pr-2 -ml-12">{fmtTime(now.getHours(), now.getMinutes())}</div>
                             <div className="flex-1 border-t border-primary relative">
                               <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
                             </div>
                          </div>
                      );
                    }
                    return null;
                  })()}
                  {todayEvts.map(ev => {
                    const [sh,sm] = ev.timeStart.split(':').map(Number);
                    const [eh,em] = ev.timeEnd.split(':').map(Number);
                    const startMin = sh*60+sm, endMin = eh*60+em;
                    const top = ((startMin - 7*60) / 60) * 60;
                    const height = Math.max(((endMin - startMin) / 60) * 60, 32);
                    const isSpecial = ev.category === 'udienza' || ev.category === 'scadenza';
                    return (
                      <div key={ev.id} onClick={() => onEdit(ev)}
                        className={`agenda-event absolute left-14 right-2 rounded-lg px-3 py-1.5 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:z-10
                            ${ev.category === 'udienza' ? 'bg-[#d4a940]/20 border-l-4 border-[#d4a940]' : ''}
                            ${ev.category === 'scadenza' ? 'bg-[#EF6B6B]/20 border-l-4 border-[#EF6B6B]' : ''}
                            ${!isSpecial ? 'bg-white/[0.08] hover:bg-white/[0.12] border-l-4 border-white/20' : ''}
                            ${ev.completed ? 'opacity-50 grayscale' : ''}
                        `}
                        style={{
                            top, height: height, 
                            borderLeftColor: CAT_COLORS[ev.category]
                        }}>
                        <div className="flex justify-between items-start">
                             <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-white truncate">{ev.title}</span>
                                    {ev.autoSync && <ExternalLink size={10} className="text-white/70" />}
                                </div>
                                {height >= 45 && (
                                    <p className="text-[10px] text-white/60 mt-0.5 truncate">{ev.notes || ev.category.toUpperCase()}</p>
                                )}
                             </div>
                             <span className="text-[10px] font-mono text-white/80 bg-black/20 px-1.5 py-0.5 rounded flex-shrink-0">{ev.timeStart}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
             </div>
         )}
      </div>
    </div>
  );
}

// --- Vista Settimana ---
function WeekView({ events, onEdit, onAdd, activeFilters }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const scrollRef = useRef(null);
  const now = new Date();
  const todayStr = toDateStr(now);
  const sow = new Date(now);
  sow.setDate(now.getDate() - ((now.getDay() + 6) % 7) + (weekOffset * 7));
  const days = Array.from({length: 7}, (_, i) => {
    const d = new Date(sow); d.setDate(sow.getDate() + i);
    return { date: d, str: toDateStr(d) };
  });
  const filtered = activeFilters.length > 0 ? events.filter(e => activeFilters.includes(e.category)) : events;

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="glass-card flex items-center p-1 gap-2">
          <button onClick={() => setWeekOffset(w => w-1)} className="btn-ghost w-8 h-8 p-0"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold w-32 text-center text-white">{days[0].date.getDate()} - {days[6].date.getDate()} {MONTHS_IT[days[6].date.getMonth()].slice(0,3)}</span>
          <button onClick={() => setWeekOffset(w => w+1)} className="btn-ghost w-8 h-8 p-0"><ChevronRight size={16}/></button>
        </div>
        <button onClick={() => onAdd(todayStr)} className="btn-primary"><Plus size={16}/> Nuovo</button>
      </div>

      <div className="glass-card flex-1 flex flex-col overflow-hidden border border-white/5">
        <div className="grid grid-cols-[50px_repeat(7,1fr)] border-b border-white/5 bg-black/20">
          <div/>
          {days.map(({date, str}) => {
            const isToday = str === todayStr;
            return (
              <div key={str} className={`text-center py-3 ${isToday ? 'bg-primary/5' : ''}`}>
                <div className="text-[10px] font-bold text-text-dim mb-1">{DAYS_SHORT[date.getDay()]}</div>
                <div className={`text-sm font-bold w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-black shadow-lg shadow-primary/50' : 'text-text'}`}>
                    {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={scrollRef} className="overflow-y-auto flex-1 no-scrollbar relative">
          <div className="grid grid-cols-[50px_repeat(7,1fr)] relative" style={{height: HOURS.length * 60}}>
            <div className="relative border-r border-white/5 bg-black/20">
              {HOURS.map(h => (
                <div key={h} className="absolute w-full text-right pr-2 text-[10px] text-text-dim font-medium" style={{top: (h-7)*60 + 5}}>
                  {String(h).padStart(2,'0')}
                </div>
              ))}
            </div>
            {days.map(({date, str}) => {
              const isToday = str === todayStr;
              const dayEvts = filtered.filter(e => e.date === str);
              return (
                <div key={str} className={`relative border-r border-white/5 ${isToday ? 'bg-white/[0.02]' : ''}`}
                    onClick={(e) => {
                       if (e.target.closest('.week-ev')) return;
                       const rect = e.currentTarget.getBoundingClientRect();
                       const y = e.clientY - rect.top + (scrollRef.current?.scrollTop || 0);
                       const rawMin = Math.round((y / 60) * 60) + 7*60;
                       const startH = Math.floor(rawMin/60); 
                       onAdd(str, fmtTime(startH, 0), fmtTime(Math.min(startH+1,23), 0));
                    }}>
                  {HOURS.map(h => (<div key={h} className="absolute w-full border-t border-white/[0.03]" style={{top: (h-7)*60, height: 60}}/>))}
                  {dayEvts.map(ev => {
                    const [sh,sm] = ev.timeStart.split(':').map(Number);
                    const [eh,em] = ev.timeEnd.split(':').map(Number);
                    const top = ((sh*60+sm-7*60)/60)*60;
                    const height = Math.max(((eh*60+em-sh*60-sm)/60)*60, 20);
                    const isUdienza = ev.category === 'udienza';
                    return (
                      <div key={ev.id} className="week-ev agenda-event absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 cursor-pointer text-white overflow-hidden"
                        style={{
                            top, height, fontSize: 10,
                            background: isUdienza ? CAT_COLORS.udienza : `${CAT_COLORS[ev.category]}CC`,
                            borderLeft: `2px solid ${isUdienza ? '#fff' : 'rgba(255,255,255,0.3)'}`,
                            boxShadow: isUdienza ? '0 2px 8px rgba(212,169,64,0.3)' : 'none'
                        }}
                        onClick={e => {e.stopPropagation(); onEdit(ev);}}>
                        <div className="font-bold truncate leading-tight">{ev.title}</div>
                        {height >= 30 && <div className="opacity-80 text-[9px]">{ev.timeStart}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Vista Mese ---
function MonthView({ events, onEdit, onAdd, activeFilters }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const now = new Date();
  const todayStr = toDateStr(now);
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDay = (new Date(year, month, 1).getDay() + 6) % 7; 
  const cells = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) { cells.push({ date: new Date(year, month - 1, prevDays - i), str: toDateStr(new Date(year, month - 1, prevDays - i)), outside: true }); }
  for (let d = 1; d <= daysInMonth; d++) { cells.push({ date: new Date(year, month, d), str: toDateStr(new Date(year, month, d)), outside: false }); }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) { cells.push({ date: new Date(year, month + 1, d), str: toDateStr(new Date(year, month + 1, d)), outside: true }); }
  const filtered = activeFilters.length > 0 ? events.filter(e => activeFilters.includes(e.category)) : events;

  return (
    <div className="space-y-4 h-full flex flex-col">
       <div className="flex items-center justify-between flex-shrink-0">
        <div className="glass-card flex items-center p-1 gap-2">
          <button onClick={() => setMonthOffset(m => m-1)} className="btn-ghost w-8 h-8 p-0"><ChevronLeft size={16}/></button>
          <span className="text-sm font-bold w-40 text-center text-white">{MONTHS_IT[month]} {year}</span>
          <button onClick={() => setMonthOffset(m => m+1)} className="btn-ghost w-8 h-8 p-0"><ChevronRight size={16}/></button>
        </div>
        <button onClick={() => onAdd(todayStr)} className="btn-primary"><Plus size={16}/> Nuovo</button>
      </div>
      <div className="glass-card flex-1 flex flex-col overflow-hidden p-0 border border-white/5">
        <div className="grid grid-cols-7 border-b border-white/5 bg-black/20">
          {['LUN','MAR','MER','GIO','VEN','SAB','DOM'].map((d, i) => (
            <div key={d} className={`text-center py-2 text-[10px] font-bold ${i>=5 ? 'text-primary' : 'text-text-dim'}`}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 grid-rows-6 flex-1">
          {cells.map(({ date, str, outside }, idx) => {
            const isToday = str === todayStr;
            const dayEvts = filtered.filter(e => e.date === str);
            return (
              <div key={idx} onClick={() => onAdd(str)}
                className={`border-b border-r border-white/5 p-1 relative cursor-pointer hover:bg-white/[0.03] transition group ${outside ? 'opacity-30 bg-black/20' : ''} ${isToday ? 'bg-primary/[0.05]' : ''}`}>
                <div className={`text-[10px] font-bold mb-1 ml-1 w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-black' : 'text-text-muted'}`}>
                  {date.getDate()}
                </div>
                <div className="space-y-1 overflow-y-auto max-h-[80px] no-scrollbar">
                  {dayEvts.slice(0, 4).map(ev => (
                    <div key={ev.id} onClick={e => {e.stopPropagation(); onEdit(ev)}}
                      className="text-[9px] px-1.5 py-0.5 rounded-sm truncate text-white border-l-[2px] transition hover:scale-105"
                      style={{ background: `${CAT_COLORS[ev.category]}40`, borderLeftColor: CAT_COLORS[ev.category] }}>
                      {ev.title}
                    </div>
                  ))}
                  {dayEvts.length > 4 && <div className="text-[8px] text-center text-text-dim">+{dayEvts.length - 4} altri</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Componente Principale Agenda ---
export default function AgendaPage({ agendaEvents, onSaveAgenda, practices, onSelectPractice }) {
  const [view, setView] = useState('today');
  const [modalEvent, setModalEvent] = useState(null);
  const [activeFilters, setActiveFilters] = useState([]);
  const events = agendaEvents || [];

  const toggleFilter = (cat) => setActiveFilters(prev => 
    prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
  );

  const handleSave = (ev) => {
    const updated = events.some(e => e.id === ev.id) ? events.map(e => e.id === ev.id ? ev : e) : [...events, ev];
    onSaveAgenda(updated); setModalEvent(null); toast.success('Agenda aggiornata');
  };

  const handleDelete = (id) => { onSaveAgenda(events.filter(e => e.id !== id)); setModalEvent(null); toast.success('Eliminato'); };
  const handleToggle = (id) => onSaveAgenda(events.map(e => e.id === id ? {...e, completed: !e.completed} : e));
  const openAdd = (date, tS, tE) => setModalEvent({ event: { date: date || toDateStr(new Date()), timeStart: tS || '09:00', timeEnd: tE || '10:00' }, isNew: true });
  const openEdit = (ev) => ev.autoSync && ev.practiceId && onSelectPractice ? onSelectPractice(ev.practiceId) : setModalEvent({ event: ev, isNew: false });
  
  const views = [ 
    { key: 'today', label: 'Oggi', icon: Clock }, 
    { key: 'week', label: 'Settimana', icon: CalendarDays }, 
    { key: 'month', label: 'Mese', icon: Calendar } 
  ];

  return (
    <div className="main-content animate-slide-up h-screen flex flex-col overflow-hidden pb-4">
      {/* BARRA SUPERIORE OTTIMIZZATA */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mb-4 px-1 flex-shrink-0">
        
        {/* Selettore Vista */}
        <div className="glass-card p-1 flex gap-1 self-start">
          {views.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setView(key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition ${view === key ? 'bg-primary text-black shadow-[0_0_15px_rgba(212,169,64,0.4)]' : 'text-text-muted hover:text-white hover:bg-white/5'}`}>
              <Icon size={14}/> {label}
            </button>
          ))}
        </div>

        {/* BARRA FILTRI CATEGORIE - NUOVO DESIGN RESPONSIVE CON SCROLL ORIZZONTALE */}
        <div className="flex items-center bg-black/30 rounded-xl border border-white/5 overflow-hidden max-w-full">
          {/* Label Fisso */}
          <div className="flex items-center gap-2 text-text-dim px-3 py-2 border-r border-white/5 flex-shrink-0 bg-white/[0.02]">
            <Filter size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Filtra</span>
          </div>
          
          {/* Contenitore Scrollabile */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-2 px-3 flex-1 scroll-smooth">
            {Object.entries(CAT_LABELS).map(([key, label]) => {
               const isActive = activeFilters.includes(key);
               return (
                  <button 
                    key={key} 
                    onClick={() => toggleFilter(key)} 
                    className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border flex-shrink-0 ${
                      isActive 
                        ? 'border-transparent text-white shadow-[0_0_10px_rgba(0,0,0,0.5)] scale-105' 
                        : 'border-white/5 text-text-dim hover:bg-white/5 hover:text-white'
                    }`} 
                    style={isActive ? { background: CAT_COLORS[key] } : {}}
                  >
                    {label}
                  </button>
               );
            })}
          </div>

          {/* Reset button fisso se attivo */}
          {activeFilters.length > 0 && (
            <button 
              onClick={() => setActiveFilters([])} 
              className="px-3 py-2 text-text-dim hover:text-red-400 transition-colors border-l border-white/5 bg-white/[0.02] flex-shrink-0"
              title="Pulisci filtri"
            >
              <X size={16}/>
            </button>
          )}
        </div>
      </div>

      {/* Grid Contenuto */}
      <div className="grid gap-6 flex-1 overflow-hidden" style={{ gridTemplateColumns: '1fr minmax(240px, 280px)' }}>
        <div className="overflow-hidden h-full">
          {view === 'today' && <TodayView events={events} onToggle={handleToggle} onEdit={openEdit} onAdd={openAdd} activeFilters={activeFilters} />}
          {view === 'week' && <WeekView events={events} onEdit={openEdit} onAdd={openAdd} activeFilters={activeFilters} />}
          {view === 'month' && <MonthView events={events} onEdit={openEdit} onAdd={openAdd} activeFilters={activeFilters} />}
        </div>
        
        {/* Sidebar Destra */}
        <div className="space-y-4 overflow-y-auto no-scrollbar pr-1 hidden md:block">
          <StatsCard events={events} />
          <UpcomingPanel events={events} onEdit={openEdit} onToggle={handleToggle} />
        </div>
      </div>

      {modalEvent && <EventModal event={modalEvent.event} onSave={handleSave} onDelete={handleDelete} onClose={() => setModalEvent(null)} />}
    </div>
  );
}