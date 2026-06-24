# Rencana Implementasi: Pertumbuhan KPI Dashboard Dinamis Berdasarkan Data Historis

> **Untuk pekerja agen:** SUB-SKILL DIUTAMAKAN: Gunakan superpowers:subagent-driven-development (rekomendasi) atau superpowers:executing-plans untuk mengimplementasikan rencana ini tugas demi tugas. Langkah-langkah menggunakan sintaks checkbox (`- [ ]`) untuk pelacakan.

**Tujuan:** Mengubah label subteks kartu KPI "Pendapatan Hari Ini" (Revenue) dan "Total Transaksi" (Transaction Count) pada dashboard secara dinamis berdasarkan data historis riil (Supabase & local IndexedDB) yang membandingkan metrik hari ini dengan kemarin.

**Arsitektur:**
1. Memperluas query transaksi Supabase di `useDashboardData.ts` untuk mengambil transaksi mulai kemarin (`startOfYesterday`), memilahnya di memori menjadi data hari ini dan kemarin.
2. Memperkenalkan selector baru di `dashboardSelectors.ts` untuk menghitung total penjualan kemarin dan total transaksi kemarin secara tepat.
3. Meneruskan nilai ini ke `DashboardView` dari `App.tsx` dan merender growth positif (hijau, TrendingUp), negatif (merah, TrendingDown), dan stabil (zinc, Activity) secara dinamis.

---

### Task 1: Update Hook untuk Mengambil Data Multi-Hari

**Files:**
- Modify: [useDashboardData.ts](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/hooks/useDashboardData.ts)

- [ ] **Step 1: Implementasi getAsiaJakartaYesterdayStart dan perbarui Query 1**

Ubah `src/hooks/useDashboardData.ts` untuk memproses data dari `startOfYesterday` dan mengembalikan agregat hari kemarin.

```typescript
const getAsiaJakartaYesterdayStart = (todayStartStr: string) => {
  const todayDate = new Date(todayStartStr);
  const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(yesterdayDate);
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const y = parts.find(p => p.type === 'year')!.value;
  return `${y}-${m}-${d}T00:00:00+07:00`;
};
```

