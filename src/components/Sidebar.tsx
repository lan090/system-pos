import { 
  BarChart2, 
  ShoppingBag, 
  Users, 
  Bookmark, 
  Calendar, 
  Settings, 
  Plus, 
  User, 
  LogOut,
  Sparkles,
  LayoutDashboard,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  userRole?: string;
  currentUser?: {
    email: string;
    nama_lengkap: string;
  };
}

export default function Sidebar({ 
  currentTab, 
  onTabChange, 
  onLogout, 
  userRole = 'Kasir/Front Desk',
  currentUser
}: SidebarProps) {
  // Navigation tabs - filtered based on RBAC rules!
  const navItems = [
    ...(userRole === 'Owner/Manager' ? [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    ...(userRole !== 'Terapis' ? [{ id: 'pos', label: 'Terminal POS', icon: ShoppingBag }] : []),
    { id: 'customers', label: 'Basis Data Pelanggan', icon: Users },
    { id: 'catalog', label: 'Katalog Layanan', icon: Bookmark },
    { id: 'appointments', label: 'Matriks Janji Temu', icon: Calendar },
    ...(userRole === 'Owner/Manager' ? [{ id: 'users', label: 'Manajemen Pengguna', icon: Users }] : []),
    { id: 'settings', label: 'Pengaturan & Sinkronisasi', icon: Settings },
  ];

  // Role display label mapping
  const roleLabel = userRole === 'Owner/Manager' 
    ? 'PEMILIK/MANAJER'
    : userRole === 'Kasir/Front Desk'
    ? 'KASIR/RESEPSIONIS'
    : 'TERAPIS';

  const roleColor = userRole === 'Owner/Manager'
    ? 'bg-[#FFF0F5] text-[#C0365A] border border-[#FFE4EC]'
    : userRole === 'Kasir/Front Desk'
    ? 'bg-[#FFF7FA] text-[#F7477B] border border-[#FFE4EC]'
    : 'bg-gray-50 text-gray-500 border border-gray-200';

  return (
    <aside className="hidden md:flex flex-col bg-white border-r border-[#FFE4EC] shadow-premium-sm h-screen w-[260px] fixed left-0 top-0 z-40 font-sans">
      
      {/* ── HEADER ── */}
      <div className="px-5 pt-6 pb-4 border-b border-[#FFE4EC]">
        <div className="flex items-center gap-2.5 mb-0.5">
          {/* Logo Icon */}
          <div className="w-8 h-8 rounded-xl bg-[#F7477B] flex items-center justify-center shadow-[0_4px_14px_rgba(247,71,123,0.35)] flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[#C0365A] tracking-tight leading-none">AuraDesk</h1>
            <p className="text-[9px] font-bold text-[#F7477B] uppercase tracking-widest leading-tight mt-0.5 opacity-80">
              Salon &amp; Kecantikan
            </p>
          </div>
        </div>
        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mt-2 pl-0.5">
          Fenina Salon &amp; Reflexology
        </p>
      </div>

      {/* ── CTA BUTTON ── */}
      <div className="px-4 pt-4 pb-2">
        {userRole !== 'Terapis' ? (
          <button 
            onClick={() => onTabChange('pos')}
            className="w-full bg-[#F7477B] text-white hover:bg-[#C0365A] transition-all duration-200 rounded-full py-2.5 px-4 flex justify-center items-center gap-2 font-bold cursor-pointer text-xs shadow-[0_4px_14px_rgba(247,71,123,0.30)] hover:shadow-[0_6px_20px_rgba(247,71,123,0.40)] hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-wider"
          >
            <Plus className="w-3.5 h-3.5" />
            Pemesanan POS Cepat
          </button>
        ) : (
          <div className="w-full bg-gray-50 text-gray-400 border border-gray-200 rounded-full py-2.5 px-4 flex justify-center items-center gap-2 font-semibold text-xs select-none opacity-70 cursor-not-allowed">
            <Plus className="w-3.5 h-3.5" />
            Menu POS Terkunci
          </div>
        )}
      </div>

      {/* ── NAVIGATION ── */}
      <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto px-3 py-2">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-[13px] 
                transition-all duration-200 cursor-pointer w-full text-left
                ${isActive 
                  ? 'bg-[#FFF0F5] text-[#C0365A] font-semibold shadow-[0_2px_8px_rgba(247,71,123,0.08)]' 
                  : 'text-gray-500 hover:bg-[#FFF7FA] hover:text-[#C0365A]'
                }
              `}
            >
              <IconComponent 
                className={`w-[17px] h-[17px] flex-shrink-0 transition-colors ${
                  isActive ? 'text-[#F7477B]' : 'text-gray-400 group-hover:text-[#F7477B]'
                }`} 
              />
              <span className="flex-1 leading-none">{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3.5 h-3.5 text-[#F9A8BF] ml-auto flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ── FOOTER / USER SECTION ── */}
      <div className="px-4 pt-3 pb-4 border-t border-[#FFE4EC]">
        {/* User Info Card */}
        <div className="bg-[#FFF7FA] rounded-2xl px-3 py-3 mb-3 border border-[#FFE4EC]">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-9 h-9 rounded-xl bg-[#F7477B] flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgba(247,71,123,0.25)]">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold text-[#C0365A] block truncate max-w-[140px] leading-tight">
                {currentUser?.nama_lengkap || currentUser?.email || 'Pengguna'}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 inline-block px-1.5 py-0.5 rounded-md ${roleColor}`}>
                {roleLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Logout */}
        <button 
          onClick={onLogout}
          className="w-full text-[11px] font-semibold tracking-wide text-gray-500 flex items-center gap-2 hover:text-[#C0365A] px-1.5 cursor-pointer transition-colors group"
        >
          <LogOut className="w-3.5 h-3.5 group-hover:text-[#F7477B] transition-colors" />
          Sistem Keluar
        </button>
      </div>
    </aside>
  );
}
