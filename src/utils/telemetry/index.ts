// =========================================================================
// src/utils/telemetry/index.ts
// FSRMS v2.0 — Telemetry Adapter Public API & Singleton
// =========================================================================
/**
 * Public API for the Telemetry Adapter module.
 *
 * Environment-based configuration (import.meta.env.MODE):
 * - development : ConsoleTelemetryProvider (verbose), 3s flush interval
 * - staging     : Console + SupabaseAnalyticsProvider, 10s flush interval
 * - production  : SupabaseAnalyticsProvider only, 30s flush interval, debug logging off
 */
import { TelemetryAdapter } from './TelemetryAdapter';
import { ConsoleTelemetryProvider } from './providers/ConsoleTelemetryProvider';
import { SupabaseAnalyticsProvider } from './providers/SupabaseAnalyticsProvider';
import type { TelemetryAdapterConfig, TelemetryProvider } from './types';

const mode = import.meta.env.MODE as string;

function buildConfig(): TelemetryAdapterConfig {
  const providers: TelemetryProvider[] = [];

  if (mode === 'development') {
    providers.push(new ConsoleTelemetryProvider());
    return {
      providers,
      flushIntervalMs: 3_000,
      batchSize: 50,
      maxRetries: 3,
      backoffBaseMs: 500,
      backoffMaxMs: 30_000,
      evictionThresholdBytes: 20_000_000,
      evictionThresholdCount: 10_000,
      debugLogging: true,
      maxRetriesBeforeDLQ: 10,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 60_000,
    };
  }

  if (mode === 'staging') {
    providers.push(new ConsoleTelemetryProvider());
    providers.push(new SupabaseAnalyticsProvider());
    return {
      providers,
      flushIntervalMs: 10_000,
      batchSize: 50,
      maxRetries: 5,
      backoffBaseMs: 1_000,
      backoffMaxMs: 30_000,
      evictionThresholdBytes: 20_000_000,
      evictionThresholdCount: 10_000,
      debugLogging: true,
      maxRetriesBeforeDLQ: 10,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerCooldownMs: 60_000,
    };
  }

  // production (default)
  providers.push(new SupabaseAnalyticsProvider());
  return {
    providers,
    flushIntervalMs: 30_000,
    batchSize: 50,
    maxRetries: 5,
    backoffBaseMs: 2_000,
    backoffMaxMs: 30_000,
    evictionThresholdBytes: 20_000_000,
    evictionThresholdCount: 10_000,
    debugLogging: false,
    maxRetriesBeforeDLQ: 10,
    circuitBreakerFailureThreshold: 5,
    circuitBreakerCooldownMs: 60_000,
  };
}

/** Global singleton — instantiated once on module load */
export const telemetry = new TelemetryAdapter(buildConfig());

// Graceful flush on page hide (catches tab close, navigation, and backgrounding)
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      telemetry.flush().catch(() => {});
    }
  });
}

// Re-export types and classes for consumers that need to extend the system
export { TelemetryAdapter } from './TelemetryAdapter';
export type {
  ITelemetryAdapter,
  TelemetryProvider,
  TelemetryAdapterConfig,
  TelemetryQueueItem,
  EnrichedTelemetryEvent,
  ProviderStatus,
  EventPriority,
} from './types';
