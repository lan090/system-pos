// =========================================================================
// src/utils/dashboardSelectors.ts
// FSRMS v2.0 — Pure Selector Functions for Dashboard ViewModels
// =========================================================================

export interface SelectorOfflineQueueItem {
  id: string;
  type: string;
  metadata?: {
    total_amount?: number;
    customer_id?: string | null;
    service_ids?: string[];
    operator_name?: string;
    starting_cash?: number;
    actual_cash?: number;
    expected_cash?: number;
  };
  created_at?: string;
}

export interface SelectorOnlineTransaction {
  id: string;
  total_amount: number;
  customer_id?: string | null;
  payment_method: 'Cash' | 'QRIS' | 'Bank Transfer';
  created_at?: string;
  transaction_items?: Array<{ service_id: string }>;
}

const FALLBACK_GUEST_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Checks if a customer ID represents a guest/walk-in.
 */
export function isGuestId(id?: string | null): boolean {
  return !id || id === FALLBACK_GUEST_ID;
}

/**
 * Calculates total revenue combining online sales sum and offline queue transactions.
 */
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

/**
 * Calculates total transaction count combining online count and offline queue count.
 */
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

/**
 * Calculates yesterday's revenue.
 */
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

/**
 * Calculates yesterday's transaction count.
 */
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


/**
 * Calculates average ticket size.
 */
export function selectAverageTicketSize(revenue: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(revenue / count);
}

/**
 * Calculates guest vs customer ratio from online and offline transaction data.
 * Returns a number between 0 and 1.
 */
export function selectGuestRatio(
  onlineTxs: SelectorOnlineTransaction[],
  offlineQueue: SelectorOfflineQueueItem[]
): number {
  let guestCount = 0;
  let totalCount = 0;

  // Process online
  if (Array.isArray(onlineTxs)) {
    totalCount += onlineTxs.length;
    guestCount += onlineTxs.filter(tx => isGuestId(tx.customer_id)).length;
  }

  // Process offline
  const offlineTxs = offlineQueue.filter(item => item.type === 'CREATE_TRANSACTION');
  totalCount += offlineTxs.length;
  guestCount += offlineTxs.filter(item => isGuestId(item.metadata?.customer_id)).length;

  if (totalCount === 0) return 0;
  return Number((guestCount / totalCount).toFixed(2));
}

/**
 * Computes simple sync health status based on connection, queue depth, and quarantined count.
 */
export function selectSyncStatus(
  isOnline: boolean,
  pendingCount: number,
  quarantinedCount: number
): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (quarantinedCount > 0) {
    return 'CRITICAL';
  }
  if (!isOnline || pendingCount > 0) {
    return 'WARNING';
  }
  return 'HEALTHY';
}

/**
 * Aggregates top services combining online counts and offline queue metadata.
 * Returns sorted top 3 services.
 */
