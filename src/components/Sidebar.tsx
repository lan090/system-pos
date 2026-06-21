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
  LayoutDashboard
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
    ...(userRole !== 'Terapis' ? [{ id: 'pos', label: 'POS Terminal', icon: ShoppingBag }] : []),
    { id: 'customers', label: 'Customer DB', icon: Users },
    { id: 'catalog', label: 'Service Catalog', icon: Bookmark },
    { id: 'appointments', label: 'Appointments Matrix', icon: Calendar },
    ...(userRole === 'Owner/Manager' ? [{ id: 'users', label: 'User Management', icon: Users }] : []),
    { id: 'settings', label: 'Settings & Sync', icon: Settings },
  ];

  return (
    <aside className="bg-white border-r border-[#F5E1E4] shadow-premium-sm h-screen w-[260px] fixed left-0 top-0 flex flex-col py-8 px-5 z-40 font-sans">
      {/* Header */}
      <div className="mb-8 px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#C5A880]" />
          <h1 className="text-xl font-bold text-[#6B3A44] tracking-tight">AuraDesk</h1>
        </div>
        <p className="text-[9px] font-bold text-[#D98897] uppercase tracking-widest mt-1">Fenina Salon &amp; Reflexology</p>
      </div>

      {/* CTA Button - Locked for Terapis */}
      {userRole !== 'Terapis' ? (
        <button 
          onClick={() => onTabChange('pos')}
          className="mb-6 w-full bg-[#FDF4F5] text-[#6B3A44] hover:bg-[#D98897] hover:text-white transition-all duration-200 rounded-xl py-2.5 px-4 flex justify-center items-center gap-1.5 font-semibold cursor-pointer text-xs shadow-premium-sm"
        >
          <Plus className="w-4 h-4" />
          Quick POS Order
        </button>
      ) : (
        <div className="mb-6 w-full bg-[#FAF3F4] text-stone-400 border border-[#F5E1E4] rounded-xl py-2.5 px-4 flex justify-center items-center gap-1.5 font-semibold text-xs select-none opacity-60">
          <Plus className="w-4 h-4" />
          Menu POS Locked
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1">
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-xs transition-all duration-200 cursor-pointer border-l-2 ${
                isActive 
                  ? 'bg-[#FDF4F5] text-[#D98897] border-[#C5A880] pl-3.5 font-semibold' 
                  : 'text-[#6B3A44]/75 border-transparent hover:bg-[#FAF6F6] hover:text-[#D98897] pl-3'
              }`}
            >
              <IconComponent className={`w-4 h-4 ${isActive ? 'text-[#D98897]' : 'text-[#6B3A44]/60'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-[#F5E1E4] px-1 flex flex-col gap-3">
        <div className="flex items-center gap-3 text-[#6B3A44]">
          <div className="w-8 h-8 rounded-full bg-[#FAF6F6] flex items-center justify-center border border-[#F5E1E4] text-[#D98897]">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-[#6B3A44] block truncate max-w-[150px] leading-tight mb-1">
              {currentUser?.nama_lengkap || currentUser?.email || 'FRONT DESK'}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#C5A880] block leading-none">{userRole}</span>
          </div>
        </div>

        <button 
          onClick={onLogout}
          className="text-[10px] font-semibold tracking-wider text-rose-500 flex items-center gap-1.5 hover:underline pl-1 cursor-pointer transition-colors uppercase"
        >
          <LogOut className="w-3.5 h-3.5" />
          Log Out System
        </button>
      </div>
    </aside>
  );
}
