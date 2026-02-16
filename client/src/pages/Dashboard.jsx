import React, { useMemo } from 'react';
import { Briefcase, CalendarClock, AlertTriangle, ChevronRight, Plus, Scale, Sun, Moon, Sunrise } from 'lucide-react';

const TYPE_LABELS = { civile: 'Civile', penale: 'Penale', amm: 'Amministrativo', stra: 'Stragiudiziale' };

// Sotto-componente per le card delle statistiche
const StatCard = ({ icon, bg, count, label }) => (
  <div className="glass-card p-4 flex items-center gap-4 border border-white/5 hover:border-primary/20 transition-colors">
    <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-text tabular-nums">{count}</p>
      <p className="text-[10px] text-text-muted font-bold uppercase tracking-wider">{label}</p>
    </div>
  </div>
);

export default function Dashboard({ practices, onNavigate, onSelectPractice, onNewPractice }) {
  
  // 1. Greeting Dinamico (UX)
  const greeting = useMemo(() => {
    const hours = new Date().getHours();
    if (hours < 12) return { text: 'Buongiorno', icon: <Sunrise size={20} className="text-warning" /> };
    if (hours < 18) return { text: 'Buon pomeriggio', icon: <Sun size={20} className="text-warning" /> };
    return { text: 'Buonasera', icon: <Moon size={20} className="text-primary" /> };
  }, []);

  // 2. Performance: Calcoli memorizzati (non rallenta al re-render)
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = [];
    const closed = [];
    const urgent = [];
    let pendingCount = 0;

    practices.forEach(p => {
      // Separazione Attivi/Chiusi
      if (p.status === 'active') {
        active.push(p);
        
        // Conteggio task
        if (p.tasks) {
          pendingCount += p.tasks.filter(t => !t.done).length;
        }

        // Calcolo scadenze
        if (p.deadlines) {
          p.deadlines.forEach(d => {
            const dDate = new Date(d.date);
            dDate.setHours(0, 0, 0, 0);
            const diffTime = dDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            // Logica "Urgente": tra oggi (0) e 7 giorni, o scadute nel passato recente (-3)
            if (diffDays >= -3 && diffDays <= 7) {
              urgent.push({ 
                ...d, 
                practiceId: p.id, 
                client: p.client, 
                object: p.object, 
                diffDays,
                isOverdue: diffDays < 0 
              });
            }
          });
        }
      } else {
        closed.push(p);
      }
    });

    // Ordinamento scadenze per data
    urgent.sort((a, b) => new Date(a.date) - new Date(b.date));

    return { active, closed, urgent, pendingCount };
  }, [practices]);

  const formatDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

  return (
    <div className="main-content animate-slide-up pb-8">
      {/* Header con Saluto */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            {greeting.icon} {greeting.text}, Avvocato.
          </h1>
          <p className="text-text-muted text-sm mt-1 ml-1">
            Ecco la situazione aggiornata del tuo studio.
          </p>
        </div>
      </div>

      {/* Griglia KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          icon={<Briefcase size={18} className="text-primary" />} 
          bg="bg-primary/10" 
          count={stats.active.length} 
          label="Fascicoli Attivi" 
        />
        <StatCard 
          icon={<Scale size={18} className="text-success" />} 
          bg="bg-success/10" 
          count={stats.closed.length} 
          label="Archiviati" 
        />
        <StatCard 
          icon={<CalendarClock size={18} className="text-warning" />} 
          bg="bg-warning/10" 
          count={stats.urgent.length} 
          label="Scadenze Urgenti" 
        />
        <StatCard 
          icon={<AlertTriangle size={18} className="text-info" />} 
          bg="bg-info/10" 
          count={stats.pendingCount} 
          label="Attività Pendenti" 
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Widget Scadenze */}
        <div className="glass-card p-5 border border-white/5 flex flex-col h-[320px]">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-sm font-semibold text-text flex items-center gap-2">
              <CalendarClock size={16} className="text-warning" />
              Prossimi 7 giorni
            </h2>
            <button
              className="text-xs text-primary font-bold hover:text-primary-hover transition-colors"
              onClick={() => onNavigate('/scadenze')}
            >
              Vedi calendario completo →
            </button>
          </div>
          
          <div className="overflow-y-auto pr-1 space-y-2 flex-1 custom-scrollbar">
            {stats.urgent.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-dim opacity-50">
                <CalendarClock size={32} className="mb-2" />
                <p className="text-xs">Nessuna scadenza imminente</p>
              </div>
            ) : (
              stats.urgent.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1c28]/50 hover:bg-[#1a1c28] border border-transparent hover:border-white/10 transition-all cursor-pointer group"
                  onClick={() => onSelectPractice(d.practiceId)}
                >
                  <div className={`w-1.5 h-8 rounded-full flex-shrink-0 ${d.isOverdue ? 'bg-red-500' : d.diffDays <= 1 ? 'bg-danger' : 'bg-warning'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <p className={`text-xs font-semibold truncate ${d.isOverdue ? 'text-red-400' : 'text-text'}`}>
                        {d.label} {d.isOverdue && '(SCADUTA)'}
                      </p>
                      <span className="text-[10px] font-mono text-text-muted">{formatDate(d.date)}</span>
                    </div>
                    <p className="text-[10px] text-text-dim truncate mt-0.5">{d.client} — {d.object}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Widget Recenti */}
        <div className="glass-card p-5 border border-white/5 flex flex-col h-[320px]">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h2 className="text-sm font-semibold text-text flex items-center gap-2">
              <Briefcase size={16} className="text-primary" />
              Lavorati di recente
            </h2>
            <button className="btn-primary text-[10px] px-3 py-1 h-7" onClick={onNewPractice}>
              <Plus size={14} /> Crea Nuovo
            </button>
          </div>

          <div className="overflow-y-auto pr-1 space-y-2 flex-1 custom-scrollbar">
             {stats.active.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-dim opacity-50">
                <Briefcase size={32} className="mb-2" />
                <p className="text-xs">Nessun fascicolo attivo</p>
              </div>
            ) : (
              stats.active.slice(0, 10).map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1c28]/50 hover:bg-[#1a1c28] border border-transparent hover:border-white/10 transition-all cursor-pointer group"
                  onClick={() => onSelectPractice(p.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-semibold text-text truncate">{p.client}</p>
                      <span className="text-[9px] text-text-dim uppercase border border-white/10 px-1 rounded">{TYPE_LABELS[p.type]?.slice(0,3)}</span>
                    </div>
                    <p className="text-[10px] text-text-dim truncate">{p.object}</p>
                  </div>
                  <ChevronRight size={14} className="text-text-dim group-hover:text-primary transition-all opacity-50 group-hover:opacity-100" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}