export function selectTopServices(
  onlineCounts: Record<string, number>,
  offlineQueue: SelectorOfflineQueueItem[],
  services: Array<{ id: string; nama_layanan: string }>
): Array<{ name: string; count: number; percentage: number; color: string; textClass: string }> {
  const counts: Record<string, number> = { ...onlineCounts };

  // Aggregate offline queue metadata
  offlineQueue
    .filter(item => item.type === 'CREATE_TRANSACTION' && item.metadata?.service_ids)
    .forEach(item => {
      item.metadata?.service_ids?.forEach(svcId => {
        counts[svcId] = (counts[svcId] || 0) + 1;
      });
    });

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  const colors = ['#D98897', '#6B3A44', '#FAF6F6'];
  const textClasses = ['text-[#D98897]', 'text-[#6B3A44]', 'text-zinc-400'];

  return Object.entries(counts)
    .map(([serviceId, count]) => {
      const svc = services.find(s => s.id === serviceId);
      return {
        name: svc?.nama_layanan || 'Unknown Service',
        count,
        percentage: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0,
        color: '',
        textClass: ''
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((item, idx) => ({
      ...item,
      color: colors[idx] || colors[0],
      textClass: textClasses[idx] || textClasses[0]
    }));
}

export function selectPaymentMethodSplits(
  onlineTxs: SelectorOnlineTransaction[],
  offlineQueue: SelectorOfflineQueueItem[]
): { Cash: number; QRIS: number; BankTransfer: number } {
  const splits = { Cash: 0, QRIS: 0, BankTransfer: 0 };

  if (Array.isArray(onlineTxs)) {
    onlineTxs.forEach(tx => {
      if (tx.payment_method === 'Cash') splits.Cash += tx.total_amount;
      else if (tx.payment_method === 'QRIS') splits.QRIS += tx.total_amount;
      else if (tx.payment_method === 'Bank Transfer') splits.BankTransfer += tx.total_amount;
    });
  }

  if (Array.isArray(offlineQueue)) {
    offlineQueue
      .filter(item => item.type === 'CREATE_TRANSACTION' && item.metadata)
      .forEach(item => {
        const pm = (item.metadata as any)?.payment_method;
        const amt = Number(item.metadata?.total_amount) || 0;
        if (pm === 'Cash') splits.Cash += amt;
        else if (pm === 'QRIS') splits.QRIS += amt;
        else if (pm === 'Bank Transfer') splits.BankTransfer += amt;
      });
  }

  const total = splits.Cash + splits.QRIS + splits.BankTransfer;
  if (total === 0) return { Cash: 0, QRIS: 0, BankTransfer: 0 };

  return {
    Cash: Math.round((splits.Cash / total) * 100),
    QRIS: Math.round((splits.QRIS / total) * 100),
    BankTransfer: Math.round((splits.BankTransfer / total) * 100)
  };
}

/**
 * Counts customers by membership tier from local customer cache.
 */
export function selectMembershipTierCounts(customers: any[]): { Platinum: number; Gold: number; Silver: number } {
  const counts = { Platinum: 0, Gold: 0, Silver: 0 };
  if (!Array.isArray(customers)) return counts;

  customers.forEach(c => {
    if (c.tier === 'Platinum') counts.Platinum++;
    else if (c.tier === 'Gold') counts.Gold++;
    else counts.Silver++; // Fallback standard
  });

  return counts;
}

/**
 * Formulates the active cashier shift summary.
 * expected_cash = starting_cash + online Cash sales.
 */
export function selectShiftSummary(
  activeShift: any,
  onlineTxs: SelectorOnlineTransaction[]
): {
  id?: string;
  operatorName: string;
  shiftStatus: 'Open' | 'Closed';
  startingCash: number;
  expectedCash: number;
  shiftDuration: string;
} {
  if (!activeShift) {
    return {
      id: undefined,
      operatorName: '',
      shiftStatus: 'Closed',
      startingCash: 0,
      expectedCash: 0,
      shiftDuration: '00:00'
    };
  }

  const startingCash = Number(activeShift.starting_cash) || 0;
  
  // Calculate online cash transactions sum
  let onlineCashSum = 0;
  if (Array.isArray(onlineTxs)) {
    onlineCashSum = onlineTxs
      .filter(tx => tx.payment_method === 'Cash')
      .reduce((sum, tx) => sum + Number(tx.total_amount), 0);
  }

  const expectedCash = startingCash + onlineCashSum;

  // Calculate shift duration
  let shiftDuration = '00:00';
  if (activeShift.start_time) {
    const start = new Date(activeShift.start_time).getTime();
    const now = Date.now();
    const diffMs = Math.max(0, now - start);
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    shiftDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  return {
    id: activeShift.id,
    operatorName: activeShift.operator_name || 'Kasir',
    shiftStatus: (activeShift.status as any) || 'Open',
    startingCash,
    expectedCash,
    shiftDuration
  };
}

/**
 * Aggregates booking statistics from appointment caches.
 */
export function selectBookingStatistics(appointments: any[]): {
  total: number;
  done: number;
  inProgress: number;
  scheduled: number;
} {
  const stats = { total: 0, done: 0, inProgress: 0, scheduled: 0 };
  if (!Array.isArray(appointments)) return stats;

  stats.total = appointments.length;
  appointments.forEach(app => {
    const status = app.status?.toLowerCase();
    if (status === 'done') stats.done++;
    else if (status === 'in progress') stats.inProgress++;
    else if (status === 'scheduled') stats.scheduled++;
  });

  return stats;
}

/**
 * Builds the System Diagnostics ViewModel with role gating.
 * Returns null if user is not Owner/Manager (Selector-level gate).
 */
export function selectSystemDiagnostics(
  userRole: string,
  snapshot: any,
  drift: any,
  integrity: any
): any | null {
  if (userRole !== 'Owner/Manager') {
    return null; // Strict selector-level gating
  }

  return {
    circuitBreakerStatus: snapshot?.syncEngine?.frozen ? 'OPEN' : 'CLOSED',
    circuitBreakerFailures: snapshot?.quarantine?.count || 0,
    cooldownRemainingMs: 0,
    syncFailureRate: 0,
    integrityStatus: integrity?.overallStatus || 'CLEAN',
    clockDriftMs: drift?.driftMs || 0,
    localIssues: snapshot?.quarantine?.items || [],
    recentErrors: snapshot?.recentErrors || []
  };
}

export interface HybridRevenueResult {
  finalRevenueSeries: Array<{ date: string; total: number }>;
  serverRevenueSeries: Array<{ date: string; total: number }>;
  offlineDeltaSeries: Array<{ date: string; total: number }>;
  conflictResolutionLog: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
}

/**
 * Hybrid Revenue Selector: Merges aggregated server revenue series and client offline queue mutations.
 * Enforces metadata fast-path only, zero decryption, deduplicates by UUID, and limits loop iterations to 500 max.
 * Returns the final merged series, server base series, offline delta series, and conflict logs.
 */
export function selectHybridRevenueSeries(
  serverRevenue: Array<{ date: string; total: number }>,
  offlineQueue: SelectorOfflineQueueItem[]
): HybridRevenueResult {
  const serverMap: Record<string, number> = {};
  const offlineMap: Record<string, number> = {};
  const finalMap: Record<string, number> = {};
  const conflictResolutionLog: Array<{ type: string; message: string; timestamp: string }> = [];

  // 1. Initialize server map (Immutable authority)
  if (Array.isArray(serverRevenue)) {
    serverRevenue.forEach(item => {
      if (item.date) {
        const amt = Number(item.total) || 0;
        serverMap[item.date] = amt;
        finalMap[item.date] = amt;
      }
    });
  }

  // 2. Add offline uncommitted transactions (overlay delta)
  const maxOfflineItems = 500;
  const pendingOfflineTxs = (offlineQueue || [])
    .filter(item => {
      const isPendingTx = item.type === 'CREATE_TRANSACTION';
      const metadataStatus = (item.metadata as any)?.status;
      const isNotRefundedOrCancelled = metadataStatus !== 'Refunded' && metadataStatus !== 'Cancelled';
      return isPendingTx && isNotRefundedOrCancelled && item.metadata && item.metadata.total_amount !== undefined;
    })
    .slice(0, maxOfflineItems);

  const processedIds = new Set<string>();

  pendingOfflineTxs.forEach(item => {
    if (item.id) {
      if (processedIds.has(item.id)) {
        conflictResolutionLog.push({
          type: 'DUPLICATE_OFFLINE_ID',
          message: `Deduplicated offline transaction UUID ${item.id}`,
          timestamp: new Date().toISOString()
        });
        return;
      }
      processedIds.add(item.id);

      // Extract date in YYYY-MM-DD Jakarta timezone
      let dateStr: string;
      try {
        dateStr = item.created_at 
          ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.created_at))
          : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      } catch (err) {
        dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      }

      const amount = Number(item.metadata?.total_amount) || 0;

      offlineMap[dateStr] = (offlineMap[dateStr] || 0) + amount;
      finalMap[dateStr] = (finalMap[dateStr] || 0) + amount;
    }
  });

  // 3. Map back to arrays and sort
  const serverRevenueSeries = Object.entries(serverMap).map(([date, total]) => ({
    date,
    total
  })).sort((a, b) => a.date.localeCompare(b.date));

  const offlineDeltaSeries = Object.entries(offlineMap).map(([date, total]) => ({
    date,
    total
  })).sort((a, b) => a.date.localeCompare(b.date));

  const finalRevenueSeries = Object.entries(finalMap).map(([date, total]) => ({
    date,
    total
  })).sort((a, b) => a.date.localeCompare(b.date));

  return {
    finalRevenueSeries,
    serverRevenueSeries,
    offlineDeltaSeries,
    conflictResolutionLog
  };
}
