// =========================================================================
// src/utils/telemetry/providers/ConsoleTelemetryProvider.ts
// FSRMS v2.0 — Console/Debug Telemetry Provider
// =========================================================================
import type { TelemetryProvider, EnrichedTelemetryEvent } from '../types';

/**
 * Development provider — logs events to the browser console.
 * Active in 'development' mode and optionally in 'staging'.
 */
export class ConsoleTelemetryProvider implements TelemetryProvider {
  readonly name = 'ConsoleTelemetryProvider';

  async send(event: EnrichedTelemetryEvent): Promise<void> {
    const prefix = `[TELEMETRY][${event.priority.toUpperCase()}][${event.event_name}]`;
    const logFn = event.priority === 'system' ? console.warn : console.log;
    logFn(prefix, JSON.stringify({
      event_id: event.event_id,
      timestamp_utc: event.timestamp_utc,
      session_id: event.session_id,
      properties: event.properties,
    }));
    // Micro-task yield — ensures async non-blocking
    await Promise.resolve();
  }
}
