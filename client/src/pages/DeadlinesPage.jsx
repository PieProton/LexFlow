import React, { useState, useEffect } from 'react';
import { CalendarClock, ChevronRight, AlertTriangle, Clock, Check, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '../tauri-api';

const TYPE_LABELS = { civile: 'Civile', penale: 'Penale', amm: 'Amministrativo', stra: 'Stragiudiziale', agenda: 'Agenda' };

export default function DeadlinesPage({ practices, onSelectPractice, settings, agendaEvents, onNavigate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [briefingMattina, setBriefingMattina] = useState(settings?.briefingMattina || '08:30');
  const [briefingPomeriggio, setBriefingPomeriggio] = useState(settings?.briefingPomeriggio || '14:30');
  const [briefingSera, setBriefingSera] = useState(settings?.briefingSera || '19:30');
  const [briefingDirty, setBriefingDirty] = useState(false);

  useEffect(() => {
    setBriefingMattina(settings?.briefingMattina || '08:30');
    setBriefingPomeriggio(settings?.briefingPomeriggio || '14:30');
    setBriefingSera(settings?.briefingSera || '19:30');
    setBriefingDirty(false);
  }, [settings]);

  const handleBriefingSave = async () => {
    try {
      const updated = { ...settings, briefingMattina, briefingPomeriggio, briefingSera };
      await api.saveSettings(updated);
      // Sync backend scheduler con formato corretto: briefingTimes (array) + items preservati
      const briefingTimes = [briefingMattina, briefingPomeriggio, briefingSera].filter(Boolean);
      const items = (agendaEvents || [])
        .filter(e => !e.completed && e.timeStart)
        .map(e => ({
          id: e.id,
          date: e.date,
          time: e.timeStart,
          title: e.title,
          remindMinutes: e.remindMinutes ?? (settings?.preavviso || 30),
          customRemindTime: e.customRemindTime || null,
        }));
      await api.syncNotificationSchedule({ briefingTimes, items });
      setBriefingDirty(false);
      toast.success('Orari briefing aggiornati');
    } catch (e) {
      toast.error('Errore nel salvataggio');
    }
  };

  const onBriefingChange = (setter) => (e) => { setter(e.target.value); setBriefingDirty(true); };

  // Collect all deadlines from active practices
  const allDeadlines = [];
  practices.filter(p => p.status === 'active').forEach(p => {
    (p.deadlines || []).forEach(d => {
      const dDate = new Date(d.date);
      dDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((dDate - today) / (1000 * 60 * 60 * 24));
      allDeadlines.push({ ...d, practiceId: p.id, client: p.client, object: p.object, type: p.type, diff, source: 'practice' });
    });
  });

  // Cross-sync: include agenda events with category "scadenza"
  (agendaEvents || []).filter(e => e.category === 'scadenza' && !e.completed).forEach(e => {
    const dDate = new Date(e.date);
    dDate.setHours(0, 0, 0, 0);
    const diff = Math.ceil((dDate - today) / (1000 * 60 * 60 * 24));
    allDeadlines.push({
      id: e.id,
      label: e.title,
      date: e.date,
      practiceId: e.practiceId || null,
      client: e.practiceId ? (practices.find(p => p.id === e.practiceId)?.client || 'Agenda') : 'Agenda',
      object: e.notes || '',
      type: 'agenda',
      diff,
      source: 'agenda',
    });
  });
  allDeadlines.sort((a, b) => new Date(a.date) - new Date(b.date));

  const pastDeadlines = allDeadlines.filter(d => d.diff < 0);
  const todayDeadlines = allDeadlines.filter(d => d.diff === 0);
  const weekDeadlines = allDeadlines.filter(d => d.diff > 0 && d.diff <= 7);
  const futureDeadlines = allDeadlines.filter(d => d.diff > 7);
  const next30 = allDeadlines.filter(d => d.diff > 0 && d.diff <= 30);

  const formatDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });

  const DeadlineRow = ({ d }) => (
    <div
      className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition cursor-pointer group border border-white/5 hover:border-white/10"
      onClick={() => {
        if (d.source === 'agenda') {
          if (onNavigate) onNavigate('/agenda');
        } else if (d.practiceId) {
          onSelectPractice(d.practiceId);
        }
      }}
    >
      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        d.diff < 0 ? 'bg-red-400' : d.diff === 0 ? 'bg-amber-400' : d.diff <= 3 ? 'bg-amber-400' : 'bg-blue-400'
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white">{d.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-text-dim">{d.client}</span>
          <span className="text-[9px] text-text-dim/60 uppercase tracking-wider">
            {TYPE_LABELS[d.type]}
          </span>
        </div>
      </div>
      <div className="text-[10px] font-mono text-text-dim bg-white/5 px-2 py-0.5 rounded">{formatDate(d.date)}</div>
      {d.source === 'agenda' && <Calendar size={12} className="text-primary/60 flex-shrink-0" title="Da Agenda" />}
      <ChevronRight size={14} className="text-text-dim group-hover:text-primary transition flex-shrink-0" />
    </div>
  );

  const Section = ({ title, items, color }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-[10px] font-black text-text-dim uppercase tracking-[2px] mb-3">{title} ({items.length})</h3>
        <div className="space-y-2">
          {items.map((d, i) => <DeadlineRow key={i} d={d} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="main-content animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
              <CalendarClock size={20} className="text-text-muted" />
            </div>
            Scadenze
          </h1>
          <p className="text-text-dim text-xs mt-1.5 uppercase tracking-[2px] font-bold">{allDeadlines.length} scadenz{allDeadlines.length === 1 ? 'a' : 'e'} totali</p>
        </div>
      </div>

      {/* 3 Stat Cards + Briefing Widget */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* In Scadenza Oggi */}
        <div className="glass-card p-5 border border-white/5">
          <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-2">In Scadenza Oggi</p>
          <p className="text-3xl font-black text-white">{todayDeadlines.length}</p>
          <p className="text-[10px] text-text-dim mt-1">
            {todayDeadlines.length === 0 ? 'Nessuna scadenza' : todayDeadlines.map(d => d.label).join(', ')}
          </p>
        </div>

        {/* In Ritardo */}
        <div className="glass-card p-5 border border-white/5">
          <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-2">In Ritardo</p>
          <p className={`text-3xl font-black ${pastDeadlines.length > 0 ? 'text-red-400' : 'text-white'}`}>{pastDeadlines.length}</p>
          <p className="text-[10px] text-text-dim mt-1">
            {pastDeadlines.length === 0 ? 'Tutto in regola' : `${pastDeadlines.length} scadenz${pastDeadlines.length === 1 ? 'a' : 'e'} superat${pastDeadlines.length === 1 ? 'a' : 'e'}`}
          </p>
        </div>

        {/* Prossimi 30 giorni */}
        <div className="glass-card p-5 border border-white/5">
          <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider mb-2">Prossimi 30 Giorni</p>
          <p className="text-3xl font-black text-white">{next30.length}</p>
          <p className="text-[10px] text-text-dim mt-1">
            {next30.length === 0 ? 'Calendario libero' : `${next30.length} in arrivo`}
          </p>
        </div>

        {/* Orari Briefing — EDITABILE */}
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Orari Briefing</p>
            {briefingDirty && (
              <button onClick={handleBriefingSave} className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-hover transition-colors">
                <Check size={12} /> Salva
              </button>
            )}
          </div>
          <div className="space-y-2">
            {[
              { label: 'Mattina', value: briefingMattina, onChange: onBriefingChange(setBriefingMattina) },
              { label: 'Pomeriggio', value: briefingPomeriggio, onChange: onBriefingChange(setBriefingPomeriggio) },
              { label: 'Sera', value: briefingSera, onChange: onBriefingChange(setBriefingSera) },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                <span className="text-xs text-white font-medium">{label}</span>
                <input type="time" className="bg-black/30 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono text-center focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all w-20" value={value} onChange={onChange} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {allDeadlines.length === 0 ? (
        <div className="text-center py-16">
          <CalendarClock size={40} className="text-text-dim mx-auto mb-3" />
          <p className="text-text-muted text-sm">Nessuna scadenza impostata</p>
        </div>
      ) : (
        <div className="glass-card p-6">
          <Section title="Scadute" items={pastDeadlines} />
          <Section title="Oggi" items={todayDeadlines} />
          <Section title="Prossimi 7 giorni" items={weekDeadlines} />
          <Section title="Future" items={futureDeadlines} />
        </div>
      )}
    </div>
  );
}
