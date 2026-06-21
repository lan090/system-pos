import { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Wallet, 
  Receipt, 
  MoreHorizontal, 
  Info, 
  Activity,
  Award,
  CalendarDays,
  Users,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Clock,
  Lock,
  Unlock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  UserCheck,
  CheckCircle2
} from 'lucide-react';
import { safeAddToQueue, clearActiveShift } from '../utils/storageEngine';

interface DashboardViewProps {
  userRole: 'Owner/Manager' | 'Kasir/Front Desk' | 'Terapis';
  syncStatus?: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  queueCount?: number;
  totalSalesToday?: number;
  successTransactionsCount?: number;
  guestRatio?: number;
  topServices?: Array<{
    name: string;
    percentage: number;
    count: number;
    color: string;
    textClass: string;
  }>;
  activityData?: Array<{
    label: string;
    value: number;
    raw: string;
    peak?: boolean;
  }>;
  averageTicketSize?: number;
  paymentMethodSplits?: { Cash: number; QRIS: number; BankTransfer: number };
  membershipTierCounts?: { Platinum: number; Gold: number; Silver: number };
  shiftSummary?: {
    id?: string;
    operatorName: string;
    shiftStatus: 'Open' | 'Closed';
    startingCash: number;
    expectedCash: number;
    shiftDuration: string;
  };
  bookingStats?: {
    total: number;
    done: number;
    inProgress: number;
    scheduled: number;
  };
  systemDiagnostics?: any | null;
  safeModeViewModel?: {
    isSafeModeActive: boolean;
    degradedBannerMessage: string;
  };
  isOnline?: boolean;
  hybridRevenue?: {
    finalRevenueSeries: Array<{ date: string; total: number }>;
    serverRevenueSeries: Array<{ date: string; total: number }>;
    offlineDeltaSeries: Array<{ date: string; total: number }>;
    conflictResolutionLog: Array<{ type: string; message: string; timestamp: string }>;
  };
}

function getISOWeekString(dateStr: string): string {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const target = new Date(year, month, day);
  const dayNum = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNum + 3);
  const firstThursday = target.getTime();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
  const weekYear = new Date(firstThursday).getFullYear();
  return `${weekYear}-W${weekNum.toString().padStart(2, '0')}`;
}

