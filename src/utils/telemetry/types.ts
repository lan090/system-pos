// =========================================================================
// src/utils/telemetry/types.ts
// FSRMS v2.0 — Telemetry Adapter Interfaces
// =========================================================================

/** Per-provider delivery status for a single queued event */
export type ProviderStatus = 'pending' | 'sent' | 'failed' | 'dead_letter';

/** Event priority for FIFO eviction ordering */
export type EventPriority = 'system' | 'normal';

/**
 * Schema for a single event stored in the TELEMETRY_QUEUE IndexedDB store.
 * Tracked per-provider so partial delivery is safe.
 */
export interface TelemetryQueueItem {
  /** UUIDv4 — primary key, used for idempotency */
  event_id: string;
  /** Human-readable event name (e.g. 'sale_completed', 'sync_failure') */
  event_name: string;
  /** Sanitized event payload (PII-scrubbed, ≤10 KB) */
  payload: Record<string, unknown>;
  /** Delivery status per registered provider */
  provider_states: Record<string, ProviderStatus>;
  /** Total retry attempts across all providers */
  retry_count: number;
  /** ISO timestamp of when the event was originally created */
  created_at: string;
  /**
   * Priority class:
   * - 'system' → errors, circuit breaker, DLQ events (never evicted first)
   * - 'normal' → page views, metrics, user actions (evicted first when storage is full)
   */
  priority: EventPriority;
  /** Byte size of the serialized payload; enforced ≤ 10240 bytes */
  payload_size_bytes: number;
  /** ISO timestamp of when the event was first moved to the Dead Letter Queue */
  dlq_at?: string;
  /** Per-provider retry counts for retry tracking */
  provider_retry_counts?: Record<string, number>;
}

/** Metrics representing the current health of the telemetry queue */
export interface QueueHealth {
  /** Total number of items in the queue (including dead letters) */
  queue_size: number;
  /** Number of items marked as dead_letter for at least one provider */
  dead_letter_count: number;
  /** Number of providers currently in a failed/unreachable state */
  failed_provider_count: number;
  /** Age of the oldest pending/unsent event in milliseconds (null if empty) */
  oldest_event_age_ms: number | null;
  /** Number of events still pending delivery to at least one provider (excluding dead_letter/sent) */
  pending_event_count: number;
  /** ISO timestamp of when the health check was performed */
  checked_at: string;
}

/**
 * Idempotency metadata injected synchronously for every track*() call.
 */
export interface TelemetryMetadata {
  event_id: string;
  timestamp_utc: string;
  session_id: string;
}

/**
 * The raw event data passed by the caller before metadata injection.
 */
export interface RawTelemetryEvent {
  event_name: string;
  properties?: Record<string, unknown>;
  /** Override priority; defaults to 'normal' */
  priority?: EventPriority;
  /** Correlation/trace ID for distributed tracing */
  correlation_id?: string;
}

/**
 * A fully enriched event (metadata injected) ready for storage & dispatch.
 */
export interface EnrichedTelemetryEvent extends RawTelemetryEvent, TelemetryMetadata {
  priority: EventPriority;
}

/**
 * Contract for a single telemetry provider.
 * Each provider is responsible for delivering ONE event to its backend.
 */
export interface TelemetryProvider {
  /** Unique identifier used as key in provider_states */
  readonly name: string;
  /**
   * Deliver a single enriched event.
   * MUST throw on failure so the adapter can handle retry.
   * MUST NOT block the main thread (must be async).
   */
  send(event: EnrichedTelemetryEvent): Promise<void>;
}

/**
 * Configuration for the TelemetryAdapter.
 */
export interface TelemetryAdapterConfig {
  /** List of active providers */
  providers: TelemetryProvider[];
  /** Flush interval in milliseconds */
  flushIntervalMs: number;
  /** Maximum events per flush batch */
  batchSize: number;
  /** Maximum retry attempts per provider before marking as permanently failed */
  maxRetries: number;
  /** Initial backoff delay in ms (doubles each retry + jitter) */
  backoffBaseMs: number;
  /** Maximum backoff cap in ms */
  backoffMaxMs: number;
  /** IndexedDB size threshold triggering FIFO eviction (bytes) */
  evictionThresholdBytes: number;
  /** Count threshold triggering FIFO eviction */
  evictionThresholdCount: number;
  /** Enable verbose debug logging */
  debugLogging: boolean;
  /** Maximum retry attempts per provider before marking as dead letter (DLQ) */
  maxRetriesBeforeDLQ?: number;
  /** Number of consecutive failures before opening the circuit breaker */
  circuitBreakerFailureThreshold?: number;
  /** Cooldown time in ms before attempting a test request in HALF_OPEN state */
  circuitBreakerCooldownMs?: number;
}

/**
 * Public API surface of TelemetryAdapter.
 */
export interface ITelemetryAdapter {
  trackEvent(eventName: string, properties?: Record<string, unknown>): void;
  trackError(error: Error, context?: Record<string, unknown>): void;
  trackMetric(metricName: string, value: number, tags?: Record<string, unknown>): void;
  trackPageView(pageName: string, properties?: Record<string, unknown>): void;
  /** Force immediate flush (useful on page unload) */
  flush(): Promise<void>;
  /** Teardown: stop flush interval, close connections */
  destroy(): void;
  /** Get all events that have dead-lettered for at least one provider */
  getDeadLetterEvents(): Promise<TelemetryQueueItem[]>;
  /** Reset status of dead-lettered providers back to pending for retry */
  retryDeadLetterEvent(eventId: string): Promise<void>;
  /** Permanently delete a dead letter event */
  clearDeadLetterEvent(eventId: string): Promise<void>;
  /** Get current health snapshot of the queue */
  getQueueHealth(): Promise<QueueHealth>;
}
