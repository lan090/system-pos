import React from 'react';
import { Trash2, FileText, AlertCircle, CloudOff, Camera, CheckCircle, Info, ShoppingBag } from 'lucide-react';
import { CartItem, Customer, Discount } from '../../types';
import PaymentSelector from './PaymentSelector';

interface CartPanelProps {
  cart: CartItem[];
  removeFromCart: (treatmentId: string) => void;
  subtotal: number;
  discountAmount: number;
  activeDiscount: Discount | null;
  grandTotal: number;
  activeCustomer: Customer;
  selectedCustomerId: string;
  setSelectedCustomerId: (id: string) => void;
  customers: Customer[];
  CHECKOUT_V2_ENABLED: boolean;
  isCheckoutDisabled: boolean;
  hasPendingClose: boolean;
  requiresOfflineVerification: boolean;
  offlineVerificationMode: 'sender' | 'photo';
  setOfflineVerificationMode: (mode: 'sender' | 'photo') => void;
  senderName: string;
  setSenderName: (name: string) => void;
  compressedImageMeta: { originalSizeKB: number; sizeKB: number; base64: string } | null;
  isCompressing: boolean;
  triggerFileSelect: () => void;
  handleCheckout: () => void;
  paymentMethod: 'Cash' | 'QRIS' | 'Bank Transfer';
  setPaymentMethod: (method: 'Cash' | 'QRIS' | 'Bank Transfer') => void;
  isOnline: boolean;
}