Update `queryFn` di `useDashboardData.ts`:
```typescript
  const { data: onlineSalesData, isLoading: isLoadingOnline, refetch: refetchOnline } = useQuery({
    queryKey: ['dashboard-sales', getAsiaJakartaStartOfDay()],
    queryFn: async () => {
      const { supabase, isSupabaseReady } = await import('../lib/supabaseClient');
      if (!isSupabaseReady) throw new Error('Supabase credentials not ready');
      const startOfDay = getAsiaJakartaStartOfDay();
      const startOfYesterday = getAsiaJakartaYesterdayStart(startOfDay);

      // Query 1: Today's and Yesterday's transactions (fast-path)
      const { data: allTxs, error: txsError } = await supabase
        .from('transactions')
        .select(`
          id, 
          total_amount,
          created_at,
          customer_id,
          payment_method,
          transaction_items (
            service_id
          )
        `)
        .eq('status', 'Done')
        .gte('created_at', startOfYesterday);
        
      if (txsError) throw txsError;

      const todayTxs = allTxs?.filter((tx: any) => tx.created_at && tx.created_at >= startOfDay) || [];
      const yesterdayTxs = allTxs?.filter((tx: any) => tx.created_at && tx.created_at >= startOfYesterday && tx.created_at < startOfDay) || [];

      // Query 2: Historical daily revenue aggregates
      let serverRevenue: Array<{ date: string; total: number }> = [];
      try {
        const { data: viewData, error: viewError } = await supabase
          .from('v_daily_revenue')
          .select('date, total')
          .order('date', { ascending: true });

        if (viewError) throw viewError;
        
        serverRevenue = viewData?.map((item: any) => ({
          date: item.date,
          total: Number(item.total) || 0
        })) || [];
      } catch (err) {
        console.warn('v_daily_revenue view not available, falling back to lightweight direct select aggregation:', err);
        const { data: fallbackTxs, error: fallbackError } = await supabase
          .from('transactions')
          .select('total_amount, created_at')
          .eq('status', 'Done');

        if (fallbackError) throw fallbackError;

        const dateMap: Record<string, number> = {};
        fallbackTxs?.forEach((tx: any) => {
          if (tx.created_at) {
            const d = new Date(tx.created_at);
            const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
            dateMap[dateStr] = (dateMap[dateStr] || 0) + (Number(tx.total_amount) || 0);
          }
        });

        serverRevenue = Object.entries(dateMap).map(([date, total]) => ({
          date,
          total
        })).sort((a, b) => a.date.localeCompare(b.date));
      }
      
      let count = todayTxs.length;
      let sum = todayTxs.reduce((acc, curr) => acc + Number(curr.total_amount), 0);
      let yesterdayCount = yesterdayTxs.length;
      let yesterdaySum = yesterdayTxs.reduce((acc, curr) => acc + Number(curr.total_amount), 0);
      
      const serviceCounts: Record<string, number> = {};
      const hourlyActivity: Record<string, { value: number, amount: number }> = {};
      
      todayTxs?.forEach((tx: any) => {
         tx.transaction_items?.forEach((item: any) => {
            if (item.service_id) {
               serviceCounts[item.service_id] = (serviceCounts[item.service_id] || 0) + 1;
            }
         });
         
         if (tx.created_at) {
            const hour = new Date(tx.created_at).getHours();
            const label = `${hour.toString().padStart(2, '0')}:00`;
            if (!hourlyActivity[label]) hourlyActivity[label] = { value: 0, amount: 0 };
            hourlyActivity[label].value += 1;
            hourlyActivity[label].amount += Number(tx.total_amount) || 0;
         }
      });

      return {
        rawTxs: todayTxs,
        serverRevenue,
        count,
        sum,
        yesterdayCount,
        yesterdaySum,
        serviceCounts,
        hourlyActivity
      };
    },
    enabled: isOnline,
  });
```

Dan update object fallback `onlineSalesData`:
```typescript
    onlineSalesData: onlineSalesData || {
      rawTxs: [],
      serverRevenue: [],
      count: 0,
      sum: 0,
      yesterdayCount: 0,
      yesterdaySum: 0,
      serviceCounts: {},
      hourlyActivity: {}
    },
```

---

### Task 2: Implementasi Selector Metrik Kemarin

**Files:**
- Modify: [dashboardSelectors.ts](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/utils/dashboardSelectors.ts)

- [ ] **Step 1: Modifikasi selectRevenue dan selectTransactionCount untuk filter offline queue berdasarkan tanggal**

Update fungsi saat ini:
```typescript
export function selectRevenue(
  onlineSum: number,
  offlineQueue: SelectorOfflineQueueItem[],
  startOfDayStr?: string
): number {
  const offlineSum = offlineQueue
    .filter(item => {
      if (item.type !== 'CREATE_TRANSACTION' || !item.metadata) return false;
      if (!startOfDayStr) return true;
      const itemTime = item.created_at ? new Date(item.created_at).getTime() : Date.now();
      const startOfDayTime = new Date(startOfDayStr).getTime();
      return itemTime >= startOfDayTime;
    })
    .reduce((sum, item) => sum + (Number(item.metadata?.total_amount) || 0), 0);
  return onlineSum + offlineSum;
}

export function selectTransactionCount(
  onlineCount: number,
  offlineQueue: SelectorOfflineQueueItem[],
  startOfDayStr?: string
): number {
  const offlineCount = offlineQueue.filter(item => {
    if (item.type !== 'CREATE_TRANSACTION') return false;
    if (!startOfDayStr) return true;
    const itemTime = item.created_at ? new Date(item.created_at).getTime() : Date.now();
    const startOfDayTime = new Date(startOfDayStr).getTime();
    return itemTime >= startOfDayTime;
  }).length;
  return onlineCount + offlineCount;
}
```

