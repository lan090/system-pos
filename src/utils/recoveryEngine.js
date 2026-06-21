// =========================================================================
// src/utils/recoveryEngine.js
// FSRMS v2.0 — Auto-Recovery Decision Engine
// =========================================================================

import { getSystemStateSnapshot, emitInfo } from './observability';
import { openSecureDB } from './storageEngine';

const BASE_SCORES = {
  SYNC_FAILURE:       15,  // Low — usually transient
  AUTH_FAILURE:       20,  // Low-Medium — recoverable with re-login
  CLOCK_DRIFT_SEVERE: 25,  // Medium — affects ordering but not data
  CONFLICT_STORM:     40,  // Medium — needs investigation
  QUARANTINE_SURGE:   45,  // Medium-High — data may be at risk
  OFFLINE_PROLONGED:  50,  // Medium-High — growing queue pressure
  QUEUE_OVERFLOW:     65,  // High — system integrity at risk
  DATA_CORRUPTION:    85,  // Critical — immediate action required
  DB_INCONSISTENCY:   90,  // Critical — financial data risk
};

export const RECOVERY_ACTIONS = {
  AUTO_RETRY:           'AUTO_RETRY',
  QUARANTINE_AND_WAIT:  'QUARANTINE_AND_WAIT',
  REPLAY_FROM_TRACE:    'REPLAY_FROM_TRACE',
  FREEZE_AND_ROLLBACK:  'FREEZE_AND_ROLLBACK',
  ESCALATE_TO_MANUAL:   'ESCALATE_TO_MANUAL',
};

function calculateSeverityScore(incident, context) {
  let score = BASE_SCORES[incident.code] ?? 30;

  // Queue pressure modifier: +1 per 5 items over threshold (max +20)
  const queueOverThreshold = Math.max(0, (context.queueDepth || 0) - 20);
  score += Math.min(20, Math.floor(queueOverThreshold / 5));

  // Recency modifier: +10 if this is the 3rd incident in 30 minutes
  if ((context.recentIncidentCount || 0) >= 3) score += 10;

  // Quarantine surge modifier: +5 per 3 quarantined items (max +15)
  score += Math.min(15, Math.floor((context.quarantineCount || 0) / 3) * 5);

  // Clock drift modifier: +5 if drift > 5min, +15 if drift > 30min
  const driftSec = context.clockDriftSeconds || 0;
  if (driftSec > 1800) score += 15;
  else if (driftSec > 300) score += 5;

  // Manual override guard: if human already acted, cap modifier contribution
  if (context.manualOverrideActive) score = Math.min(score, 79);

  return Math.min(100, Math.max(0, Math.round(score)));
}

function selectRecoveryAction(severityScore, incident, context) {
  // SAFETY: Manual override always wins — never overwrite human decision
  if (context.manualOverrideActive) {
    return {
      action: RECOVERY_ACTIONS.ESCALATE_TO_MANUAL,
      reason: 'Manual override is active — system defers to operator',
      humanOverrideRequired: true,
    };
  }

  // Exception: AUTH_FAILURE always routes to AUTO_RETRY regardless of score
  if (incident.code === 'AUTH_FAILURE') {
    return {
      action: RECOVERY_ACTIONS.AUTO_RETRY,
      reason: 'Auth failure is recoverable via token refresh',
      humanOverrideRequired: false,
      estimatedRecoveryMs: 3000,
    };
  }

  // Exception: DB_INCONSISTENCY always escalates regardless of score
  if (incident.code === 'DB_INCONSISTENCY') {
    return {
      action: RECOVERY_ACTIONS.ESCALATE_TO_MANUAL,
      reason: 'DB inconsistency requires human verification before any automated action',
      humanOverrideRequired: true,
    };
  }

  // Standard decision tree
  if (severityScore <= 19) return {
    action: RECOVERY_ACTIONS.AUTO_RETRY,
    reason: 'Low severity — transient failure, retry is safe',
    humanOverrideRequired: false,
    estimatedRecoveryMs: 5000,
  };

  if (severityScore <= 39) return {
    action: RECOVERY_ACTIONS.QUARANTINE_AND_WAIT,
    reason: 'Medium severity — quarantine affected mutations, monitor for escalation',
    humanOverrideRequired: false,
    estimatedRecoveryMs: 30000,
  };

  if (severityScore <= 59) return {
    action: RECOVERY_ACTIONS.REPLAY_FROM_TRACE,
    reason: 'Medium-high severity — attempt deterministic replay from event log',
    humanOverrideRequired: false,
    estimatedRecoveryMs: 60000,
  };

  if (severityScore <= 79) return {
    action: RECOVERY_ACTIONS.FREEZE_AND_ROLLBACK,
    reason: 'High severity — freeze engine, rollback last N mutations safely',
    humanOverrideRequired: true,  // must confirm rollback scope
    estimatedRecoveryMs: 300000,  // 5 min
  };

  return {
    action: RECOVERY_ACTIONS.ESCALATE_TO_MANUAL,
    reason: 'Critical severity — automated recovery unsafe, human intervention required',
    humanOverrideRequired: true,
    estimatedRecoveryMs: null,  // unknown
  };
}