export default function CartPanel({
  cart,
  removeFromCart,
  subtotal,
  discountAmount,
  activeDiscount,
  grandTotal,
  activeCustomer,
  selectedCustomerId,
  setSelectedCustomerId,
  customers,
  CHECKOUT_V2_ENABLED,
  isCheckoutDisabled,
  hasPendingClose,
  requiresOfflineVerification,
  offlineVerificationMode,
  setOfflineVerificationMode,
  senderName,
  setSenderName,
  compressedImageMeta,
  isCompressing,
  triggerFileSelect,
  handleCheckout,
  paymentMethod,
  setPaymentMethod,
  isOnline,
}: CartPanelProps) {
  
  // Get dynamic loyalty tier badge classes
  const getTierGradient = (tier: string) => {
    switch (tier) {
      case 'Platinum':
        return 'from-slate-200 to-zinc-400 text-zinc-900 border border-zinc-300';
      case 'Gold':
        return 'from-amber-200 to-yellow-400 text-amber-950 border border-amber-300';
      case 'Silver':
      default:
        return 'from-rose-100 to-zinc-300 text-rose-950 border border-rose-200';
    }
  };

  return (
    <aside className="w-full lg:w-[420px] flex-shrink-0 flex flex-col h-[calc(100vh-140px)] bg-white border border-[#FFE4EC] rounded-2xl shadow-[0_8px_24px_rgba(247,71,123,0.08)] overflow-hidden font-sans">
      
      {/* Customer Header Selector */}
      <div className="p-4 border-b border-[#FFE4EC] bg-white space-y-3">
        {CHECKOUT_V2_ENABLED ? (
          <div className="p-3 bg-[#FFF0F5] border border-[#FFE4EC] rounded-xl flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#F7477B] mt-0.5 flex-shrink-0" />
            <span className="text-[10px] font-semibold text-[#C0365A] leading-relaxed">
              Checkout Cepat Aktif — Data pelanggan dapat ditambahkan setelah transaksi selesai.
            </span>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#C0365A] truncate">{activeCustomer.name}</h3>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="text-[10px] font-bold bg-[#FFF0F5] px-2 py-1 rounded-lg border border-[#FFE4EC] text-[#C0365A] focus:outline-none focus:border-[#F7477B] cursor-pointer"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <span className={`mt-1.5 inline-block text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-gradient-to-r ${getTierGradient(activeCustomer.tier)}`}>
                💎 {activeCustomer.tier} MEMBER
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {cart.length > 0 ? (
          cart.map((item) => (
            <div key={item.treatment.id} className="flex justify-between items-start border-b border-[#FFE4EC]/70 pb-3">
              <div className="flex-1 min-w-0 pr-2">
                <h4 className="text-xs font-bold text-gray-800 truncate leading-normal">{item.treatment.nama_layanan}</h4>
                <p className="text-[10px] text-gray-400 mt-1 font-semibold">
                  {item.quantity} x Rp {item.treatment.harga_jual.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="text-right flex flex-col items-end flex-shrink-0 ml-2">
                <span className="text-xs font-bold text-[#C0365A] font-mono">
                  Rp {(item.treatment.harga_jual * item.quantity).toLocaleString('id-ID')}
                </span>
                <button
                  onClick={() => removeFromCart(item.treatment.id)}
                  className="text-red-400 mt-2 opacity-70 hover:opacity-100 transition-opacity p-1.5 hover:bg-rose-50 rounded-xl cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF0F5] flex items-center justify-center text-[#F7477B] animate-pulse">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="max-w-[200px]">
              <span className="font-bold text-[#C0365A] block text-xs">Keranjang Kosong</span>
              <span className="text-[10px] text-gray-400 font-medium block mt-1 leading-relaxed">
                Pilih layanan dari katalog di sebelah kiri untuk menambah ke keranjang.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Pricing Summary */}
      <div className="p-4 bg-[#FFF7FA] border-t border-[#FFE4EC] space-y-2 text-xs font-semibold">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 font-normal">Subtotal</span>
          <span className="font-bold font-mono text-gray-700">Rp {subtotal.toLocaleString('id-ID')}</span>
        </div>
        {discountAmount > 0 && activeDiscount && (
          <div className="flex justify-between items-center text-green-600">
            <span className="font-normal">
              Diskon ({activeDiscount.nama})
            </span>
            <span className="font-bold font-mono">- Rp {discountAmount.toLocaleString('id-ID')}</span>
          </div>
        )}
        <div className="pt-2.5 border-t border-[#FFE4EC] flex justify-between items-center">
          <span className="text-sm font-extrabold text-[#C0365A]">Grand Total</span>
          <span className="text-sm font-extrabold text-[#C0365A] font-mono">Rp {grandTotal.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Payment Selection */}
      <PaymentSelector
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
      />

      {/* Offline Verification */}
      {requiresOfflineVerification && (
        <div className="border-t border-[#F5E1E4] bg-white">
          <div className="flex items-center gap-2 px-4 py-2 bg-[#FAF3F4] border-b border-[#F5E1E4]">
            <CloudOff className="w-3.5 h-3.5 text-[#C85C5C] flex-shrink-0" />
            <p className="text-[10px] font-bold text-[#C85C5C] leading-tight">
              Mode Offline Aktif — Verifikasi pembayaran diperlukan.
            </p>
          </div>

          {/* Verification Option Toggles */}
          <div className="flex border-b border-[#F5E1E4] bg-[#FAF3F4]">
            <button
              type="button"
              onClick={() => setOfflineVerificationMode('sender')}
              className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${
                offlineVerificationMode === 'sender'
                  ? 'border-[#C5A880] text-[#6B3A44] bg-white'
                  : 'border-transparent text-zinc-500 hover:bg-white/40'
              }`}
            >
              Opsi A: Nama Pengirim
            </button>
            <button
              type="button"
              onClick={() => setOfflineVerificationMode('photo')}
              className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-wider text-center border-b-2 transition-all cursor-pointer ${
                offlineVerificationMode === 'photo'
                  ? 'border-[#C5A880] text-[#6B3A44] bg-white'
                  : 'border-transparent text-zinc-500 hover:bg-white/40'
              }`}
            >
              Opsi B: Bukti Transfer
            </button>
          </div>

          <div className="p-4">
            {offlineVerificationMode === 'sender' ? (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B3A44]">
                  Nama Pengirim Rekening
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className={`w-full bg-[#FAF3F4] border rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-[#D98897] transition-all text-[#6B3A44] ${
                    senderName.trim().length === 0 ? 'border-[#C85C5C]/50' : 'border-[#F5E1E4]'
                  }`}
                  placeholder="Contoh: BCA Dian / Atas Nama Budi..."
                />
                {senderName.trim().length === 0 && (
                  <p className="text-[10px] text-[#C85C5C] font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Wajib diisi untuk verifikasi offline.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  onClick={triggerFileSelect}
                  className="border-2 border-dashed border-[#F5E1E4] rounded-xl p-4 text-center cursor-pointer hover:bg-[#FAF3F4]/50 transition-all flex flex-col items-center justify-center gap-1.5 h-24"
                >
                  {isCompressing ? (
                    <div className="space-y-1 text-center animate-pulse">
                      <span className="text-[10px] font-bold text-[#6B3A44]">OPTIMIZING IMAGE...</span>
                    </div>
                  ) : compressedImageMeta ? (
                    <div className="flex items-center gap-2 text-left w-full">
                      <div className="w-10 h-10 rounded border border-[#F5E1E4] bg-slate-100 flex-shrink-0 overflow-hidden">
                        <img src={compressedImageMeta.base64} alt="Compressed preview" className="object-cover w-full h-full" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0 text-[10px]">
                        <span className="font-bold text-[#6B3A44] truncate block">receipt_800x600.jpg</span>
                        <div className="flex gap-2 text-[9px] text-zinc-400 mt-0.5">
                          <span className="line-through">{(compressedImageMeta.originalSizeKB / 1024).toFixed(1)}MB</span>
                          <span className="text-[#4F8A6B] font-bold">{compressedImageMeta.sizeKB}KB</span>
                        </div>
                      </div>
                      <div className="bg-[#FAF3F4] text-[#4F8A6B] border border-[#F5E1E4] px-2 py-0.5 rounded text-[8px] font-bold">
                        &lt;150KB
                      </div>
                    </div>
                  ) : (
                    <>
                      <Camera className="w-5 h-5 text-[#D98897]" />
                      <span className="text-xs font-semibold text-[#6B3A44]">Ambil / Unggah Foto Struk</span>
                      <span className="text-[9px] text-zinc-400">Max 800x600px, Auto-kompresi</span>
                    </>
                  )}
                </div>

                {!compressedImageMeta && !isCompressing && (
                  <p className="text-[10px] text-[#C85C5C] font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> Foto bukti transfer wajib diunggah.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cash Offline Notice */}
      {!isOnline && paymentMethod === 'Cash' && (
        <div className="border-t border-[#F5E1E4] px-4 py-2.5 bg-emerald-50/50 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5 text-[#4F8A6B] flex-shrink-0" />
          <p className="text-[10px] font-semibold text-[#4F8A6B]">
            Tunai (Cash) offline tidak membutuhkan verifikasi. Transaksi disimpan ke antrean lokal.
          </p>
        </div>
      )}

      {/* Checkout Execution Button */}
      <div className="p-4 pt-3 bg-white">
        <button
          onClick={handleCheckout}
          disabled={isCheckoutDisabled}
          id="checkout-btn"
          className={`w-full py-3.5 rounded-full font-bold uppercase tracking-wider text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
            isCheckoutDisabled
              ? 'bg-gray-100 text-gray-300 border border-gray-200 cursor-not-allowed opacity-50 shadow-none'
              : 'bg-[#F7477B] text-white hover:bg-[#C0365A] shadow-[0_4px_20px_rgba(247,71,123,0.35)] hover:shadow-[0_6px_28px_rgba(247,71,123,0.45)] hover:-translate-y-0.5 active:translate-y-0'
          }`}
        >
          <FileText className="w-4 h-4 flex-shrink-0" />
          Checkout &amp; Print Struk
        </button>
        {hasPendingClose ? (
          <p className="text-center text-[10px] text-[#C85C5C] font-bold uppercase tracking-wide mt-2 flex items-center justify-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-[#C85C5C]" />
            Shift closed pending offline flush.
          </p>
        ) : isCheckoutDisabled && cart.length > 0 ? (
          <p className="text-center text-[10px] text-[#C85C5C] font-bold uppercase tracking-wide mt-2">
            Isi verifikasi pembayaran offline.
          </p>
        ) : null}
      </div>

    </aside>
  );
}
