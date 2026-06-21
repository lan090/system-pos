import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Shield, 
  UserCheck, 
  UserX, 
  Loader2, 
  AlertCircle, 
  CheckCircle,
  X,
  Edit2
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { generateSalt, hashPassword } from '../utils/crypto';
import { SystemUser, Therapist } from '../types';

interface UserManagementViewProps {
  therapists?: Therapist[];
  onAddTherapist: (therapist: Therapist) => Promise<void>;
  onUpdateTherapist: (id: string, updates: Partial<Therapist>) => Promise<void>;
  isOnline: boolean;
}

export default function UserManagementView({
  therapists = [],
  onAddTherapist,
  onUpdateTherapist,
  isOnline
}: UserManagementViewProps) {
  const [activeTab, setActiveTab] = useState<'staff' | 'therapists'>('staff');
  
  // Staff account states
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Staff Form states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    nama_lengkap: '',
    role: 'Kasir/Front Desk' as SystemUser['role'],
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);

  // Therapist states
  const [therapistSearchTerm, setTherapistSearchTerm] = useState('');
  const [isTherapistDrawerOpen, setIsTherapistDrawerOpen] = useState(false);
  const [editingTherapist, setEditingTherapist] = useState<Therapist | null>(null);
  const [therapistNameInput, setTherapistNameInput] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, username, nama_lengkap, role, is_active, created_at, updated_at')
        .order('role', { ascending: true })
        .order('nama_lengkap', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('[UserManagement] Failed to fetch users:', err);
      setErrorMsg('Gagal memuat daftar pengguna dari server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleToggleActive = async (userId: string, currentStatus: boolean) => {
    if (actionLoading) return;
    setActionLoading(userId);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
      setSuccessMsg(`Status pengguna berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (err: any) {
      console.error('[UserManagement] Failed to update status:', err);
      setErrorMsg('Gagal memperbarui status aktif pengguna.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUsername = formData.username.trim().toLowerCase();
    const cleanEmail = formData.email.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setErrorMsg('Username hanya boleh huruf kecil, angka, underscore, dan minimal 3-20 karakter.');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg('Password minimal harus 6 karakter.');
      return;
    }

    setActionLoading('submit');

    try {
      const salt = generateSalt();
      const hash = await hashPassword(formData.password, salt);

      const newUser = {
        id: crypto.randomUUID(),
        username: cleanUsername,
        email: cleanEmail,
        nama_lengkap: formData.nama_lengkap.trim(),
        role: formData.role,
        password_salt: salt,
        password_hash: hash,
        is_active: true
      };

      const { error } = await supabase
        .from('users')
        .insert(newUser);

      if (error) {
        if (error.message.includes('unique') || error.code === '23505') {
          throw new Error('Username atau Email sudah terdaftar di sistem.');
        }
        throw error;
      }

      setSuccessMsg(`Akun staff baru "${formData.nama_lengkap}" berhasil terdaftar.`);
      setIsDrawerOpen(false);
      
      setFormData({
        username: '',
        email: '',
        nama_lengkap: '',
        role: 'Kasir/Front Desk',
        password: ''
      });
      setShowPassword(false);
      
      fetchUsers();
    } catch (err: any) {
      console.error('[UserManagement] Registration failed:', err);
      setErrorMsg(err.message || 'Gagal mendaftarkan staff baru. Periksa koneksi internet Anda.');
    } finally {
      setActionLoading(null);
    }
  };

  // Therapist event handlers
  const handleTherapistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const name = therapistNameInput.trim();
    if (name.length < 2) {
      setErrorMsg('Nama terapis minimal 2 karakter.');
      return;
    }

    setActionLoading('therapist-submit');
    try {
      if (editingTherapist) {
        await onUpdateTherapist(editingTherapist.id, { nama: name });
        setSuccessMsg(`Nama terapis berhasil diperbarui menjadi "${name}".`);
      } else {
        const newTherapist: Therapist = {
          id: crypto.randomUUID(),
          nama: name,
          is_active: true
        };
        await onAddTherapist(newTherapist);
        setSuccessMsg(`Terapis baru "${name}" berhasil didaftarkan.`);
      }
      setIsTherapistDrawerOpen(false);
      setTherapistNameInput('');
      setEditingTherapist(null);
    } catch (err: any) {
      console.error('[UserManagement] Therapist submit failed:', err);
      setErrorMsg(err.message || 'Gagal menyimpan data terapis.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleTherapistActive = async (therapist: Therapist) => {
    if (actionLoading) return;
    setActionLoading(therapist.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const nextStatus = !therapist.is_active;
      await onUpdateTherapist(therapist.id, { is_active: nextStatus });
      setSuccessMsg(`Status terapis "${therapist.nama}" berhasil ${nextStatus ? 'diaktifkan' : 'dinonaktifkan'}.`);
    } catch (err: any) {
      console.error('[UserManagement] Failed to update therapist status:', err);
      setErrorMsg('Gagal memperbarui status aktif terapis.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const searchLower = searchTerm.toLowerCase();
    return (
      u.nama_lengkap.toLowerCase().includes(searchLower) ||
      (u.username && u.username.toLowerCase().includes(searchLower)) ||
      u.email.toLowerCase().includes(searchLower)
    );
  });

  const filteredTherapists = therapists.filter(t =>
    t.nama.toLowerCase().includes(therapistSearchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 font-sans" id="user-management-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white rounded-2xl p-5 shadow-premium-sm border border-[#F5E1E4]">
        <div>
          <h2 className="text-lg font-bold text-[#6B3A44] tracking-tight">User Management &amp; Roles</h2>
          <p className="text-[11px] text-zinc-500 font-medium mt-0.5">Create staff accounts, allocate RBAC permissions, and manage terminal operators.</p>
        </div>
        <button 
          onClick={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            if (activeTab === 'staff') {
              setIsDrawerOpen(true);
            } else {
              setEditingTherapist(null);
              setTherapistNameInput('');
              setIsTherapistDrawerOpen(true);
            }
          }}
          className="bg-[#D98897] text-white hover:bg-[#6B3A44] hover:shadow-premium-md transition-all font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-premium-sm text-xs cursor-pointer h-9"
        >
          <Plus className="w-4 h-4" />
          {activeTab === 'staff' ? 'Add Staff Account' : 'Add Therapist'}
        </button>
      </div>

      {/* Tabs selection */}
      <div className="flex gap-2 border-b border-[#F5E1E4] pb-px">
        <button
          onClick={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setActiveTab('staff');
          }}
          className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'staff'
              ? 'border-[#D98897] text-[#D98897]'
              : 'border-transparent text-zinc-500 hover:text-[#6B3A44]'
          }`}
        >
          Akun Staff System
        </button>
        <button
          onClick={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setActiveTab('therapists');
          }}
          className={`pb-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'therapists'
              ? 'border-[#D98897] text-[#D98897]'
              : 'border-transparent text-zinc-500 hover:text-[#6B3A44]'
          }`}
        >
          Daftar Terapis Salon
        </button>
      </div>

      {/* Success/Error Alerts */}
      {successMsg && (
        <div className="bg-[#EDF6F2] border border-[#C2DDD0] rounded-xl p-4 flex items-start gap-3 text-xs font-bold text-[#244A3A] animate-fade-in">
          <CheckCircle className="w-4.5 h-4.5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <p>{successMsg}</p>
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 text-xs font-bold text-rose-950 animate-fade-in">
          <AlertCircle className="w-4.5 h-4.5 text-rose-600 flex-shrink-0 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white border border-[#F5E1E4] rounded-2xl shadow-premium-md overflow-hidden">
        {activeTab === 'staff' ? (
          <>
            {/* Search Toolbar */}
            <div className="p-4 border-b border-[#F5E1E4] bg-[#FAF3F4]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D98897]">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input 
                  type="text"
                  placeholder="Cari staff berdasarkan nama, username, email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-[#F5E1E4] rounded-xl py-2 pl-9 pr-4 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:border-[#D98897] placeholder:text-zinc-350"
                />
              </div>
              <span className="text-[10px] font-bold text-[#6B3A44] font-mono bg-[#FFF0F2] px-3 py-1.5 rounded-xl border border-[#F5E1E4]/50 flex-shrink-0">
                Total: {filteredUsers.length} Staff Terdaftar
              </span>
            </div>

            {/* Table list */}
            <div className="overflow-x-auto">
              {isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-zinc-400 gap-3">
                  <Loader2 className="w-6 h-6 text-[#D98897] animate-spin" />
                  <span className="text-xs font-bold">Memuat data staff...</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF3F4]/10 border-b border-[#F5E1E4] text-zinc-400">
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Nama Lengkap</th>
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Username</th>
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Email Address</th>
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Role RBAC</th>
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Status</th>
                      <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5E1E4]/30">
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-[#FAF3F4]/10 transition-colors">
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shadow-premium-sm ${
                                user.role === 'Owner/Manager' ? 'bg-[#261C1D] text-white border border-black/10' : 'bg-[#FFF0F2] text-[#D98897] border border-[#F2C6CE]/50'
                              }`}>
                                {user.nama_lengkap.charAt(0)}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#6B3A44]">{user.nama_lengkap}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-xs font-semibold text-zinc-500 font-mono">
                            @{user.username || 'n/a'}
                          </td>
                          <td className="py-4 px-6 text-xs font-semibold text-zinc-500">
                            {user.email}
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wider uppercase border ${
                              user.role === 'Owner/Manager' 
                                ? 'bg-[#261C1D] text-white border-transparent shadow-premium-sm' 
                                : 'bg-zinc-55 text-zinc-600 border-zinc-200 bg-zinc-50'
                            }`}>
                              <Shield className="w-3 h-3" />
                              {user.role}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border ${
                              user.is_active ? 'bg-[#EDF6F2] text-[#244A3A] border-[#D2E3DB]' : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {user.is_active ? 'Aktif' : 'Nonaktif'}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            {user.id === 'e0000000-0000-0000-0000-000000000001' ? (
                              <span className="text-[10px] text-zinc-400 font-bold italic">Akun Utama Locked</span>
                            ) : (
                              <button
                                onClick={() => handleToggleActive(user.id, user.is_active)}
                                disabled={actionLoading !== null}
                                className={`px-2.5 py-1 text-xs font-bold hover:underline cursor-pointer flex items-center gap-1 ml-auto bg-transparent border-none ${
                                  user.is_active
                                    ? 'text-rose-600 hover:text-[#C85C5C]'
                                    : 'text-emerald-600 hover:text-emerald-800'
                                }`}
                              >
                                {actionLoading === user.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : user.is_active ? (
                                  <>
                                    <UserX className="w-3.5 h-3.5" />
                                    Deactivate
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="w-3.5 h-3.5" />
                                    Activate
                                  </>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-zinc-400 font-semibold">
                          Tidak ditemukan hasil yang cocok dengan pencarian.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Therapist Search Toolbar */}
            <div className="p-4 border-b border-[#F5E1E4] bg-[#FAF3F4]/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative w-full max-w-sm">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D98897]">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input 
                  type="text"
                  placeholder="Cari terapis berdasarkan nama..."
                  value={therapistSearchTerm}
                  onChange={(e) => setTherapistSearchTerm(e.target.value)}
                  className="w-full bg-white border border-[#F5E1E4] rounded-xl py-2 pl-9 pr-4 text-xs font-semibold text-[#6B3A44] focus:outline-none focus:border-[#D98897] placeholder:text-zinc-350"
                />
              </div>
              <span className="text-[10px] font-bold text-[#6B3A44] font-mono bg-[#FFF0F2] px-3 py-1.5 rounded-xl border border-[#F5E1E4]/50 flex-shrink-0">
                Total: {filteredTherapists.length} Terapis Terdaftar
              </span>
            </div>

            {/* Therapist Table list */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF3F4]/10 border-b border-[#F5E1E4] text-zinc-400">
                    <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Nama Terapis</th>
                    <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider">Status Agenda</th>
                    <th className="py-3.5 px-6 text-[10px] font-bold uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F5E1E4]/30">
                  {filteredTherapists.length > 0 ? (
                    filteredTherapists.map((therapist) => (
                      <tr key={therapist.id} className="hover:bg-[#FAF3F4]/10 transition-colors">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#FAF3F4] text-[#D98897] border border-[#F5E1E4] flex items-center justify-center text-xs font-bold shadow-premium-sm">
                              {therapist.nama.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-[#6B3A44]">{therapist.nama}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold border ${
                            therapist.is_active ? 'bg-[#EDF6F2] text-[#244A3A] border-[#D2E3DB]' : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {therapist.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-3.5">
                            <button
                              onClick={() => {
                                setEditingTherapist(therapist);
                                setTherapistNameInput(therapist.nama);
                                setErrorMsg(null);
                                setSuccessMsg(null);
                                setIsTherapistDrawerOpen(true);
                              }}
                              className="text-stone-500 hover:text-[#6B3A44] flex items-center gap-1 text-xs font-bold bg-transparent border-none cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              Edit Nama
                            </button>
                            <button
                              onClick={() => handleToggleTherapistActive(therapist)}
                              disabled={actionLoading !== null}
                              className={`px-2.5 py-1 text-xs font-bold hover:underline cursor-pointer flex items-center gap-1 bg-transparent border-none ${
                                therapist.is_active
                                  ? 'text-rose-600 hover:text-[#C85C5C]'
                                  : 'text-emerald-600 hover:text-emerald-800'
                              }`}
                            >
                              {actionLoading === therapist.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : therapist.is_active ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Activate
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-xs text-zinc-400 font-semibold">
                        Tidak ditemukan hasil terapis yang cocok dengan pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Staff Register Side-Drawer Overlay */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-stone-900/20 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsDrawerOpen(false)}
          />

          <div className="relative w-full max-w-[460px] h-full bg-white shadow-premium-lg flex flex-col border-l border-[#F5E1E4] rounded-l-3xl overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#F5E1E4] flex justify-between items-center bg-[#FAF3F4]/20">
              <h3 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
                <User className="w-5 h-5 text-[#D98897]" />
                Register Staff Account
              </h3>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className="text-zinc-400 hover:text-[#6B3A44] p-1.5 rounded-full hover:bg-[#FAF3F4] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleFormSubmit} className="flex-grow flex flex-col justify-between overflow-hidden">
              <div className="px-8 py-6 overflow-y-auto space-y-5 flex-1 text-xs">
                <p className="text-xs font-semibold text-zinc-500">
                  Daftarkan staff baru ke database local POS. Akun akan terbuat dengan unique salt dan hashed password via PBKDF2 secara instan.
                </p>

                {/* Nama Lengkap */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Nama Lengkap Staff *</label>
                  <input 
                    type="text" 
                    name="nama_lengkap"
                    required
                    value={formData.nama_lengkap}
                    onChange={handleInputChange}
                    placeholder="Contoh: Aiko Tanaka"
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  />
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Username Login *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 text-xs font-bold">@</span>
                    <input 
                      type="text" 
                      name="username"
                      required
                      value={formData.username}
                      onChange={handleInputChange}
                      placeholder="aikotanaka"
                      className="w-full pl-8 pr-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                    />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-bold block mt-1">Gunakan huruf kecil, angka, dan underscore saja.</span>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Email Address *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D98897]">
                      <Mail className="w-3.5 h-3.5" />
                    </span>
                    <input 
                      type="email" 
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="aiko@fenina.com"
                      className="w-full pl-10 pr-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                    />
                  </div>
                </div>

                {/* RBAC Role Selection */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Role Otorisasi (RBAC) *</label>
                  <select 
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all cursor-pointer"
                  >
                    <option value="Kasir/Front Desk">Kasir/Front Desk (Operasional POS)</option>
                    <option value="Owner/Manager">Owner/Manager (Full Analytics & Admin)</option>
                  </select>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Password Kredensial *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                      <Lock className="w-3.5 h-3.5 text-[#D98897]" />
                    </span>
                    <input 
                      type={showPassword ? 'text' : 'password'} 
                      name="password"
                      required
                      value={formData.password}
                      onChange={handleInputChange}
                      placeholder="Minimal 6 karakter..."
                      className="w-full pl-10 pr-10 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#6B3A44] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-6 border-t border-[#F5E1E4] bg-[#FAF3F4]/20 flex justify-end gap-3.5">
                <button 
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-zinc-500 border border-[#F5E1E4] hover:bg-zinc-100 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading === 'submit'}
                  className={`px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-white transition-all cursor-pointer bg-[#D98897] hover:bg-[#6B3A44] shadow-premium-sm hover:shadow-premium-md`}
                >
                  {actionLoading === 'submit' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Mendaftarkan...
                    </>
                  ) : (
                    'Daftarkan Staff'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Therapist Side-Drawer Overlay */}
      {isTherapistDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-stone-900/20 backdrop-blur-xs transition-opacity" 
            onClick={() => setIsTherapistDrawerOpen(false)}
          />

          <div className="relative w-full max-w-[460px] h-full bg-white shadow-premium-lg flex flex-col border-l border-[#F5E1E4] rounded-l-3xl overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 border-b border-[#F5E1E4] flex justify-between items-center bg-[#FAF3F4]/20">
              <h3 className="text-base font-bold text-[#6B3A44] flex items-center gap-2">
                <User className="w-5 h-5 text-[#D98897]" />
                {editingTherapist ? 'Edit Therapist Name' : 'Register Therapist'}
              </h3>
              <button 
                onClick={() => setIsTherapistDrawerOpen(false)}
                className="text-zinc-400 hover:text-[#6B3A44] p-1.5 rounded-full hover:bg-[#FAF3F4] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleTherapistSubmit} className="flex-grow flex flex-col justify-between overflow-hidden">
              <div className="px-8 py-6 overflow-y-auto space-y-5 flex-1 text-xs">
                <p className="text-xs font-semibold text-zinc-500">
                  {editingTherapist 
                    ? 'Ubah nama terapis untuk ditampilkan pada jadwal booking dan struk thermal.' 
                    : 'Daftarkan terapis baru untuk penjadwalan layanan salon.'}
                </p>

                {/* Nama Lengkap */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-[#6B3A44] uppercase tracking-wider">Nama Terapis *</label>
                  <input 
                    type="text" 
                    required
                    value={therapistNameInput}
                    onChange={(e) => setTherapistNameInput(e.target.value)}
                    placeholder="Contoh: Aiko"
                    className="w-full px-4 py-3 bg-[#FDF9FA] border border-[#F5E1E4] rounded-xl text-xs font-semibold text-[#6B3A44] focus:outline-none focus:ring-2 focus:ring-[#D98897]/20 focus:border-[#D98897] shadow-premium-sm transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-8 py-6 border-t border-[#F5E1E4] bg-[#FAF3F4]/20 flex justify-end gap-3.5">
                <button 
                  type="button"
                  onClick={() => setIsTherapistDrawerOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-zinc-500 border border-[#F5E1E4] hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={actionLoading === 'therapist-submit'}
                  className="px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider text-[10px] text-white transition-all cursor-pointer bg-[#D98897] hover:bg-[#6B3A44] shadow-premium-sm hover:shadow-premium-md"
                >
                  {actionLoading === 'therapist-submit' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan Terapis'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
