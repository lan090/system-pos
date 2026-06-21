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
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#D98897] w-4.5 h-4.5" />
        <input
          type="text"
          placeholder="Cari layanan atau kategori di katalog offline..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-[#F5E1E4] rounded-xl py-3.5 pl-12 pr-4 text-xs font-semibold text-[#6B3A44] placeholder-[#D98897]/60 focus:outline-none focus:border-[#D98897] shadow-premium-sm transition-all duration-150"
        />
      </div>

      <div className="space-y-4">
        {/* Catalog Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-[#D98897]" />
              Select Treatment Catalog
            </h2>
            <p className="text-[10px] text-zinc-500 font-medium">Browse and search offline beauty services.</p>
          </div>

          <button
            onClick={onOpenCloseShift}
            className="bg-[#FAF3F4] text-[#6B3A44] border border-[#F5E1E4] hover:bg-[#D98897] hover:text-white font-bold px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all duration-150 flex items-center gap-1.5 cursor-pointer shadow-premium-sm"
          >
            <Lock className="w-3.5 h-3.5" />
            Tutup Shift Harian
          </button>
        </div>

        {/* Treatments Grid */}
        {filteredTreatments.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-sm space-y-4 min-h-[300px] mt-2">
            <div className="w-12 h-12 rounded-full bg-[#FFF0F2] flex items-center justify-center text-[#D98897]">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="text-center max-w-xs space-y-1">
              <h3 className="text-xs font-bold text-[#6B3A44]">Layanan Tidak Ditemukan</h3>
              <p className="text-[10px] text-zinc-400 leading-relaxed font-medium">
                Tidak ada layanan kecantikan yang cocok dengan pencarian "{searchTerm}". Coba gunakan kata kunci lainnya.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-2">
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
                  className={`relative bg-white border rounded-2xl p-5 shadow-premium-sm flex flex-col justify-between h-44 transition-all duration-200 ${
                    treatment.availableOffline
                      ? 'border-[#F5E1E4] hover:shadow-premium-md hover:border-[#D98897] hover:-translate-y-0.5 cursor-pointer'
                      : 'border-[#F5E1E4]/50 select-none'
                  }`}
                >
                  <div className={treatment.availableOffline ? '' : 'opacity-40'}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FAF3F4] text-[#D98897] flex items-center justify-center font-mono font-bold text-xs">
                        {monogram}
                      </div>
                      <span className="text-[9px] font-bold text-[#C5A880] uppercase tracking-wider bg-[#FAF3F4] px-2 py-0.5 rounded">
                        {treatment.kategori}
                      </span>
                    </div>
                    
                    <h3 className="text-xs font-bold text-[#6B3A44] line-clamp-1">{treatment.nama_layanan}</h3>
                    <p className="text-[10px] text-zinc-500 line-clamp-2 mt-1 leading-normal font-medium">{treatment.description}</p>
                  </div>

                  <div className={`flex items-center justify-between mt-auto pt-2 ${treatment.availableOffline ? '' : 'opacity-40'}`}>
                    <span className="text-xs font-bold text-[#6B3A44] font-mono">
                      Rp {treatment.harga_jual.toLocaleString('id-ID')}
                    </span>
                    
                    {treatment.availableOffline ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); addToCart(treatment); }}
                        className="min-w-[36px] min-h-[36px] rounded-xl bg-[#FAF3F4] border border-[#F5E1E4] flex items-center justify-center text-[#6B3A44] hover:bg-[#D98897] hover:text-white hover:border-[#D98897] transition-all duration-150 cursor-pointer shadow-premium-sm"
                      >
                        {inCart ? (
                          <span className="text-xs font-bold text-[#6B3A44] group-hover:text-white">+{inCart.quantity}</span>
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : <div className="min-h-[36px]" />}
                  </div>

                  {!treatment.availableOffline && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center rounded-2xl p-2 z-10">
                      <div className="bg-[#FAF3F4] px-3 py-1.5 rounded-xl border border-[#F5E1E4] max-w-max">
                        <span className="text-[9px] font-bold text-[#C5A880] uppercase tracking-widest leading-none">Offline Locked</span>
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
