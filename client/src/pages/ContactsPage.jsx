import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, Search, User, Scale, Briefcase, Building, Gavel, UserCheck, Edit3, Trash2, X, Check, Phone, Mail, MapPin, Hash, ChevronRight, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import * as api from '../tauri-api';

function genId() { return 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const CONTACT_TYPES = [
  { id: 'client', label: 'Cliente', icon: User, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'counterparty', label: 'Controparte', icon: Scale, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  { id: 'opposing_counsel', label: 'Avv. Controparte', icon: UserCheck, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { id: 'judge', label: 'Giudice', icon: Gavel, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  { id: 'consultant', label: 'Consulente', icon: Briefcase, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  { id: 'other', label: 'Altro', icon: Users, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
];

const TYPE_MAP = Object.fromEntries(CONTACT_TYPES.map(t => [t.id, t]));

export default function ContactsPage({ practices, onSelectPractice }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.loadContacts();
        setContacts(data || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const saveContacts = useCallback(async (newContacts) => {
    setContacts(newContacts);
    try { await api.saveContacts(newContacts); } catch (e) { console.error(e); toast.error('Errore salvataggio'); }
  }, []);

  const deleteContact = async (id) => {
    await saveContacts(contacts.filter(c => c.id !== id));
    if (selectedContact?.id === id) setSelectedContact(null);
    toast.success('Contatto eliminato');
  };

  // Filter + search
  const filtered = useMemo(() => {
    let list = contacts;
    if (filterType !== 'all') list = list.filter(c => c.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.pec || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.fiscalCode || '').toLowerCase().includes(q) ||
        (c.vatNumber || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [contacts, filterType, searchQuery]);

  // Find practices linked to a contact
  const getLinkedPractices = useCallback((contactId) => {
    return (practices || []).filter(p => {
      if (p.clientId === contactId || p.counterpartyId === contactId || p.opposingCounselId === contactId || p.judgeId === contactId) return true;
      if (p.roles && p.roles.some(r => r.contactId === contactId)) return true;
      return false;
    });
  }, [practices]);

  const typeCounts = useMemo(() => {
    const counts = { all: contacts.length };
    CONTACT_TYPES.forEach(t => { counts[t.id] = contacts.filter(c => c.type === t.id).length; });
    return counts;
  }, [contacts]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-violet-500/10 rounded-2xl flex items-center justify-center border border-violet-500/20">
            <Users size={28} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Anagrafica Contatti</h1>
            <p className="text-text-dim text-sm mt-0.5">{contacts.length} contatti registrati</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm font-bold">
          <Plus size={16} /> Nuovo Contatto
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca per nome, email, CF, P.IVA..."
            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-text-dim/50 focus:border-primary/50 outline-none"
          />
        </div>
        {/* Type filter pills — scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button onClick={() => setFilterType('all')}
            className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${filterType === 'all' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white/5 text-text-dim border-white/10 hover:bg-white/10'}`}>
            Tutti ({typeCounts.all})
          </button>
          {CONTACT_TYPES.map(t => (
            <button key={t.id} onClick={() => setFilterType(t.id)}
              className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${filterType === t.id ? `${t.color}` : 'bg-white/5 text-text-dim border-white/10 hover:bg-white/10'}`}>
              {t.label} ({typeCounts[t.id] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Main Layout: List + Detail */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Contact List */}
        <div className={`space-y-1.5 ${selectedContact ? 'lg:w-1/2' : 'w-full'} transition-all`}>
          {filtered.length === 0 ? (
            <div className="text-center py-12 opacity-40">
              <Users size={40} className="mx-auto mb-3 text-text-dim" />
              <p className="text-text-dim text-sm">
                {searchQuery ? 'Nessun risultato' : 'Nessun contatto registrato'}
              </p>
            </div>
          ) : (
            filtered.map(c => {
              const typeInfo = TYPE_MAP[c.type] || TYPE_MAP.other;
              const TypeIcon = typeInfo.icon;
              const isSelected = selectedContact?.id === c.id;
              const linkedCount = getLinkedPractices(c.id).length;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all group active:scale-[0.99] ${
                    isSelected ? 'bg-primary/10 border border-primary/30' : 'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${typeInfo.color}`}>
                    <TypeIcon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{c.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-text-dim">{typeInfo.label}</span>
                      {linkedCount > 0 && (
                        <span className="text-[9px] text-text-muted">• {linkedCount} fascicoli</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-text-dim group-hover:text-primary transition-colors flex-shrink-0" />
                </div>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        {selectedContact && (
          <div className="lg:w-1/2 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 space-y-5 animate-fade-in self-start lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const typeInfo = TYPE_MAP[selectedContact.type] || TYPE_MAP.other;
                  const TypeIcon = typeInfo.icon;
                  return (
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${typeInfo.color}`}>
                      <TypeIcon size={22} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedContact.name}</h3>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${(TYPE_MAP[selectedContact.type] || TYPE_MAP.other).color.split(' ')[0]}`}>
                    {(TYPE_MAP[selectedContact.type] || TYPE_MAP.other).label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditingContact({ ...selectedContact })} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <Edit3 size={16} className="text-text-dim" />
                </button>
                <button onClick={() => deleteContact(selectedContact.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-all">
                  <Trash2 size={16} className="text-red-400" />
                </button>
                <button onClick={() => setSelectedContact(null)} className="p-2 hover:bg-white/10 rounded-lg transition-all lg:hidden">
                  <X size={16} className="text-text-dim" />
                </button>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              {selectedContact.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white">{selectedContact.email}</span>
                </div>
              )}
              {selectedContact.pec && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail size={14} className="text-primary flex-shrink-0" />
                  <span className="text-white">PEC: {selectedContact.pec}</span>
                </div>
              )}
              {selectedContact.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white">{selectedContact.phone}</span>
                </div>
              )}
              {selectedContact.address && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white">{selectedContact.address}</span>
                </div>
              )}
              {selectedContact.fiscalCode && (
                <div className="flex items-center gap-3 text-sm">
                  <Hash size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white font-mono text-xs">{selectedContact.fiscalCode}</span>
                </div>
              )}
              {selectedContact.vatNumber && (
                <div className="flex items-center gap-3 text-sm">
                  <Building size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white font-mono text-xs">P.IVA {selectedContact.vatNumber}</span>
                </div>
              )}
              {selectedContact.barAssociation && (
                <div className="flex items-center gap-3 text-sm">
                  <Scale size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white text-xs">{selectedContact.barAssociation}</span>
                </div>
              )}
              {selectedContact.court && (
                <div className="flex items-center gap-3 text-sm">
                  <Gavel size={14} className="text-text-dim flex-shrink-0" />
                  <span className="text-white text-xs">{selectedContact.court}</span>
                </div>
              )}
              {selectedContact.notes && (
                <p className="text-text-dim text-xs mt-2 italic border-l-2 border-white/10 pl-3">{selectedContact.notes}</p>
              )}
            </div>

            {/* Linked Practices */}
            {(() => {
              const linked = getLinkedPractices(selectedContact.id);
              if (linked.length === 0) return null;
              return (
                <div className="space-y-2 pt-2">
                  <h4 className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Fascicoli Collegati ({linked.length})</h4>
                  <div className="space-y-1.5">
                    {linked.map(p => (
                      <div key={p.id} onClick={() => onSelectPractice?.(p.id)}
                        className="flex items-center gap-3 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl cursor-pointer transition-all group active:scale-[0.98]">
                        <Briefcase size={14} className="text-text-dim flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm truncate group-hover:text-primary transition-colors">{p.client} — {p.object}</p>
                        </div>
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${p.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                          {p.status === 'active' ? 'Attivo' : 'Chiuso'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editingContact) && (
        <ContactModal
          initial={editingContact}
          onSave={async (contact) => {
            if (editingContact) {
              await saveContacts(contacts.map(c => c.id === contact.id ? contact : c));
              setEditingContact(null);
              setSelectedContact(contact);
              toast.success('Contatto aggiornato');
            } else {
              await saveContacts([contact, ...contacts]);
              setShowCreate(false);
              toast.success('Contatto aggiunto');
            }
          }}
          onClose={() => { setShowCreate(false); setEditingContact(null); }}
        />
      )}
    </div>
  );
}

/* ──── Contact Create/Edit Modal ──── */
function ContactModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || {
    id: genId(),
    type: 'client',
    name: '',
    fiscalCode: '',
    vatNumber: '',
    phone: '',
    email: '',
    pec: '',
    address: '',
    barAssociation: '',
    court: '',
    notes: '',
  });

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Il nome è obbligatorio');
      return;
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-[#0f1016] border border-white/10 rounded-2xl w-full max-w-lg shadow-3xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{initial ? 'Modifica Contatto' : 'Nuovo Contatto'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} className="text-text-dim" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Type pills */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Tipo</label>
            <div className="flex flex-wrap gap-2">
              {CONTACT_TYPES.map(t => (
                <button key={t.id} onClick={() => setForm({ ...form, type: t.id })}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${form.type === t.id ? t.color : 'bg-white/5 text-text-dim border-white/10 hover:bg-white/10'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Nome / Ragione Sociale *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nome completo o ragione sociale"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/50 focus:border-primary/50 outline-none" autoFocus />
          </div>

          {/* CF + P.IVA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Codice Fiscale</label>
              <input value={form.fiscalCode || ''} onChange={e => setForm({ ...form, fiscalCode: e.target.value.toUpperCase() })}
                placeholder="RSSMRA80A01H501Z" maxLength={16}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">P.IVA</label>
              <input value={form.vatNumber || ''} onChange={e => setForm({ ...form, vatNumber: e.target.value })}
                placeholder="01234567890" maxLength={11}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Telefono</label>
              <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+39 333 1234567" type="tel"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Email</label>
              <input value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="email@esempio.it" type="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
          </div>

          {/* PEC (important for lawyers) */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">PEC</label>
            <input value={form.pec || ''} onChange={e => setForm({ ...form, pec: e.target.value })}
              placeholder="nome@pec-avvocati.it" type="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Indirizzo</label>
            <input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })}
              placeholder="Via Roma 1, 00100 Roma (RM)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
          </div>

          {/* Conditional fields based on type */}
          {(form.type === 'opposing_counsel' || form.type === 'consultant') && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Ordine / Albo</label>
              <input value={form.barAssociation || ''} onChange={e => setForm({ ...form, barAssociation: e.target.value })}
                placeholder="Ordine Avvocati di Roma"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
          )}

          {form.type === 'judge' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Tribunale / Sezione</label>
              <input value={form.court || ''} onChange={e => setForm({ ...form, court: e.target.value })}
                placeholder="Tribunale di Milano, Sez. III"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Note</label>
            <textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Annotazioni libere..." rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-text-dim hover:text-white hover:bg-white/5 rounded-xl text-sm font-bold transition-all">Annulla</button>
          <button onClick={handleSubmit} className="btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2">
            <Check size={16} /> {initial ? 'Aggiorna' : 'Salva Contatto'}
          </button>
        </div>
      </div>
    </div>
  );
}
