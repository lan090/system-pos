// =========================================================================
// src/utils/rcaEngine.js
// FSRMS v2.0 — Root Cause Analysis (RCA) Engine
// =========================================================================

import { queryEventLog, getTraceById, emitInfo } from './observability';
import { openSecureDB } from './storageEngine';

const RCA_SIGNATURES = [
  {
    rca_code:     'RCA-NET-01',
    description:  'Network connectivity loss',
    category:     'SYNC_FAILURE',
    confidence_base: 90,
    check: (evidence) =>
      !evidence.isOnline && evidence.offlineDurationMin >= 1,
  },
  {
    rca_code:     'RCA-AUTH-01',
    description:  'JWT token expired or invalid',
    category:     'SYNC_FAILURE',
    confidence_base: 95,
    check: (evidence) =>
      evidence.recentHttpStatuses.includes(401),
  },
  {
    rca_code:     'RCA-AUTH-02',
    description:  'RLS policy rejection (role mismatch or policy gap)',
    category:     'SYNC_FAILURE',
    confidence_base: 88,
    check: (evidence) =>
      evidence.recentHttpStatuses.includes(403),
  },
  {
    rca_code:     'RCA-NET-02',
    description:  'Supabase rate limiting',
    category:     'SYNC_FAILURE',
    confidence_base: 85,
    check: (evidence) =>
      evidence.recentHttpStatuses.includes(429),
  },
  {
    rca_code:     'RCA-NET-03',
    description:  'Supabase service outage',
    category:     'SYNC_FAILURE',
    confidence_base: 80,
    check: (evidence) =>
      evidence.recentHttpStatuses.some(s => s >= 500),
  },
  {
    rca_code:     'RCA-DUP-01',
    description:  'Same mutation re-queued multiple times (double-submit)',
    category:     'CONFLICT_STORM',
    confidence_base: 82,
    check: (evidence) =>
      evidence.coalesceDedupCount > 3,
  },
  {
    rca_code:     'RCA-RETRY-01',
    description:  'Retry loop — maxRetries not enforced or ignored',
    category:     'CONFLICT_STORM',
    confidence_base: 75,
    check: (evidence) =>
      evidence.sendAttemptCount > 9 && evidence.sendOkCount === 0,
  },
  {
    rca_code:     'RCA-PERF-01',
    description:  'SyncEngine blocked by freeze flag',
    category:     'QUEUE_OVERFLOW',
    confidence_base: 99,
    check: (evidence) =>
      evidence.syncFrozen === true,
  },
  {
    rca_code:     'RCA-PERF-03',
    description:  'High offline transaction volume',
    category:     'QUEUE_OVERFLOW',
    confidence_base: 70,
    check: (evidence) =>
      evidence.queueDepth > 30 && evidence.offlineDurationMin >= 15,
  },
  {
    rca_code:     'RCA-WRITE-01',
    description:  'IDB partial write — browser crashed during write',
    category:     'DATA_CORRUPTION',
    confidence_base: 60,
    check: (evidence) =>
      evidence.queueWriteFailCount > 0 && evidence.decryptionFailCount > 0,
  },
  {
    rca_code:     'RCA-TRIGGER-01',
    description:  'Loyalty trigger skipped (customer_id NULL on transaction)',
    category:     'DB_INCONSISTENCY',
    confidence_base: 72,
    check: (evidence) =>
      evidence.nullCustomerTransactionCount > 0 && evidence.loyaltyMismatchDetected,
  },
  {
    rca_code:     'RCA-PARTIAL-01',
    description:  'Draft transaction never finalized after header insert',
    category:     'DB_INCONSISTENCY',
    confidence_base: 85,
    check: (evidence) =>
      evidence.staleDraftCount > 0,
  },
];

export async function gatherRcaEvidence(incident, traceId) {
  const db = await openSecureDB();
  const [queue, quarantined, syncState] = await Promise.all([
    db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []),
    db.getAll('QUARANTINED_MUTATIONS').catch(() => []),
    db.get('SYNC_ENGINE_STATE', 'state').catch(() => null),
  ]);
  db.close();

  const recentEvents = await queryEventLog({ sinceMinutes: 60 });
  const traceEvents  = traceId ? (await getTraceById(traceId)).events : [];

  // Extract HTTP status codes from event data
  const httpStatuses = recentEvents
    .filter(e => e.data && e.data.httpStatus)
    .map(e => e.data.httpStatus);

  // Count event types in trace
  const countType = (type) => traceEvents.filter(e => e.event_type === type).length;

  return {
    isOnline:              navigator.onLine,
    offlineDurationMin:    (() => {
      if (typeof sessionStorage === 'undefined') return 0;
      const since = sessionStorage.getItem('fsrms_offline_since');
      return since ? Math.round((Date.now() - parseInt(since)) / 60000) : 0;
    })(),
    queueDepth:            queue.length,
    quarantineCount:       quarantined.length,
    syncFrozen:            syncState?.frozen || false,
    recentHttpStatuses:    httpStatuses,
    coalesceDedupCount:    recentEvents.filter(e => e.event_type === 'COALESCE_DEDUP').length,
    sendAttemptCount:      countType('SEND_ATTEMPT'),
    sendOkCount:           countType('SEND_OK'),
    queueWriteFailCount:   recentEvents.filter(e => e.event_type === 'QUEUE_WRITE_FAIL').length,
    decryptionFailCount:   recentEvents.filter(e => e.event_type === 'DECRYPTION_FAIL').length,
    staleDraftCount:       0,   // populated from Supabase check if online
    nullCustomerTransactionCount: 0,
    loyaltyMismatchDetected: false,
    traceEventCount:       traceEvents.length,
  };
}

export async function runRcaAnalysis(incident, traceId) {
  const evidence = await gatherRcaEvidence(incident, traceId);

  const matches = RCA_SIGNATURES
    .filter(sig => sig.check(evidence))
    .map(sig => ({
      rca_code:    sig.rca_code,
      description: sig.description,
      category:    sig.category,
      confidence:  sig.confidence_base,
      adjusted_confidence: evidence.traceEventCount < 3
        ? Math.round(sig.confidence_base * 0.7)
        : sig.confidence_base,
    }))
    .sort((a, b) => b.adjusted_confidence - a.adjusted_confidence);

  const top3 = matches.slice(0, 3);

  const rcaReport = {
    incident_id:    incident.incident_id,
    incident_code:  incident.code,
    analysis_at:    new Date().toISOString(),
    trace_id:       traceId || null,
    probable_causes: top3,
    evidence_summary: evidence,
    no_match_found:  top3.length === 0,
    recommendation:  top3.length > 0
      ? `Likely: ${top3[0].description} (${top3[0].adjusted_confidence}% confidence)`
      : 'Insufficient evidence — collect more trace data before concluding RCA',
  };

  await emitInfo({
    trace_id:   traceId || 'NO_TRACE',
    event_type: 'INTEGRITY_CHECK_RUN',
    layer:      'SYSTEM',
    message:    `RCA complete: ${rcaReport.recommendation}`,
    data:       { top3: top3.map(c => `${c.rca_code}(${c.adjusted_confidence}%)`) },
  });

  return rcaReport;
}
