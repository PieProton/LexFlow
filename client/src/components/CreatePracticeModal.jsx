import React, { useState } from 'react';
import { 
  X, User, Building, Scale, Hash, Save, FileText, Plus, FilePlus, AlertCircle 
} from 'lucide-react';

// Mappa dei colori dinamici per materia (Premium Glow Style)
const MATERIA_COLORS = {
  civile: 'bg-blue-500/10 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]',
  penale: 'bg-red-500/10 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
  lavoro: 'bg-orange-500/10 text-orange-400 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
  amm: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
  stra: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)]',
};

export default function CreatePracticeModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    client: '',
    object: '',
    type: 'civile',
    counterparty: '',
    court: '',
    code: '',
    description: '',
    status: 'active',
    attachments: [] // Stato per i file PDF
  });

  const [errors, setErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.client.trim()) newErrors.client = 'Il cliente è obbligatorio';
    if (!formData.object.trim()) newErrors.object = 'L\'oggetto è obbligatorio';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onSave({
      ...formData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  // Gestore caricamento file
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    setFormData({ ...formData, attachments: [...formData.attachments, ...files] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in">
      <div className="bg-[#0f1016] border border-white/10 rounded-[32px] w-full max-w-2xl shadow-3xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-white/5 to-transparent">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
              <Plus size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">Nuovo Fascicolo</h2>
              <p className="text-text-dim text-xs uppercase tracking-widest font-medium opacity-60">Configurazione Pratica Digitale</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-text-dim transition-all group">
            <X size={24} className="group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8">
          
          {/* Cliente */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1 flex items-center gap-2">
              <User size={12} /> Cliente / Assistito <span className="text-primary">*</span>
            </label>
            <div className="relative group">
              <input
                className={`input-field pl-5 w-full bg-white/5 border-white/10 focus:border-primary/50 transition-all ${errors.client ? 'border-red-500/50 bg-red-500/5' : ''}`}
                placeholder="Inserisci il nome del cliente o della società..."
                value={formData.client}
                onChange={e => setFormData({...formData, client: e.target.value})}
              />
            </div>
            {errors.client && <p className="text-red-400 text-[10px] font-bold flex items-center gap-1 ml-1 mt-1 animate-pulse"><AlertCircle size={10}/> {errors.client}</p>}
          </div>

          {/* Materia con Pills Colorate */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Materia del Fascicolo</label>
            <div className="flex flex-wrap gap-2.5">
              {[
                { id: 'civile', label: 'Civile' },
                { id: 'penale', label: 'Penale' },
                { id: 'lavoro', label: 'Lavoro' },
                { id: 'amm', label: 'Amministrativo' },
                { id: 'stra', label: 'Stragiudiziale' }
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: m.id })}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border uppercase tracking-wider ${
                    formData.type === m.id
                      ? `${MATERIA_COLORS[m.id]} scale-105 ring-2 ring-white/5`
                      : 'bg-white/5 border-white/10 text-text-dim hover:bg-white/10 hover:border-white/20'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Oggetto */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Oggetto della Pratica *</label>
            <input
              className={`input-field w-full bg-white/5 border-white/10 ${errors.object ? 'border-red-500/50 bg-red-500/5' : ''}`}
              placeholder="Es. Recupero crediti o Descrizione sommaria..."
              value={formData.object}
              onChange={e => setFormData({...formData, object: e.target.value})}
            />
            {errors.object && <p className="text-red-400 text-[10px] font-bold flex items-center gap-1 ml-1 animate-pulse"><AlertCircle size={10}/> {errors.object}</p>}
          </div>

          {/* Grid Dati Tecnici */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Controparte</label>
              <div className="relative group">
                <Scale className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={16} />
                <input
                  className="input-field pl-12 w-full bg-white/5 border-white/10"
                  placeholder="Parte avversa..."
                  value={formData.counterparty}
                  onChange={e => setFormData({...formData, counterparty: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Autorità / Tribunale</label>
              <div className="relative group">
                <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={16} />
                <input
                  className="input-field pl-12 w-full bg-white/5 border-white/10"
                  placeholder="Sede o Giudice..."
                  value={formData.court}
                  onChange={e => setFormData({...formData, court: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Riferimento (RG / Rif. Interno)</label>
              <div className="relative group">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={16} />
                <input
                  className="input-field pl-12 w-full font-mono text-sm bg-white/5 border-white/10 tracking-widest"
                  placeholder="Es. 4567/2026"
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Caricamento PDF (Nuova Sezione richiesta) */}
          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1 flex items-center gap-2">
              <FileText size={12} /> Documenti Allegati (PDF)
            </label>
            <div 
              className="border-2 border-dashed border-white/10 rounded-[24px] p-8 flex flex-col items-center justify-center gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group relative"
              onClick={() => document.getElementById('pdf-upload').click()}
            >
              <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <FilePlus size={28} className="text-text-dim group-hover:text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-white">Carica documenti PDF</p>
                <p className="text-[10px] text-text-dim mt-1 opacity-60 italic">I file verranno cifrati nel vault</p>
              </div>
              <input 
                id="pdf-upload"
                type="file" 
                multiple 
                accept=".pdf" 
                className="hidden" 
                onChange={handleFileChange} 
              />
              
              {/* Visualizzazione file pronti */}
              {formData.attachments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {formData.attachments.map((f, i) => (
                    <span key={i} className="px-3 py-1 bg-primary text-[9px] font-bold rounded-lg text-white uppercase tracking-tighter">
                      {f.name.substring(0, 15)}...
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px] ml-1">Note / Strategia</label>
            <textarea
              className="input-field w-full min-h-[120px] py-4 px-5 resize-none bg-white/5 border-white/10 focus:bg-white/10 transition-all"
              placeholder="Annotazioni libere..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-white/5 bg-[#14151d] flex justify-end gap-4">
          <button 
            onClick={onClose} 
            className="px-6 py-3 rounded-2xl text-text-dim hover:text-white hover:bg-white/5 transition-all text-xs font-bold uppercase tracking-widest"
          >
            Annulla
          </button>
          <button 
            onClick={handleSubmit} 
            className="btn-primary px-10 py-3 flex items-center gap-3 shadow-xl shadow-primary/20 hover:scale-[1.05] active:scale-[0.98] transition-all"
          >
            <Save size={18} />
            <span className="font-black uppercase tracking-widest text-xs">Salva Fascicolo</span>
          </button>
        </div>
      </div>
    </div>
  );
}