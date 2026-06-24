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
    <div className="border-t border-[#FFE4EC] bg-[#FFF7FA] font-sans">
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#F7477B]">Metode Pembayaran</p>
      </div>
      <div className="px-4 pb-3">
        <div className="bg-[#FFF0F5] rounded-xl p-1 border border-[#FFE4EC] flex gap-1 relative overflow-hidden">
          {paymentTabs.map((tab) => {
            const isActive = paymentMethod === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPaymentMethod(tab.id)}
                className={`flex-1 min-h-[40px] py-2 text-xs font-bold uppercase rounded-lg transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer border-none ${
                  isActive
                    ? 'bg-[#F7477B] shadow-[0_4px_14px_rgba(247,71,123,0.30)] text-white'
                    : 'bg-transparent text-gray-400 hover:bg-white/60 hover:text-[#C0365A]'
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
