import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Briefcase, Calendar, CheckSquare, ChevronRight } from 'lucide-react';
import CreatePracticeModal from '../components/CreatePracticeModal';

// Hook per ottimizzare la ricerca ed evitare ricalcoli inutili
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

const TYPE_LABELS = { civile: 'Civile', penale: 'Penale', amm: 'Amministrativo', stra: 'Stragiudiziale' };
const TYPE_BADGE = { 
  civile: 'bg-blue-500/10 text-blue-400 border-blue-500/20', 
  penale: 'bg-red-500/10 text-red-400 border-red-500/20', 
  amm: 'bg-purple-500/10 text-purple-400 border-purple-500/20', 
  stra: 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
};

// Componente per lo stato di caricamento (Skeleton)
const PracticeSkeleton = () => (
  <div className="glass-card p-5 border border-[#22263a] animate-pulse">
    <div className="flex items-center justify-between">
      <div className="space-y-3 flex-1">
        <div className="flex gap-2">
          <div className="h-5 bg-[#22263a] rounded w-1/4"></div>
          <div className="h-5 bg-[#22263a] rounded w-16"></div>
        </div>
        <div className="h-4 bg-[#22263a] rounded w-1/2"></div>
      </div>
      <div className="h-10 w-10 bg-[#22263a] rounded-xl"></div>
    </div>
  </div>
);

export default function PracticesList() {
  const [practices, setPractices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    // Caricamento dati dal database SQLite sicuro
    window.api.loadData().then(data => {
      setPractices(data || []);
      setIsLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    return practices.filter(p => {
      const q = debouncedSearch.toLowerCase();
      return (
        p.client?.toLowerCase().includes(q) || 
        p.object?.toLowerCase().includes(q) || 
        p.code?.toLowerCase().includes(q)
      );
    });
  }, [practices, debouncedSearch]);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-slide-up">
      {/* Header con Titolo e tasto Nuova Pratica */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Fascicoli</h1>
          <p className="text-text-muted text-sm mt-1">Gestisci l'archivio digitale delle tue pratiche</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)} 
          className="btn-primary flex items-center gap-2 px-5 py-2.5 shadow-xl shadow-primary/20"
        >
          <Plus size={20} /> <span className="font-semibold">Nuovo Fascicolo</span>
        </button>
      </div>

      {/* Barra di ricerca con effetto focus */}
      <div className="bg-[#13141e] p-4 rounded-xl border border-[#22263a] mb-8 shadow-inner">
        <div className="relative group">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" />
          <input
            className="w-full bg-[#0c0d14] border border-[#22263a] rounded-lg py-3 pl-12 pr-4 text-sm text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            placeholder="Cerca per cliente, oggetto, numero RG..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Rendering condizionale: Loading, Empty o List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <PracticeSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-[#13141e]/30 rounded-3xl border border-[#22263a] border-dashed">
          <Briefcase size={48} className="text-text-dim mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-white">Nessun fascicolo trovato</h3>
          <p className="text-text-muted text-sm mt-1">Prova a cambiare i termini di ricerca</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(p => (
            <div
              key={p.id}
              className="glass-card p-5 cursor-pointer border border-transparent hover:border-primary/40 hover:bg-[#1a1c28] transition-all duration-300 group relative overflow-hidden flex items-center gap-6"
            >
              {/* Icona Pratica */}
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20 group-hover:scale-110 transition-transform">
                <Briefcase size={24} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <h3 className="text-lg font-bold text-white truncate group-hover:text-primary transition-colors">
                    {p.client}
                  </h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold uppercase tracking-wider ${TYPE_BADGE[p.type] || TYPE_BADGE.civile}`}>
                    {TYPE_LABELS[p.type] || 'Generale'}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-text-muted">
                  <span className="truncate max-w-[300px]">{p.object}</span>
                  {p.code && <span className="font-mono text-xs bg-white/5 px-1.5 py-0.5 rounded">{p.code}</span>}
                </div>
              </div>

              {/* Info Secondarie e Azione */}
              <div className="flex items-center gap-6">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-[10px] uppercase text-text-dim font-bold tracking-widest mb-1">Data Creazione</span>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Calendar size={12} />
                    {new Date(p.createdAt).toLocaleDateString('it-IT')}
                  </div>
                </div>
                <ChevronRight className="text-text-dim group-hover:text-white transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal di creazione */}
      {isModalOpen && (
        <CreatePracticeModal 
          onClose={() => setIsModalOpen(false)} 
          onSave={async (newP) => {
            const updated = [...practices, newP];
            setPractices(updated);
            await window.api.saveData(updated);
          }} 
        />
      )}
    </div>
  );
}