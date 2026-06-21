// =========================================================================
// src/utils/healthScore.js
// FSRMS v2.0 — System Health Score Calculator
// =========================================================================

export async function calculateSystemHealthScore() {
  const { getSystemStateSnapshot } = await import('./observability');
  const { getOpenIncidents }       = await import('./incidentManager');
  const { runAllAnomalyChecks }    = await import('./anomalyDetector');

  const snapshot  = await getSystemStateSnapshot();
  const incidents = await getOpenIncidents();
  const anomalies = await runAllAnomalyChecks(null, null);

  let score = 100;

  // Deductions — Queue depth
  if (snapshot.queue.depth > 100) score -= 30;
  else if (snapshot.queue.depth > 50)  score -= 15;
  else if (snapshot.queue.depth > 20)  score -= 5;

  // Deductions — Quarantine
  if (snapshot.quarantine.count > 10) score -= 25;
  else if (snapshot.quarantine.count > 3) score -= 10;
  else if (snapshot.quarantine.count > 0) score -= 5;

  // Deductions — Sync engine frozen
  if (snapshot.syncEngine.frozen) score -= 20;

  // Deductions — Open incidents by severity
  const p1Count = incidents.filter(i => i.severity === 'P1').length;
  const p2Count = incidents.filter(i => i.severity === 'P2').length;
  score -= p1Count * 25;
  score -= p2Count * 10;

  // Deductions — Anomaly level
  if (anomalies.overallStatus === 'CRITICAL') score -= 20;
  else if (anomalies.overallStatus === 'WARNING') score -= 8;

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label = score >= 90 ? 'HEALTHY'
              : score >= 70 ? 'DEGRADED'
              : score >= 50 ? 'AT_RISK'
              : 'CRITICAL';

  const color = score >= 90 ? '#22c55e'   // green
              : score >= 70 ? '#eab308'   // yellow
              : score >= 50 ? '#f97316'   // orange
              : '#ef4444';                // red

  return {
    score,
    label,
    color,
    deductions: {
      queuePressure: snapshot.queue.depth > 20,
      quarantinePresent: snapshot.quarantine.count > 0,
      frozen: snapshot.syncEngine.frozen,
      openP1: p1Count,
      openP2: p2Count,
      anomalyLevel: anomalies.overallStatus,
    },
    recommendedAction: deriveRecommendedAction(score, snapshot, incidents),
  };
}

function deriveRecommendedAction(score, snapshot, incidents) {
  if (snapshot.syncEngine.frozen)
    return { label: 'Resume Sync', action: 'RESUME_SYNC', urgency: 'HIGH' };
  if (incidents.some(i => i.severity === 'P1'))
    return { label: 'Review P1 Incident', action: 'OPEN_INCIDENT_BOARD', urgency: 'CRITICAL' };
  if (snapshot.quarantine.count > 0)
    return { label: 'Replay Last Failure', action: 'REPLAY_LAST', urgency: 'MEDIUM' };
  if (snapshot.queue.depth > 20)
    return { label: 'Force Sync Now', action: 'FORCE_REPLAY', urgency: 'LOW' };
  return { label: 'System OK', action: null, urgency: 'NONE' };
}
