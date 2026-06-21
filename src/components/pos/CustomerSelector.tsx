import React from 'react';
import { AlertCircle } from 'lucide-react';

interface CustomerSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  captureName: string;
  setCaptureName: (name: string) => void;
  captureWA: string;
  setCaptureWA: (wa: string) => void;
  captureError: string;
  handleSkipCapture: () => void;
  handleSaveCapture: () => void;
}

export default function CustomerSelector({
  isOpen,
  onClose,
  captureName,
  setCaptureName,
  captureWA,
  setCaptureWA,
  captureError,
  handleSkipCapture,
  handleSaveCapture,
}: CustomerSelectorProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#261C1D]/40 backdrop-blur-md" onClick={handleSkipCapture} />
      
      {/* Modal Container */}
      <div className="relative bg-white text-[#6B3A44] max-w-sm w-full rounded-3xl p-6 shadow-premium-lg border border-[#F5E1E4] anim-zoom-in space-y-4">
        
        {/* Title */}
        <div className="text-center">
          <h3 className="text-sm font-bold text-[#6B3A44]">Tautkan Pelanggan</h3>
          <p className="text-[10px] text-zinc-500 font-semibold mt-1">
            Simpan data pelanggan untuk akumulasi poin loyalitas transaksi ini.
          </p>
        </div>
        
        {/* Error Alert */}
        {captureError && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[#C85C5C] text-[10px] font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{captureError}</span>
          </div>
        )}

        {/* Form Inputs */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B3A44] block">Nama Pelanggan</label>
            <input
              type="text"
              id="capture-customer-name"
              value={captureName}
              onChange={(e) => setCaptureName(e.target.value)}
              placeholder="Masukkan nama pelanggan (opsional)"
              className="w-full bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:border-[#D98897]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#6B3A44] block">Nomor WhatsApp</label>
            <input
              type="tel"
              id="capture-customer-wa"
              value={captureWA}
              onChange={(e) => setCaptureWA(e.target.value)}
              placeholder="Contoh: 081234567890 (opsional)"
              className="w-full bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:border-[#D98897]"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            id="capture-skip-btn"
            onClick={handleSkipCapture}
            className="flex-1 py-3 text-xs font-bold uppercase tracking-wider text-[#6B3A44] hover:bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl transition-all cursor-pointer"
          >
            Lewati
          </button>
          <button
            type="button"
            id="capture-save-btn"
            onClick={handleSaveCapture}
            className="flex-1 py-3 text-xs font-bold uppercase tracking-wider text-white bg-[#D98897] hover:bg-[#c97887] rounded-xl shadow-premium-sm transition-all cursor-pointer"
          >
            Simpan
          </button>
        </div>

      </div>
    </div>
  );
}
