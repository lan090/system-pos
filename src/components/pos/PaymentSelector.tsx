import React from 'react';
import { Banknote, QrCode, CreditCard } from 'lucide-react';

type PaymentMethod = 'Cash' | 'QRIS' | 'Bank Transfer';

interface PaymentSelectorProps {
  paymentMethod: PaymentMethod;
  setPaymentMethod: (method: PaymentMethod) => void;
}

export default function PaymentSelector({
  paymentMethod,
  setPaymentMethod,
}: PaymentSelectorProps) {
  
  const paymentTabs: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
    { id: 'Cash', label: 'Tunai', icon: <Banknote className="w-3.5 h-3.5" /> },
    { id: 'QRIS', label: 'QRIS', icon: <QrCode className="w-3.5 h-3.5" /> },
    { id: 'Bank Transfer', label: 'Transfer', icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="border-t border-[#F5E1E4] bg-[#FAF3F4]/30 font-sans">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#D98897]">Metode Pembayaran</p>
      </div>
      <div className="px-4 pb-3">
        <div className="bg-[#FAF3F4] rounded-xl p-1 border border-[#F5E1E4] flex gap-1 relative overflow-hidden">
          {paymentTabs.map((tab) => {
            const isActive = paymentMethod === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPaymentMethod(tab.id)}
                className={`flex-1 min-h-[40px] py-2 text-xs font-bold uppercase rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer border-none ${
                  isActive
                    ? 'bg-white shadow-premium-sm text-[#6B3A44]'
                    : 'bg-transparent text-zinc-500 hover:bg-white/40'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
