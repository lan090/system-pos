import { supabase } from '../lib/supabaseClient';
import {
  getStorageAdapter,
  getSessionCredentials,
  decryptData,
  sendTelemetry
} from './storageEngine';
import { emitInfo, emitWarn, emitError } from './observability';
import { failureSimulator } from './replayEngine';


let adaptiveTimeoutId = null;
let isSyncing = false;

// Deterministic Time Scheduler Core
let activeTimers = new Map();
let timerIdCounter = 1;
let virtualTime = 0;
let isVirtualTimeEnabled = false;

export const scheduler = {
  setTimeout: (callback, delay) => {
    if (isVirtualTimeEnabled) {
      const id = timerIdCounter++;
      activeTimers.set(id, { callback, triggerTime: virtualTime + delay });
      return id;
    }
    return setTimeout(callback, delay);
  },
  clearTimeout: (id) => {
    if (isVirtualTimeEnabled) {
      activeTimers.delete(id);
      return;
    }
    clearTimeout(id);
  },
  now: () => {
    if (isVirtualTimeEnabled) {
      return virtualTime;
    }
    return Date.now();
  },
  enableVirtualTime: (startAt = Date.now()) => {
    isVirtualTimeEnabled = true;
    virtualTime = startAt;
    activeTimers.clear();
    console.log(`[VIRTUAL-SCHEDULER] Virtual time enabled at ${startAt}`);
  },
  disableVirtualTime: () => {
    isVirtualTimeEnabled = false;
    activeTimers.clear();
    console.log('[VIRTUAL-SCHEDULER] Virtual time disabled');
  },
  tick: async (ms) => {
    if (!isVirtualTimeEnabled) return;
    const targetTime = virtualTime + ms;
    console.log(`[VIRTUAL-SCHEDULER] Ticking clock forward by ${ms}ms to ${targetTime}`);
    while (true) {
      let nextTimer = null;
      let nextId = null;
      for (const [id, timer] of activeTimers.entries()) {
        if (timer.triggerTime <= targetTime) {
          if (!nextTimer || timer.triggerTime < nextTimer.triggerTime) {
            nextTimer = timer;
            nextId = id;
          }
        }
      }
      if (!nextTimer) break;
      virtualTime = nextTimer.triggerTime;
      activeTimers.delete(nextId);
      await nextTimer.callback();
    }
    virtualTime = targetTime;
  }
};

// Expose to window for testing
if (typeof window !== 'undefined') {
  window.__fsrms_scheduler = scheduler;
}

// Circuit Breaker state machine
let circuitBreaker = {
  status: 'CLOSED', // 'CLOSED', 'OPEN', 'HALF-OPEN'
  failures: 0,
  cooldownUntil: 0,
  currentCooldownDuration: 30000 // starts at 30 seconds, doubles up to 300s
};

export async function getAdaptiveBackoffDelay() {
  try {
    const db = await getStorageAdapter();
    const items = await db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []);
    if (items.length === 0) return 30000; // default 30s
    
    // Find oldest/highest retry count
    const maxRetry = Math.max(...items.map(i => i.retryCount || 0));
    
    const base = 1000; // 1 second base
    const exp = Math.min(maxRetry, 6); // cap exponent at 6 (2^6 = 64 seconds)
    const jitter = Math.random() * 1000; // up to 1s jitter
    
    const delay = Math.pow(2, exp) * base + jitter;
    return Math.min(delay, 60000); // cap max delay at 60s
  } catch {
    return 30000;
  }
}

export async function scheduleAdaptiveSync() {
  if (adaptiveTimeoutId) scheduler.clearTimeout(adaptiveTimeoutId);
  
  const delay = await getAdaptiveBackoffDelay();
  console.log(`[SYNC-BACKOFF] Scheduling next sync heartbeat in ${Math.round(delay)}ms.`);
  
  adaptiveTimeoutId = scheduler.setTimeout(async () => {
    await flushMutationQueue();
    await scheduleAdaptiveSync();
  }, delay);
}

// Setup WebKit main-thread fallbacks
function setupWebKitFallback() {
  // a) online window event
  window.addEventListener('online', () => {
    console.log('WebKit Fallback: Network online event triggered.');
    flushMutationQueue();
  });

  // b) visibilitychange event when returning to foreground
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('WebKit Fallback: App focused, flushing queue.');
      flushMutationQueue();
    }
  });

  // c) Adaptive heartbeat while foregrounded
  scheduleAdaptiveSync();

  window.addEventListener('blur', () => {
    if (adaptiveTimeoutId) {
      scheduler.clearTimeout(adaptiveTimeoutId);
      adaptiveTimeoutId = null;
    }
  });

  window.addEventListener('focus', () => {
    scheduleAdaptiveSync();
  });
}