- [ ] **Step 2: Tambah selectYesterdayRevenue dan selectYesterdayTransactionCount**

Tambahkan fungsi-fungsi berikut pada file `src/utils/dashboardSelectors.ts`:
```typescript
export function selectYesterdayRevenue(
  onlineYesterdaySum: number,
  offlineQueue: SelectorOfflineQueueItem[],
  startOfYesterdayStr: string,
  startOfDayStr: string
): number {
  const startOfYesterdayTime = new Date(startOfYesterdayStr).getTime();
  const startOfDayTime = new Date(startOfDayStr).getTime();
  
  const offlineSum = offlineQueue
    .filter(item => {
      if (item.type !== 'CREATE_TRANSACTION' || !item.metadata) return false;
      const itemTime = item.created_at ? new Date(item.created_at).getTime() : 0;
      return itemTime >= startOfYesterdayTime && itemTime < startOfDayTime;
    })
    .reduce((sum, item) => sum + (Number(item.metadata?.total_amount) || 0), 0);
    
  return onlineYesterdaySum + offlineSum;
}

export function selectYesterdayTransactionCount(
  onlineYesterdayCount: number,
  offlineQueue: SelectorOfflineQueueItem[],
  startOfYesterdayStr: string,
  startOfDayStr: string
): number {
  const startOfYesterdayTime = new Date(startOfYesterdayStr).getTime();
  const startOfDayTime = new Date(startOfDayStr).getTime();
  
  const offlineCount = offlineQueue.filter(item => {
    if (item.type !== 'CREATE_TRANSACTION') return false;
    const itemTime = item.created_at ? new Date(item.created_at).getTime() : 0;
    return itemTime >= startOfYesterdayTime && itemTime < startOfDayTime;
  }).length;
  
  return onlineYesterdayCount + offlineCount;
}
```

---

### Task 3: Penghitungan dan Pengikatan Data di App.tsx

**Files:**
- Modify: [App.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/App.tsx)

- [ ] **Step 1: Perbarui logika selector dan parsing props di App.tsx**

Tambahkan impor fungsi baru pada file `src/App.tsx`:
```typescript
  selectRevenue,
  selectTransactionCount,
  selectYesterdayRevenue,
  selectYesterdayTransactionCount,
```

Tambahkan logika kalkulasi `yesterdaySales` dan `yesterdayTransactionsCount` di `src/App.tsx`:
```typescript
  const startOfDay = useMemo(() => getAsiaJakartaStartOfDay(), []);
  const startOfYesterday = useMemo(() => {
    const todayDate = new Date(startOfDay);
    const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = formatter.formatToParts(yesterdayDate);
    const m = parts.find(p => p.type === 'month')!.value;
    const d = parts.find(p => p.type === 'day')!.value;
    const y = parts.find(p => p.type === 'year')!.value;
    return `${y}-${m}-${d}T00:00:00+07:00`;
  }, [startOfDay]);

  // Derived state dari useDashboardData dan selectors
  const totalSalesToday = useMemo(() => selectRevenue(onlineSalesData.sum, offlineQueue, startOfDay), [onlineSalesData.sum, offlineQueue, startOfDay]);
  const successTransactionsCount = useMemo(() => selectTransactionCount(onlineSalesData.count, offlineQueue, startOfDay), [onlineSalesData.count, offlineQueue, startOfDay]);
  
  const yesterdaySales = useMemo(() => selectYesterdayRevenue(onlineSalesData.yesterdaySum || 0, offlineQueue, startOfYesterday, startOfDay), [onlineSalesData.yesterdaySum, offlineQueue, startOfYesterday, startOfDay]);
  const yesterdayTransactionsCount = useMemo(() => selectYesterdayTransactionCount(onlineSalesData.yesterdayCount || 0, offlineQueue, startOfYesterday, startOfDay), [onlineSalesData.yesterdayCount, offlineQueue, startOfYesterday, startOfDay]);
```

