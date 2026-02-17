import React, { useState } from 'react';
import { X, Briefcase, User, Building, Scale, Hash, Save, FileText, Plus } from 'lucide-react';

export default function CreatePracticeModal({ onClose, onSave }) {
  const [formData, setFormData] = useState({
    client: '',
    object: '',
    type: 'civile',
    counterparty: '',
    court: '',
    code: '',
    description: '',
    status: 'active'
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

    // Generazione ID e data per il nuovo database SQLite
    onSave({
      ...formData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString()
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-[#13141e] border border-[#22263a] rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header con stile Premium */}
        <div className="px-8 py-6 border-b border-[#22263a] flex items-center justify-between bg-[#1a1c28]/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
              <Plus size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Nuovo Fascicolo</h2>
              <p className="text-text-dim text-xs">Inserisci i dettagli tecnici della pratica</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-text-dim transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* Corpo del Form con Scrollbar Personalizzata */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Cliente */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Cliente / Assistito *</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={18} />
                <input
                  className={`input-field pl-12 w-full ${errors.client ? 'border-red-500' : 'border-white/10'}`}
                  placeholder="Nome del cliente o società..."
                  value={formData.client}
                  onChange={e => setFormData({...formData, client: e.target.value})}
                />
              </div>
              {errors.client && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.client}</p>}
            </div>

            {/* Materia con Selettore Pills */}
            <div className="md:col-span-2 space-y-3">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest block ml-1">Materia del Fascicolo</label>
              <div className="flex flex-wrap gap-2">
                {['Civile', 'Penale', 'Lavoro', 'Amministrativo', 'Stragiudiziale'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: m.toLowerCase() })}
                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                      formData.type === m.toLowerCase()
                        ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-105'
                        : 'bg-white/5 border-white/10 text-text-muted hover:border-white/30 hover:text-text'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Oggetto */}
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Oggetto della Pratica *</label>
              <div className="relative group">
                <FileText className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={18} />
                <input
                  className={`input-field pl-12 w-full ${errors.object ? 'border-red-500' : 'border-white/10'}`}
                  placeholder="Es. Recupero crediti vs Società X..."
                  value={formData.object}
                  onChange={e => setFormData({...formData, object: e.target.value})}
                />
              </div>
              {errors.object && <p className="text-red-500 text-[10px] mt-1 ml-1">{errors.object}</p>}
            </div>

            {/* Controparte */}
            <div>
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Controparte</label>
              <div className="relative group">
                <Scale className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={18} />
                <input
                  className="input-field pl-12 w-full border-white/10"
                  placeholder="Parte avversa..."
                  value={formData.counterparty}
                  onChange={e => setFormData({...formData, counterparty: e.target.value})}
                />
              </div>
            </div>

            {/* Autorità */}
            <div>
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Autorità / Tribunale</label>
              <div className="relative group">
                <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={18} />
                <input
                  className="input-field pl-12 w-full border-white/10"
                  placeholder="Es. Trib. Milano - Sez. XI"
                  value={formData.court}
                  onChange={e => setFormData({...formData, court: e.target.value})}
                />
              </div>
            </div>

            {/* Numero RG */}
            <div>
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Numero RG / Rif.</label>
              <div className="relative group">
                <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim group-focus-within:text-primary transition-colors" size={18} />
                <input
                  className="input-field pl-12 w-full font-mono text-sm border-white/10"
                  placeholder="Es. 1234/2024"
                  value={formData.code}
                  onChange={e => setFormData({...formData, code: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[10px] font-bold text-text-dim uppercase tracking-widest mb-2 block ml-1">Note Aggiuntive</label>
            <textarea
              className="input-field w-full min-h-[100px] py-3 resize-none border-white/10"
              placeholder="Descrizione libera del fascicolo..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
            />
          </div>
        </div>

        {/* Footer con Azioni */}
        <div className="px-8 py-6 border-t border-[#22263a] bg-[#1a1c28]/50 flex justify-end gap-4">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 rounded-xl text-text-muted hover:text-white transition-colors text-sm font-semibold"
          >
            Annulla
          </button>
          <button 
            onClick={handleSubmit} 
            className="btn-primary px-8 py-2.5 flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-transform"
          >
            <Save size={20} />
            <span className="font-bold">Salva Fascicolo</span>
          </button>
        </div>
      </div>
    </div>
  );
}