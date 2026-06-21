import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Phone, 
  Mail, 
  FileText,
  User,
  MoreVertical,
  Check,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Award,
  Coins
} from 'lucide-react';
import { Customer } from '../types';

interface CustomerDBViewProps {
  customers: Customer[];
  onAddCustomer: (customer: Customer) => void;
  onEditCustomer: (customer: Customer) => void;
  userRole?: string;
}

export default function CustomerDBView({ customers, onAddCustomer, onEditCustomer, userRole }: CustomerDBViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTier, setSelectedTier] = useState('All Tiers');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
  const [activeMenuCustomerId, setActiveMenuCustomerId] = useState<string | null>(null);

  // RBAC logic to determine edit/registration privileges based on allowlist
  const canEditCustomer = userRole === 'Owner/Manager' || userRole === 'Kasir/Front Desk';

  // Form states
  const [formData, setFormData] = useState<{
    name: string;
    phone: string;
    email: string;
    notes: string;
    tier: 'Silver' | 'Gold' | 'Platinum';
  }>({
    name: '',
    phone: '',
    email: '',
    notes: '',
    tier: 'Silver'
  });

  const [formSubmitted, setFormSubmitted] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Stats calculation
  const stats = useMemo(() => {
    const total = customers.length;
    const platinum = customers.filter(c => c.tier === 'Platinum').length;
    const gold = customers.filter(c => c.tier === 'Gold').length;
    const silver = customers.filter(c => c.tier === 'Silver').length;
    const totalVisits = customers.reduce((sum, c) => sum + (c.totalVisits || 0), 0);
    const avgVisits = total > 0 ? (totalVisits / total).toFixed(1) : '0';
    const totalOmset = customers.reduce((sum, c) => sum + (c.totalOmset || 0), 0);
    
    return { total, platinum, gold, silver, avgVisits, totalOmset };
  }, [customers]);

  // Search & Filter Memo
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      const matchesSearch = 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesTier = selectedTier === 'All Tiers' || c.tier === selectedTier;
      
      return matchesSearch && matchesTier;
    });
  }, [customers, searchTerm, selectedTier]);

  // Check if phone number is already registered under another customer
  const duplicateCustomer = useMemo(() => {
    if (!formData.phone.trim()) return null;
    const cleanPhone = formData.phone.trim().replace(/\D/g, '');
    
    return customers.find(c => {
      if (editCustomerId && c.id === editCustomerId) return false;
      const existingClean = c.phone.replace(/\D/g, '');
      return existingClean === cleanPhone;
    });
  }, [formData.phone, customers, editCustomerId]);

  // Check if name is already registered (case-insensitive)
  const duplicateNameCustomer = useMemo(() => {
    if (!formData.name.trim()) return null;
    return customers.find(c => {
      if (editCustomerId && c.id === editCustomerId) return false;
      return c.name.toLowerCase().trim() === formData.name.toLowerCase().trim();
    });
  }, [formData.name, customers, editCustomerId]);

  // Advanced Regex Phone validation: starts with '08' and is 10-14 digits
  const isPhoneValid = useMemo(() => {
    const cleanPhone = formData.phone.trim().replace(/\D/g, '');
    return /^08\d{8,12}$/.test(cleanPhone);
  }, [formData.phone]);

  const hasValidationError = !!duplicateCustomer || !isPhoneValid;
  const phoneShowError = phoneTouched && !isPhoneValid && formData.phone.trim().length > 0;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasValidationError) return;

    if (editCustomerId) {
      const existing = customers.find(c => c.id === editCustomerId);
      if (!existing) {
        console.error('Customer not found');
        return;
      }

      const updatedCustomer: Customer = {
        ...existing,
        id: editCustomerId,
        name: formData.name,
        phone: formData.phone.trim().replace(/\D/g, ''),
        tier: formData.tier,
        email: formData.email || undefined,
        notes: formData.notes || undefined,
        totalVisits: existing.totalVisits
      };
      onEditCustomer(updatedCustomer);
    } else {
      const newCustomer: Customer = {
        id: crypto.randomUUID(),
        name: formData.name,
        phone: formData.phone.trim().replace(/\D/g, ''),
        totalVisits: 0,
        joinDate: new Date().toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
        tier: formData.tier,
        email: formData.email || undefined,
        notes: formData.notes || undefined
      };
      onAddCustomer(newCustomer);
    }

    setIsDrawerOpen(false);
    setEditCustomerId(null);
    setPhoneTouched(false);
    
    setFormData({
      name: '',
      phone: '',
      email: '',
      notes: '',
      tier: 'Silver'
    });
  };

  const openNewCustomerDrawer = () => {
    setEditCustomerId(null);
    setPhoneTouched(false);
    setFormData({
      name: '',
      phone: '',
      email: '',
      notes: '',
      tier: 'Silver'
    });
    setIsDrawerOpen(true);
  };

  const openEditCustomerDrawer = (customer: Customer) => {
    setEditCustomerId(customer.id);
    setPhoneTouched(true);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      notes: customer.notes || '',
      tier: customer.tier
    });
    setIsDrawerOpen(true);
  };

  // Get dynamic loyalty tier badge classes
  const getTierGradient = (tier: string) => {
    switch (tier) {
      case 'Platinum':
        return 'from-slate-800 to-zinc-900 text-slate-100 border border-slate-700 shadow-premium-sm';
      case 'Gold':
        return 'from-amber-100 via-[#E8C587]/30 to-amber-200 text-[#7A5B2E] border border-amber-200/60 shadow-premium-sm';
      case 'Silver':
      default:
        return 'from-zinc-100 to-rose-100/40 text-rose-950 border border-rose-200/40 shadow-premium-sm';
    }
  };

  return (
    <div className="space-y-6 font-sans" id="customer-db-view">
      {/* Utility Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-2xl p-5 shadow-premium-sm border border-[#F5E1E4]">
        <div>
          <h2 className="text-lg font-bold text-[#6B3A44] tracking-tight">Customer Database &amp; Loyalty</h2>
          <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Manage client relationships, track visits, and monitor membership rewards.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto justify-end">
          {canEditCustomer ? (
            <button 
              onClick={openNewCustomerDrawer}
              className="bg-[#D98897] text-white hover:bg-[#6B3A44] hover:shadow-premium-md transition-all font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-premium-sm text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register New Client
            </button>
          ) : (
            <div className="bg-zinc-100 text-zinc-400 border border-zinc-200 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 select-none opacity-60">
              <Plus className="w-4 h-4 line-through" />
              Registration Restricted (Terapis Mode)
            </div>
          )}
        </div>
      </div>

      {/* Analytics widgets row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="bg-white p-5 rounded-2xl border border-[#F5E1E4] shadow-premium-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#FFF0F2] flex items-center justify-center text-[#D98897]">
            <User className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">Total Clients</span>
            <span className="text-lg font-bold text-[#6B3A44] block font-mono">{stats.total}</span>
          </div>
        </div>

        {/* VIP Tier Members */}
        <div className="bg-white p-5 rounded-2xl border border-[#F5E1E4] shadow-premium-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#F6F0FA] flex items-center justify-center text-[#9C75B5]">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">VIP Members</span>
            <span className="text-sm font-bold text-[#6B3A44] block">
              {stats.platinum} Platinum • {stats.gold} Gold
            </span>
          </div>
        </div>

        {/* Average visits */}
        <div className="bg-white p-5 rounded-2xl border border-[#F5E1E4] shadow-premium-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#EDF6F2] flex items-center justify-center text-[#4F8A6B]">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">Avg Visits</span>
            <span className="text-lg font-bold text-[#6B3A44] block font-mono">{stats.avgVisits}</span>
          </div>
        </div>

        {/* Total Revenue Tracked */}
        <div className="bg-white p-5 rounded-2xl border border-[#F5E1E4] shadow-premium-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] flex items-center justify-center text-[#C5A880]">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">Cumulative Spend</span>
            <span className="text-xs font-bold text-[#6B3A44] block font-mono truncate max-w-[130px]">
              Rp {stats.totalOmset.toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-md overflow-hidden">
        {/* Table Head — Search & Tier Filter */}
        <div className="p-4 border-b border-[#F5E1E4] bg-[#FAF3F4]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Tier filter */}
            <div className="relative flex-shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                <Filter className="w-3.5 h-3.5" />
              </span>
              <select 
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="pl-8 pr-8 py-2 bg-white border border-[#F5E1E4] rounded-xl text-xs focus:outline-none focus:border-[#D98897] appearance-none cursor-pointer text-[#6B3A44] font-bold min-w-[130px]"
              >
                <option>All Tiers</option>
                <option>Platinum</option>
                <option>Gold</option>
                <option>Silver</option>
              </select>
            </div>
            {/* Search */}
            <div className="relative flex-1 max-w-sm min-w-[200px]">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D98897]">
                <Search className="w-3.5 h-3.5" />
              </span>
              <input 
                type="text"
                placeholder="Cari pelanggan berdasarkan nama, telepon..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-[#F5E1E4] rounded-xl py-2 pl-9 pr-4 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:border-[#D98897] placeholder:text-zinc-300"
              />
            </div>
          </div>
          <span className="text-[10px] font-bold text-[#6B3A44] font-mono bg-[#FFF0F2] px-3 py-1.5 rounded-xl border border-[#F5E1E4]/50 flex-shrink-0">
            Total: {filteredCustomers.length} Record Terdaftar
          </span>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#FAF3F4]/10 border-b border-[#F5E1E4] text-zinc-400">
                <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Nama Pelanggan</th>
                <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Nomor Telepon</th>
                <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Total Kunjungan</th>
                <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Loyalty Tier</th>
                <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F5E1E4]/30">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-[#FAF3F4]/10 transition-colors group">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-premium-sm ${
                          customer.tier === 'Platinum' ? 'bg-[#261C1D] text-white border border-black/10' :
                          customer.tier === 'Gold' ? 'bg-[#FFF0F2] text-[#D98897] border border-[#F2C6CE]/50' : 
                          'bg-zinc-100 text-zinc-700 border border-zinc-200/50'
                        }`}>
                          {customer.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-[#6B3A44]">{customer.name}</p>
                          <p className="text-[10px] text-zinc-400 font-semibold mt-0.5">Bergabung {customer.joinDate}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-xs font-semibold text-zinc-500 font-mono">
                      {customer.phone}
                    </td>
                    <td className="py-4 px-6 text-xs font-bold text-[#6B3A44] font-mono">
                      {customer.totalVisits} Kunjungan
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-gradient-to-r ${getTierGradient(customer.tier)}`}>
                        {customer.tier === 'Platinum' && '💎 '}
                        {customer.tier === 'Gold' && '⭐ '}
                        {customer.tier}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right relative">
                      {canEditCustomer ? (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuCustomerId(activeMenuCustomerId === customer.id ? null : customer.id);
                            }}
                            className="text-[#D98897] hover:text-[#6B3A44] transition-colors p-1.5 rounded-full hover:bg-[#FAF3F4] cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeMenuCustomerId === customer.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10 cursor-default" 
                                onClick={() => setActiveMenuCustomerId(null)}
                              />
                              <div className="absolute right-6 mt-1 w-36 bg-white border border-[#F5E1E4] rounded-xl shadow-premium-lg py-1 z-20 text-left overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => {
                                    openEditCustomerDrawer(customer);
                                    setActiveMenuCustomerId(null);
                                  }}
                                  className="w-full px-4 py-2 text-xs font-bold text-[#6B3A44] hover:bg-[#FAF3F4]/30 hover:text-[#D98897] transition-colors flex items-center gap-2 cursor-pointer border-none text-left"
                                >
                                  Edit Pelanggan
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-stone-400 font-medium select-none italic">Restricted</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-zinc-400 font-semibold">
                    Tidak ditemukan hasil yang cocok dengan pencarian.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="px-6 py-3.5 bg-[#FAF3F4]/10 border-t border-[#F5E1E4] flex justify-between items-center text-xs text-zinc-500 font-semibold">
          <p>Menampilkan 1-{filteredCustomers.length} dari {customers.length} pelanggan</p>
          <div className="flex gap-2">
            <button className="p-1 rounded-lg text-zinc-300 hover:bg-[#FAF3F4] disabled:opacity-30 cursor-pointer" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-1 rounded-lg text-zinc-500 hover:bg-[#FAF3F4] cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Side-Drawer Form Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-stone-900/20 backdrop-blur-xs transition-opacity" 
            onClick={() => {
              setIsDrawerOpen(false);
              setEditCustomerId(null);
            }}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-[460px] h-full bg-white shadow-premium-lg flex flex-col border-l border-[#F5E1E4] z-10 rounded-l-3xl overflow-hidden">
            {/* Drawer Header */}
            <div className="px-8 py-6 border-b border-[#F5E1E4] flex justify-between items-center bg-[#FAF3F4]/20">
              <h3 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
                <User className="w-5 h-5 text-[#D98897]" />
                {editCustomerId ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
              </h3>
              <button 
                onClick={() => {
                  setIsDrawerOpen(false);
                  setEditCustomerId(null);
                }}
                className="text-zinc-400 hover:text-[#6B3A44] p-1.5 rounded-full hover:bg-[#FAF3F4] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body / Form */}
            <form onSubmit={handleFormSubmit} className="flex-grow flex flex-col justify-between overflow-hidden">
              <div className="px-8 py-6 overflow-y-auto space-y-5 flex-1 text-xs">
                <p className="text-xs font-semibold text-zinc-500">
                  Isi informasi lengkap pelanggan di bawah ini untuk didaftarkan ke dalam database manajemen.
                </p>

                {/* Field: Nama Pelanggan */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Nama Pelanggan *</label>
                  <input 
                    type="text" 
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  />
                  {duplicateNameCustomer && (
                    <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 border-l-2 border-l-amber-400 p-3.5 rounded-xl mt-1.5 font-semibold flex items-start gap-1 leading-snug">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                      Peringatan: Nama "{formData.name}" sudah terdaftar sebagai Member ({duplicateNameCustomer.tier}). Input diperbolehkan, namun disarankan verifikasi ganda nomor HP.
                    </p>
                  )}
                </div>

                {/* Field: Nomor Telepon */}
                <div className="space-y-1.5">
                  <label className={`block text-[10px] font-bold uppercase tracking-wider ${phoneShowError || !!duplicateCustomer ? 'text-red-500' : 'text-[#6B3A44]'}`}>
                    Nomor Telepon *
                  </label>
                  <div className="relative">
                    <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${phoneShowError || !!duplicateCustomer ? 'text-red-500' : 'text-[#D98897]'}`}>
                      <Phone className="w-3.5 h-3.5" />
                    </span>
                    <input 
                      type="tel" 
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                      onBlur={() => setPhoneTouched(true)}
                      className={`w-full pl-9 pr-9 py-3 text-xs font-semibold rounded-xl focus:outline-none transition-all ${
                        phoneShowError || !!duplicateCustomer
                          ? 'bg-red-50/50 border-2 border-red-500 text-red-900 focus:ring-2 focus:ring-red-200' 
                          : 'bg-[#FDF9FA] focus:bg-white border border-[#F5E1E4] text-[#6B3A44] focus:border-[#D98897]'
                      }`}
                    />
                    {(phoneShowError || !!duplicateCustomer) && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-red-500">
                        <AlertCircle className="w-4 h-4" />
                      </span>
                    )}
                  </div>

                  {phoneShowError && (
                    <p className="text-xs text-red-600 bg-red-50/70 border border-red-100 p-3 rounded-xl mt-1.5 flex items-start gap-1 font-semibold leading-relaxed">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      Format HP Salah: Harus diawali "08" dan berisi total 10 sampai 14 digit angka saja.
                    </p>
                  )}

                  {duplicateCustomer && (
                    <p className="text-xs text-red-600 bg-red-50/70 border border-red-100 p-3 rounded-xl mt-1.5 flex items-start gap-1 font-semibold leading-relaxed">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                      Bentrok Database: Nomor sudah terdaftar atas nama {duplicateCustomer.name} ({duplicateCustomer.tier}).
                    </p>
                  )}
                </div>

                {/* Field: Email Optional */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Email (Opsional)</label>
                  <input 
                    type="email" 
                    name="email"
                    placeholder="contoh@email.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all placeholder:text-zinc-300"
                  />
                </div>

                {/* Field: Loyalty Tier Selection */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Loyalty Tier</label>
                  <select 
                    name="tier"
                    value={formData.tier}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  >
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                    <option value="Platinum">Platinum</option>
                  </select>
                </div>

                {/* Field: Catatan Internal */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Catatan Internal</label>
                  <textarea 
                    name="notes"
                    rows={3}
                    value={formData.notes}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all resize-none placeholder:text-zinc-300"
                    placeholder="Masukkan catatan riwayat atau preferensi pelanggan..."
                  />
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="px-8 py-6 border-t border-[#F5E1E4] bg-[#FAF3F4]/20 flex justify-end gap-3.5">
                <button 
                  type="button"
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setEditCustomerId(null);
                  }}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-zinc-500 border border-[#F5E1E4] hover:bg-zinc-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={hasValidationError}
                  className={`px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-white transition-all cursor-pointer ${
                    hasValidationError 
                      ? 'bg-zinc-200 text-zinc-400 border border-[#F5E1E4] cursor-not-allowed opacity-50 shadow-none' 
                      : 'bg-[#D98897] hover:bg-[#6B3A44] shadow-premium-sm hover:shadow-premium-md'
                  }`}
                >
                  {editCustomerId ? 'Simpan Perubahan' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