// Batch Coalescing Algorithm to optimize mutations and prevent N+1 conflicts
export function batchCoalesceMutations(mutations) {
  const coalescedMap = new Map();
  const listToKeep = [];

  for (const m of mutations) {
    // Unique identifier based on type + entity id
    const entityId = m.payload.id || m.payload.customer_id || m.payload.service_id;
    const key = `${m.type}_${entityId}`;

    if (m.type === 'UPDATE_CUSTOMER' || m.type === 'ADD_CUSTOMER_VISIT') {
      if (coalescedMap.has(key)) {
        const existing = coalescedMap.get(key);
        // Coalesce visits delta
        existing.payload.totalVisits = (existing.payload.totalVisits || 0) + (m.payload.totalVisitsDelta || 1);
        if (m.payload.notes) {
          existing.payload.notes = `${existing.payload.notes || ''}; ${m.payload.notes}`.replace(/^;\s*/, '');
        }
        existing.payload = { ...existing.payload, ...m.payload, totalVisits: existing.payload.totalVisits, notes: existing.payload.notes };
      } else {
        coalescedMap.set(key, { ...m });
      }
    } else {
      listToKeep.push(m);
    }
  }

  const finalMutations = [...listToKeep, ...coalescedMap.values()];

  // Sort mutations to enforce logical foreign key dependency safety
  // Rule: Shifts and Customers/Services always first, Transactions before Close Shift!
  return finalMutations.sort((a, b) => {
    // 1. Shifts, Customers/Services, and Therapists always first
    const isParentA = a.type === 'CREATE_CASH_SHIFT' || a.type === 'CREATE_CUSTOMER' || a.type === 'CREATE_SERVICE' || a.type === 'CREATE_THERAPIST';
    const isParentB = b.type === 'CREATE_CASH_SHIFT' || b.type === 'CREATE_CUSTOMER' || b.type === 'CREATE_SERVICE' || b.type === 'CREATE_THERAPIST';
    
    if (isParentA && !isParentB) return -1;
    if (isParentB && !isParentA) return 1;

    // 2. Appointments before Transactions (due to transaction referencing appointment_id)
    if (a.type === 'CREATE_APPOINTMENT' && b.type === 'CREATE_TRANSACTION') return -1;
    if (b.type === 'CREATE_APPOINTMENT' && a.type === 'CREATE_TRANSACTION') return 1;

    // 3. Transactions before Close Shift
    if (a.type !== 'CLOSE_CASH_SHIFT' && b.type === 'CLOSE_CASH_SHIFT') return -1;
    if (b.type !== 'CLOSE_CASH_SHIFT' && a.type === 'CLOSE_CASH_SHIFT') return 1;

    return new Date(a.created_at || a.timestamp || Date.now()).getTime() - new Date(b.created_at || b.timestamp || Date.now()).getTime();
  });
}

// Helper to record latency histogram metrics inside SYNC_ENGINE_STATE
async function recordLatencyMetric(durationMs) {
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction('SYNC_ENGINE_STATE', 'readwrite');
    const store = tx.objectStore('SYNC_ENGINE_STATE');
    const metrics = await store.get('sync_metrics_histogram') || {
      id: 'sync_metrics_histogram',
      total_sync_attempts: 0,
      successful_syncs: 0,
      '0-200ms': 0,
      '200-500ms': 0,
      '500-1000ms': 0,
      '1000-5000ms': 0,
      '>5000ms': 0
    };
    
    metrics.total_sync_attempts++;
    metrics.successful_syncs++;
    
    if (durationMs <= 200) metrics['0-200ms']++;
    else if (durationMs <= 500) metrics['200-500ms']++;
    else if (durationMs <= 1000) metrics['500-1000ms']++;
    else if (durationMs <= 5000) metrics['1000-5000ms']++;
    else metrics['>5000ms']++;
    
    await store.put(metrics);
    await tx.done;
  } catch (err) {
    console.error('[METRICS] Failed to record latency metric:', err);
  }
}

