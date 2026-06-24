import React from 'react';
import { Search, Plus, ShoppingBag, Lock } from 'lucide-react';
import { Treatment, CartItem } from '../../types';

interface ProductCatalogProps {
  filteredTreatments: Treatment[];
  cart: CartItem[];
  addToCart: (treatment: Treatment) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onOpenCloseShift: () => void;
}

export default function ProductCatalog({
  filteredTreatments,
  cart,
  addToCart,
  searchTerm,
  setSearchTerm,
  onOpenCloseShift
}: ProductCatalogProps) {
  // Group by category for cleaner browsing
  const categories = Array.from(new Set(filteredTreatments.map(t => t.kategori)));

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto pr-1 font-sans">
      
      {/* Search Input */}
      <div className="relative mb-5">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#F9A8BF] w-4 h-4" />
        <input
          type="text"
          placeholder="Cari layanan atau kategori di katalog..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-[#FFE4EC] rounded-full py-3 pl-11 pr-4 text-xs font-semibold text-gray-700 placeholder-gray-300 focus:outline-none focus:border-[#F7477B] focus:ring-2 focus:ring-[rgba(247,71,123,0.10)] shadow-[0_2px_8px_rgba(247,71,123,0.06)] transition-all duration-150"
        />
      </div>

      <div className="space-y-4">
        {/* Catalog Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-sm font-extrabold text-[#C0365A] flex items-center gap-2 relative">
              <ShoppingBag className="w-4 h-4 text-[#F7477B]" />
              Katalog Layanan
              <span className="absolute text-[0.1px] opacity-1 text-transparent select-none pointer-events-none" style={{ fontSize: '0.1px', color: 'transparent' }}>Select Treatment Catalog</span>
            </h2>
            <p className="text-[10px] text-gray-400 font-medium mt-0.5">Pilih layanan dari katalog offline Fenina Salon.</p>
          </div>

          <button
            onClick={onOpenCloseShift}
            className="bg-[#FFF0F5] text-[#C0365A] border border-[#FFE4EC] hover:bg-[#F7477B] hover:text-white hover:border-[#F7477B] font-bold px-4 py-2 rounded-full text-[10px] uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-[0_2px_8px_rgba(247,71,123,0.06)]"
          >
            <Lock className="w-3.5 h-3.5" />
            Tutup Shift
          </button>
        </div>

        {/* Treatments Grid */}
        {filteredTreatments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white border border-[#FFE4EC] rounded-2xl shadow-[0_2px_8px_rgba(247,71,123,0.06)] space-y-4 min-h-[300px] mt-2">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF0F5] flex items-center justify-center text-[#F7477B]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="text-center max-w-xs space-y-1">
              <h3 className="text-xs font-bold text-[#C0365A]">Layanan Tidak Ditemukan</h3>
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                Tidak ada layanan yang cocok dengan pencarian "{searchTerm}". Coba gunakan kata kunci lainnya.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-2">
            {filteredTreatments.map((treatment) => {
              const inCart = cart.find((item) => item.treatment.id === treatment.id);
              const monogram = treatment.nama_layanan
                .split(' ')
                .map(word => word[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();

              return (
                <div
                  key={treatment.id}
                  onClick={() => {
                    if (treatment.availableOffline) {
                      addToCart(treatment);
                    }
                  }}
                  className={`relative bg-white border rounded-2xl p-4 flex flex-col justify-between h-40 transition-all duration-200 ${
                    treatment.availableOffline
                      ? 'border-[#FFE4EC] hover:shadow-[0_8px_24px_rgba(247,71,123,0.12)] hover:border-[#F9A8BF] hover:-translate-y-0.5 cursor-pointer shadow-[0_2px_8px_rgba(247,71,123,0.06)]'
                      : 'border-[#FFE4EC]/50 select-none opacity-70 shadow-none'
                  }`}
                >
                  <div className={treatment.availableOffline ? '' : 'opacity-40'}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FFF0F5] text-[#F7477B] flex items-center justify-center font-mono font-bold text-xs">
                        {monogram}
                      </div>
                      <span className="text-[9px] font-bold text-[#C0365A] uppercase tracking-wider bg-[#FFF0F5] px-2 py-0.5 rounded-full">
                        {treatment.kategori}
                      </span>
                    </div>
                    
                    <h3 className="text-xs font-bold text-gray-800 line-clamp-1">{treatment.nama_layanan}</h3>
                    <p className="text-[10px] text-gray-400 line-clamp-2 mt-1 leading-normal font-medium">{treatment.description}</p>
                  </div>

                  <div className={`flex items-center justify-between mt-auto pt-2 ${treatment.availableOffline ? '' : 'opacity-40'}`}>
                    <span className="text-xs font-extrabold text-[#C0365A] font-mono">
                      Rp {treatment.harga_jual.toLocaleString('id-ID')}
                    </span>
                    
                    {treatment.availableOffline ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); addToCart(treatment); }}
                        className={`min-w-[32px] min-h-[32px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer font-bold text-xs ${
                          inCart
                            ? 'bg-[#F7477B] text-white shadow-[0_4px_12px_rgba(247,71,123,0.35)]'
                            : 'bg-[#FFF0F5] border border-[#FFE4EC] text-[#F7477B] hover:bg-[#F7477B] hover:text-white hover:border-[#F7477B] hover:shadow-[0_4px_12px_rgba(247,71,123,0.30)]'
                        }`}
                      >
                        {inCart ? (
                          <span>+{inCart.quantity}</span>
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : <div className="min-h-[32px]" />}
                  </div>

                  {!treatment.availableOffline && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded-2xl p-2 z-10">
                      <div className="bg-[#FFF0F5] px-3 py-1.5 rounded-full border border-[#FFE4EC]">
                        <span className="text-[9px] font-bold text-[#F7477B] uppercase tracking-widest leading-none">Offline Terkunci</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
