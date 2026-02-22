import React, { useMemo } from 'react';
import { Briefcase, CalendarDays, CalendarClock, Coffee, Sun, Sunrise } from 'lucide-react';

export default function Dashboard({ practices, agendaEvents, onNavigate, onSelectPractice, onNewPractice }) {

  // ── Greeting contestuale con stile diverso per fascia oraria ──
  const hero = useMemo(() => {
    const h = new Date().getHours();
    if (h < 13) return {
      label: 'AGGIORNAMENTO MATTUTINO',
      greeting: 'Buongiorno',
      sub: 'Ecco gli impegni previsti per la giornata di oggi.',
      gradient: 'from-amber-900/40 via-orange-900/20 to-transparent',
      iconBg: 'text-amber-400/20',
      icon: <Sunrise size={120} strokeWidth={1} />,
    };
    if (h < 18) return {
      label: 'AGGIORNAMENTO POMERIDIANO',
      greeting: 'Buon Pomeriggio',
      sub: 'Focus sulle attività rimanenti prima della chiusura dello studio.',
      gradient: 'from-rose-800/40 via-orange-900/25 to-transparent',
      iconBg: 'text-rose-300/20',
      icon: <Sun size={120} strokeWidth={1} />,
    };
    return {
      label: 'AGGIORNAMENTO SERALE',
      greeting: 'Buonasera',
      sub: 'Riepilogo e preparazione per la giornata di domani.',
      gradient: 'from-sky-900/30 via-blue-900/15 to-transparent',
      iconBg: 'text-sky-400/15',
      icon: <Coffee size={120} strokeWidth={1} />,
    };
  }, []);

  // ── Calcoli statistiche ──
  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let activeCount = 0;
    let deadlineCount = 0;

    (practices || []).forEach(p => {
      if (p.status === 'active') {
        activeCount++;
        (p.deadlines || []).forEach(d => {
          const dd = new Date(d.date); dd.setHours(0, 0, 0, 0);
          if (dd >= today) deadlineCount++;
        });
      }
    });

    const totalAgenda = (agendaEvents || []).filter(e => !e.autoSync).length;

    return { activeCount, totalAgenda, deadlineCount };
  }, [practices, agendaEvents]);

  // ── Impegni rilevanti (oggi/domani) ──
  const relevant = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const events = agendaEvents || [];
    let filtered;

    if (h < 13) {
      // Mattina: mostra tutto oggi
      filtered = events.filter(e => e.date === todayStr && !e.completed);
    } else if (h < 18) {
      // Pomeriggio: mostra impegni restanti di oggi (dopo le 13)
      filtered = events.filter(e => e.date === todayStr && !e.completed && e.timeStart >= '13:00');
    } else {
      // Sera: mostra impegni di domani
      filtered = events.filter(e => e.date === tomorrowStr && !e.completed);
    }

    return filtered.sort((a, b) => (a.timeStart || '').localeCompare(b.timeStart || '')).slice(0, 6);
  }, [agendaEvents]);

  return (
    <div className="main-content animate-slide-up pb-8">

      {/* ═══ HERO CARD ═══ */}
      <div className={`relative rounded-3xl overflow-hidden bg-gradient-to-r ${hero.gradient} border border-white/5 p-8 mb-8`}>
        {/* Icona decorativa grande */}
        <div className={`absolute right-6 top-1/2 -translate-y-1/2 ${hero.iconBg} pointer-events-none select-none`}>
          {hero.icon}
        </div>

        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[3px] text-text-muted flex items-center gap-2 mb-3">
            <Sunrise size={14} className="text-primary" />
            {hero.label}
          </p>
          <h1 className="text-3xl font-black text-white tracking-tight mb-1">{hero.greeting}</h1>
          <p className="text-sm text-text-muted max-w-md">{hero.sub}</p>
        </div>

        {/* ── Widget impegni rilevanti dentro la hero ── */}
        <div className="relative z-10 mt-6 bg-black/30 rounded-2xl p-5 border border-white/5">
          {relevant.length === 0 ? (
            <div className="flex items-center justify-center gap-3 py-3 text-text-dim opacity-60">
              <CalendarDays size={20} />
              <p className="text-sm">Nessun impegno rilevante per questo periodo.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {relevant.map((ev, i) => (
                <div key={ev.id || i} className="flex items-center gap-3 text-sm">
                  <span className="text-[11px] font-mono text-text-muted bg-white/5 px-2 py-0.5 rounded w-14 text-center flex-shrink-0">
                    {ev.timeStart || '--:--'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ev.category === 'udienza' ? '#d4a940' : ev.category === 'scadenza' ? '#EF6B6B' : '#7c8099' }} />
                  <span className="text-white truncate">{ev.title}</span>
                  {ev.category && (
                    <span className="text-[9px] text-text-dim uppercase tracking-wider ml-auto flex-shrink-0">{ev.category}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══ 3 STAT CARDS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 flex items-center gap-4 border border-white/5 hover:border-white/10 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <Briefcase size={20} className="text-text-muted" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">{stats.activeCount}</p>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Fascicoli Attivi</p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4 border border-white/5 hover:border-white/10 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <CalendarDays size={20} className="text-text-muted" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">{stats.totalAgenda}</p>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Impegni Totali</p>
          </div>
        </div>

        <div className="glass-card p-5 flex items-center gap-4 border border-white/5 hover:border-white/10 transition-colors">
          <div className="w-11 h-11 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <CalendarClock size={20} className="text-text-muted" />
          </div>
          <div>
            <p className="text-2xl font-black text-white tabular-nums">{stats.deadlineCount}</p>
            <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Scadenze Attive</p>
          </div>
        </div>
      </div>
    </div>
  );
}