// Helper to manage mutation retry counting and DLQ quarantine via StorageAdapter (Atomic Read-Modify-Write)
async function handleMutationFailure(mut, errorMsg, isNonTransient = false) {
  const targetId = mut.id || mut.queueId;
  if (!targetId) return;

  try {
    const db = await getStorageAdapter();
    const tx = db.transaction(['OFFLINE_MUTATION_QUEUE', 'QUARANTINED_MUTATIONS'], 'readwrite');
    const queueStore = tx.objectStore('OFFLINE_MUTATION_QUEUE');
    const quarantineStore = tx.objectStore('QUARANTINED_MUTATIONS');

    const queueItem = await queueStore.get(targetId);
    if (!queueItem) {
      await tx.done;
      return;
    }

    const currentRetryCount = (queueItem.retryCount || 0) + 1;
    queueItem.retryCount = currentRetryCount;

    // Trigger Circuit Breaker for network/transport errors
    const isTransportError = errorMsg.includes('Network transport failure') || 
                             errorMsg.includes('503') || 
                             errorMsg.includes('timeout') ||
                             errorMsg.includes('TypeError: Failed to fetch') ||
                             errorMsg.includes('SIMULATED_FAILURE');

    if (isTransportError && !isNonTransient) {
      circuitBreaker.failures++;
      if (circuitBreaker.failures >= 3 || circuitBreaker.status === 'HALF-OPEN') {
        circuitBreaker.status = 'OPEN';
        circuitBreaker.currentCooldownDuration = Math.min(circuitBreaker.currentCooldownDuration * 2, 300000);
        circuitBreaker.cooldownUntil = scheduler.now() + circuitBreaker.currentCooldownDuration;
        console.warn(`[SYNC-CIRCUIT-BREAKER] Tripped to OPEN. Cooldown active for ${circuitBreaker.currentCooldownDuration}ms. Failures: ${circuitBreaker.failures}`);
      }
    }

    const shouldQuarantine = isNonTransient || currentRetryCount >= 5;

    // Standardized Telemetry Schema Event
    await emitWarn({
      correlationId: queueItem.correlationId || 'NO_CORRELATION',
      eventType: shouldQuarantine ? 'DLQ_ACTIVATION' : 'RETRY_ATTEMPT',
      layer: 'SYNC',
      entityId: mut.payload?.id || null,
      message: shouldQuarantine 
        ? `Mutation quarantined. Limit reached or non-transient. Error: ${errorMsg}`
        : `Mutation sync failed (attempt ${currentRetryCount}). Error: ${errorMsg}`,
      metadata: {
        queueId: targetId,
        mutationType: mut.type,
        retryCount: currentRetryCount,
        error: errorMsg
      }
    });

    if (shouldQuarantine) {
      // Transfer to QUARANTINED_MUTATIONS
      await quarantineStore.put({
        ...mut,
        queueId: targetId,
        retryCount: currentRetryCount,
        quarantinedAt: new Date().toISOString(),
        errorLog: errorMsg,
        incident_metadata: {
          error: errorMsg,
          quarantined_at: new Date().toISOString(),
          type: isNonTransient ? 'NON_TRANSIENT' : 'RETRY_LIMIT_EXCEEDED'
        }
      });

      // Delete from OFFLINE_MUTATION_QUEUE
      await queueStore.delete(targetId);
      console.warn(`[SYNC] Mutation #${targetId} isolated to DLQ quarantine. Reason: ${isNonTransient ? 'Non-transient error' : 'Retry limit >= 5'}. Error: ${errorMsg}`);
    } else {
      // Update queue item wrapper with incremented retry count
      await queueStore.put(queueItem);
      console.log(`[SYNC] Mutation #${targetId} retryCount incremented to ${currentRetryCount}. Error: ${errorMsg}`);
    }

    await tx.done;
  } catch (err) {
    console.error(`[SYNC] Error in handleMutationFailure for mutation #${targetId}:`, err);
    await emitError({
      correlationId: mut.correlationId || 'NO_CORRELATION',
      eventType: 'STORAGE_ERROR',
      layer: 'STORAGE',
      message: `Failed to execute handleMutationFailure: ${err.message || err}`,
      metadata: { targetId, error: err.message || err }
    });
  }
}

