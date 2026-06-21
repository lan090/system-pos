import React from 'react';
import { CheckCircle, FileText, AlertCircle } from 'lucide-react';
import { CartItem, Customer, Discount, CashShift } from '../../types';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeShift: CashShift | null;
  capturedCustomerName: string;
  activeCustomer: Customer;
  CHECKOUT_V2_ENABLED: boolean;
  paymentMethod: 'Cash' | 'QRIS' | 'Bank Transfer';
  isOnline: boolean;
  offlineVerificationMode: 'sender' | 'photo';
  senderName: string;
  cart: CartItem[];
  subtotal: number;
  discountAmount: number;
  activeDiscount: Discount | null;
  grandTotal: number;
  showVoidInput: boolean;
  setShowVoidInput: (show: boolean) => void;
  voidReason: string;
  setVoidReason: (reason: string) => void;
  handleVoidTransaction: () => void;
  isVoiding: boolean;
}

export default function ReceiptModal({
  isOpen,
  onClose,
  activeShift,
  capturedCustomerName,
  activeCustomer,
  CHECKOUT_V2_ENABLED,
  paymentMethod,
  isOnline,
  offlineVerificationMode,
  senderName,
  cart,
  subtotal,
  discountAmount,
  activeDiscount,
  grandTotal,
  showVoidInput,
  setShowVoidInput,
  voidReason,
  setVoidReason,
  handleVoidTransaction,
  isVoiding,
}: ReceiptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#261C1D]/40 backdrop-blur-md" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative bg-white text-[#6B3A44] max-w-sm w-full rounded-3xl p-6 shadow-premium-lg border border-[#F5E1E4] max-h-[90vh] overflow-y-auto anim-zoom-in">
        
        {/* Success Header */}
        <div className="flex flex-col items-center text-center">
          <CheckCircle className="text-[#4F8A6B] w-12 h-12 mb-3 animate-bounce" />
          <h3 className="text-base font-bold text-[#6B3A44]">Transaksi Sukses!</h3>
          <p className="text-[10px] text-zinc-500 font-semibold mt-1">
            {isOnline
              ? 'Struk dicetak & data disinkronkan langsung ke database cloud.'
              : 'Struk dicetak & data disimpan ke antrean lokal.'}
          </p>
        </div>

        {/* 58mm Thermal Simulation */}
        <div className="mt-6 flex justify-center">
          <div
            id="thermal-receipt-area"
            className="w-[240px] bg-white border border-[#F5E1E4] rounded-lg shadow-inner font-mono text-[10px] text-slate-800 p-3 select-all"
            style={{ boxShadow: 'inset 0 0 0 1px #F5E1E4, 2px 2px 8px rgba(107,58,68,0.04)' }}
          >
            {/* Header */}
            <div className="text-center border-b border-dashed border-slate-300 pb-2 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-900 leading-tight">
                AuraDesk
              </p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-700 mt-0.5">
                Fenina Salon &amp; Reflexology
              </p>
              <p className="text-[8px] text-slate-500 font-semibold mt-0.5 uppercase tracking-wide">
                KASIR: {(activeShift?.operator_name || 'Front Desk').toUpperCase()}
              </p>
            </div>

            {/* Transaction Metadata */}
            <div className="space-y-0.5 mb-2">
              <div className="flex justify-between items-start w-full py-0.5">
                <span className="text-slate-500 shrink-0">WAKTU:</span>
                <span className="text-right font-medium text-slate-900 break-words max-w-[140px]">
                  {new Date().toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between items-start w-full py-0.5">
                <span className="text-slate-500 shrink-0">PELANGGAN:</span>
                <span className="text-right font-bold text-slate-900 break-words max-w-[140px]">
                  {CHECKOUT_V2_ENABLED ? capturedCustomerName : activeCustomer.name}
                </span>
              </div>
              <div className="flex justify-between items-start w-full py-0.5">
                <span className="text-slate-500 shrink-0">METODE:</span>
                <span className="text-right font-bold text-slate-900">{paymentMethod}</span>
              </div>
              <div className="flex justify-between items-start w-full py-0.5">
                <span className="text-slate-500 shrink-0">STATUS:</span>
                <span className={`text-right font-bold ${isOnline ? 'text-green-700' : 'text-rose-700'}`}>
                  {isOnline ? 'CLOUD SYNCED' : 'TERCATAT LOKAL'}
                </span>
              </div>
              {!isOnline && paymentMethod !== 'Cash' && (
                <div className="flex justify-between items-start w-full py-0.5">
                  <span className="text-slate-500 shrink-0">VERIF.:</span>
                  <span className="text-right font-medium break-words max-w-[140px]">
                    {offlineVerificationMode === 'photo' ? 'JPEG OK' : `${senderName}`}
                  </span>
                </div>
              )}
            </div>

            {/* Item List */}
            <div className="border-t border-dashed border-slate-300 pb-2 pt-2">
              {cart.map((item) => (
                <div key={item.treatment.id} className="flex justify-between items-start w-full py-1">
                  <span className="leading-tight break-words max-w-[145px] text-slate-700">
                    {item.treatment.nama_layanan}
                    <br />
                    <span className="text-slate-400 text-[8px]">x{item.quantity} @ Rp {item.treatment.harga_jual.toLocaleString('id-ID')}</span>
                  </span>
                  <span className="text-right font-bold text-slate-900 shrink-0 ml-1">
                    Rp {(item.treatment.harga_jual * item.quantity).toLocaleString('id-ID')}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-dashed border-slate-300 pt-2 pb-2">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500">SUBTOTAL:</span>
                <span className="text-right font-medium">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              {discountAmount > 0 && activeDiscount && (
                <div className="flex justify-between items-center py-0.5 text-emerald-700">
                  <span>DISKON ({activeDiscount.nama}):</span>
                  <span className="text-right font-bold">
                    - Rp {discountAmount.toLocaleString('id-ID')}
                  </span>
                </div>
              )}
              <div className="border-t border-dashed border-slate-300 pt-1 mt-1 font-bold flex justify-between items-center text-slate-950 text-[11px]">
                <span>GRAND TOTAL:</span>
                <span className="text-right">
                  Rp {grandTotal.toLocaleString('id-ID')}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-dashed border-slate-300 pt-2 text-center text-[8px] text-slate-400 italic leading-snug">
              <p>Terimakasih atas kunjungan Anda.</p>
              <p>Satu langkah menuju keindahan sejati.</p>
              <p className="text-slate-300 mt-1 tracking-widest">✦ ✦ ✦</p>
            </div>

          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex flex-col gap-2 no-print font-sans">
          
          <button
            onClick={() => window.print()}
            className="w-full bg-[#6B3A44] text-white font-bold uppercase tracking-wider text-xs py-3 rounded-xl hover:bg-[#5a2e38] shadow-premium-sm cursor-pointer flex justify-center items-center gap-2 transition-all duration-150"
          >
            <FileText className="w-4 h-4" />
            Cetak Struk Thermal
          </button>

          <button
            onClick={onClose}
            className="w-full bg-[#D98897] text-white font-bold uppercase tracking-wider text-xs py-3 rounded-xl hover:opacity-90 shadow-premium-sm cursor-pointer transition-all duration-150"
          >
            Tutup &amp; Mulai Transaksi Baru
          </button>

          {!showVoidInput ? (
            <button
              onClick={() => setShowVoidInput(true)}
              className="w-full bg-[#FAF3F4] text-[#C85C5C] font-bold uppercase tracking-wider text-[10px] py-3 rounded-xl hover:bg-rose-100/50 transition-colors border border-[#F5E1E4] cursor-pointer"
            >
              Void Transaksi (Pembatalan)
            </button>
          ) : (
            <div className="bg-[#FAF3F4] border border-[#F5E1E4] rounded-2xl p-3.5 space-y-3.5 mt-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#C85C5C] text-left">Alasan Void Transaksi:</p>
              <input
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Contoh: Salah input harga / Salah item..."
                className="w-full text-xs p-2.5 rounded-xl border border-[#F5E1E4] bg-white focus:outline-none focus:border-[#D98897] text-[#6B3A44] font-semibold"
              />
              <div className="flex gap-2 font-sans">
                <button
                  onClick={() => setShowVoidInput(false)}
                  className="flex-1 bg-white border border-[#F5E1E4] text-[#6B3A44] font-bold uppercase tracking-wider text-[9px] py-2 rounded-xl cursor-pointer hover:bg-[#FAF3F4]"
                >
                  Batal
                </button>
                <button
                  onClick={handleVoidTransaction}
                  disabled={isVoiding || !voidReason.trim()}
                  className="flex-1 bg-[#C85C5C] text-white font-bold uppercase tracking-wider text-[9px] py-2 rounded-xl cursor-pointer hover:bg-red-700 disabled:opacity-50"
                >
                  {isVoiding ? 'Memproses...' : 'Konfirmasi'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
