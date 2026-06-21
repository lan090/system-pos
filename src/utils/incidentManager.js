// =========================================================================
// src/utils/incidentManager.js
// FSRMS v2.0 — Incident Response System
// =========================================================================

import { emitError, emitInfo, emitWarn } from './observability';
import { openSecureDB } from './storageEngine';

const INCIDENT_STORE = 'FSRMS_INCIDENTS';

export async function openIncident({ code, severity, description, traceId, autoActions = [] }) {
  const db = await openSecureDB();
  const incident = {
    incident_id: crypto.randomUUID(),
    code,
    severity,
    status: 'OPEN',
    trace_id: traceId || null,
    opened_at: new Date().toISOString(),
    opened_by: 'SYSTEM',
    description,
    auto_actions: autoActions,
    manual_steps: getManualSteps(code),
    postmortem: null,
  };

  await db.put(INCIDENT_STORE, incident);
  db.close();

  await emitError({
    trace_id: traceId,
    event_type: 'INCIDENT_OPENED',
    layer: 'SYSTEM',
    severity: severity === 'P1' ? 'CRITICAL' : 'ERROR',
    message: `INCIDENT OPENED [${severity}][${code}]: ${description}`,
    data: { incident_id: incident.incident_id, code, auto_actions: autoActions }
  });

  // Dispatch to UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(
      severity === 'P1' || severity === 'P2' ? 'fsrms-hard-failure' : 'fsrms-soft-alert',
      { detail: { incident, metric: code } }
    ));
  }

  return incident;
}

export async function escalateIncident(incidentId) {
  const db = await openSecureDB();
  const incident = await db.get(INCIDENT_STORE, incidentId);
  if (!incident) {
    db.close();
    return;
  }
  incident.status = 'ESCALATED';
  incident.escalated_at = new Date().toISOString();
  await db.put(INCIDENT_STORE, incident);
  db.close();
  await emitWarn({ 
    event_type: 'INCIDENT_OPENED', 
    layer: 'SYSTEM',
    message: `Incident escalated: ${incidentId}`, 
    data: { incidentId } 
  });
}

export async function resolveIncident(incidentId, postmortem) {
  const db = await openSecureDB();
  const incident = await db.get(INCIDENT_STORE, incidentId);
  if (!incident) {
    db.close();
    return;
  }
  incident.status = 'RESOLVED';
  incident.resolved_at = new Date().toISOString();
  incident.postmortem = postmortem;
  await db.put(INCIDENT_STORE, incident);
  db.close();

  await emitInfo({ 
    event_type: 'INCIDENT_RESOLVED', 
    layer: 'SYSTEM',
    message: `Incident resolved: ${incidentId}`,
    data: { incidentId, postmortem: postmortem?.substring(0, 100) }
  });
}

export async function getOpenIncidents() {
  const db = await openSecureDB();
  const all = await db.getAll(INCIDENT_STORE).catch(() => []);
  db.close();
  return all.filter(i => i.status === 'OPEN' || i.status === 'ESCALATED')
            .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at));
}

function getManualSteps(code) {
  const steps = {
    DATA_CORRUPTION: [
      'Run all 6 DB DETECTOR queries (Phase 9.1)',
      'Review QUARANTINED_MUTATIONS in admin panel',
      'Run auto-repair if safe (Phase 9.2)',
      'Unfreeze sync engine via admin panel',
      'Verify integrity check returns CLEAN',
    ],
    QUEUE_OVERFLOW: [
      'Check WiFi connectivity on kasir device',
      'Check Supabase dashboard for outages',
      'Force sync via admin panel → "Force Replay Queue"',
      'If sync still fails: export queue snapshot for backup',
      'Unfreeze and retry after root cause resolved',
    ],
    DB_INCONSISTENCY: [
      'Run DETECTOR 6: Done txs with no items',
      'Run R-REPAIR-3: auto-void stale Drafts',
      'Notify Owner/Manager — do not process new transactions until resolved',
      'Submit incident report to Supabase support if RLS-related',
    ],
    AUTH_FAILURE: [
      'Re-login on affected device',
      'Verify Supabase JWT secret is not rotated',
      'Check session expiry settings in Supabase Auth config',
    ],
    CONFLICT_STORM: [
      'Review QUARANTINED_MUTATIONS for ID_COLLISION entries',
      'Check if multiple devices are syncing the same transaction ID',
      'Verify device UUIDs are not being shared/cloned',
    ],
  };
  return steps[code] || ['Review incident details and contact IT support'];
}