// Centralized runner that performs actual sync loop
async function doFlushMutationQueue() {
  console.log('[SYNC-TRACE] doFlushMutationQueue() started.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.warn('[SYNC-TRACE] BREAK POINT: navigator.onLine=false. Flush aborted.');
    return;
  }

  const credentials = await getSessionCredentials();
  if (!credentials || !credentials.token) {
    console.warn('[SYNC-TRACE] BREAK POINT: No session token. Flush postponed.');
    return;
  }

  const { token, supabaseUrl, supabaseAnonKey } = credentials;

  if (!supabaseUrl) {
    console.error('[SYNC-TRACE] BREAK POINT: supabaseUrl missing from credentials.');
    return;
  }
  if (!supabaseAnonKey || supabaseAnonKey.split('.').length !== 3) {
    console.error('[SYNC-TRACE] BREAK POINT: supabaseAnonKey invalid or not a 3-part JWT.');
    return;
  }

  console.log('[SYNC-TRACE] flushMutationQueue: credentials OK. Reading queue...');
  const db = await getStorageAdapter();
  const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readonly');
  const store = tx.objectStore('OFFLINE_MUTATION_QUEUE');
  const rawItems = await store.getAll();

  if (rawItems.length === 0) {
    db.close();
    return;
  }

  console.log(`Sync Engine: Found ${rawItems.length} encrypted mutations. Decrypting...`);

  let successCount = 0;
  let failCount = 0;
  let lastErrorMsg = '';

  const decryptedMutations = [];
  for (const item of rawItems) {
    try {
      const decryptedPayload = await decryptData(item.payload, token);
      decryptedMutations.push({
        queueId: item.id,
        ...decryptedPayload
      });
    } catch (err) {
      console.error(`Sync Engine: Decryption failed for queued item #${item.id}. Quarantining.`, err);
      const dbAdapter = await getStorageAdapter();
      const secureTx = dbAdapter.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
      await secureTx.objectStore('OFFLINE_MUTATION_QUEUE').delete(item.id);
      await secureTx.done;
      failCount++;
      lastErrorMsg = err.message || 'Decryption failed';
    }
  }

  db.close();

  const coalescedMutations = batchCoalesceMutations(decryptedMutations);
  console.log(`Sync Engine: Coalescing reduced pipeline from ${decryptedMutations.length} to ${coalescedMutations.length} requests.`);

  const quarantinedEntityIds = new Set();

  const sleep = (ms) => new Promise((resolve) => {
    if (isVirtualTimeEnabled) {
      virtualTime += ms;
      resolve();
    } else {
      setTimeout(resolve, ms);
    }
  });

  for (let idx = 0; idx < coalescedMutations.length; idx++) {
    const mut = coalescedMutations[idx];

    // Quarantine propagation check: if a parent failed in this batch, quarantine descendants
    const dependsOnQuarantined = 
      (mut.payload?.customer_id && quarantinedEntityIds.has(mut.payload.customer_id)) ||
      (mut.payload?.shift_id && quarantinedEntityIds.has(mut.payload.shift_id)) ||
      (mut.payload?.appointment_id && quarantinedEntityIds.has(mut.payload.appointment_id)) ||
      (mut.type === 'CLOSE_CASH_SHIFT' && quarantinedEntityIds.has(mut.payload.id)) ||
      (mut.type === 'CREATE_TRANSACTION' && mut.payload?.id && Array.isArray(mut.payload.cart) && 
        mut.payload.cart.some(item => quarantinedEntityIds.has(item.service_id)));

    if (dependsOnQuarantined) {
      console.warn(`[SYNC] Quarantine propagating: mutation type="${mut.type}" id="${mut.payload?.id || mut.id}" depends on a quarantined parent entity.`);
      if (mut.payload?.id) quarantinedEntityIds.add(mut.payload.id);
      
      await handleMutationFailure(mut, 'Quarantine propagation from parent dependency failure', true);
      failCount++;
      continue;
    }

    if (idx > 0) {
      await sleep(200); // 200ms rate limiting cooldown between mutations
    }

    const syncStart = scheduler.now();
    try {
      let response;
      await emitInfo({
        correlationId: mut.correlationId || 'NO_CORRELATION',
        eventType: 'SYNC_START',
        layer: 'SYNC',
        entityId: mut.payload?.id || mut.id || null,
        message: `Sync attempt: ${mut.type}`,
        metadata: { mutationType: mut.type }
      });

      const freshCredentials = await getSessionCredentials();
      const freshAnonKey = freshCredentials?.supabaseAnonKey || supabaseAnonKey;
      let freshToken = freshCredentials?.token || token;

      if (!freshToken || freshToken.split('.').length !== 3) {
        console.warn('Sync Engine: freshToken tidak valid atau format mock (1-part). Menggunakan freshAnonKey untuk Authorization.');
        freshToken = freshAnonKey;
      }

      // Perform operations via centralized Supabase Client
      if (failureSimulator.shouldSimulateFailure(mut.type)) {
        console.warn(`[SIMULATION] Injecting simulated failure for mutation type: ${mut.type}`);
        response = {
          ok: false,
          status: 503,
          json: async () => ({ message: 'SIMULATED_FAILURE', code: '503' }),
          text: async () => 'SIMULATED_FAILURE'
        };
      } else if (mut.type === 'CREATE_CUSTOMER') {
        const customerPayload = {
          id: mut.payload.id,
          nama_lengkap: mut.payload.name,
          nomor_telepon: mut.payload.phone || null,
          email: mut.payload.email || null,
          discount_id: mut.payload.discount_id || null,
          catatan_khusus: mut.payload.notes || null,
          membership_tier: mut.payload.tier || 'Silver',
          total_omset: mut.payload.totalOmset || 0.00,
          total_kunjungan: mut.payload.totalVisits || 1,
          customer_type: mut.payload.customer_type || 'STANDARD'
        };
        console.log('[CREATE_CUSTOMER] Payload sebelum dikirim ke Supabase:', JSON.stringify(customerPayload));

        const query = supabase
          .from('customers')
          .upsert(customerPayload)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        console.log('[CREATE_CUSTOMER] Respons Supabase:', JSON.stringify({ data, error, status }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };

      } else if (mut.type === 'UPDATE_CUSTOMER') {
        const customerPayload = {
          id: mut.payload.id,
          nama_lengkap: mut.payload.name,
          nomor_telepon: mut.payload.phone || null,
          email: mut.payload.email || null,
          discount_id: mut.payload.discount_id || null,
          catatan_khusus: mut.payload.notes || null,
          membership_tier: mut.payload.tier || 'Silver',
          total_omset: mut.payload.totalOmset || 0.00,
          total_kunjungan: mut.payload.totalVisits || 0,
          customer_type: mut.payload.customer_type || 'STANDARD'
        };
        console.log('[UPDATE_CUSTOMER] Payload sebelum dikirim ke Supabase:', JSON.stringify(customerPayload));

        const query = supabase
          .from('customers')
          .upsert(customerPayload)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        console.log('[UPDATE_CUSTOMER] Respons Supabase:', JSON.stringify({ data, error, status }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };

      } else if (mut.type === 'DELETE_CUSTOMER') {
        console.log('[DELETE_CUSTOMER] ID:', mut.payload.id);

        const query = supabase
          .from('customers')
          .delete()
          .eq('id', mut.payload.id);
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { error, status } = await query;

        console.log('[DELETE_CUSTOMER] Respons Supabase:', JSON.stringify({ error, status }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : { message: 'Deleted' },
          text: async () => JSON.stringify(error || { message: 'Deleted' })
        };

      } else if (mut.type === 'CREATE_SERVICE') {
        const query = supabase
          .from('services')
          .upsert({
            id: mut.payload.id,
            nama_layanan: mut.payload.nama_layanan,
            kategori: mut.payload.kategori,
            harga_jual: mut.payload.harga_jual,
            description: mut.payload.description || null,
            available_offline: Boolean(mut.payload.available_offline ?? true),
            is_active: Boolean(mut.payload.is_active ?? true)
          })
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'CREATE_APPOINTMENT') {
        const payload = {
          id: mut.payload.id,
          customer_id: mut.payload.customer_id || '00000000-0000-0000-0000-000000000000',
          therapist_id: mut.payload.therapist_id,
          service_id: (mut.payload.service_id && mut.payload.service_id !== '00000000-0000-0000-0000-000000000000') 
            ? mut.payload.service_id 
            : '11111111-1111-1111-1111-111111111111',
          appointment_ts: mut.payload.appointment_ts || mut.payload.date || new Date().toISOString(),
          status: mut.payload.status || 'Scheduled'
        };
        console.log('APPOINTMENT_PAYLOAD (CREATE)', payload);

        const query = supabase
          .from('appointments')
          .upsert(payload)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status, statusText } = await query;

        console.log('[SUPABASE_DIAGNOSTICS] appointment write: ' + JSON.stringify({
          payload,
          method: 'upsert()',
          requestPath: 'offline queue write',
          response: { data, error, status, statusText }
        }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'UPDATE_APPOINTMENT') {
        const payload = {
          status: mut.payload.status
        };
        console.log('APPOINTMENT_PAYLOAD (UPDATE)', { id: mut.payload.id, ...payload });

        const query = supabase
          .from('appointments')
          .update(payload)
          .eq('id', mut.payload.id)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status, statusText } = await query;

        console.log('[SUPABASE_DIAGNOSTICS] appointment write: ' + JSON.stringify({
          payload: { id: mut.payload.id, ...payload },
          method: 'update()',
          requestPath: 'offline queue write',
          response: { data, error, status, statusText }
        }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'CREATE_TRANSACTION' || mut.type === 'UPDATE_TRANSACTION') {
        const query = supabase
          .from('transactions')
          .upsert({
            id: mut.payload.id,
            session_id: mut.payload.session_id || crypto.randomUUID(),
            customer_id: mut.payload.customer_id || null,
            customer_name: mut.payload.customer_name || null,
            customer_phone: mut.payload.customer_phone || null,
            processed_by: mut.payload.processed_by,
            appointment_id: mut.payload.appointment_id || null,
            discount_id: mut.payload.discount_id || null,
            discount_amount: mut.payload.discount_amount || 0,
            payment_method: mut.payload.payment_method,
            offline_sender: mut.payload.offline_sender || null,
            offline_media: mut.payload.offline_media || null,
            status: mut.payload.status || 'Done',
            total_amount: mut.payload.total_amount,
            shift_id: mut.payload.shift_id || null,
            created_at: mut.payload.created_at,
            synchronized_at: new Date().toISOString()
          })
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status: txStatus } = await query;

        if (error) {
          response = {
            ok: false,
            status: txStatus,
            json: async () => error,
            text: async () => JSON.stringify(error)
          };
        } else {
          if (mut.payload.cart && mut.payload.cart.length > 0) {
            const itemsToInsert = mut.payload.cart.map((item) => ({
              transaction_id: mut.payload.id,
              service_id: item.service_id,
              price_at_sale: item.harga_jual
            }));

            const itemsQuery = supabase
              .from('transaction_items')
              .upsert(itemsToInsert);
            itemsQuery.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
            const { error: itemsErr, status: itemsStatus } = await itemsQuery;

            if (itemsErr) {
              response = {
                ok: false,
                status: itemsStatus,
                json: async () => itemsErr,
                text: async () => JSON.stringify(itemsErr)
              };
            } else {
              response = {
                ok: true,
                status: 201,
                json: async () => ({ message: 'OK' }),
                text: async () => 'OK'
              };
            }
          } else {
            response = {
              ok: true,
              status: txStatus,
              json: async () => data,
              text: async () => JSON.stringify(data)
            };
          }
        }
      } else if (mut.type === 'CREATE_CASH_SHIFT') {
        const query = supabase
          .from('cash_shifts')
          .upsert({
            id: mut.payload.id,
            cashier_id: mut.payload.cashier_id,
            operator_name: mut.payload.operator_name,
            starting_cash: mut.payload.starting_cash,
            expected_cash: mut.payload.expected_cash,
            status: mut.payload.status || 'Open',
            start_time: mut.payload.start_time || new Date().toISOString()
          })
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'CLOSE_CASH_SHIFT') {
        const query = supabase
          .from('cash_shifts')
          .update({
            actual_cash: mut.payload.actual_cash,
            expected_cash: mut.payload.expected_cash,
            status: 'Closed',
            end_time: mut.payload.end_time || new Date().toISOString()
          })
          .eq('id', mut.payload.id)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'CREATE_THERAPIST') {
        const query = supabase
          .from('therapists')
          .upsert({
            id: mut.payload.id,
            nama: mut.payload.nama,
            is_active: Boolean(mut.payload.is_active ?? true),
            created_at: mut.payload.created_at || new Date().toISOString()
          })
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      } else if (mut.type === 'UPDATE_THERAPIST') {
        const query = supabase
          .from('therapists')
          .update({
            nama: mut.payload.nama,
            is_active: mut.payload.is_active
          })
          .eq('id', mut.payload.id)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
      }

      if (response) {
        console.log("📡 STATUS RESPONS SUPABASE:", {
          ok: response.ok,
          status: response.status,
          hasJson: typeof response.json === 'function'
        });

        if (typeof response.json === 'function') {
          try {
            const resData = await response.json();
            console.log("📦 ISI DATA/ERROR DARI SUPABASE:", resData);
          } catch (e) {
            console.log("⚠️ Gagal membaca json respons:", e.message);
          }
        }

        if (response.ok || (response.status >= 200 && response.status <= 299)) {
          const targetId = mut.id || mut.queueId;
          
          if (!targetId) {
            console.error("❌ ERROR: targetId UNDEFINED! Tidak ada properti 'id' atau 'queueId' di dalam objek mutasi ini.");
          } else {
            console.log(`🧹 Memicu penghapusan untuk ID: ${targetId}`);
            try {
              const dbAdapter = await getStorageAdapter();
              const deleteTx = dbAdapter.transaction(['OFFLINE_MUTATION_QUEUE', 'LOCAL_TRANSACTION_CACHE'], 'readwrite');
              const queueStore = deleteTx.objectStore('OFFLINE_MUTATION_QUEUE');
              const cacheStore = deleteTx.objectStore('LOCAL_TRANSACTION_CACHE');
              
              await queueStore.delete(targetId);
              console.log(`🎉 SUCCESS: ID ${targetId} resmi terhapus dari queue.`);

              if (mut.payload?.id) {
                const cachedTx = await cacheStore.get(mut.payload.id);
                if (cachedTx) {
                  cachedTx.status = 'Done';
                  await cacheStore.put(cachedTx);
                } else {
                  await cacheStore.put({
                    id: mut.payload.id,
                    status: 'Done',
                    created_at: mut.payload.created_at || new Date().toISOString()
                  });
                }
              }
              await deleteTx.done;
            } catch (err) {
              console.error(`❌ FAILURE: Gagal menghapus ID ${targetId} via adapter:`, err);
            }
          }

          successCount++;
          const duration = scheduler.now() - syncStart;
          await recordLatencyMetric(duration);

          if (circuitBreaker.status === 'HALF-OPEN') {
            circuitBreaker.status = 'CLOSED';
            circuitBreaker.failures = 0;
            circuitBreaker.currentCooldownDuration = 30000;
            console.log('[SYNC-CIRCUIT-BREAKER] Converted back to CLOSED after successful sync.');
          }

          console.log(`Sync Engine: Mutation synced successfully.`);
          await emitInfo({
            correlationId: mut.correlationId || 'NO_CORRELATION',
            eventType: 'SYNC_SUCCESS',
            layer: 'SYNC',
            entityId: mut.payload?.id || mut.id || null,
            severity: 'INFO',
            message: `Sync committed: ${mut.type}`,
            durationMs: duration
          });

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('global-sync-complete'));
          }
        } else if (response.status === 409) {
          console.warn(`Sync Engine: 409 Conflict for mutation #${mut.queueId}. Deleting to unblock queue.`);
          const targetId = mut.id || mut.queueId;
          if (targetId) {
            try {
              const dbAdapter = await getStorageAdapter();
              const deleteTx = dbAdapter.transaction(['OFFLINE_MUTATION_QUEUE'], 'readwrite');
              const queueStore = deleteTx.objectStore('OFFLINE_MUTATION_QUEUE');
              await queueStore.delete(targetId);
              await deleteTx.done;
              console.log(`✅ Mutasi ID ${targetId} (409 Conflict) BERHASIL dihapus dari antrean.`);
            } catch (adapterError) {
              console.error("❌ Kegagalan saat eksekusi transaction 409 via adapter:", adapterError);
            }
          }

          successCount++; // Treated as sync execution resolve
          await emitWarn({
            correlationId: mut.correlationId || 'NO_CORRELATION',
            eventType: 'SYNC_FAILURE',
            layer: 'SYNC',
            entityId: mut.payload?.id || mut.id || null,
            message: `Sync conflict: ${mut.type} — 409 Conflict`,
            metadata: { httpStatus: 409 }
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('sync-conflict', { detail: mut }));
          }
        } else {
          console.error(`🚨 SINKRONISASI DITOLAK: Status ${response.status}. Data tidak akan dihapus dari lokal.`);
          const errText = await response.text().catch(() => response.statusText);
          failCount++;
          lastErrorMsg = `Sync failure ${response.status}: ${errText}`;
          await emitError({
            correlationId: mut.correlationId || 'NO_CORRELATION',
            eventType: 'SYNC_FAILURE',
            layer: 'SYNC',
            entityId: mut.payload?.id || mut.id || null,
            message: `Sync failed: ${mut.type} — ${errText}`,
            metadata: { httpStatus: response?.status, errorCode: errText }
          });

          let postgresCode = '';
          try {
            const jsonErr = JSON.parse(errText);
            postgresCode = jsonErr.code || '';
          } catch (e) {}

          const isNonTransient = 
            response.status === 400 || 
            response.status === 401 || 
            response.status === 403 || 
            postgresCode === '42501' ||
            postgresCode === 'PGRST204' || 
            postgresCode === '23503' ||
            postgresCode === '22P02' ||
            errText.toLowerCase().includes('violates foreign key constraint') ||
            errText.toLowerCase().includes('violates row-level security') ||
            errText.toLowerCase().includes('in the schema cache');

          await handleMutationFailure(mut, errText, isNonTransient);
          if (isNonTransient) {
            const failedId = mut.payload?.id || mut.payload?.customer_id || mut.payload?.shift_id || mut.payload?.service_id || mut.id;
            if (failedId) quarantinedEntityIds.add(failedId);
          } else {
            break;
          }
        }
      }
    } catch (err) {
      failCount++;
      lastErrorMsg = err.message || 'Network transport failure';
      console.error(`Sync Engine: Network transport failure on mutation #${mut.queueId}. Postponing sync.`, err);
      await emitError({
        correlationId: mut.correlationId || 'NO_CORRELATION',
        eventType: 'SYNC_FAILURE',
        layer: 'SYNC',
        entityId: mut.payload?.id || mut.id || null,
        message: `Sync transport failure: ${mut.type} — ${lastErrorMsg}`,
        metadata: { error: lastErrorMsg }
      });
      await handleMutationFailure(mut, lastErrorMsg, false);
      break;
    }
  }

  const totalAttempted = successCount + failCount;
  if (totalAttempted > 0) {
    const failureRate = failCount / totalAttempted;

    const syncAnomaly = {
      metric: 'SYNC_FAILURE_RATE',
      value: failureRate,
      failCount,
      successCount,
      totalAttempted,
      status: failureRate >= 0.50 ? 'CRITICAL'
            : failureRate >= 0.10 ? 'WARNING'
            : 'NORMAL'
    };

    try {
      const dbAdapter = await getStorageAdapter();
      const existing = await dbAdapter.get('SYNC_ENGINE_STATE', 'sync_metrics') || { id: 'sync_metrics', history: [] };
      existing.history = [
        ...(existing.history || []).slice(-9), // keep last 10 cycles
        { timestamp: new Date().toISOString(), failureRate, failCount, successCount }
      ];
      await dbAdapter.put('SYNC_ENGINE_STATE', existing);
      dbAdapter.close();
    } catch (e) { }

    if (syncAnomaly.status === 'CRITICAL') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-hard-failure', { detail: syncAnomaly }));
      }
    } else if (syncAnomaly.status === 'WARNING') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-soft-alert', { detail: syncAnomaly }));
      }
    }
  }

  if (failCount > 0 && successCount === 0) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-total-failure', {
        detail: {
          failCount,
          lastError: lastErrorMsg,
          queueDepth: rawItems.length,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }

  await sendTelemetry({
    event: "sync_execution",
    queue_depth: rawItems.length,
    success_count: successCount,
    fail_count: failCount,
    error_message: lastErrorMsg
  });
}

