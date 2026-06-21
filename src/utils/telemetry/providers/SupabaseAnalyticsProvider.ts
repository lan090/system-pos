// =========================================================================
// src/utils/telemetry/providers/SupabaseAnalyticsProvider.ts
// FSRMS v2.0 — HTTP/Supabase Telemetry Provider
// =========================================================================
import type { TelemetryProvider, EnrichedTelemetryEvent } from '../types';

const TELEMETRY_ENDPOINT = '/api/v1/telemetry';
const FETCH_TIMEOUT_MS = 8000;

/**
 * Production/staging provider — delivers events via HTTP POST to the
 * /api/v1/telemetry edge function endpoint.
 *
 * Throws on HTTP error or network timeout so the adapter can retry
 * with exponential backoff. Uses `keepalive: true` to survive page unload.
 */
export class SupabaseAnalyticsProvider implements TelemetryProvider {
  readonly name = 'SupabaseAnalyticsProvider';

  async send(event: EnrichedTelemetryEvent): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(TELEMETRY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Telemetry-Event-Id': event.event_id,
        },
        body: JSON.stringify(event),
        signal: controller.signal,
        keepalive: true, // survive page unload
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
