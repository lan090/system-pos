// =========================================================================
// src/utils/featureFlags.js
// FSRMS v2.0 — Feature Flags System
// =========================================================================

import { emitInfo } from './observability';

const FLAG_STORE_KEY = 'fsrms_feature_flags';

const DEFAULT_FLAGS = {
  CHECKOUT_V2_ENABLED:        false,  // Phase 4: new checkout flow
  ANOMALY_DETECTION_ENABLED:  true,   // Phase 13: anomaly sensors
  OBSERVABILITY_ENABLED:      true,   // Phase 15: structured event log
  EMERGENCY_FREEZE:           false,  // Phase 9: manual freeze override
  DUAL_RUN_VALIDATION:        false,  // Phase 4: dual-run test mode
};

export function getFlag(flagName) {
  try {
    const stored = JSON.parse(localStorage.getItem(FLAG_STORE_KEY) || '{}');
    return flagName in stored ? stored[flagName] : DEFAULT_FLAGS[flagName] ?? false;
  } catch {
    return DEFAULT_FLAGS[flagName] ?? false;
  }
}

export function setFlag(flagName, value, operator) {
  if (!(flagName in DEFAULT_FLAGS)) {
    throw new Error(`Unknown feature flag: ${flagName}`);
  }
  const stored = JSON.parse(localStorage.getItem(FLAG_STORE_KEY) || '{}');
  stored[flagName] = value;
  localStorage.setItem(FLAG_STORE_KEY, JSON.stringify(stored));

  // Log flag change as structured event
  emitInfo({
    event_type: 'INTEGRITY_CHECK_RUN', 
    layer: 'SYSTEM',
    message: `Feature flag changed: ${flagName} = ${value}`,
    data: { flagName, newValue: value, operator_id: operator?.id || 'UNKNOWN' }
  });

  return stored;
}

export function getAllFlags() {
  const stored = JSON.parse(localStorage.getItem(FLAG_STORE_KEY) || '{}');
  return Object.fromEntries(
    Object.keys(DEFAULT_FLAGS).map(k => [k, k in stored ? stored[k] : DEFAULT_FLAGS[k]])
  );
}