let renewInterval = null;

function startLockRenewal(tabId) {
  if (renewInterval) clearInterval(renewInterval);
  renewInterval = setInterval(async () => {
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction('SYNC_ENGINE_STATE', 'readwrite');
      const store = tx.objectStore('SYNC_ENGINE_STATE');
      const currentLock = await store.get('active_sync_lock');
      if (currentLock && currentLock.tabId === tabId) {
        currentLock.lockedAt = scheduler.now();
        await store.put(currentLock);
      }
      await tx.done;
    } catch (err) {
      console.warn('[SYNC-CONCURRENCY] Lock renewal failed:', err);
    }
  }, 3000); // renew lock every 3 seconds
}

function stopLockRenewal() {
  if (renewInterval) {
    clearInterval(renewInterval);
    renewInterval = null;
  }
}

export async function flushMutationQueue() {
  if (isSyncing) {
    console.log('[SYNC-CONCURRENCY] Sync engine is already busy syncing. Skipping execution.');
    return;
  }

  // Circuit Breaker state check
  if (circuitBreaker.status === 'OPEN') {
    if (scheduler.now() >= circuitBreaker.cooldownUntil) {
      circuitBreaker.status = 'HALF-OPEN';
      console.log('[SYNC-CIRCUIT-BREAKER] Cooldown expired. Entering HALF-OPEN.');
    } else {
      console.warn(`[SYNC-CIRCUIT-BREAKER] Sync aborted. Circuit is OPEN. Cooldown active until ${new Date(circuitBreaker.cooldownUntil).toISOString()}`);
      return;
    }
  }

  // FREEZE CHECK: Hard failure protocol may have frozen the sync engine
  try {
    const db = await getStorageAdapter();
    const state = await db.get('SYNC_ENGINE_STATE', 'state');
    if (state?.frozen === true) {
      console.error('[SYNC-FREEZE] SyncEngine is frozen due to corruption detection.',
        'Frozen at:', state.frozenAt, '| Reason:', state.reason);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sync-engine-frozen', { detail: state }));
      }
      db.close();
      return; // HARD ABORT — do not process queue
    }
    db.close();
  } catch (err) {
    console.warn('[SYNC] Could not read freeze state:', err);
  }

  const runSyncCycle = async () => {
    isSyncing = true;
    try {
      await emitInfo({
        correlationId: crypto.randomUUID(),
        eventType: 'SYNC_START',
        layer: 'SYNC',
        message: 'Sync loop cycle started'
      });
      await doFlushMutationQueue();
    } finally {
      isSyncing = false;
      stopLockRenewal();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fsrms-sync-complete'));
        window.dispatchEvent(new CustomEvent('global-sync-complete'));
        window.dispatchEvent(new CustomEvent('pwa-sync-complete'));
      }
    }
  };

  // 1. Acquire Web Lock if API is present
  if (typeof navigator !== 'undefined' && navigator.locks) {
    try {
      await navigator.locks.request('active_sync_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          console.log('[SYNC-CONCURRENCY] Failed to acquire lock via Web Locks API (another tab is active). Skipping sync.');
          return;
        }
        await runSyncCycle();
      });
      return;
    } catch (err) {
      console.warn('[SYNC-CONCURRENCY] Web Locks API request failed, falling back to IndexedDB lock:', err);
    }
  }

  // 2. Fallback to IndexedDB locking
  const tabId = crypto.randomUUID();
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction('SYNC_ENGINE_STATE', 'readwrite');
    const store = tx.objectStore('SYNC_ENGINE_STATE');
    const lock = await store.get('active_sync_lock');
    const now = scheduler.now();

    if (lock && lock.isLocked && (now - lock.lockedAt < 10000)) {
      console.log('[SYNC-CONCURRENCY] Sync deferred. Tab lock held via IndexedDB by tab:', lock.tabId);
      await tx.done;
      return;
    }

    await store.put({
      id: 'active_sync_lock',
      isLocked: true,
      lockedAt: now,
      tabId
    });
    await tx.done;

    startLockRenewal(tabId);

    await runSyncCycle();

    // Release lock
    const cleanDb = await getStorageAdapter();
    const cleanTx = cleanDb.transaction('SYNC_ENGINE_STATE', 'readwrite');
    const cleanStore = cleanTx.objectStore('SYNC_ENGINE_STATE');
    const currentLock = await cleanStore.get('active_sync_lock');
    if (currentLock && currentLock.tabId === tabId) {
      await cleanStore.delete('active_sync_lock');
    }
    await cleanTx.done;
  } catch (err) {
    console.error('[SYNC-CONCURRENCY] Failed during IndexedDB locking process:', err);
    // If locks completely failed to initialize (e.g. MemoryAdapter under SSR), run fallback single thread anyway
    await runSyncCycle();
  } finally {
    stopLockRenewal();
  }
}
