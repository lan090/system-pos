// =========================================================================
// src/utils/replayEngine.js
// FSRMS v2.0 — Mutation Replay & Debug System
// =========================================================================

import { emitInfo, emitWarn, queryEventLog, getTraceById } from './observability';
import { openSecureDB } from './storageEngine';
import { getFlag } from './featureFlags';

// ─── REPLAY-1: Replay single mutation by trace_id ───────────────────
export async function replayByTraceId(traceId, supabase, operator) {
  if (!operator || operator.role !== 'Owner/Manager') {
    throw new Error('UNAUTHORIZED: Replay requires Owner/Manager role');
  }

  await emitInfo({
    trace_id: traceId, 
    event_type: 'FLUSH_STARTED', 
    layer: 'SYSTEM',
    message: `Replay requested for trace_id: ${traceId}`,
    data: { operator_id: operator.id }
  });

  // 1. Get all events for this trace
  const { events } = await getTraceById(traceId);
  const queuedEvent = events.find(e => e.event_type === 'MUTATION_QUEUED');

  if (!queuedEvent || !queuedEvent.data) {
    throw new Error(`No MUTATION_QUEUED event found for trace_id: ${traceId}`);
  }

  const originalPayload = queuedEvent.data;

  // 2. Check if already committed (prevent double-replay)
  const alreadyCommitted = events.some(e => e.event_type === 'SEND_OK' || e.event_type === 'DB_COMMITTED');

  if (alreadyCommitted) {
    await emitWarn({
      trace_id: traceId, 
      event_type: 'FLUSH_STARTED', 
      layer: 'SYSTEM',
      message: `Replay skipped: trace already committed`,
      data: { traceId, alreadyCommitted: true }
    });
    return { skipped: true, reason: 'ALREADY_COMMITTED' };
  }

  // 3. Re-queue with new trace_id (so we can distinguish replay from original)
  const replayTraceId = `REPLAY_${traceId}`;
  const { safeAddToQueue } = await import('./storageEngine');
  await safeAddToQueue({
    type: originalPayload.mutationType,
    payload: {
      ...originalPayload,
      trace_id: replayTraceId,
      _replayed_from: traceId,
      _replayed_at: new Date().toISOString(),
      _replayed_by: operator.id,
    }
  });

  await emitInfo({
    trace_id: replayTraceId, 
    event_type: 'MUTATION_QUEUED', 
    layer: 'SYSTEM',
    message: `Mutation re-queued for replay`,
    data: { originalTraceId: traceId, replayTraceId }
  });

  return { replayed: true, replayTraceId };
}

// ─── REPLAY-2: Replay all failed mutations from a time window ────────
export async function replayFailedInWindow(sinceMinutes = 60, operator) {
  if (!operator || operator.role !== 'Owner/Manager') {
    throw new Error('UNAUTHORIZED');
  }

  const failedEvents = await queryEventLog({
    eventType: 'SEND_FAIL',
    sinceMinutes
  });

  const uniqueTraces = [...new Set(failedEvents.map(e => e.trace_id).filter(t => t && t !== 'NO_TRACE'))];

  const results = [];
  for (const traceId of uniqueTraces) {
    try {
      const result = await replayByTraceId(traceId, null, operator);
      results.push({ traceId, ...result });
    } catch (err) {
      results.push({ traceId, error: err.message });
    }
  }

  return { attempted: uniqueTraces.length, results };
}

// ─── TIME-TRAVEL: Reconstruct system state at past timestamp ─────────
export async function inspectStateAtTime(targetISOTimestamp) {
  const db = await openSecureDB();
  const allEvents = await db.getAll('FSRMS_EVENT_LOG').catch(() => []);
  db.close();

  // Filter events up to target timestamp
  const eventsBefore = allEvents
    .filter(e => e.timestamp <= targetISOTimestamp)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Reconstruct logical state from events
  const state = {
    inspectedAt: targetISOTimestamp,
    eventCount: eventsBefore.length,
    mutations: {},   // trace_id → last known status
    incidents: [],
    freezeActivated: false,
  };

  for (const event of eventsBefore) {
    if (event.trace_id && event.trace_id !== 'NO_TRACE') {
      state.mutations[event.trace_id] = state.mutations[event.trace_id] || {
        trace_id: event.trace_id,
        events: []
      };
      state.mutations[event.trace_id].events.push(event.event_type);
      state.mutations[event.trace_id].lastStatus = event.event_type;
    }

    if (event.event_type === 'FREEZE_ACTIVATED') state.freezeActivated = true;
    if (event.event_type === 'FREEZE_LIFTED')    state.freezeActivated = false;
    if (event.event_type === 'INCIDENT_OPENED')  state.incidents.push(event.data?.incident_id);
    if (event.event_type === 'INCIDENT_RESOLVED')
      state.incidents = state.incidents.filter(id => id !== event.data?.incidentId);
  }

  // Classify mutations by state
  const committed  = Object.values(state.mutations).filter(m => m.events.includes('SEND_OK'));
  const failed     = Object.values(state.mutations).filter(m => m.events.includes('QUARANTINED'));
  const inProgress = Object.values(state.mutations).filter(m =>
    !m.events.includes('SEND_OK') && !m.events.includes('QUARANTINED')
  );

  return {
    ...state,
    summary: {
      totalMutations: Object.keys(state.mutations).length,
      committed: committed.length,
      failed: failed.length,
      inProgress: inProgress.length,
      openIncidents: state.incidents.length,
      frozen: state.freezeActivated,
    }
  };
}

// ─── FAILURE SIMULATION (Controlled, non-production only) ────────────
export class FailureSimulator {
  constructor() {
    this._mode = null;
    this._enabled = false;
  }

  // Enable only when DUAL_RUN_VALIDATION flag is active
  enable(mode) {
    if (!getFlag('DUAL_RUN_VALIDATION')) {
      throw new Error('SAFETY: Failure simulation requires DUAL_RUN_VALIDATION flag to be ON');
    }
    this._mode = mode;
    this._enabled = true;
    emitWarn({
      event_type: 'ANOMALY_DETECTED', 
      layer: 'SYSTEM',
      message: `[SIMULATION] Failure mode activated: ${mode}`,
      data: { simulationMode: mode }
    });
  }

  disable() {
    this._mode = null;
    this._enabled = false;
    emitInfo({
      event_type: 'ANOMALY_DETECTED', 
      layer: 'SYSTEM',
      message: '[SIMULATION] Failure mode deactivated'
    });
  }

  // Called inside syncEngine.js before each Supabase request
  shouldSimulateFailure(mutationType) {
    if (!this._enabled) return false;
    switch (this._mode) {
      case 'NETWORK_TIMEOUT':    return Math.random() < 0.8;  // 80% fail rate
      case 'CONFLICT_STORM':     return mutationType === 'CREATE_TRANSACTION';
      case 'PARTIAL_FAILURE':    return Math.random() < 0.5;  // 50% fail rate
      case 'TOTAL_FAILURE':      return true;                  // always fail
      case 'AUTH_FAILURE':       return true;                  // simulate 401
      default:                   return false;
    }
  }
}

export const failureSimulator = new FailureSimulator();
