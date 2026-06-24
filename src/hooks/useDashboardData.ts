import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStorageAdapter, loadActiveShift, detectClockDrift } from '../utils/storageEngine';
import { getSystemStateSnapshot } from '../utils/observability';
import { runIntegrityCheck } from '../utils/integrityChecker';

const getAsiaJakartaStartOfDay = () => {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(new Date());
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  const y = parts.find(p => p.type === 'year')!.value;
  return `${y}-${m}-${d}T00:00:00+07:00`;
};

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


export function useDashboardData(isOnline: boolean, userRole: string) {
  const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
  const [quarantinedCount, setQuarantinedCount] = useState<number>(0);
  const [activeShift, setActiveShift] = useState<any | null>(null);
  const [systemSnapshot, setSystemSnapshot] = useState<any | null>(null);
  const [clockDrift, setClockDrift] = useState<any | null>(null);
  const [integrityReport, setIntegrityReport] = useState<any | null>(null);
  const [isLoadingOffline, setIsLoadingOffline] = useState(true);

  const loadOfflineData = async () => {
    setIsLoadingOffline(true);
    try {
      const db = await getStorageAdapter();
      const isOwner = userRole === 'Owner/Manager';

      // 1. Basic cashier data (always loaded, lightweight envelopes only)
      const [queueItems, quarantinedItems, shiftData] = await Promise.all([
        db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []),
        db.getAll('QUARANTINED_MUTATIONS').catch(() => []),
        loadActiveShift().catch(() => null)
      ]);

      setOfflineQueue(queueItems || []);
      setQuarantinedCount(quarantinedItems?.length || 0);
      setActiveShift(shiftData);

      // 2. Role-Gated Telemetry Queries (Skipped for Cashiers)
      if (isOwner) {
        console.log('[useDashboardData] Running Owner-level telemetry & SRE snapshot queries...');
        const [snapshot, drift] = await Promise.all([
          getSystemStateSnapshot().catch(() => null),
          detectClockDrift().catch(() => null)
        ]);

        let integrity = null;
        if (isOnline) {
          const { supabase } = await import('../lib/supabaseClient');
          integrity = await runIntegrityCheck(supabase, { runDbChecks: true, silent: true }).catch(() => null);
        } else {
          integrity = await runIntegrityCheck(null, { runDbChecks: false, silent: true }).catch(() => null);
        }

        setSystemSnapshot(snapshot);
        setClockDrift(drift);
        setIntegrityReport(integrity);
      } else {
        // Clear telemetry states for non-owners
        setSystemSnapshot(null);
        setClockDrift(null);
        setIntegrityReport(null);
      }
    } catch (err) {
      console.warn('Failed to load offline data for dashboard hook:', err);
    } finally {
      setIsLoadingOffline(false);
    }
  };

  useEffect(() => {
    loadOfflineData();

    // Event-driven revalidation triggers
    const handleQueueUpdated = () => loadOfflineData();
    const handleSyncComplete = () => loadOfflineData();
    const handleShiftUpdated = () => loadOfflineData();
    const handleRevalidate = () => loadOfflineData();

    window.addEventListener('pos-queue-updated', handleQueueUpdated);
    window.addEventListener('global-sync-complete', handleSyncComplete);
    window.addEventListener('shift-updated', handleShiftUpdated);
    
    // Tab Focus & Visibility Change revalidation
    window.addEventListener('focus', handleRevalidate);
    window.addEventListener('visibilitychange', handleRevalidate);

    return () => {
      window.removeEventListener('pos-queue-updated', handleQueueUpdated);
      window.removeEventListener('global-sync-complete', handleSyncComplete);
      window.removeEventListener('shift-updated', handleShiftUpdated);
      window.removeEventListener('focus', handleRevalidate);
      window.removeEventListener('visibilitychange', handleRevalidate);
    };
  }, [userRole, isOnline]);

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
        // Fallback: Query only total_amount and created_at columns from transactions (lightweight)
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

  return {
    offlineQueue,
    quarantinedCount,
    activeShift,
    systemSnapshot,
    clockDrift,
    integrityReport,
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
    isLoading: (isOnline && isLoadingOnline) || isLoadingOffline,
    refetch: () => {
      loadOfflineData();
      if (isOnline) refetchOnline();
    }
  };
}
export default useDashboardData;
