// =========================================================================
// src/utils/integrityChecker.js
// FSRMS v2.0 — System Integrity Checker
// =========================================================================

import { detectClientCorruption } from './storageEngine';

export async function runIntegrityCheck(supabase, options = {}) {
  const { runDbChecks = false, silent = false } = options;
  const report = {
    timestamp: new Date().toISOString(),
    clientIssues: [],
    dbIssues: [],
    overallStatus: 'CLEAN', // 'CLEAN' | 'DEGRADED' | 'CRITICAL'
    recommendedAction: null
  };

  // === CLIENT-SIDE CHECKS ===
  try {
    report.clientIssues = await detectClientCorruption();
  } catch (err) {
    report.clientIssues = [{ type: 'CHECK_FAILED', error: err.message, severity: 'HIGH' }];
  }

  // === SUPABASE DB CHECKS (online + permission required) ===
  if (runDbChecks && supabase) {
    try {
      // Orphan items check
      const { data: orphans } = await supabase.rpc('check_orphan_transaction_items');
      if (orphans?.count > 0) {
        report.dbIssues.push({ type: 'ORPHAN_ITEMS', count: orphans.count, severity: 'HIGH' });
      }

      // Draft timeout check
      const { data: staleDrafts } = await supabase.rpc('check_stale_drafts');
      if (staleDrafts?.count > 0) {
        report.dbIssues.push({ type: 'STALE_DRAFTS', count: staleDrafts.count, severity: 'MEDIUM' });
      }

      // Zero-amount done transactions
      const { data: zeroTx } = await supabase.rpc('check_zero_amount_transactions');
      if (zeroTx?.count > 0) {
        report.dbIssues.push({ type: 'ZERO_AMOUNT_DONE', count: zeroTx.count, severity: 'HIGH' });
      }
    } catch (err) {
      report.dbIssues.push({ type: 'DB_CHECK_FAILED', error: err.message, severity: 'MEDIUM' });
    }
  }

  // === SEVERITY AGGREGATION ===
  const allIssues = [...report.clientIssues, ...report.dbIssues];
  const hasCritical = allIssues.some(i => i.severity === 'CRITICAL');
  const hasHigh = allIssues.some(i => i.severity === 'HIGH');

  if (hasCritical) {
    report.overallStatus = 'CRITICAL';
    report.recommendedAction = 'FREEZE_AND_ALERT';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fsrms-hard-failure', { detail: report }));
    }
  } else if (hasHigh) {
    report.overallStatus = 'DEGRADED';
    report.recommendedAction = 'ALERT_IT';
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sync-total-failure', { detail: report }));
    }
  }

  if (!silent) {
    console.log('[INTEGRITY CHECK]', report.overallStatus, report);
  }

  return report;
}
