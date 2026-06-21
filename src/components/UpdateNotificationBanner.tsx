import React from 'react';
import { usePWAUpdate } from '../hooks/usePWAUpdate';
import { RefreshCw, X } from 'lucide-react';

export default function UpdateNotificationBanner() {
  const { needRefresh, triggerUpdate, closeUpdate } = usePWAUpdate();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-[#6B3A44] text-[#FAF6F6] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-[9999] max-w-[90vw] animate-in slide-in-from-bottom-5">
      <div className="flex-1 text-sm font-medium">
        <span className="font-semibold flex items-center gap-2 mb-1">
          <RefreshCw className="w-4 h-4 animate-spin-slow" />
          Versi aplikasi baru tersedia
        </span>
        Selesaikan transaksi Anda terlebih dahulu, lalu klik [Perbarui Aplikasi] untuk menerapkan.
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={triggerUpdate}
          className="bg-[#D98897] hover:bg-[#D98897]/90 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-md transition-colors whitespace-nowrap"
        >
          Perbarui Aplikasi
        </button>
        <button
          onClick={closeUpdate}
          className="p-2 hover:bg-black/20 rounded-full transition-colors"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
