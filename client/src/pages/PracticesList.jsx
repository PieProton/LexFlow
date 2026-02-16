import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Briefcase, Calendar, CheckSquare } from 'lucide-react';

// --- UTILS: Debounce Hook per le prestazioni ---
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const TYPE_LABELS = { civile: 'Civile', penale: 'Penale', amm: 'Amministrativo', stra: 'Stragiudiziale' };
const TYPE_BADGE = { civile: 'badge-civile', penale: 'badge-penale', amm: 'badge-amm', stra: 'badge-stra' };

// --- COMPONENT: Skeleton Loader (Miglior UX) ---
const PracticeSkeleton = () => (
  <div className="glass-card p-4 border border-[#22263a] animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-2 flex-1">
        <div className="flex gap-2">
          <div className="h-4 bg-[#22263a] rounded w-1/3"></div>
          <div className="h-4 bg-[#22263a] rounded w-16"></div>
        </div>
        <div className="h-3 bg-[#22263a] rounded w-1/2"></div>
      </div>
      <div className="h-8 w-8 bg-[#22263a] rounded-full"></div>
    </div>
  </div>
);

export default function PracticesList({ practices, onSelect, onNewPractice, isLoading = false }) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Ottimizzazione: Filtra solo dopo 300ms che l'utente ha smesso di digitare
  const debouncedSearch = useDebounce(search, 300);

  // Ottimizzazione: Calcola i filtri solo se cambiano le dipendenze
  const filtered = useMemo(() => {
    return practices.filter(p => {
      if (filterType !== 'all' && p.type !== filterType) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        return (
          p.client?.toLowerCase().includes(q) ||
          p.counterparty?.toLowerCase().includes(q) ||
          p.object?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q) ||
          p.court?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [practices, filterType, filterStatus, debouncedSearch]);

  const getMetadata = (p) => {
    const pending = (p.tasks || []).filter(t => !t.done).length;
    const today = new Date();
    today.setHours(0,0,0,0);
    const upcoming = (p.deadlines || [])
      .map(d => ({ ...d, dateObj: new Date(d.date) }))
      .filter(d => d.dateObj >= today)
      .sort((a, b) => a.dateObj - b.dateObj)[0];
    return { pending, nextDeadline: upcoming };
  };

  return (
    <div className="main-content animate-slide-up pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Fascicoli</h1>
          <p className="text-text-muted text-sm mt-1">
            Gestisci {practices.length} fascicol{practices.length === 1 ? 'o' : 'i'} in totale
          </p>
        </div>
        <button 
          className="btn-primary flex items-center gap-2 px-4 py-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all" 
          onClick={onNewPractice}
        >
          <Plus size={18} /> <span>Nuovo Fascicolo</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#13141e] p-3 rounded-xl border border-[#22263a] flex flex-col md:flex-row gap-3 mb-6 shadow-sm">
        <div className="relative flex-1 group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" />
          <input
            className="w-full bg-[#0c0d14] border border-[#22263a] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-text-dim/50"
            placeholder="Cerca cliente, controparte, RG..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <select
            className="bg-[#0c0d14] border border-[#22263a] rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none cursor-pointer hover:bg-[#1a1c28] transition-colors"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
          >
            <option value="all">Tutti i tipi</option>
            <option value="civile">Civile</option>
            <option value="penale">Penale</option>
            <option value="amm">Amministrativo</option>
            <option value="stra">Stragiudiziale</option>
          </select>
          <select
            className="bg-[#0c0d14] border border-[#22263a] rounded-lg px-3 py-2 text-sm text-white focus:border-primary outline-none cursor-pointer hover:bg-[#1a1c28] transition-colors"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="all">Stato: Tutti</option>
            <option value="active">Attivi</option>
            <option value="closed">Chiusi</option>
          </select>
        </div>
      </div>

      {/* List Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <PracticeSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-[#13141e]/50 rounded-2xl border border-[#22263a] border-dashed">
          <div className="w-16 h-16 bg-[#22263a] rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase size={32} className="text-text-dim" />
          </div>
          <h3 className="text-lg font-medium text-white mb-1">Nessun fascicolo trovato</h3>
          <p className="text-text-muted text-sm max-w-xs mx-auto mb-6">
            Non ci sono fascicoli che corrispondono ai tuoi criteri di ricerca.
          </p>
          {practices.length === 0 && (
            <button className="btn-primary text-sm" onClick={onNewPractice}>
              Crea il primo fascicolo
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(p => {
            const { pending, nextDeadline } = getMetadata(p);
            return (
              <div
                key={p.id}
                onClick={() => onSelect(p.id)}
                className="glass-card p-4 cursor-pointer border border-transparent hover:border-primary/30 hover:bg-[#1a1c28] transition-all duration-200 group relative overflow-hidden"
              >
                {/* Status Strip laterale */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${p.status === 'active' ? 'bg-primary' : 'bg-text-dim'}`} />
                
                <div className="flex items-start justify-between pl-3">
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <h3 className="text-base font-semibold text-white truncate group-hover:text-primary transition-colors">
                        {p.client}
                      </h3>
                      <span className={`badge text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${TYPE_BADGE[p.type]}`}>
                        {TYPE_LABELS[p.type]}
                      </span>
                    </div>
                    
                    <p className="text-sm text-text-muted truncate mb-2">{p.object}</p>
                    
                    <div className="flex items-center gap-3 text-xs text-text-dim">
                      {p.code && <span className="bg-[#22263a] px-1.5 py-0.5 rounded text-gray-400 font-mono">{p.code}</span>}
                      {p.court && <span>Trib. {p.court}</span>}
                      {p.counterparty && <span className="italic">vs {p.counterparty}</span>}
                    </div>
                  </div>

                  {/* Metadata Column */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                     {nextDeadline && (
                      <div className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-2 py-1 rounded border border-warning/20">
                        <Calendar size={12} />
                        <span>{new Date(nextDeadline.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}</span>
                      </div>
                    )}
                    {pending > 0 ? (
                      <div className="flex items-center gap-1.5 text-xs text-info bg-info/10 px-2 py-1 rounded border border-info/20">
                        <CheckSquare size={12} />
                        <span>{pending} da fare</span>
                      </div>
                    ) : (
                      <div className="text-[10px] text-green-500 flex items-center gap-1 opacity-60">
                         <CheckSquare size={10} /> Tutto fatto
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}