export default function DashboardView({ 
  userRole,
  syncStatus = 'HEALTHY',
  queueCount = 0,
  totalSalesToday = 0,
  successTransactionsCount = 0,
  guestRatio = 0,
  topServices = [],
  activityData = [],
  averageTicketSize = 0,
  paymentMethodSplits = { Cash: 0, QRIS: 0, BankTransfer: 0 },
  membershipTierCounts = { Platinum: 0, Gold: 0, Silver: 0 },
  shiftSummary = {
    id: undefined,
    operatorName: '',
    shiftStatus: 'Closed',
    startingCash: 0,
    expectedCash: 0,
    shiftDuration: '00:00'
  },
  bookingStats = {
    total: 0,
    done: 0,
    inProgress: 0,
    scheduled: 0
  },
  systemDiagnostics = null,
  safeModeViewModel = {
    isSafeModeActive: false,
    degradedBannerMessage: ''
  },
  isOnline = true,
  hybridRevenue = {
    finalRevenueSeries: [],
    serverRevenueSeries: [],
    offlineDeltaSeries: [],
    conflictResolutionLog: []
  }
}: DashboardViewProps) {
  const {
    finalRevenueSeries = [],
    serverRevenueSeries = [],
    offlineDeltaSeries = [],
    conflictResolutionLog = []
  } = hybridRevenue;

  const [hoveredSlice, setHoveredSlice] = useState<number | null>(null);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [actualCashInput, setActualCashInput] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isSystemDiagnosticsOpen, setIsSystemDiagnosticsOpen] = useState(false);
  const [timeScale, setTimeScale] = useState<'keseluruhan' | 'harian' | 'mingguan' | 'bulanan' | 'tahunan'>('keseluruhan');

  // 1. Generate scale dataset dynamically based on selected timeScale using actual transaction data
  const activeScaleData = useMemo(() => {
    if (timeScale === 'harian') {
      // Daily: Use hourly activityData representing time of day
      return activityData.map(item => ({
        label: item.label,
        value: item.value,
        raw: item.value >= 1000000 
          ? `Rp ${(item.value / 1000000).toFixed(1).replace('.0', '')} jt`
          : item.value >= 1000 
            ? `Rp ${(item.value / 1000).toFixed(0)}K` 
            : `Rp ${item.value}`
      }));
    }

    if (timeScale === 'mingguan') {
      // Weekly: Group the current week's dates (Monday to Sunday) in Asia/Jakarta timezone
      const weekDates = (() => {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
        const parts = formatter.formatToParts(new Date());
        const m = parts.find(p => p.type === 'month')!.value;
        const d = parts.find(p => p.type === 'day')!.value;
        const y = parts.find(p => p.type === 'year')!.value;
        
        const today = new Date(`${y}-${m}-${d}T00:00:00`);
        const day = today.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today);
        monday.setDate(diff);
        
        const dates: string[] = [];
        for (let i = 0; i < 7; i++) {
          const current = new Date(monday);
          current.setDate(monday.getDate() + i);
          const yr = current.getFullYear();
          const mo = (current.getMonth() + 1).toString().padStart(2, '0');
          const da = current.getDate().toString().padStart(2, '0');
          dates.push(`${yr}-${mo}-${da}`);
        }
        return dates;
      })();

      const revenueMap: Record<string, number> = {};
      finalRevenueSeries.forEach(item => {
        revenueMap[item.date] = item.total;
      });

      const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
      return weekDates.map((dateStr, idx) => {
        const total = revenueMap[dateStr] || 0;
        return {
          label: DAY_LABELS[idx],
          value: total,
          raw: total >= 1000000 
            ? `Rp ${(total / 1000000).toFixed(1).replace('.0', '')} jt`
            : total >= 1000 
              ? `Rp ${(total / 1000).toFixed(0)}K` 
              : `Rp ${total}`
        };
      });
    }

    if (timeScale === 'bulanan') {
      // Monthly: YYYY-MM
      const monthMap: Record<string, number> = {};
      finalRevenueSeries.forEach(item => {
        const monthStr = item.date.slice(0, 7); // YYYY-MM
        monthMap[monthStr] = (monthMap[monthStr] || 0) + item.total;
      });

      const sortedMonths = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));
      const last6Months = sortedMonths.slice(-6);

      const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
      return last6Months.map(([month, total]) => {
        const [yr, mo] = month.split('-');
        const monthLabel = `${MONTH_LABELS[parseInt(mo, 10) - 1]} '${yr.slice(2)}`;
        return {
          label: monthLabel,
          value: total,
          raw: total >= 1000000 
            ? `Rp ${(total / 1000000).toFixed(1).replace('.0', '')} jt`
            : total >= 1000 
              ? `Rp ${(total / 1000).toFixed(0)}K` 
              : `Rp ${total}`
        };
      });
    }

    if (timeScale === 'tahunan') {
      // Yearly: YYYY
      const yearMap: Record<string, number> = {};
      finalRevenueSeries.forEach(item => {
        const yearStr = item.date.slice(0, 4); // YYYY
        yearMap[yearStr] = (yearMap[yearStr] || 0) + item.total;
      });

      const sortedYears = Object.entries(yearMap).sort((a, b) => a[0].localeCompare(b[0]));

      return sortedYears.map(([yr, total]) => ({
        label: yr,
        value: total,
        raw: total >= 1000000 
          ? `Rp ${(total / 1000000).toFixed(1).replace('.0', '')} jt`
          : total >= 1000 
            ? `Rp ${(total / 1000).toFixed(0)}K` 
            : `Rp ${total}`
      }));
    }

    // timeScale === 'keseluruhan' (default)
    const yearMap: Record<string, number> = {};
    finalRevenueSeries.forEach(item => {
      const yearStr = item.date.slice(0, 4);
      yearMap[yearStr] = (yearMap[yearStr] || 0) + item.total;
    });

    const currentYear = new Date().getFullYear();
    const years = [
      (currentYear - 3).toString(),
      (currentYear - 2).toString(),
      (currentYear - 1).toString(),
      currentYear.toString()
    ];

    return years.map(yr => {
      const total = yearMap[yr] || 0;
      return {
        label: yr,
        value: total,
        raw: total >= 1000000 
          ? `Rp ${(total / 1000000).toFixed(1).replace('.0', '')} jt`
          : total >= 1000 
            ? `Rp ${(total / 1000).toFixed(0)}K` 
            : `Rp ${total}`
      };
    });
  }, [timeScale, finalRevenueSeries, activityData]);

  // 2. Check if there is data
  const hasRevenueData = useMemo(() => {
    return Array.isArray(activeScaleData) && activeScaleData.some(d => d.value > 0);
  }, [activeScaleData]);

  // 3. Calculate coordinates for line chart
  const lineChartPoints = useMemo(() => {
    if (!hasRevenueData || !activeScaleData || activeScaleData.length === 0) return { path: '', area: '', points: [] };
    
    const maxVal = Math.max(...activeScaleData.map(d => d.value), 1);
    const svgWidth = 500;
    const svgHeight = 130;
    const paddingLeft = 50;
    const paddingRight = 15;
    const paddingTop = 15;
    const paddingBottom = 20;

    const chartWidth = svgWidth - paddingLeft - paddingRight;
    const chartHeight = svgHeight - paddingTop - paddingBottom;
    const len = activeScaleData.length;

    const points = activeScaleData.map((bar, i) => {
      const x = len > 1 ? paddingLeft + (i / (len - 1)) * chartWidth : paddingLeft + chartWidth / 2;
      const y = paddingTop + chartHeight - (bar.value / maxVal) * chartHeight;
      return { x, y, raw: bar.raw, label: bar.label, value: bar.value };
    });

    // Generate SVG path d string
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    
    // Generate SVG area path string
    const areaD = `${pathD} L ${points[len - 1].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} L ${points[0].x.toFixed(1)} ${(paddingTop + chartHeight).toFixed(1)} Z`;

    return { path: pathD, area: areaD, points };
  }, [activeScaleData, hasRevenueData]);

  // 4. Trend Direction calculation
  const revenueTrend = useMemo(() => {
    if (!hasRevenueData || !activeScaleData || activeScaleData.length < 2) return 'Stable';
    const values = activeScaleData.map(d => d.value);
    const half = Math.floor(values.length / 2);
    const firstHalf = values.slice(0, half);
    const secondHalf = values.slice(half);
    
    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    if (avgSecond > avgFirst * 1.05) return 'Up';
    if (avgSecond < avgFirst * 0.95) return 'Down';
    return 'Stable';
  }, [activeScaleData, hasRevenueData]);

  const maxRevenueValue = useMemo(() => {
    if (!activeScaleData || activeScaleData.length === 0) return 0;
    return Math.max(...activeScaleData.map(d => d.value), 0);
  }, [activeScaleData]);

  const formatYLabel = (val: number) => {
    if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1).replace('.0', '')} jt`;
    if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}K`;
    return `Rp ${val}`;
  };

  const trendBadge = useMemo(() => {
    if (revenueTrend === 'Up') {
      return (
        <span className="bg-green-50 border border-green-200 text-green-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 font-mono uppercase tracking-wide">
          ▲ Tren: Meningkat
        </span>
      );
    }
    if (revenueTrend === 'Down') {
      return (
        <span className="bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 font-mono uppercase tracking-wide">
          ▼ Tren: Menurun
        </span>
      );
    }
    return (
      <span className="bg-zinc-50 border border-zinc-200 text-zinc-600 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-0.5 font-mono uppercase tracking-wide">
        ■ Tren: Stabil
      </span>
    );
  }, [revenueTrend]);

  // SVG Chart Dimensions & Computations
  const size = 160;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute offset for donut slices
  let accumulatedPercentage = 0;

  // Variance calculation for shift closure
  const calculatedVariance = useMemo(() => {
    const actual = parseFloat(actualCashInput) || 0;
    const expected = shiftSummary?.expectedCash || 0;
    return actual - expected;
  }, [actualCashInput, shiftSummary]);

  const handleConfirmCloseShift = async () => {
    if (!shiftSummary?.id) return;
    const actualCash = parseFloat(actualCashInput);
    if (isNaN(actualCash)) return;

    const payload = {
      id: shiftSummary.id,
      end_time: new Date().toISOString(),
      actual_cash: actualCash,
      expected_cash: shiftSummary.expectedCash,
      status: 'Closed'
    };

    try {
      // 1. Queue CLOSE_CASH_SHIFT mutation offline-safe
      await safeAddToQueue({ type: 'CLOSE_CASH_SHIFT', payload });
      
      // 2. Clear local active shift cache
      await clearActiveShift();

      // 3. Close modal and clean up inputs
      setIsCloseShiftModalOpen(false);
      setActualCashInput('');
      setConfirmChecked(false);

      // 4. Dispatch shift update signals for hooks revalidation
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('shift-updated'));
        window.dispatchEvent(new CustomEvent('pos-queue-updated'));
      }
    } catch (err) {
      console.error('Failed to close shift from dashboard:', err);
      alert('Gagal menutup shift. Silakan coba lagi.');
    }
  };

  // Sync status configuration mapping
  const syncStatusConfig = {
    HEALTHY: {
      bg: 'bg-green-50 border-green-200 border-l-green-500 text-green-950',
      icon: <ShieldCheck className="w-5 h-5 text-green-600" />,
      title: 'Sistem Sinkronisasi Sehat',
      desc: 'Semua transaksi offline berhasil terunggah. Cloud database terintegrasi sempurna.'
    },
    WARNING: {
      bg: 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-950',
      icon: <Shield className="w-5 h-5 text-amber-600 animate-pulse" />,
      title: 'Menunggu Sinkronisasi',
      desc: `Sistem sedang offline atau terdapat ${queueCount} transaksi antrean lokal menunggu konektivitas pulih.`
    },
    CRITICAL: {
      bg: 'bg-rose-50 border-rose-200 border-l-rose-500 text-rose-950',
      icon: <ShieldAlert className="w-5 h-5 text-rose-600 animate-bounce" />,
      title: 'Butuh Tindakan SRE',
      desc: 'Terdapat transaksi gagal (Quarantined / DLQ) yang membutuhkan perhatian Administrator sistem.'
    }
  }[syncStatus] || {
    bg: 'bg-zinc-50 border-zinc-200 border-l-zinc-500 text-zinc-950',
    icon: <Info className="w-5 h-5 text-zinc-600 font-semibold font-semibold" />,
    title: 'Status Sinkronisasi',
    desc: 'Memuat status sinkronisasi sistem...'
  };

  return (
    <div className="space-y-8 font-sans bg-[#FDF9FA]" id="dashboard-view">
      
      {/* Page Header */}
      <div className="flex justify-between items-center border-b border-[#F5E1E4] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[#6B3A44] tracking-tight">Dashboard Overview</h2>
          <p className="text-[11px] font-bold text-[#D98897] uppercase tracking-widest mt-0.5">Fenina Salon &amp; Reflexology</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-[#4F8A6B] animate-pulse' : 'bg-[#C85C5C]'}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-[#6B3A44]">
            {isOnline ? 'System Online' : 'Offline Mode'}
          </span>
        </div>
      </div>
      
      {/* Safe Mode Banner */}
      {safeModeViewModel.isSafeModeActive && (
        <div className="bg-[#C85C5C] text-white font-semibold text-xs px-6 py-4 rounded-xl flex items-center gap-3 shadow-premium-md select-none animate-pulse">
          <ShieldAlert className="w-5 h-5 text-white flex-shrink-0" />
          <div className="flex-1">
            <span className="uppercase tracking-widest block font-bold text-[10px]">SAFE MODE ACTIVE</span>
            <p className="font-normal text-xs mt-0.5">{safeModeViewModel.degradedBannerMessage}</p>
          </div>
        </div>
      )}

      {/* ────────────────── 1. PREMIUM KPI ROW ────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        
        {/* KPI 1: Daily Revenue */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-200 hover:-translate-y-0.5">
          <div>
            <span className="text-[10px] font-bold text-[#D98897] uppercase tracking-widest block mb-1">Daily Revenue</span>
            <div className="text-2xl font-bold text-[#6B3A44] tracking-tight">
              Rp {totalSalesToday.toLocaleString('id-ID')}
            </div>
          </div>
          <span className="text-[10px] font-medium text-[#4F8A6B] uppercase tracking-wide flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Combined Sales
          </span>
        </div>

        {/* KPI 2: Transaction Count */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-200 hover:-translate-y-0.5">
          <div>
            <span className="text-[10px] font-bold text-[#D98897] uppercase tracking-widest block mb-1">Transactions</span>
            <div className="text-2xl font-bold text-[#6B3A44] tracking-tight">
              {successTransactionsCount} Sesi
            </div>
          </div>
          <span className="text-[10px] font-medium text-[#D98897] uppercase tracking-wide flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 animate-pulse" /> Active Queue Sum
          </span>
        </div>

        {/* KPI 3: Average Ticket */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-200 hover:-translate-y-0.5">
          <div>
            <span className="text-[10px] font-bold text-[#D98897] uppercase tracking-widest block mb-1">Average Ticket</span>
            <div className="text-2xl font-bold text-[#6B3A44] tracking-tight">
              Rp {averageTicketSize.toLocaleString('id-ID')}
            </div>
          </div>
          <span className="text-[10px] font-medium text-stone-500 uppercase tracking-wide">
            Per Checkout Session
          </span>
        </div>

        {/* KPI 4: Queue Health */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-200 hover:-translate-y-0.5">
          <div>
            <span className="text-[10px] font-bold text-[#D98897] uppercase tracking-widest block mb-1">Queue Status</span>
            <div className="text-2xl font-bold text-[#6B3A44] tracking-tight">
              {queueCount > 0 ? `${queueCount} Pending` : 'Clean'}
            </div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${
            syncStatus === 'HEALTHY' ? 'text-[#4F8A6B]' :
            syncStatus === 'WARNING' ? 'text-[#D4A15A]' : 'text-[#C85C5C] animate-pulse'
          }`}>
            {syncStatus === 'HEALTHY' ? '● Sync Healthy' :
             syncStatus === 'WARNING' ? '▲ Sync Pending' : '■ DLQ Attention Required'}
          </span>
        </div>

        {/* KPI 5: Active Shift */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between h-36 relative overflow-hidden group transition-all duration-200 hover:-translate-y-0.5">
          <div>
            <span className="text-[10px] font-bold text-[#D98897] uppercase tracking-widest block mb-1">Active Shift</span>
            <div className="text-lg font-bold text-[#6B3A44] truncate">
              {shiftSummary.shiftStatus === 'Open' ? shiftSummary.operatorName : 'Closed'}
            </div>
          </div>
          <span className="text-[10px] font-bold text-[#C5A880] uppercase tracking-wider font-mono">
            {shiftSummary.shiftStatus === 'Open' ? `Duration: ${shiftSummary.shiftDuration}` : 'No active shift'}
          </span>
        </div>

      </div>

      {/* ────────────────── 2. REVENUE & PERFORMANCE ANALYTICS ────────────────── */}
      {userRole === 'Owner/Manager' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Revenue Trend Line Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between min-h-[350px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-[#F5E1E4] pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#D98897]" />
                <h3 className="text-sm font-semibold text-[#6B3A44]">
                  {timeScale === 'keseluruhan' ? 'Total Revenue Trend' :
                   timeScale === 'harian' ? 'Daily Revenue Trend' :
                   timeScale === 'mingguan' ? 'Weekly Revenue Trend' :
                   timeScale === 'bulanan' ? 'Monthly Revenue Trend' :
                   'Yearly Revenue Trend'}
                </h3>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap">
                {trendBadge}
                <div className="flex bg-[#FAF3F4] p-0.5 rounded-lg border border-[#F5E1E4]">
                  {(['keseluruhan', 'harian', 'mingguan', 'bulanan', 'tahunan'] as const).map((scale) => (
                    <button
                      key={scale}
                      onClick={() => setTimeScale(scale)}
                      className={`text-[9px] font-bold px-2.5 py-1 rounded-md transition-all uppercase tracking-wider cursor-pointer ${
                        timeScale === scale
                          ? 'bg-[#6B3A44] text-white shadow-premium-sm'
                          : 'text-[#6B3A44]/70 hover:text-[#6B3A44] hover:bg-white/80'
                      }`}
                    >
                      {scale === 'keseluruhan' ? 'Semua' : scale === 'harian' ? 'Hari' : scale === 'mingguan' ? 'Minggu' : scale === 'bulanan' ? 'Bulan' : 'Tahun'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 w-full h-44 pt-2 flex flex-col justify-between relative">
              {hasRevenueData ? (
                <div className="w-full h-full">
                  <svg viewBox="0 0 500 130" className="w-full h-full overflow-visible">
                    <defs>
                      <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D98897" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#D98897" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Gridlines */}
                    {[0, 0.5, 1].map((ratio, idx) => {
                      const y = 15 + ratio * 95;
                      return (
                        <g key={idx}>
                          <line 
                            x1="50" 
                            y1={y} 
                            x2="485" 
                            y2={y} 
                            stroke="#F5E1E4" 
                            strokeWidth="1" 
                            strokeDasharray="4,4" 
                            opacity="0.8"
                          />
                          <text 
                            x="45" 
                            y={y + 3} 
                            textAnchor="end" 
                            fill="#6B3A44" 
                            className="text-[9px] font-mono font-bold opacity-75"
                          >
                            {formatYLabel(maxRevenueValue * (1 - ratio))}
                          </text>
                        </g>
                      );
                    })}

                    {/* Shaded Area under path */}
                    <path d={lineChartPoints.area} fill="url(#revenueAreaGrad)" />

                    {/* Smooth trendline */}
                    <path 
                      d={lineChartPoints.path} 
                      fill="none" 
                      stroke="#D98897" 
                      strokeWidth="2.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />

                    {/* Vertex point circles with interactive tooltips */}
                    {lineChartPoints.points.map((p, idx) => (
                      <g key={idx} className="group/dot cursor-pointer">
                        <circle 
                          cx={p.x} 
                          cy={p.y} 
                          r="3" 
                          fill="#FFFFFF" 
                          stroke="#6B3A44" 
                          strokeWidth="1.5"
                          className="transition-all duration-150 group-hover/dot:r-4.5 group-hover/dot:fill-[#D98897]"
                        />
                        
                        <foreignObject 
                          x={p.x - 45} 
                          y={p.y - 32} 
                          width="90" 
                          height="28" 
                          className="pointer-events-none opacity-0 group-hover/dot:opacity-100 transition-opacity duration-150 z-50 overflow-visible"
                        >
                          <div className="bg-[#4A1D27] text-white text-[9px] px-1.5 py-0.5 rounded shadow-premium-md text-center leading-none font-bold">
                            <span className="block opacity-80">{p.label}</span>
                            <span className="block mt-0.5 text-[#D98897]">{p.raw}</span>
                          </div>
                        </foreignObject>
                      </g>
                    ))}

                    {/* X Axis Labels */}
                    {lineChartPoints.points.filter((_, idx) => lineChartPoints.points.length <= 8 || idx % 2 === 0).map((p, idx) => (
                      <text 
                        key={idx} 
                        x={p.x} 
                        y="125" 
                        textAnchor="middle" 
                        fill="#6B3A44" 
                        className="text-[9px] font-bold opacity-75"
                      >
                        {p.label}
                      </text>
                    ))}
                  </svg>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 text-sm space-y-2 py-10">
                  <TrendingUp className="w-8 h-8 text-zinc-300 animate-pulse" />
                  <span className="text-xs font-medium">
                    {timeScale === 'keseluruhan' ? 'Belum ada data pendapatan keseluruhan' :
                     timeScale === 'harian' ? 'Belum ada data pendapatan hari ini' :
                     timeScale === 'mingguan' ? 'Belum ada data pendapatan minggu ini' :
                     timeScale === 'bulanan' ? 'Belum ada data pendapatan bulan ini' :
                     'Belum ada data pendapatan tahun ini'}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-[#F5E1E4] flex items-center justify-between text-[10px] text-[#6B3A44] font-medium opacity-75">
              <span>
                {timeScale === 'keseluruhan' ? 'Ikhtisar tren pendapatan tahunan keseluruhan.' :
                 timeScale === 'harian' ? 'Ikhtisar tren pendapatan kumulatif per jam.' :
                 timeScale === 'mingguan' ? 'Ikhtisar tren pendapatan harian minggu ini.' :
                 timeScale === 'bulanan' ? 'Ikhtisar tren pendapatan mingguan bulan ini.' :
                 'Ikhtisar tren pendapatan bulanan tahun ini.'}
              </span>
              <span className="text-[#D98897] font-bold flex items-center gap-1 uppercase">
                <Info className="w-3.5 h-3.5" /> Sync Engine Connected
              </span>
            </div>
          </div>

          {/* Donut Chart: Top Services */}
          <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4 border-b border-[#F5E1E4] pb-3">
                <h3 className="text-sm font-semibold text-[#6B3A44] uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#D98897]" />
                  Layanan Terfavorit
                </h3>
              </div>

              <div className="flex flex-col items-center justify-center">
                <div className="relative w-36 h-36 mb-4">
                  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90 w-full h-full">
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="transparent"
                      stroke="#FAF3F4"
                      strokeWidth={strokeWidth}
                    />
                    {/* Reset accumulated percentage */}
                    {(() => { accumulatedPercentage = 0; return null; })()}
                    {topServices.map((item, idx) => {
                      const dashArray = (item.percentage / 100) * circumference;
                      const dashOffset = circumference - (accumulatedPercentage / 100) * circumference;
                      accumulatedPercentage += item.percentage;
                      
                      const isHovered = hoveredSlice === idx;

                      return (
                        <circle
                          key={idx}
                          cx={size / 2}
                          cy={size / 2}
                          r={radius}
                          fill="transparent"
                          stroke={item.color}
                          strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
                          strokeDasharray={`${dashArray} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredSlice(idx)}
                          onMouseLeave={() => setHoveredSlice(null)}
                          style={{
                            transformOrigin: 'center',
                            transform: isHovered ? 'scale(1.01)' : 'scale(1)',
                          }}
                        />
                      );
                    })}
                  </svg>

                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Total</span>
                    <span className="text-2xl font-bold text-[#6B3A44] mt-0.5 font-mono">{successTransactionsCount}</span>
                  </div>
                </div>

                <div className="w-full space-y-1.5">
                  {topServices.slice(0, 3).map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`flex items-center justify-between p-1.5 rounded-xl transition-all duration-200 cursor-pointer ${
                        hoveredSlice === idx ? 'bg-[#FAF3F4]' : 'hover:bg-[#FAF3F4]/50'
                      }`}
                      onMouseEnter={() => setHoveredSlice(idx)}
                      onMouseLeave={() => setHoveredSlice(null)}
                    >
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2.5 h-2.5 rounded-full" 
                          style={{ backgroundColor: item.color }} 
                        />
                        <span className="text-xs font-semibold text-zinc-600 truncate max-w-[120px]">{item.name}</span>
                      </div>
                      <div className="text-right text-xs">
                        <span className="font-bold text-[#6B3A44] font-mono">{item.percentage}%</span>
                        <span className="text-[10px] text-zinc-400 ml-1 font-normal">({item.count} Sesi)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      ) : (
        <div className="bg-white border border-[#F5E1E4] rounded-2xl p-8 text-center space-y-4 max-w-lg mx-auto shadow-premium-md">
          <Lock className="w-12 h-12 text-[#D98897] mx-auto" />
          <h3 className="text-base font-semibold text-[#6B3A44]">Akses Analitik Dibatasi</h3>
          <p className="text-sm text-[#6B3A44]/75 leading-relaxed font-normal">
            Hanya pengguna dengan peran <strong>Owner/Manager</strong> yang diizinkan untuk melihat data analitik dan finansial.
          </p>
        </div>
      )}

      {/* ────────────────── 3. APPOINTMENTS + QUEUE HEALTH + SHIFT OPERATION ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Active Shift Controls */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between min-h-[220px]">
          <div>
            <h3 className="text-sm font-semibold text-[#6B3A44] mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <Unlock className="w-4 h-4 text-[#D98897]" />
              Shift Kasir Aktif
            </h3>
            {shiftSummary.shiftStatus === 'Open' ? (
              <div className="space-y-4 text-xs font-semibold text-[#6B3A44]">
                <div className="grid grid-cols-2 gap-3 border-y border-[#F5E1E4] py-3">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Operator</span>
                    <span className="font-bold">{shiftSummary.operatorName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Modal Awal</span>
                    <span className="font-bold font-mono">Rp {shiftSummary.startingCash.toLocaleString('id-ID')}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center bg-[#FAF3F4] p-3.5 rounded-xl border border-[#F5E1E4]">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Laci Kas Ekspektasi</span>
                    <span className="text-sm font-bold text-primary font-mono">Rp {shiftSummary.expectedCash.toLocaleString('id-ID')}</span>
                  </div>
                  <button 
                    onClick={() => {
                      setActualCashInput('');
                      setConfirmChecked(false);
                      setIsCloseShiftModalOpen(true);
                    }}
                    className="bg-primary text-white hover:bg-opacity-90 text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all shadow-premium-sm cursor-pointer"
                  >
                    Tutup Shift
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[#FAF3F4] border border-dashed border-[#F5E1E4] p-6 rounded-xl text-center flex flex-col items-center justify-center gap-2">
                <Lock className="w-6 h-6 text-zinc-400" />
                <p className="text-xs text-zinc-500 font-normal">Shift kasir saat ini ditutup.</p>
                <p className="text-[10px] text-zinc-400">Silakan buka shift kasir di menu Terminal POS untuk melayani transaksi.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sync Status & Queue Health */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between min-h-[220px]">
          <div>
            <h3 className="text-sm font-semibold text-[#6B3A44] mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#D98897]" />
              Queue Sync Health
            </h3>
            <div className="space-y-4">
              <div className="bg-[#FAF3F4] p-3.5 rounded-xl border border-[#F5E1E4] flex justify-between items-center">
                <div>
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">Antrean Lokal</span>
                  <span className="text-lg font-bold text-[#6B3A44] font-mono">{queueCount} Records</span>
                </div>
                {queueCount > 0 && isOnline && (
                  <button 
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('pos-queue-updated'));
                      }
                    }}
                    className="bg-white border border-[#F5E1E4] text-[#6B3A44] hover:bg-[#FAF3F4] text-[10px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all cursor-pointer"
                  >
                    Sync Queue
                  </button>
                )}
              </div>

              {queueCount > 0 ? (
                <div className="text-[10px] font-medium text-[#D4A15A] bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl p-3 leading-relaxed">
                  ⚠️ Ada {queueCount} data menunggu diunggah. Sinkronisasi otomatis berjalan di latar belakang.
                </div>
              ) : (
                <div className="text-[10px] font-semibold text-[#4F8A6B] bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#4F8A6B]" />
                  Semua transaksi tersinkronisasi 100% dengan cloud.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appointments Booking Stats */}
        <div className="bg-white rounded-2xl p-6 shadow-premium-md flex flex-col justify-between min-h-[220px]">
          <div>
            <h3 className="text-sm font-semibold text-[#6B3A44] mb-4 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-[#D98897]" />
              Reservasi Hari Ini
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#6B3A44]">
              <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4] flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Total Booking</span>
                <span className="text-lg font-bold font-mono mt-1">{bookingStats.total}</span>
              </div>
              <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4] flex flex-col justify-between">
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Telah Selesai</span>
                <span className="text-lg font-bold font-mono mt-1 text-[#4F8A6B]">{bookingStats.done}</span>
              </div>
              <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4] flex flex-col justify-between col-span-2 flex-row items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Sedang Layanan / Terjadwal</span>
                  <span className="text-sm font-bold font-mono mt-0.5">
                    {bookingStats.inProgress} Layanan · {bookingStats.scheduled} Terjadwal
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ────────────────── SRE TELEMETRY COLLAPSIBLE PANEL ────────────────── */}
      {userRole === 'Owner/Manager' && systemDiagnostics !== null && (
        <section className="bg-white border border-[#F5E1E4] rounded-2xl p-4 shadow-premium-sm">
          <button 
            onClick={() => setIsSystemDiagnosticsOpen(!isSystemDiagnosticsOpen)}
            className="w-full flex justify-between items-center text-xs font-bold text-[#6B3A44] uppercase tracking-wider cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4.5 h-4.5 text-[#C5A880]" />
              <span>SRE Diagnostics &amp; Telemetry Panel</span>
            </div>
            <div className="flex items-center gap-2 bg-[#FAF3F4] border border-[#F5E1E4] px-2.5 py-1 rounded-xl text-[9px]">
              OWNER MODE
              {isSystemDiagnosticsOpen ? <ChevronUp className="w-3.5 h-3.5 text-[#C5A880]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C5A880]" />}
            </div>
          </button>

          {isSystemDiagnosticsOpen && (
            <div className="mt-4 pt-4 border-t border-[#F5E1E4] grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-semibold text-zinc-700">
              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-[#6B3A44] uppercase tracking-widest border-b border-zinc-100 pb-1">Circuit Breaker &amp; Clock Sync</h4>
                
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4]">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Breaker Status</span>
                    <span className={`text-xs font-bold ${systemDiagnostics.circuitBreakerStatus === 'CLOSED' ? 'text-[#4F8A6B]' : 'text-[#C85C5C]'}`}>
                      {systemDiagnostics.circuitBreakerStatus}
                    </span>
                  </div>
                  <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4]">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Sync Failures</span>
                    <span className="text-xs font-bold text-[#C85C5C]">{systemDiagnostics.circuitBreakerFailures}</span>
                  </div>
                  <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4] col-span-2 flex justify-between items-center">
                    <div>
                      <span className="text-[9px] font-bold text-zinc-400 uppercase block mb-1">Clock Drift</span>
                      <span className="text-xs font-bold text-[#6B3A44]">{systemDiagnostics.clockDriftMs} ms</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${Math.abs(systemDiagnostics.clockDriftMs) < 5000 ? 'bg-green-100 text-[#4F8A6B]' : 'bg-amber-100 text-[#D4A15A]'}`}>
                      {Math.abs(systemDiagnostics.clockDriftMs) < 5000 ? 'NORMAL' : 'DRIFTED'}
                    </span>
                  </div>
                </div>

                <div className="bg-[#FAF3F4] p-3 rounded-xl border border-[#F5E1E4] flex justify-between items-center font-mono">
                  <span className="text-xs text-zinc-600">Integrity Checker Status</span>
                  <span className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${systemDiagnostics.integrityStatus === 'CLEAN' ? 'bg-green-100 text-[#4F8A6B]' : 'bg-rose-100 text-[#C85C5C]'}`}>
                    {systemDiagnostics.integrityStatus}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-[#6B3A44] uppercase tracking-widest border-b border-zinc-100 pb-1">Dead Letter Queue (Quarantined)</h4>
                {systemDiagnostics.localIssues && systemDiagnostics.localIssues.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-2 border border-rose-100 p-2 rounded-xl bg-rose-50/50">
                    {systemDiagnostics.localIssues.map((issue: any, index: number) => (
                      <div key={index} className="p-2.5 bg-white rounded-lg border border-rose-200/50 font-mono text-xs leading-tight space-y-1">
                        <div className="flex justify-between items-center text-rose-800">
                          <span className="font-bold">{issue.type}</span>
                          <span className="text-zinc-400 text-[10px]">{issue.quarantinedAt?.split('T')[1]?.substring(0,8)}</span>
                        </div>
                        <p className="text-zinc-600 truncate">Err: {issue.errorLog}</p>
                        <span className="text-zinc-400 text-[10px] block select-all">Correlation: {issue.correlationId}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 text-[#4F8A6B] p-4 rounded-xl text-center flex flex-col items-center justify-center gap-1 min-h-[120px]">
                    <Database className="w-6 h-6 text-[#4F8A6B] mb-1" />
                    <p className="text-xs font-bold">Dead Letter Queue Clean</p>
                    <p className="text-[10px] text-green-700/80">No quarantined sync mutations detected.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ────────────────── SHIFT CLOSE DOUBLE CONFIRMATION MODAL ────────────────── */}
      {isCloseShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#261C1D]/40 backdrop-blur-md" onClick={() => setIsCloseShiftModalOpen(false)} />
          
          <div className="relative bg-white border border-[#F5E1E4] max-w-md w-full rounded-3xl p-6 shadow-premium-lg overflow-hidden">
            <div className="flex justify-between items-center pb-3 border-b border-[#F5E1E4]">
              <h3 className="text-base font-bold text-[#6B3A44] flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#D98897]" />
                Konfirmasi Tutup Shift
              </h3>
              <button onClick={() => setIsCloseShiftModalOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold cursor-pointer">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="bg-[#FAF3F4] p-4 rounded-2xl border border-[#F5E1E4] space-y-3 text-xs font-semibold text-[#6B3A44]">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-normal">Operator Sesi:</span>
                  <span className="font-bold">{shiftSummary.operatorName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500 font-normal">Modal Awal:</span>
                  <span className="font-bold font-mono">Rp {shiftSummary.startingCash.toLocaleString('id-ID')}</span>
                </div>
                <div className="flex justify-between items-center border-t border-[#F5E1E4] pt-2">
                  <span className="text-zinc-500 font-normal font-bold">Ekspektasi Uang di Laci:</span>
                  <span className="font-bold text-primary font-mono text-sm">Rp {shiftSummary.expectedCash.toLocaleString('id-ID')}</span>
                </div>
              </div>

              {/* Input Actual Cash */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Uang Tunai Fisik Aktual di Laci (Rupiah)
                </label>
                <div className="relative rounded-xl shadow-premium-sm">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <span className="text-zinc-400 text-sm font-bold">Rp</span>
                  </div>
                  <input
                    type="number"
                    value={actualCashInput}
                    onChange={(e) => setActualCashInput(e.target.value)}
                    className="w-full bg-[#FAF3F4] border border-[#F5E1E4] rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-[#D98897] font-mono text-[#6B3A44]"
                    placeholder="Masukkan jumlah fisik kas laci..."
                  />
                </div>
              </div>

              {/* Variance display */}
              {actualCashInput.trim() !== '' && (
                <div className="flex justify-between items-center p-3 rounded-xl border text-xs font-bold font-mono bg-[#FAF3F4] border-[#F5E1E4] text-[#6B3A44]">
                  <span>Selisih (Variance):</span>
                  <span className={`${
                    calculatedVariance === 0 ? 'text-[#4F8A6B]' :
                    calculatedVariance > 0 ? 'text-[#4F8A6B]' : 'text-[#C85C5C]'
                  }`}>
                    {calculatedVariance === 0 ? 'Sesuai (Rp 0)' :
                     calculatedVariance > 0 ? `Surplus +Rp ${calculatedVariance.toLocaleString('id-ID')}` :
                     `Defisit -Rp ${Math.abs(calculatedVariance).toLocaleString('id-ID')}`}
                  </span>
                </div>
              )}

              {/* Checkbox Gate */}
              <div className="flex items-start gap-2.5 pt-2 select-none">
                <input
                  type="checkbox"
                  id="confirm-close-check"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                  className="mt-0.5 rounded text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                />
                <label htmlFor="confirm-close-check" className="text-xs font-semibold text-zinc-500 leading-tight cursor-pointer">
                  Saya mengonfirmasi bahwa penghitungan uang kas fisik aktual di laci kasir telah sesuai dengan isian di atas.
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setIsCloseShiftModalOpen(false)}
                className="flex-1 bg-white border border-[#F5E1E4] text-zinc-500 hover:bg-[#FAF3F4]/50 text-xs font-bold uppercase tracking-wider py-3 rounded-xl transition-all cursor-pointer text-center"
              >
                Batalkan
              </button>
              <button
                onClick={handleConfirmCloseShift}
                disabled={!confirmChecked || actualCashInput.trim() === ''}
                className={`flex-1 text-xs font-bold uppercase tracking-wider py-3 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                  confirmChecked && actualCashInput.trim() !== ''
                    ? 'bg-primary text-white hover:bg-opacity-95 shadow-premium-sm'
                    : 'bg-[#FAF3F4] border border-[#F5E1E4] text-zinc-300 cursor-not-allowed'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Tutup Shift
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