Meneruskan props baru ke `<DashboardView ... />`:
```typescript
                <DashboardView 
                  userRole={userRole}
                  syncStatus={syncStatus} 
                  queueCount={pendingSyncCount} 
                  totalSalesToday={totalSalesToday}
                  successTransactionsCount={successTransactionsCount}
                  yesterdaySales={yesterdaySales}
                  yesterdayTransactionsCount={yesterdayTransactionsCount}
                  guestRatio={guestRatio}
                  topServices={topServices}
                  activityData={activityData}
                  averageTicketSize={averageTicketSize}
                  paymentMethodSplits={paymentMethodSplits}
                  membershipTierCounts={membershipTierCounts}
                  shiftSummary={shiftSummary}
                  bookingStats={bookingStats}
                  systemDiagnostics={systemDiagnostics}
                  safeModeViewModel={safeModeViewModel}
                  isOnline={isOnline}
                  hybridRevenue={hybridRevenue}
                />
```

---

### Task 4: Perbarui Tampilan KPI Dashboard

**Files:**
- Modify: [DashboardView.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/components/DashboardView.tsx)

- [ ] **Step 1: Update props DashboardView dan kalkulasi selisih**

Import `TrendingDown` dari `lucide-react`:
```typescript
import { 
  TrendingUp, 
  TrendingDown,
  Wallet, 
...
```

Perbarui signature `DashboardViewProps`:
```typescript
interface DashboardViewProps {
  userRole: 'Owner/Manager' | 'Kasir/Front Desk' | 'Terapis';
  syncStatus?: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  queueCount?: number;
  totalSalesToday?: number;
  successTransactionsCount?: number;
  yesterdaySales?: number;
  yesterdayTransactionsCount?: number;
  ...
```

Perbarui default parameters `DashboardView`:
```typescript
export default function DashboardView({ 
  userRole,
  syncStatus = 'HEALTHY',
  queueCount = 0,
  totalSalesToday = 0,
  successTransactionsCount = 0,
  yesterdaySales = 0,
  yesterdayTransactionsCount = 0,
  ...
```

Kalkulasi growth:
```typescript
  // Dynamic Growth Calculations
  const revenueGrowthPercentage = useMemo(() => {
    if (yesterdaySales === 0) {
      return totalSalesToday > 0 ? 100 : 0;
    }
    return ((totalSalesToday - yesterdaySales) / yesterdaySales) * 100;
  }, [totalSalesToday, yesterdaySales]);

  const transactionGrowthDiff = useMemo(() => {
    return successTransactionsCount - yesterdayTransactionsCount;
  }, [successTransactionsCount, yesterdayTransactionsCount]);
```

- [ ] **Step 2: Update UI Kartu KPI 1 (Revenue)**

Ubah subteks kartu pendapatan:
```typescript
          {revenueGrowthPercentage > 0 ? (
            <span className="text-[10px] font-semibold text-green-600 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" /> +{revenueGrowthPercentage.toFixed(1)}% dari kemarin
            </span>
          ) : revenueGrowthPercentage < 0 ? (
            <span className="text-[10px] font-semibold text-rose-600 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" /> {revenueGrowthPercentage.toFixed(1)}% dari kemarin
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-zinc-400" /> +0% dari kemarin
            </span>
          )}
```

- [ ] **Step 3: Update UI Kartu KPI 2 (Transaction Count)**

Ubah subteks kartu transaksi:
```typescript
          {transactionGrowthDiff > 0 ? (
            <span className="text-[10px] font-semibold text-green-600 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-600" /> +{transactionGrowthDiff} kemarin
            </span>
          ) : transactionGrowthDiff < 0 ? (
            <span className="text-[10px] font-semibold text-rose-600 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" /> {transactionGrowthDiff} kemarin
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-zinc-400" /> +0 kemarin
            </span>
          )}
```

---

## Rencana Verifikasi
* Build: `npm run lint` & `npm run build`
* E2E: `npm run test:e2e`
