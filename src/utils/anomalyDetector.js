// =========================================================================
// src/utils/anomalyDetector.js
// FSRMS v2.0 — Preventive Anomaly Detection Layer
// =========================================================================

import { openSecureDB, detectClockDrift } from './storageEngine';
import { openIncident } from './incidentManager';

const QUEUE_THRESHOLDS = {
  warning: 21,
  critical: 51,
  freeze: 101
};

export async function checkQueueSizeAnomaly() {
  const db = await openSecureDB();
  const queueItems = await db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []);
  const depth = queueItems.length;
  db.close();

  let status = 'NORMAL';
  if (depth >= QUEUE_THRESHOLDS.freeze) {
    status = 'FREEZE';
  } else if (depth >= QUEUE_THRESHOLDS.critical) {
    status = 'CRITICAL';
  } else if (depth >= QUEUE_THRESHOLDS.warning) {
    status = 'WARNING';
  }

  const result = { metric: 'QUEUE_DEPTH', value: depth, status, threshold: QUEUE_THRESHOLDS };

  if (status === 'FREEZE') {
    // Auto-freeze: too many items = something is fundamentally wrong with sync
    const db2 = await openSecureDB();
    await db2.put('SYNC_ENGINE_STATE', {
      id: 'state',
      frozen: true,
      frozenAt: new Date().toISOString(),
      reason: `AUTO_FREEZE: Queue depth ${depth} exceeded freeze threshold (${QUEUE_THRESHOLDS.freeze})`
    });
    db2.close();

    await openIncident({
      code: 'QUEUE_OVERFLOW',
      severity: 'P1',
      description: `Queue depth ${depth} exceeded freeze threshold. Sync engine frozen automatically.`,
      traceId: null,
      autoActions: ['FREEZE_SYNC_ENGINE']
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-hard-failure', { detail: result }));
    }
  } else if (status === 'CRITICAL') {
    await openIncident({
      code: 'QUEUE_OVERFLOW',
      severity: 'P2',
      description: `Queue depth is critical: ${depth} items pending sync.`,
      traceId: null
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: result }));
    }
  } else if (status === 'WARNING') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: result }));
    }
  }

  return result;
}

export async function checkTransactionMismatch(supabase, currentShiftId) {
  if (!currentShiftId) {
    return { metric: 'TX_MISMATCH', status: 'NORMAL', localCount: 0, serverCount: 0 };
  }

  // Count local transactions in current shift
  const db = await openSecureDB();
  const localTxs = await db.getAll('LOCAL_TRANSACTION_CACHE').catch(() => []);
  const shiftTxs = localTxs.filter(tx =>
    tx.shift_id === currentShiftId && tx.status === 'Done'
  );
  const localCount = shiftTxs.length;
  db.close();

  if (localCount === 0) return { metric: 'TX_MISMATCH', status: 'NORMAL', localCount: 0, serverCount: 0 };

  // Count server transactions in current shift
  let serverCount = 0;
  try {
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('shift_id', currentShiftId)
      .eq('status', 'Done');
    
    if (error) throw error;
    serverCount = count || 0;
  } catch (err) {
    return { metric: 'TX_MISMATCH', status: 'UNKNOWN', localCount, serverCount: null, error: err.message };
  }

  const mismatchRatio = Math.abs(localCount - serverCount) / Math.max(localCount, 1);
  const missingCount = localCount - serverCount;

  const status = mismatchRatio > 0.20 ? 'CRITICAL'
               : mismatchRatio > 0.05 ? 'WARNING'
               : 'NORMAL';

  const result = { metric: 'TX_MISMATCH', value: mismatchRatio, localCount, serverCount, missingCount, status };

  if (status === 'CRITICAL') {
    await openIncident({
      code: 'DB_INCONSISTENCY',
      severity: 'P1',
      description: `Transaction mismatch detected in shift ${currentShiftId}: ${missingCount} transactions missing from server.`,
      traceId: null
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-hard-failure', { detail: result }));
    }
  } else if (status === 'WARNING') {
    await openIncident({
      code: 'DB_INCONSISTENCY',
      severity: 'P2',
      description: `Minor transaction mismatch detected in shift ${currentShiftId}: ${missingCount} transactions unsynced.`,
      traceId: null
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: result }));
    }
  }

  return result;
}

export function startOfflineTracking() {
  const offlineStart = Date.now();
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('fsrms_offline_since', offlineStart.toString());
  }

  const THRESHOLDS = {
    warning: 15 * 60 * 1000,   // 15 min
    critical: 60 * 60 * 1000,  // 1 hour
    freeze: 3 * 60 * 60 * 1000 // 3 hours
  };

  const offlineMonitor = setInterval(async () => {
    if (navigator.onLine) {
      clearInterval(offlineMonitor);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('fsrms_offline_since');
      }
      return;
    }

    const duration = Date.now() - offlineStart;
    const durationMin = Math.round(duration / 60000);

    let status = 'NORMAL';
    if (duration >= THRESHOLDS.freeze)    status = 'FREEZE';
    else if (duration >= THRESHOLDS.critical) status = 'CRITICAL';
    else if (duration >= THRESHOLDS.warning)  status = 'WARNING';

    const result = {
      metric: 'OFFLINE_DURATION',
      durationMs: duration,
      durationMin,
      status
    };

    if (status === 'FREEZE') {
      clearInterval(offlineMonitor);
      // Freeze further transactions — offline too long
      const db = await openSecureDB();
      await db.put('SYNC_ENGINE_STATE', {
        id: 'state',
        frozen: true,
        frozenAt: new Date().toISOString(),
        reason: `AUTO_FREEZE: Device offline for ${durationMin} minutes`
      });
      db.close();

      await openIncident({
        code: 'OFFLINE_PROLONGED',
        severity: 'P1',
        description: `Device offline for ${durationMin} minutes. Sync engine frozen automatically.`,
        traceId: null
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-hard-failure', { detail: result }));
      }
    } else if (status === 'CRITICAL') {
      await openIncident({
        code: 'OFFLINE_PROLONGED',
        severity: 'P2',
        description: `Device offline for ${durationMin} minutes. Sync queue depth growing.`,
        traceId: null
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: result }));
      }
    } else if (status === 'WARNING') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: result }));
      }
    }
  }, 60 * 1000); // check every 1 minute

  return offlineMonitor;
}

export async function runAllAnomalyChecks(supabase, currentShiftId) {
  const results = {};

  // Run all 5 sensors concurrently (read-only, safe to parallelize)
  const [queueResult, driftResult] = await Promise.allSettled([
    checkQueueSizeAnomaly(),
    detectClockDrift()
  ]);

  results.queue = queueResult.status === 'fulfilled' ? queueResult.value : { status: 'ERROR', message: queueResult.reason?.message };
  results.clockDrift = driftResult.status === 'fulfilled' ? driftResult.value : { status: 'ERROR', message: driftResult.reason?.message };

  // TX mismatch only runs when online (requires Supabase)
  if (navigator.onLine && supabase && currentShiftId) {
    const mismatchResult = await checkTransactionMismatch(supabase, currentShiftId);
    results.txMismatch = mismatchResult;
  }

  const overallStatus = Object.values(results).some(r => r.status === 'FREEZE' || r.status === 'CRITICAL')
    ? 'CRITICAL'
    : Object.values(results).some(r => r.status === 'WARNING')
    ? 'WARNING'
    : 'NORMAL';

  return { timestamp: new Date().toISOString(), results, overallStatus };
}
