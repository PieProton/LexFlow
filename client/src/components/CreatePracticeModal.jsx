import React, { useState } from 'react';
import { X, Briefcase, User, Building, Scale, Hash, Save } from 'lucide-react';

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
    diary: [],
    tasks: [],
    deadlines: []
  });

  const [errors, setErrors] = useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Rimuovi errore se l'utente scrive
    if (errors[e.target.name]) {
      setErrors({ ...errors, [e.target.name]: null });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = {};
    if (!formData.client.trim()) newErrors.client = 'Il nome del cliente è obbligatorio';
    if (!formData.object.trim()) newErrors.object = 'L\'oggetto del fascicolo è obbligatorio';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-[#13141e] border border-[#22263a] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#22263a] flex items-center justify-between bg-[#1a1c28]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Briefcase className="text-primary" size={20} />
            Nuovo Fascicolo
          </h2>
          <button onClick={onClose} className="text-text-dim hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="create-practice-form" onSubmit={handleSubmit} className="space-y-5">
            
            {/* Row 1: Cliente & Tipo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Cliente / Assistito *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
                  <input
                    name="client"
                    className={`input-field pl-10 w-full ${errors.client ? 'border-red-500 focus:border-red-500' : ''}`}
                    placeholder="Es. Mario Rossi S.r.l."
                    value={formData.client}
                    onChange={handleChange}
                    autoFocus
                  />
                </div>
                {errors.client && <span className="text-xs text-red-400 mt-1 ml-1">{errors.client}</span>}
              </div>
              
              <div>
                <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Tipo Materia</label>
                <select
                  name="type"
                  className="input-field w-full appearance-none cursor-pointer"
                  value={formData.type}
                  onChange={handleChange}
                >
                  <option value="civile">Civile</option>
                  <option value="penale">Penale</option>
                  <option value="amm">Amministrativo</option>
                  <option value="stra">Stragiudiziale</option>
                </select>
              </div>
            </div>

            {/* Row 2: Oggetto */}
            <div>
              <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Oggetto della pratica *</label>
              <input
                name="object"
                className={`input-field w-full ${errors.object ? 'border-red-500 focus:border-red-500' : ''}`}
                placeholder="Es. Recupero crediti vs Azienda X"
                value={formData.object}
                onChange={handleChange}
              />
              {errors.object && <span className="text-xs text-red-400 mt-1 ml-1">{errors.object}</span>}
            </div>

            {/* Row 3: Dettagli Giuridici (Griglia) */}
            <div className="bg-[#0c0d14]/50 p-4 rounded-xl border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Controparte</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
                  <input
                    name="counterparty"
                    className="input-field pl-10 w-full"
                    placeholder="Nome avversario"
                    value={formData.counterparty}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Autorità / Tribunale</label>
                <div className="relative">
                  <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
                  <input
                    name="court"
                    className="input-field pl-10 w-full"
                    placeholder="Es. Trib. Milano"
                    value={formData.court}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Codice Riferimento / RG</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
                  <input
                    name="code"
                    className="input-field pl-10 w-full font-mono text-sm"
                    placeholder="Es. 12345/2024"
                    value={formData.code}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Descrizione Estesa */}
            <div>
              <label className="block text-xs font-bold text-text-dim uppercase mb-1.5 ml-1">Note / Descrizione</label>
              <textarea
                name="description"
                className="input-field w-full min-h-[100px] resize-none"
                placeholder="Dettagli aggiuntivi..."
                value={formData.description}
                onChange={handleChange}
              />
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#22263a] bg-[#1a1c28] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-text-muted hover:text-white hover:bg-white/5 transition-colors text-sm font-medium">
            Annulla
          </button>
          <button 
            type="submit" 
            form="create-practice-form"
            className="btn-primary px-6 py-2 flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Save size={18} />
            <span>Salva Fascicolo</span>
          </button>
        </div>

      </div>
    </div>
  );
}