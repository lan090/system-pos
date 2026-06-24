import React from 'react';
import { CheckCircle, FileText, Phone, Instagram, MapPin, Sparkle, Heart, Wallet, RotateCcw } from 'lucide-react';
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

  // State to capture actual cash received from customer
  const [customCashPaid, setCustomCashPaid] = React.useState<string>('');

  const currentCustomerName = CHECKOUT_V2_ENABLED ? capturedCustomerName : activeCustomer.name;
  const kasirName = (activeShift?.operator_name || 'Front Desk').toUpperCase();
  const formattedDate = new Date().toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedTime = new Date().toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
  
  // Calculate cash & change dynamically based on input, default to grandTotal if empty or non-cash
  const cashPaidVal = customCashPaid ? parseFloat(customCashPaid) : grandTotal;
  const cashPaid = paymentMethod === 'Cash' ? (isNaN(cashPaidVal) ? grandTotal : cashPaidVal) : grandTotal;
  const changeAmount = Math.max(0, cashPaid - grandTotal);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#261C1D]/40 backdrop-blur-md" onClick={onClose} />
      
      {/* Modal Container */}
      <div className="relative bg-white text-[#6B3A44] max-w-sm w-full rounded-3xl p-6 shadow-premium-lg border border-[#F5E1E4] max-h-[90vh] overflow-y-auto anim-zoom-in">
        
        {/* Success Header */}
        <div className="flex flex-col items-center text-center no-print">
          <CheckCircle className="text-[#4F8A6B] w-12 h-12 mb-3 animate-bounce" />
          <h3 className="text-base font-bold text-[#6B3A44]">Transaksi Sukses!</h3>
          <p className="text-[10px] text-zinc-500 font-semibold mt-1">
            {isOnline
              ? 'Struk dicetak & data disinkronkan langsung ke database cloud.'
              : 'Struk dicetak & data disimpan ke antrean lokal.'}
          </p>
        </div>

        {/* 58mm Thermal Simulation (Pure Black & White) */}
        <div className="mt-6 flex justify-center">
          <div
            id="thermal-receipt-area"
            className="w-[240px] bg-white border border-zinc-200 rounded-lg shadow-inner text-zinc-950 p-3 select-all relative overflow-hidden animate-fade-in"
            style={{ 
              boxShadow: 'inset 0 0 0 1px #E4E4E7, 2px 2px 8px rgba(0,0,0,0.02)',
              fontFamily: 'Georgia, serif' 
            }}
          >
            {/* Header */}
            <div className="flex flex-col items-center mb-2">
              <h1 className="text-[12px] font-bold text-center uppercase tracking-[0.08em] text-zinc-900 font-serif leading-tight mt-1">
                FENINA SALON &amp; REFLEXOLOGY
              </h1>
              
              {/* Divider Line with Diamond Center */}
              <div className="w-full flex items-center justify-center my-1.5 opacity-80">
                <div className="h-[0.5px] bg-zinc-900 flex-1" />
                <div className="mx-1 text-[8px] text-zinc-900">✦</div>
                <div className="h-[0.5px] bg-zinc-900 flex-1" />
              </div>

              {/* Contact Info */}
              <div className="w-full text-[7.5px] text-zinc-700 leading-relaxed text-center space-y-0.5">
                <div className="flex items-center justify-center gap-1">
                  <Phone className="w-2.5 h-2.5 shrink-0 text-zinc-800" />
                  <span>+62 812 8114 7726</span>
                </div>
                <div className="flex items-center justify-center gap-1">
                  <Instagram className="w-2.5 h-2.5 shrink-0 text-zinc-800" />
                  <span>@FENINASALONANDREFLEXY</span>
                </div>
                <div className="flex items-center justify-center gap-0.5 px-1 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 shrink-0 text-zinc-800 mt-0.5 self-start" />
                  <span className="leading-tight text-zinc-600">
                    Jalan Hollywood Boulevard Ruko, Jl. Rodeo Drive No.27 Blok B6, Mekarmukti, Cikarang Utara, Bekasi 17530
                  </span>
                </div>
              </div>

              <div className="w-full h-[0.5px] bg-zinc-900 my-2 opacity-60" />
              <p className="text-[9px] font-bold tracking-[0.2em] text-zinc-900 font-serif my-0.5">
                NOTA KASIR
              </p>
            </div>

            {/* Metadata Section (Formatted with font-mono & strict spacing) */}
            <div className="w-full border-t border-b border-zinc-900 py-1.5 my-2 space-y-0.5 text-[8.5px] font-mono text-zinc-900">
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>No. Nota</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span className="font-bold">10{activeShift?.id || 245}</span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Tanggal</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Jam</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span>{formattedTime}</span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Kasir</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span className="font-bold">{kasirName}</span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Pelanggan</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span className="font-bold break-all" style={{ maxWidth: '138px' }}>{currentCustomerName}</span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Status</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span className="font-bold">
                  {isOnline ? 'CLOUD SYNCED' : 'TERCATAT LOKAL'}
                </span>
              </div>
              <div className="flex w-full">
                <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Metode</span>
                <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                <span className="font-bold">{paymentMethod}</span>
              </div>
              {!isOnline && paymentMethod !== 'Cash' && (
                <div className="flex w-full">
                  <span className="inline-block" style={{ width: '72px', flexShrink: 0 }}>Verif.</span>
                  <span className="inline-block text-center" style={{ width: '10px', flexShrink: 0 }}>:</span>
                  <span className="font-medium">
                    {offlineVerificationMode === 'photo' ? 'JPEG OK' : senderName}
                  </span>
                </div>
              )}
            </div>

            {/* Layout Table using HTML Table for continuous dotted borders and perfect alignment */}
            <table className="w-full border-collapse font-mono text-[8px] text-zinc-900 mt-2">
              <thead>
                <tr className="border-t border-b border-zinc-900 font-bold">
                  <th className="text-left py-1 font-bold" style={{ width: '105px', paddingLeft: '1px' }}>LAYANAN</th>
                  <th className="border-l border-zinc-300 border-dotted text-center py-1 font-bold" style={{ width: '25px' }}>QTY</th>
                  <th className="border-l border-zinc-300 border-dotted text-center py-1 font-bold" style={{ width: '40px' }}>HARGA</th>
                  <th className="border-l border-zinc-300 border-dotted text-right py-1 pr-1 font-bold" style={{ width: '50px' }}>SUBTOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {cart.map((item, idx) => (
                  <tr key={item.treatment.id} className={idx % 2 === 1 ? 'bg-zinc-50' : ''}>
                    {/* Layanan Name with Sparkle Icon */}
                    <td className="py-1 text-left align-top" style={{ width: '105px', paddingLeft: '1px' }}>
                      <div className="flex items-start gap-1 pr-0.5">
                        <Sparkle className="w-2 h-2 text-zinc-700 shrink-0 mt-0.5" />
                        <span className="leading-tight break-words font-medium">{item.treatment.nama_layanan}</span>
                      </div>
                    </td>
                    {/* Qty */}
                    <td className="border-l border-zinc-300 border-dotted text-center align-middle font-bold" style={{ width: '25px' }}>
                      {item.quantity}
                    </td>
                    {/* Harga */}
                    <td className="border-l border-zinc-300 border-dotted text-center align-middle text-zinc-700" style={{ width: '40px' }}>
                      {(item.treatment.harga_jual / 1000).toFixed(0)}.000
                    </td>
                    {/* Subtotal */}
                    <td className="border-l border-zinc-300 border-dotted text-right pr-1 align-middle font-bold" style={{ width: '50px' }}>
                      {((item.treatment.harga_jual * item.quantity) / 1000).toFixed(0)}.000
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Section */}
            <div className="border-t border-zinc-900 mt-1 pt-1.5 space-y-1 text-[8.5px] font-mono">
              <div className="flex justify-between items-center text-zinc-700">
                <span>SUBTOTAL</span>
                <span className="font-medium text-zinc-900">Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              {discountAmount > 0 && activeDiscount && (
                <div className="flex justify-between items-center text-zinc-700">
                  <span>DISKON ({activeDiscount.nama})</span>
                  <span className="font-bold text-zinc-950">- Rp {discountAmount.toLocaleString('id-ID')}</span>
                </div>
              )}
              
              <div className="border-t border-zinc-900 border-double pt-1.5 mt-1 text-[10px] font-bold flex justify-between items-center text-zinc-950 font-serif">
                <span>TOTAL</span>
                <span>Rp {grandTotal.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Payment Info details (strict alignment & spacing) */}
            <div className="border-t border-zinc-900 border-dotted mt-2 pt-1.5 space-y-1 text-[8.5px] font-mono text-zinc-700">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <Wallet className="w-2.5 h-2.5 text-zinc-800" />
                  <span>Tunai (Cash)</span>
                </div>
                <span className="font-medium text-zinc-900">Rp {cashPaid.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1">
                  <RotateCcw className="w-2.5 h-2.5 text-zinc-800" />
                  <span>Kembalian (Change)</span>
                </div>
                <span className="font-bold text-zinc-950">Rp {changeAmount.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Footer Branding & Greetings */}
            <div className="border-t border-zinc-900 border-dotted mt-3 pt-2 text-center text-[7.5px] text-zinc-650 space-y-1.5">
              <div className="flex flex-col items-center">
                <p className="font-serif italic text-[10px] font-bold text-zinc-900 leading-none">Terima Kasih</p>
                <p className="text-[8px] font-semibold text-zinc-700 leading-tight">Atas Kunjungan Anda!</p>
                <Heart className="w-2 h-2 text-zinc-900 fill-zinc-900 mt-0.5" />
              </div>
              <div className="text-[7.5px] leading-tight space-y-0.5 pt-0.5 border-t border-zinc-200 border-dotted font-serif">
                <p className="font-medium text-zinc-800">Follow Instagram Kami: @feninasalonandreflexy</p>
                <p className="font-medium text-zinc-800">Layanan Pelanggan: 0812-3456-7890</p>
              </div>
              
              {/* Closing flower ornament */}
              <div className="flex justify-center text-[10px] text-zinc-900 font-serif pt-1">
                ✿
              </div>
            </div>

          </div>
        </div>

        {/* Buttons & Input */}
        <div className="mt-6 flex flex-col gap-2 no-print font-sans">
          {/* Uang Diterima Input for Cash payment */}
          {paymentMethod === 'Cash' && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 space-y-2 text-left">
              <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 block">Jumlah Uang Diterima (Cash):</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">Rp</span>
                <input
                  type="number"
                  value={customCashPaid}
                  onChange={(e) => setCustomCashPaid(e.target.value)}
                  placeholder={grandTotal.toString()}
                  className="w-full text-xs py-2 pl-8 pr-3 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:border-[#F7477B] text-zinc-900 font-bold shadow-[0_2px_6px_rgba(0,0,0,0.02)]"
                />
              </div>
              <div className="flex gap-1.5 pt-0.5">
                {[grandTotal, Math.ceil(grandTotal / 50000) * 50000, Math.ceil(grandTotal / 100000) * 100000].filter((val, i, self) => self.indexOf(val) === i).map((suggestedVal) => (
                  <button
                    key={suggestedVal}
                    onClick={() => setCustomCashPaid(suggestedVal.toString())}
                    className="px-2.5 py-1 text-[9px] font-bold bg-white border border-zinc-200 text-zinc-700 rounded-lg hover:border-[#F7477B] hover:text-[#F7477B] transition-colors"
                  >
                    Rp {suggestedVal.toLocaleString('id-ID')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => window.print()}
            className="w-full bg-[#F7477B] text-white font-bold uppercase tracking-wider text-xs py-3 rounded-xl hover:bg-[#C0365A] shadow-premium-sm cursor-pointer flex justify-center items-center gap-2 transition-all duration-150"
          >
            <FileText className="w-4 h-4" />
            Cetak Struk Thermal
          </button>

          <button
            onClick={onClose}
            className="w-full bg-[#FFE4EC] text-[#C0365A] font-bold uppercase tracking-wider text-xs py-3 rounded-xl hover:bg-[#F9A8BF]/40 shadow-premium-sm cursor-pointer transition-all duration-150"
          >
            Tutup &amp; Mulai Transaksi Baru
          </button>

          {!showVoidInput ? (
            <button
              onClick={() => setShowVoidInput(true)}
              className="w-full bg-zinc-50 text-[#C85C5C] font-bold uppercase tracking-wider text-[10px] py-3 rounded-xl hover:bg-rose-50 transition-colors border border-[#F5E1E4] cursor-pointer"
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
