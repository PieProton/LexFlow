import React, { useState, useEffect, useCallback } from 'react';
import { Receipt, Plus, Trash2, FileText, Download, Edit3, Check, X, ChevronRight, DollarSign, Printer, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as api from '../tauri-api';

function genId() { return 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// CPA 4% (Cassa Previdenza Avvocati) + IVA 22%
const CPA_RATE = 0.04;
const IVA_RATE = 0.22;

function calcTotals(items) {
  const subtotal = items.reduce((s, i) => s + (i.total || 0), 0);
  const cpa = subtotal * CPA_RATE;
  const ivaBase = subtotal + cpa;
  const iva = ivaBase * IVA_RATE;
  const total = ivaBase + iva;
  return { subtotal, cpa, iva, total };
}

const STATUS_LABELS = { draft: 'Bozza', sent: 'Inviata', paid: 'Pagata' };
const STATUS_COLORS = {
  draft: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  sent: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  paid: 'bg-green-500/10 text-green-400 border-green-500/30',
};

export default function BillingPage({ practices }) {
  const [invoices, setInvoices] = useState([]);
  const [timeLogs, setTimeLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [inv, tl] = await Promise.all([
          api.loadInvoices(),
          api.loadTimeLogs(),
        ]);
        setInvoices(inv || []);
        setTimeLogs(tl || []);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const saveInvoices = useCallback(async (newInvoices) => {
    setInvoices(newInvoices);
    try { await api.saveInvoices(newInvoices); } catch (e) { console.error(e); toast.error('Errore salvataggio'); }
  }, []);

  const deleteInvoice = async (id) => {
    await saveInvoices(invoices.filter(i => i.id !== id));
    toast.success('Nota eliminata');
  };

  const generatePDF = async (invoice) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFillColor(13, 14, 22);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setTextColor(128, 112, 208);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('LEXFLOW', 20, y + 4);
    doc.setTextColor(200, 200, 220);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Nota Pro-Forma', 20, y + 12);
    doc.setTextColor(180, 180, 200);
    doc.setFontSize(8);
    doc.text(`N. ${invoice.number}`, pageW - 20, y + 4, { align: 'right' });
    doc.text(`Data: ${new Date(invoice.date).toLocaleDateString('it-IT')}`, pageW - 20, y + 10, { align: 'right' });

    y = 50;

    // Client info
    doc.setTextColor(50, 50, 70);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Spett.le', 20, y);
    doc.setFontSize(13);
    doc.text(invoice.clientName || '-', 20, y + 7);
    if (invoice.clientFiscalCode) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`C.F.: ${invoice.clientFiscalCode}`, 20, y + 14);
    }

    y += 24;

    // Object
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 120);
    doc.text(`Oggetto: ${invoice.practiceObject || '-'}`, 20, y);
    y += 10;

    // Items table
    doc.autoTable({
      startY: y,
      head: [['Descrizione', 'Ore', 'Tariffa', 'Importo']],
      body: invoice.items.map(i => [
        i.description,
        i.hours.toFixed(1),
        `€ ${i.rate.toFixed(2)}`,
        `€ ${i.total.toFixed(2)}`,
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [128, 112, 208], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 250] },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 25, halign: 'right' },
      },
      margin: { left: 20, right: 20 },
    });

    y = doc.lastAutoTable.finalY + 8;

    // Totals
    const totals = calcTotals(invoice.items);
    const totalRows = [
      ['Subtotale Onorario', `€ ${totals.subtotal.toFixed(2)}`],
      ['CPA 4%', `€ ${totals.cpa.toFixed(2)}`],
      ['IVA 22%', `€ ${totals.iva.toFixed(2)}`],
      ['TOTALE', `€ ${totals.total.toFixed(2)}`],
    ];

    doc.autoTable({
      startY: y,
      body: totalRows,
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [80, 80, 100], halign: 'right', cellWidth: pageW - 80 },
        1: { fontStyle: 'bold', textColor: [30, 30, 50], halign: 'right', cellWidth: 40 },
      },
      margin: { left: 20, right: 20 },
      didParseCell: (data) => {
        if (data.row.index === 3) {
          data.cell.styles.fontSize = 12;
          data.cell.styles.textColor = [128, 112, 208];
        }
      },
    });

    // Footer
    y = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 170);
    doc.text('Documento generato automaticamente da LexFlow — Nota pro-forma, non costituisce fattura ai fini fiscali.', 20, y);

    // Export
    const pdfArrayBuffer = doc.output('arraybuffer');
    const defaultName = `Nota_ProForma_${invoice.number.replace(/\//g, '-')}.pdf`;
    try {
      await api.exportPDF(pdfArrayBuffer, defaultName);
      toast.success('PDF esportato');
    } catch (e) {
      // Fallback: download in browser
      const blob = new Blob([pdfArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = defaultName; a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF scaricato');
    }
  };

  const activePractices = (practices || []).filter(p => p.status === 'active');

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;

  // Stats
  const totalDraft = invoices.filter(i => i.status === 'draft').reduce((s, i) => s + calcTotals(i.items).total, 0);
  const totalSent = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + calcTotals(i.items).total, 0);
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + calcTotals(i.items).total, 0);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20">
            <Receipt size={28} className="text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Parcellazione</h1>
            <p className="text-text-dim text-sm mt-0.5">Note pro-forma e gestione onorari</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary px-5 py-2.5 flex items-center gap-2 text-sm font-bold">
          <Plus size={16} /> Nuova Nota
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400 font-mono">€{totalDraft.toFixed(0)}</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">In Bozza</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-400 font-mono">€{totalSent.toFixed(0)}</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Inviate</p>
        </div>
        <div className="bg-white/[0.04] border border-white/[0.08] rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-400 font-mono">€{totalPaid.toFixed(0)}</p>
          <p className="text-[10px] text-text-dim uppercase tracking-wider mt-1">Pagate</p>
        </div>
      </div>

      {/* Invoices List */}
      {invoices.length === 0 ? (
        <div className="text-center py-16 opacity-40">
          <Receipt size={48} className="mx-auto mb-4 text-text-dim" />
          <p className="text-text-dim text-sm">Nessuna nota pro-forma</p>
          <p className="text-text-dim text-xs mt-1">Crea la tua prima nota per un fascicolo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => {
            const totals = calcTotals(inv.items);
            return (
              <div key={inv.id} className="bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] rounded-xl p-4 transition-all group">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-white font-bold text-sm">N. {inv.number}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${STATUS_COLORS[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                      <span className="text-text-muted text-xs">{new Date(inv.date).toLocaleDateString('it-IT')}</span>
                    </div>
                    <p className="text-text-dim text-xs mt-1 truncate">{inv.clientName} — {inv.practiceObject}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-lg font-bold text-white font-mono">€{totals.total.toFixed(2)}</span>
                    <div className="flex items-center gap-1">
                      {/* Status cycle */}
                      <button onClick={async () => {
                        const nextStatus = inv.status === 'draft' ? 'sent' : inv.status === 'sent' ? 'paid' : 'draft';
                        await saveInvoices(invoices.map(i => i.id === inv.id ? { ...i, status: nextStatus } : i));
                      }} className="p-2 hover:bg-white/10 rounded-lg transition-all" title="Cambia stato">
                        <ChevronRight size={14} className="text-text-dim" />
                      </button>
                      <button onClick={() => generatePDF(inv)} className="p-2 hover:bg-white/10 rounded-lg transition-all" title="Esporta PDF">
                        <Download size={14} className="text-text-dim" />
                      </button>
                      <button onClick={() => setEditingInvoice({ ...inv, items: [...inv.items] })} className="p-2 hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Modifica">
                        <Edit3 size={14} className="text-text-dim" />
                      </button>
                      <button onClick={() => deleteInvoice(inv.id)} className="p-2 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Elimina">
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Invoice Modal */}
      {showCreate && (
        <InvoiceModal
          practices={activePractices}
          timeLogs={timeLogs}
          invoiceCount={invoices.length}
          onSave={async (inv) => { await saveInvoices([inv, ...invoices]); setShowCreate(false); toast.success('Nota creata'); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <InvoiceModal
          practices={activePractices}
          timeLogs={timeLogs}
          invoiceCount={invoices.length}
          editMode
          initial={editingInvoice}
          onSave={async (inv) => { await saveInvoices(invoices.map(i => i.id === inv.id ? inv : i)); setEditingInvoice(null); toast.success('Nota aggiornata'); }}
          onClose={() => setEditingInvoice(null)}
        />
      )}
    </div>
  );
}

/* ──── Invoice Create/Edit Modal ──── */
function InvoiceModal({ practices, timeLogs, invoiceCount, editMode, initial, onSave, onClose }) {
  const year = new Date().getFullYear();
  const [form, setForm] = useState(initial || {
    id: genId(),
    practiceId: practices[0]?.id || '',
    number: `${year}/${String(invoiceCount + 1).padStart(3, '0')}`,
    date: new Date().toISOString().slice(0, 10),
    clientName: practices[0]?.client || '',
    clientFiscalCode: '',
    practiceObject: practices[0]?.object || '',
    items: [],
    status: 'draft',
  });

  // Auto-populate items from time logs
  const populateFromTimeLogs = () => {
    const practiceTimeLogs = timeLogs.filter(l => l.practiceId === form.practiceId && l.billable);
    if (practiceTimeLogs.length === 0) {
      toast('Nessuna sessione fatturabile per questo fascicolo');
      return;
    }
    // Group by description
    const grouped = {};
    practiceTimeLogs.forEach(l => {
      const key = l.description || 'Attività generica';
      if (!grouped[key]) grouped[key] = { description: key, totalMin: 0, rate: l.hourlyRate || 150 };
      grouped[key].totalMin += l.durationMin || 0;
    });
    const items = Object.values(grouped).map(g => ({
      description: g.description,
      hours: Math.round(g.totalMin / 60 * 100) / 100,
      rate: g.rate,
      total: Math.round(g.totalMin / 60 * g.rate * 100) / 100,
    }));
    setForm(f => ({ ...f, items }));
    toast.success(`${items.length} voci importate dal time tracking`);
  };

  const updatePractice = (practiceId) => {
    const p = practices.find(pr => pr.id === practiceId);
    setForm(f => ({
      ...f,
      practiceId,
      clientName: p?.client || '',
      practiceObject: p?.object || '',
    }));
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'hours' || field === 'rate') {
      items[idx].total = Math.round(items[idx].hours * items[idx].rate * 100) / 100;
    }
    setForm(f => ({ ...f, items }));
  };

  const addItem = () => {
    setForm(f => ({
      ...f,
      items: [...f.items, { description: '', hours: 1, rate: 150, total: 150 }],
    }));
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const totals = calcTotals(form.items);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-fade-in" onClick={onClose}>
      <div className="bg-[#0f1016] border border-white/10 rounded-2xl w-full max-w-2xl shadow-3xl overflow-hidden flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">{editMode ? 'Modifica Nota' : 'Nuova Nota Pro-Forma'}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg"><X size={18} className="text-text-dim" /></button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Practice + Number + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2 sm:col-span-1">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Fascicolo</label>
              <select value={form.practiceId} onChange={e => updatePractice(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary/50 outline-none appearance-none">
                {practices.map(p => <option key={p.id} value={p.id}>{p.client}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Numero</label>
              <input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm font-mono focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Data</label>
              <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary/50 outline-none" />
            </div>
          </div>

          {/* Client Name + Fiscal Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">Intestatario</label>
              <input value={form.clientName} onChange={e => setForm({ ...form, clientName: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:border-primary/50 outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-text-dim uppercase tracking-[2px]">C.F. / P.IVA</label>
              <input value={form.clientFiscalCode || ''} onChange={e => setForm({ ...form, clientFiscalCode: e.target.value })}
                placeholder="Opzionale" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-text-dim/40 focus:border-primary/50 outline-none" />
            </div>
          </div>

          {/* Import from time tracking */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-text-dim uppercase tracking-[2px]">Voci</span>
            <div className="flex items-center gap-2">
              <button onClick={populateFromTimeLogs} className="text-xs text-primary hover:text-primary-hover font-bold flex items-center gap-1 transition-colors">
                <Clock size={12} /> Importa da Time Tracking
              </button>
              <button onClick={addItem} className="text-xs text-text-dim hover:text-white font-bold flex items-center gap-1 transition-colors">
                <Plus size={12} /> Aggiungi Voce
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            {form.items.map((item, idx) => (
              <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2">
                <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                  placeholder="Descrizione attività" className="w-full bg-transparent text-white text-sm placeholder:text-text-dim/40 outline-none" />
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <input type="number" step="0.25" value={item.hours} onChange={e => updateItem(idx, 'hours', Number(e.target.value))}
                      className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-mono text-center outline-none focus:border-primary/50" />
                    <span className="text-text-dim text-[10px]">ore</span>
                  </div>
                  <span className="text-text-dim text-xs">×</span>
                  <div className="flex items-center gap-1">
                    <span className="text-text-dim text-xs">€</span>
                    <input type="number" value={item.rate} onChange={e => updateItem(idx, 'rate', Number(e.target.value))}
                      className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-white text-xs font-mono text-center outline-none focus:border-primary/50" />
                  </div>
                  <span className="text-text-dim text-xs">=</span>
                  <span className="text-white font-mono text-sm font-bold flex-1 text-right">€{(item.total || 0).toFixed(2)}</span>
                  <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-500/10 rounded transition-all">
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
            {form.items.length === 0 && (
              <p className="text-text-dim text-xs text-center py-4 opacity-50">Nessuna voce. Aggiungi manualmente o importa dal time tracking.</p>
            )}
          </div>

          {/* Totals */}
          {form.items.length > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-text-dim">Subtotale</span><span className="text-white font-mono">€{totals.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-dim">CPA 4%</span><span className="text-white font-mono">€{totals.cpa.toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-text-dim">IVA 22%</span><span className="text-white font-mono">€{totals.iva.toFixed(2)}</span></div>
              <div className="border-t border-white/10 pt-2 mt-2 flex justify-between text-lg">
                <span className="text-white font-bold">Totale</span>
                <span className="text-primary font-bold font-mono">€{totals.total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 text-text-dim hover:text-white hover:bg-white/5 rounded-xl text-sm font-bold transition-all">Annulla</button>
          <button onClick={() => { const t = calcTotals(form.items); onSave({ ...form, subtotal: t.subtotal, cpa: t.cpa, iva: t.iva, grandTotal: t.total }); }} disabled={form.items.length === 0}
            className="btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2 disabled:opacity-40">
            <Check size={16} /> {editMode ? 'Aggiorna' : 'Salva Nota'}
          </button>
        </div>
      </div>
    </div>
  );
}
