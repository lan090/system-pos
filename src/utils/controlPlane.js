// =========================================================================
// src/utils/controlPlane.js
// FSRMS v2.0 — Runtime Control Plane
// =========================================================================

import { emitInfo, emitWarn, emitError, getSystemStateSnapshot } from './observability';
import { openSecureDB } from './storageEngine';
import { flushMutationQueue } from './syncEngine';

// SAFETY: all control ops require IT role verification (Owner/Manager)
function requireITRole(currentUser) {
  if (!currentUser || currentUser.role !== 'Owner/Manager') {
    throw new Error('UNAUTHORIZED: Control plane operations require Owner/Manager role');
  }
}

// ─── OP-1: PAUSE SYNC ENGINE ────────────────────────────────────────
export async function pauseSyncEngine(operator) {
  requireITRole(operator);
  const db = await openSecureDB();
  await db.put('SYNC_ENGINE_STATE', {
    id: 'state',
    frozen: true,
    frozenAt: new Date().toISOString(),
    reason: `MANUAL_PAUSE by ${operator.email}`,
    operator_id: operator.id,
  });
  db.close();
  await emitWarn({
    event_type: 'FREEZE_ACTIVATED', 
    layer: 'SYSTEM',
    message: `SyncEngine manually paused by ${operator.email}`,
    data: { operator_id: operator.id, reason: 'MANUAL_PAUSE' }
  });
}

// ─── OP-2: RESUME SYNC ENGINE ───────────────────────────────────────
export async function resumeSyncEngine(operator) {
  requireITRole(operator);
  const db = await openSecureDB();
  await db.put('SYNC_ENGINE_STATE', {
    id: 'state', 
    frozen: false,
    resumedAt: new Date().toISOString(),
    resumedBy: operator.id,
  });
  db.close();
  await emitInfo({
    event_type: 'FREEZE_LIFTED', 
    layer: 'SYSTEM',
    message: `SyncEngine resumed by ${operator.email}`,
    data: { operator_id: operator.id }
  });
  // Immediately attempt flush after resume
  flushMutationQueue().catch(err =>
    emitError({ 
      event_type: 'FLUSH_STARTED', 
      layer: 'SYNC',
      message: `Post-resume flush failed: ${err.message}` 
    })
  );
}

// ─── OP-3: FORCE REPLAY QUEUE ───────────────────────────────────────
export async function forceReplayQueue(operator) {
  requireITRole(operator);
  await emitInfo({
    event_type: 'FLUSH_STARTED', 
    layer: 'SYSTEM',
    message: `Force replay triggered by ${operator.email}`,
    data: { operator_id: operator.id }
  });
  const snapshot = await getSystemStateSnapshot();
  await emitInfo({
    event_type: 'FLUSH_STARTED', 
    layer: 'SYSTEM',
    message: `Queue state before force replay`,
    data: { queueDepth: snapshot.queue.depth, byType: snapshot.queue.byType }
  });
  return flushMutationQueue();
}

// ─── OP-4: ROLLBACK LAST N MUTATIONS ────────────────────────────────
export async function rollbackLastNMutations(operator, n) {
  requireITRole(operator);
  if (n > 10) throw new Error('SAFETY: Cannot rollback more than 10 mutations at once');

  const db = await openSecureDB();
  const queue = await db.getAll('OFFLINE_MUTATION_QUEUE');
  const sorted = [...queue].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const toRollback = sorted.slice(0, n);

  const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
  for (const item of toRollback) {
    await tx.objectStore('OFFLINE_MUTATION_QUEUE').delete(item.id);
  }
  await tx.done;
  db.close();

  await emitWarn({
    event_type: 'FLUSH_STARTED', 
    layer: 'SYSTEM',
    message: `Rolled back last ${toRollback.length} mutations by ${operator.email}`,
    data: {
      operator_id: operator.id,
      rolledBack: toRollback.map(m => ({ id: m.id, type: m.type, created_at: m.created_at }))
    }
  });

  return { rolledBack: toRollback.length };
}

// ─── OP-5: TRIGGER INTEGRITY CHECK ──────────────────────────────────
export async function triggerIntegrityCheck(operator, supabase) {
  requireITRole(operator);
  const { runIntegrityCheck } = await import('./integrityChecker');
  await emitInfo({
    event_type: 'INTEGRITY_CHECK_RUN', 
    layer: 'SYSTEM',
    message: `Manual integrity check triggered by ${operator.email}`,
    data: { operator_id: operator.id, runDbChecks: true }
  });
  return runIntegrityCheck(supabase, { runDbChecks: true, silent: false });
}

// ─── OP-6: EXPORT STATE SNAPSHOT ────────────────────────────────────
export async function exportStateSnapshot(operator) {
  requireITRole(operator);
  const snapshot = await getSystemStateSnapshot();
  await emitInfo({
    event_type: 'INTEGRITY_CHECK_RUN', 
    layer: 'SYSTEM',
    message: `State snapshot exported by ${operator.email}`,
    data: { operator_id: operator.id, queueDepth: snapshot.queue.depth }
  });
  return JSON.stringify(snapshot, null, 2);
}
