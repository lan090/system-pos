import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  X, 
  Info, 
  AlertCircle,
  Scissors,
  Bookmark,
  Sparkles,
  Wifi
} from 'lucide-react';
import { Treatment } from '../types';

interface ServiceCatalogViewProps {
  treatments: Treatment[];
  onAddTreatment: (treatment: Treatment) => Promise<void> | void;
  onDeleteTreatment: (id: string) => void;
  userRole?: string;
}

export default function ServiceCatalogView({ treatments, onAddTreatment, onDeleteTreatment, userRole }: ServiceCatalogViewProps) {
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Form states
  const [formData, setFormData] = useState<{
    nama_layanan: string;
    kategori: string;
    harga_jual: number | '';
    duration: number;
    description: string;
  }>({
    nama_layanan: '',
    kategori: 'Hair Care',
    harga_jual: '',
    duration: 60,
    description: ''
  });

  // Categories list
  const categories = ['Semua', 'Hair Care', 'Reflexology', 'Body Massage'];

  // Handle inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'harga_jual' || name === 'duration' 
        ? (value === '' ? '' : Number(value)) 
        : value
    }));
  };

  // Check validation error
  const isPriceInvalid = formData.harga_jual === '' || Number(formData.harga_jual) <= 0;
  const showPriceError = formData.harga_jual !== '' && Number(formData.harga_jual) <= 0;

  // Search & Filter Memo
  const filteredTreatments = useMemo(() => {
    return treatments.filter(t => {
      const matchesSearch = t.nama_layanan.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            t.kategori.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'Semua' || t.kategori === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [treatments, activeCategory, searchTerm]);

  // Form Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPriceInvalid) return;

    const newTreatment: Treatment = {
      id: crypto.randomUUID(),
      nama_layanan: formData.nama_layanan || 'Signature Treatment',
      kategori: formData.kategori,
      harga_jual: Number(formData.harga_jual),
      description: formData.description || 'Premium treatment service.',
      availableOffline: true,
      icon: formData.kategori === 'Hair Care' ? 'content_cut' : formData.kategori === 'Reflexology' ? 'spa' : 'face'
    };

    try {
      setIsSaving(true);
      setSubmitError(null);
      await onAddTreatment(newTreatment);
      setIsDrawerOpen(false);
      
      setFormData({
        nama_layanan: '',
        kategori: 'Hair Care',
        harga_jual: '',
        duration: 60,
        description: ''
      });
    } catch (err: any) {
      console.error("Gagal menyimpan layanan ke Supabase:", err);
      setSubmitError(err.message || 'Gagal menyimpan layanan ke server cloud.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenDrawer = () => {
    setSubmitError(null);
    setIsSaving(false);
    setFormData({
      nama_layanan: '',
      kategori: 'Hair Care',
      harga_jual: '',
      duration: 60,
      description: ''
    });
    setIsDrawerOpen(true);
  };

  return (
    <div className="space-y-6 font-sans" id="service-catalog-view">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-2xl p-5 shadow-premium-sm border border-[#F5E1E4]">
        <div>
          <h2 className="text-lg font-bold text-[#6B3A44] tracking-tight">Service Catalog</h2>
          <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Manage treatment details, categories, durations, and price policies.</p>
        </div>

        {userRole !== 'Terapis' ? (
          <button 
            onClick={handleOpenDrawer}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#D98897] text-white hover:bg-[#6B3A44] hover:shadow-premium-md transition-all font-bold rounded-xl shadow-premium-sm text-xs cursor-pointer h-9"
          >
            <Plus className="w-4 h-4" />
            Add New Service
          </button>
        ) : (
          <div className="text-[10px] bg-zinc-100 text-zinc-400 border border-zinc-200 px-3 py-2 rounded-xl font-bold opacity-60 self-end">
            Catalog locked (Terapis Mode)
          </div>
        )}
      </div>

      {/* Nav Tabs & Search bar */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-[#F5E1E4]">
        <div className="flex gap-4 md:gap-6 -mb-[1px] overflow-x-auto w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`font-bold text-xs pb-3.5 px-2 whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                activeCategory === cat ? 'text-[#D98897] border-[#D98897]' 
                  : 'text-zinc-400 border-transparent hover:text-[#D98897]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64 pb-2.5 md:pb-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D98897] w-3.5 h-3.5" />
          <input 
            type="text"
            placeholder="Cari layanan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-[#F5E1E4] rounded-xl py-2 pl-9 pr-4 text-xs font-semibold focus:outline-none focus:border-[#D98897] text-[#6B3A44] placeholder:text-zinc-300"
          />
        </div>
      </div>

      {/* Grid of Treatment Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTreatments.map((treatment) => (
          <div 
            key={treatment.id} 
            className="bg-white border border-[#F5E1E4] rounded-2xl p-6 shadow-premium-sm hover:shadow-premium-md hover:scale-[1.01] transition-all duration-300 relative overflow-hidden group flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wider uppercase border ${
                  treatment.kategori === 'Hair Care' 
                    ? 'bg-[#FFF0F2] text-[#6B3A44] border-[#F2C6CE]/50' 
                    : treatment.kategori === 'Reflexology' 
                    ? 'bg-[#FAF3F4] text-[#6B3A44] border-[#F5E1E4]/50' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-250'
                }`}>
                  {treatment.kategori}
                </span>

                {userRole !== 'Terapis' && (
                  <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => onDeleteTreatment(treatment.id)}
                      className="p-1.5 text-rose-500 hover:text-white rounded-lg hover:bg-rose-500 cursor-pointer transition-colors"
                      title="Delete Treatment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-bold text-[#6B3A44] mb-2">{treatment.nama_layanan}</h3>
              <p className="text-xs text-zinc-500 mb-4 leading-relaxed font-semibold">{treatment.description}</p>
            </div>

            <div className="flex items-center justify-between border-t border-[#F5E1E4]/60 pt-4.5 mt-4">
              <span className="text-xs font-bold text-[#D98897] font-mono bg-[#FFF0F2] px-2.5 py-1 rounded-md border border-[#F2C6CE]/30">
                Rp {treatment.harga_jual.toLocaleString('id-ID')}
              </span>
              <div className="flex items-center gap-1.5 text-emerald-600 font-bold" title="Offline Available">
                <Wifi className="w-3.5 h-3.5" />
                <span className="text-[9px] uppercase tracking-wider">Offline Ok</span>
              </div>
            </div>
          </div>
        ))}

        {filteredTreatments.length === 0 && (
          <div className="col-span-full py-16 text-center text-xs text-zinc-400 font-semibold">
            Tidak ada katalog layanan yang ditemukan untuk kategori "{activeCategory}".
          </div>
        )}
      </div>

      {/* Drawer Overlay Modal */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-stone-900/20 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Form Panel */}
          <div className="relative w-full max-w-[460px] h-full bg-white shadow-premium-lg flex flex-col border-l border-[#F5E1E4] rounded-l-3xl overflow-hidden anim-slide-in">
            {/* Header */}
            <div className="flex justify-between items-center px-8 py-6 border-b border-[#F5E1E4] bg-[#FAF3F4]/20">
              <h2 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#D98897]" />
                Tambah Layanan Baru
              </h2>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-400 hover:text-[#6B3A44] transition-colors p-1.5 rounded-full hover:bg-[#FAF3F4] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex-grow flex flex-col justify-between overflow-hidden">
              <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5 text-xs">
                {submitError && (
                  <div className="bg-red-50 border border-red-200 p-3.5 rounded-xl text-red-950 font-bold flex flex-col gap-1 mt-1">
                    <span className="flex items-center gap-1.5 text-red-700 text-[10px] uppercase tracking-widest font-bold">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      Gagal Menyimpan!
                    </span>
                    <p className="text-[11px] font-bold leading-relaxed">{submitError}</p>
                  </div>
                )}

                {/* Field: Service Name */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Nama Layanan *</label>
                  <input 
                    type="text"
                    required
                    name="nama_layanan"
                    value={formData.nama_layanan}
                    onChange={handleInputChange}
                    placeholder="Contoh: Signature Hair Spa"
                    className="w-full bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl px-4 py-3 font-semibold text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  />
                </div>

                {/* Field: Category */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Kategori *</label>
                  <select 
                    name="kategori"
                    value={formData.kategori}
                    onChange={handleInputChange}
                    className="w-full bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl px-4 py-3 font-semibold text-xs text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all cursor-pointer"
                  >
                    <option value="Hair Care">Hair Care</option>
                    <option value="Reflexology">Reflexology</option>
                    <option value="Body Massage">Body Massage</option>
                  </select>
                </div>

                {/* Field: Price */}
                <div className="space-y-1.5 relative">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider ${showPriceError ? 'text-red-500' : 'text-[#6B3A44]'}`}>
                    Harga Jual (IDR) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#D98897] font-bold text-xs">Rp</span>
                    <input 
                      type="number"
                      name="harga_jual"
                      required
                      placeholder="0"
                      value={formData.harga_jual}
                      onChange={handleInputChange}
                      className={`w-full rounded-xl pl-10 pr-10 py-3 text-xs font-semibold focus:outline-none transition-all ${
                        showPriceError 
                          ? 'bg-red-50/50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-200' 
                          : 'bg-[#FDF9FA] focus:bg-white border border-[#F5E1E4] text-[#6B3A44] focus:border-[#D98897]'
                      }`}
                    />
                    {showPriceError && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-red-500">
                        <AlertCircle className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                  {showPriceError && (
                    <p className="text-xs text-red-600 bg-red-50/70 border border-red-100 p-3 rounded-xl mt-1.5 font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                      Harga mustahil: Nilai minus atau nol dilarang oleh aturan Supabase Catalog.
                    </p>
                  )}
                </div>

                {/* Field: Duration */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B3A44]">Durasi Pengerjaan (Menit)</label>
                  <input 
                    type="number"
                    name="duration"
                    value={formData.duration}
                    onChange={handleInputChange}
                    placeholder="60"
                    className="w-full bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl px-4 py-3 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  />
                </div>

                {/* Field: Description */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6B3A44]">Deskripsi Layanan</label>
                  <textarea 
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Masukkan deskripsi teknik kerja..."
                    className="w-full bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl px-4 py-3 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] resize-none transition-all shadow-premium-sm"
                  />
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-8 py-6 border-t border-[#F5E1E4] flex justify-end gap-3.5 bg-[#FAF3F4]/20">
                <button 
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-zinc-500 border border-[#F5E1E4] hover:bg-zinc-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isPriceInvalid || isSaving}
                  className={`px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-white transition-all cursor-pointer ${
                    isPriceInvalid || isSaving
                      ? 'bg-zinc-200 text-zinc-400 border border-[#F5E1E4] cursor-not-allowed opacity-50 shadow-none' 
                      : 'bg-[#D98897] hover:bg-[#6B3A44] shadow-premium-sm hover:shadow-premium-md'
                  }`}
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Layanan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
