import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  ChevronRight, 
  Briefcase, 
  Archive,
  CheckCircle2,
  Filter,
  Tag
} from 'lucide-react';

// Mappa dei colori e stili per ogni materia (Premium Design)
const SUBJECT_STYLES = {
  civile: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Civile' },
  penale: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Penale' },
  lavoro: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', label: 'Lavoro' },
  amm: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Amministrativo' },
  stra: { color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Stragiudiziale' },
  default: { color: 'text-text-dim', bg: 'bg-white/5', border: 'border-white/10', label: 'Altro' }
};

export default function PracticesList({ practices = [], onSelect, onNewPractice }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const safePractices = useMemo(() => Array.isArray(practices) ? practices : [], [practices]);

  const types = [
    { id: 'all', label: 'Tutte le materie' },
    { id: 'civile', label: 'Civile' },
    { id: 'penale', label: 'Penale' },
    { id: 'lavoro', label: 'Lavoro' },
    { id: 'amm', label: 'Amministrativo' },
    { id: 'stra', label: 'Stragiudiziale' },
  ];

  const stats = useMemo(() => ({
    total: safePractices.length,
    active: safePractices.filter(p => p?.status === 'active').length,
    closed: safePractices.filter(p => p?.status === 'closed').length,
  }), [safePractices]);

  const filteredPractices = useMemo(() => {
    return safePractices.filter(p => {
      if (!p) return false;
      const matchesSearch = 
        (p.client?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.object?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.code?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
      const matchesType = filterType === 'all' || p.type === filterType;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [safePractices, searchTerm, filterStatus, filterType]);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header & Main Action */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-white tracking-tight">Fascicoli</h1>
          <p className="text-text-dim text-sm uppercase tracking-[2px] font-medium opacity-60">Gestione Archivio Digitale</p>
        </div>
        <button 
          onClick={() => typeof onNewPractice === 'function' && onNewPractice()} 
          className="btn-primary flex items-center gap-3 px-8 py-4 shadow-2xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Plus size={22} strokeWidth={3} />
          <span className="font-bold uppercase tracking-widest text-xs">Nuovo Fascicolo</span>
        </button>
      </div>

      {/* Stats Bar con indicatori di colore */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 flex items-center gap-5 border border-white/5">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-text-primary">
            <Briefcase size={24} />
          </div>
          <div>
            <div className="text-3xl font-black text-white leading-none mb-1">{stats.total}</div>
            <div className="text-[10px] text-text-dim uppercase tracking-[2px] font-bold">Totali</div>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-5 border-l-4 border-l-primary border-y-white/5 border-r-white/5 shadow-xl shadow-primary/5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="text-3xl font-black text-white leading-none mb-1">{stats.active}</div>
            <div className="text-[10px] text-primary uppercase tracking-[2px] font-bold">Attivi</div>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-5 border-l-4 border-l-white/20 border-y-white/5 border-r-white/5">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-text-dim">
            <Archive size={24} />
          </div>
          <div>
            <div className="text-3xl font-black text-white leading-none mb-1">{stats.closed}</div>
            <div className="text-[10px] text-text-dim uppercase tracking-[2px] font-bold">Chiusi</div>
          </div>
        </div>
      </div>

      {/* Toolbar dei Filtri (Migliorata nello spacing) */}
      <div className="bg-white/5 p-2 rounded-[24px] border border-white/10 flex flex-col lg:flex-row items-center gap-2">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={20} />
          <input 
            type="text" 
            placeholder="Cerca per cliente, oggetto, RG..."
            className="w-full pl-14 pr-6 py-4 bg-transparent border-none focus:ring-0 text-sm text-white placeholder:text-white/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full lg:w-auto p-2 lg:p-0 border-t lg:border-t-0 lg:border-l border-white/10">
          <div className="flex items-center gap-4 px-4 h-10">
            <Filter size={14} className="text-text-dim opacity-50" />
            
            {/* Selettore Stato */}
            <select 
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-[2px] text-text-primary focus:ring-0 cursor-pointer hover:text-primary transition-colors p-0"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all" className="bg-[#10111a]">Stato: Tutti</option>
              <option value="active" className="bg-[#10111a]">Solo Attivi</option>
              <option value="closed" className="bg-[#10111a]">Solo Chiusi</option>
            </select>

            <div className="w-[1px] h-4 bg-white/10" />

            {/* Selettore Materia */}
            <select 
              className="bg-transparent border-none text-[10px] font-black uppercase tracking-[2px] text-text-primary focus:ring-0 cursor-pointer hover:text-primary transition-colors p-0"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              {types.map(t => (
                <option key={t.id} value={t.id} className="bg-[#10111a]">{t.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista Fascicoli */}
      <div className="space-y-4">
        {filteredPractices.length > 0 ? (
          filteredPractices.map((p) => {
            const style = SUBJECT_STYLES[p.type] || SUBJECT_STYLES.default;
            return (
              <div 
                key={p?.id || Math.random()}
                onClick={() => typeof onSelect === 'function' && onSelect(p.id)}
                className="glass-card p-6 flex items-center justify-between group hover:bg-white/5 hover:border-white/20 transition-all cursor-pointer border border-white/5 relative overflow-hidden"
              >
                {/* Indicatore laterale colorato per materia */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.bg.replace('/10', '')}`} />

                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className={`w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all group-hover:scale-110 ${style.bg} ${style.color}`}>
                    <Briefcase size={26} />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 flex-1 min-w-0">
                    <div className="space-y-1 overflow-hidden">
                      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest opacity-50">Cliente</div>
                      <div className="text-base font-bold text-white truncate">{p?.client || 'N/D'}</div>
                    </div>
                    
                    <div className="space-y-1 overflow-hidden">
                      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest opacity-50">Materia</div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${style.bg.replace('/10', '')}`} />
                        <div className={`text-xs font-bold uppercase tracking-wider ${style.color}`}>{style.label}</div>
                      </div>
                    </div>

                    <div className="space-y-1 overflow-hidden">
                      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest opacity-50">Riferimento</div>
                      <div className="text-xs font-mono text-text-primary tracking-widest">{p?.code || '---'}</div>
                    </div>

                    <div className="hidden lg:flex flex-col justify-center items-end pr-4">
                      <div className={`text-[9px] px-3 py-1 rounded-full font-black uppercase tracking-widest border ${p?.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-white/5 text-text-dim border-white/10'}`}>
                        {p?.status === 'active' ? 'Attivo' : 'Archiviato'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                   <ChevronRight className="text-text-dim group-hover:text-primary group-hover:translate-x-1 transition-all" size={24} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="glass-card p-24 flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-white/10">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-text-dim/20">
              <Search size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Nessun fascicolo trovato</h3>
              <p className="text-text-muted text-sm max-w-xs mx-auto">Affina i filtri di ricerca o crea una nuova pratica digitale per iniziare.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}