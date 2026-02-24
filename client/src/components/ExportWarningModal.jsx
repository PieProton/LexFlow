import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

/**
 * ExportWarningModal
 *
 * Shown before any PDF export to inform the user that the generated file
 * will be stored unencrypted on disk and may be indexed by the OS.
 * Satisfies the legal/professional duty-of-care requirement to document
 * that the user was warned before unencrypted data left the vault.
 *
 * Props:
 *   isOpen    – boolean: controls visibility
 *   onClose   – fn(): called when the user cancels
 *   onConfirm – fn(): called when the user confirms and export should proceed
 */
export default function ExportWarningModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    /* Backdrop — clicking outside cancels */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-[520px] mx-4 rounded-2xl border border-white/10 bg-[#14151f] shadow-2xl animate-fade-in">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-dim hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Annulla"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-white/[0.07]">
          <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <ShieldAlert size={20} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-tight">
              Avviso di Sicurezza — Esportazione Documento
            </h2>
            <p className="text-xs text-text-dim mt-1">
              Leggere prima di procedere
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-3 text-sm text-text-muted leading-relaxed">
          <p>
            Il documento PDF che stai per generare verrà salvato <span className="text-white font-medium">in chiaro</span> sul disco.
            Una volta esportato, il file non sarà più protetto dalla crittografia isolata di LexFlow.
          </p>
          <p>
            Al fine di preservare il segreto professionale e la conformità normativa, si raccomanda di salvare
            il documento esclusivamente su volumi protetti da crittografia di sistema
            (<span className="text-text-subtle font-medium">Windows BitLocker</span> o{' '}
            <span className="text-text-subtle font-medium">macOS FileVault</span>).
          </p>
          <p>
            Evitare il salvataggio su cartelle cloud sincronizzate non sicure, desktop condivisi o
            dispositivi di archiviazione rimovibili non cifrati.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-text-dim border border-white/10 hover:bg-white/[0.06] hover:text-white transition-all"
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-primary text-white hover:brightness-110 transition-all"
          >
            Comprendo — Procedi con l'esportazione
          </button>
        </div>
      </div>
    </div>
  );
}