export async function generateRecoveryRecommendation(incident, supabase) {
  const snapshot = await getSystemStateSnapshot();
  const recentIncidents = await getRecentIncidents(30); // last 30 min
  
  // Attempt to gather clock drift from local active state
  let clockDriftSeconds = 0;
  try {
    const db = await openSecureDB();
    const syncState = await db.get('SYNC_ENGINE_STATE', 'state');
    db.close();
    if (syncState && syncState.clockDriftSeconds) {
      clockDriftSeconds = syncState.clockDriftSeconds;
    }
  } catch (e) {}

  const context = {
    queueDepth:          snapshot.queue.depth,
    quarantineCount:     snapshot.quarantine.count,
    clockDriftSeconds,
    recentIncidentCount: recentIncidents.length,
    manualOverrideActive: snapshot.syncEngine.frozen &&
                          snapshot.syncEngine.freezeReason?.startsWith('MANUAL'),
    errorFrequency:      snapshot.recentErrors?.length || 0,
  };

  const severityScore  = calculateSeverityScore(incident, context);
  const decision       = selectRecoveryAction(severityScore, incident, context);

  const recommendation = {
    incident_id:         incident.incident_id,
    incident_code:       incident.code,
    severity_score:      severityScore,
    severity_band:       severityScore >= 80 ? 'CRITICAL'
                       : severityScore >= 60 ? 'HIGH'
                       : severityScore >= 40 ? 'MEDIUM'
                       : severityScore >= 20 ? 'LOW'
                       : 'MINIMAL',
    recommended_action:  decision.action,
    action_reason:       decision.reason,
    human_override_required: decision.humanOverrideRequired,
    estimated_recovery_ms:   decision.estimatedRecoveryMs,
    evidence_summary: {
      queue_depth:       context.queueDepth,
      quarantine_count:  context.quarantineCount,
      recent_incidents:  context.recentIncidentCount,
      recent_errors:     context.errorFrequency,
      sync_frozen:       snapshot.syncEngine.frozen,
    },
    generated_at: new Date().toISOString(),
  };

  await emitInfo({
    trace_id:    incident.trace_id || 'NO_TRACE',
    event_type:  'INCIDENT_OPENED',
    layer:       'SYSTEM',
    entity_id:   incident.incident_id,
    message:     `Recovery recommendation: ${decision.action} [score: ${severityScore}]`,
    data:        recommendation,
  });

  return recommendation;
}

async function getRecentIncidents(withinMinutes) {
  const db  = await openSecureDB();
  const all = await db.getAll('FSRMS_INCIDENTS').catch(() => []);
  db.close();
  const cutoff = new Date(Date.now() - withinMinutes * 60000).toISOString();
  return all.filter(i => i.opened_at >= cutoff);
}
