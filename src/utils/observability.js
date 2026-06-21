// =========================================================================
// src/utils/observability.js
// FSRMS v2.0 — Observability Core System
// =========================================================================

import { getStorageAdapter } from './storageEngine';

const EVENT_STORE = 'FSRMS_EVENT_LOG';
const MAX_LOG_ENTRIES = 500; // rolling window, oldest purged on overflow

export function getDeviceId() {
  let deviceId = localStorage.getItem('fsrms_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('fsrms_device_id', deviceId);
  }
  return deviceId;
}

export async function emitEvent(event) {
  // Telemetry event schema mapping & versioning
  const structuredEvent = {
    schemaVersion: 1,
    eventId:       crypto.randomUUID(),
    correlationId: event.correlationId || event.trace_id || 'NO_CORRELATION',
    eventType:     event.event_type || event.eventType,
    layer:         event.layer,
    timestamp:     new Date().toISOString(),
    severity:      event.severity || 'INFO',
    message:       event.message,
    durationMs:    event.duration_ms || event.durationMs || null,
    metadata:      event.metadata || event.data || null,
    
    // Schema aliases for backward compatibility (DB version 10)
    event_id:      null,
    trace_id:      null,
    event_type:    null,
    duration_ms:   null,
    data:          null
  };
  structuredEvent.event_id = structuredEvent.eventId;
  structuredEvent.trace_id = structuredEvent.correlationId;
  structuredEvent.event_type = structuredEvent.eventType;
  structuredEvent.duration_ms = structuredEvent.durationMs;
  structuredEvent.data = structuredEvent.metadata;

  // High-frequency Sampling Strategy
  const criticalTypes = ['SYNC_START', 'SYNC_SUCCESS', 'SYNC_FAILURE', 'RETRY_ATTEMPT', 'DLQ_ACTIVATION', 'STORAGE_ERROR'];
  const isCritical = criticalTypes.includes(structuredEvent.eventType);
  const shouldSample = isCritical || (Math.random() < 0.1);

  if (!shouldSample) {
    return structuredEvent;
  }

  // 1. Always write to console as structured JSON
  const logFn = structuredEvent.severity === 'ERROR' || structuredEvent.severity === 'CRITICAL'
    ? console.error
    : structuredEvent.severity === 'WARN'
    ? console.warn
    : console.log;

  logFn(`[FSRMS][${structuredEvent.layer}][${structuredEvent.eventType}]`,
        JSON.stringify(structuredEvent));

  // 2. Persist to FSRMS_EVENT_LOG (IndexedDB/MemoryAdapter)
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction(EVENT_STORE, 'readwrite');
    const store = tx.objectStore(EVENT_STORE);

    // Enforce rolling window
    const count = await store.count();
    if (count >= MAX_LOG_ENTRIES) {
      const items = await store.getAll();
      if (items.length > 0) {
        items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        await store.delete(items[0].event_id);
      }
    }

    await store.put(structuredEvent);
    await tx.done;
  } catch (err) {
    console.error('[OBSERVABILITY] Event store write failed (non-fatal):', err.message);
  }

  // Dispatch custom event to window for UI updates
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fsrms-observability-event', { detail: structuredEvent }));
  }

  return structuredEvent;
}

// Convenience wrappers
export const emitInfo  = (e) => emitEvent({ ...e, severity: 'INFO' });
export const emitWarn  = (e) => emitEvent({ ...e, severity: 'WARN' });
export const emitError = (e) => emitEvent({ ...e, severity: 'ERROR' });
export const emitDebug = (e) => emitEvent({ ...e, severity: 'DEBUG' });

export async function getSystemStateSnapshot() {
  const db = await getStorageAdapter();

  const [queue, quarantined, shifts, syncState, recentEvents] = await Promise.all([
    db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []),
    db.getAll('QUARANTINED_MUTATIONS').catch(() => []),
    db.getAll('ACTIVE_SHIFT_STORE').catch(() => []),
    db.get('SYNC_ENGINE_STATE', 'state').catch(() => null),
    db.getAll('FSRMS_EVENT_LOG').catch(() => []),
  ]);

  // Group queue by mutation type
  const queueByType = queue.reduce((acc, item) => {
    const type = item.type || 'UNKNOWN';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Find oldest queued item
  const oldestQueueItem = [...queue].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )[0];

  // Recent errors (last 10)
  const recentErrors = recentEvents
    .filter(e => e.severity === 'ERROR' || e.severity === 'CRITICAL')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);

  return {
    snapshotAt: new Date().toISOString(),
    syncEngine: {
      frozen: syncState?.frozen || false,
      frozenAt: syncState?.frozenAt || null,
      freezeReason: syncState?.reason || null,
    },
    queue: {
      depth: queue.length,
      byType: queueByType,
      oldestQueueItem: oldestQueueItem
        ? `${Math.round((Date.now() - new Date(oldestQueueItem.created_at)) / 60000)} min`
        : null,
    },
    quarantine: {
      count: quarantined.length,
      items: quarantined.map(q => ({
        id: q.queueId || q.id,
        type: q.type,
        quarantinedAt: q.quarantinedAt,
        reason: q.reason || q.errorLog,
      })),
    },
    activeShift: shifts.find(s => !s.closed_at) || null,
    recentErrors,
    deviceId: getDeviceId(),
  };
}

export async function getTraceById(traceId) {
  const db = await getStorageAdapter();
  const events = await db.getAll(EVENT_STORE).catch(() => []);
  
  const filteredEvents = events.filter(e => e.trace_id === traceId || e.correlationId === traceId);
  const sortedEvents = filteredEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return {
    trace_id: traceId,
    events: sortedEvents,
    summary: {
      start:      sortedEvents[0]?.timestamp || null,
      end:        sortedEvents[sortedEvents.length - 1]?.timestamp || null,
      layerCount: [...new Set(sortedEvents.map(e => e.layer))].length,
      errorCount: sortedEvents.filter(e => e.severity === 'ERROR' || e.severity === 'CRITICAL').length,
      committed:  sortedEvents.some(e => e.eventType === 'SEND_OK' || e.event_type === 'SEND_OK' || e.event_type === 'DB_COMMITTED'),
    }
  };
}

export async function queryEventLog({ severity, eventType, layer, sinceMinutes = 60 }) {
  const db = await getStorageAdapter();
  const allEvents = await db.getAll(EVENT_STORE).catch(() => []);

  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

  return allEvents.filter(e =>
    e.timestamp >= cutoff
    && (!severity  || e.severity === severity)
    && (!eventType || e.eventType === eventType || e.event_type === eventType)
    && (!layer     || e.layer === layer)
  );
}
