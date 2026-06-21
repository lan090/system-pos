// =========================================================================
// src/utils/telemetry/TelemetryAdapter.ts
// FSRMS v2.0 — Telemetry Adapter (Composite Pattern)
// =========================================================================
import type {
  ITelemetryAdapter,
  TelemetryAdapterConfig,
  TelemetryProvider,
  EnrichedTelemetryEvent,
  RawTelemetryEvent,
  EventPriority,
  TelemetryQueueItem,
} from './types';
import { sanitize, enforcePayloadSizeLimit, measurePayloadBytes } from './PIISanitizer';
import { IndexedDBQueueEngine } from './IndexedDBQueueEngine';
import { CircuitBreaker } from './CircuitBreaker';
import { MultiTabCoordinator } from './MultiTabCoordinator';

/**
 * Calculates exponential backoff delay with random jitter.
 * Formula: delay = base * (2^retryCount) + jitter, capped at maxMs.
 */
function calcBackoff(retryCount: number, baseMs: number, maxMs: number): number {
  const exp = baseMs * Math.pow(2, retryCount);
  const jitter = Math.random() * baseMs;
  return Math.min(exp + jitter, maxMs);
}

/**
 * TelemetryAdapter — Composite Pattern implementation.
 *
 * Public API (track*) is SYNCHRONOUS — metadata injection happens
 * inline (no await), then async queue write is fire-and-forget.
 *
 * Dispatch to providers happens asynchronously in a background flush loop.
 * Provider exceptions are always caught and isolated — a failing provider
 * never propagates errors or prevents other providers from receiving events.
 */
export class TelemetryAdapter implements ITelemetryAdapter {
  private readonly config: TelemetryAdapterConfig;
  private readonly queue: IndexedDBQueueEngine;
  /** Session ID is generated once per adapter instance and injected into all events */
  private readonly sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private isFlushing = false;
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly coordinator: MultiTabCoordinator | null;

  constructor(config: TelemetryAdapterConfig) {
    this.config = config;
    this.queue = new IndexedDBQueueEngine();
    this.sessionId = crypto.randomUUID();

    // Initialize Circuit Breakers per provider
    for (const provider of this.config.providers) {
      const threshold = this.config.circuitBreakerFailureThreshold ?? 5;
      const cooldown = this.config.circuitBreakerCooldownMs ?? 60_000;
      this.circuitBreakers.set(provider.name, new CircuitBreaker(threshold, cooldown));
    }

    // Initialize coordinator
    this.coordinator = new MultiTabCoordinator('telemetry_flush_leader');

    this._startFlushLoop();
  }

  // ── Public track* API (synchronous) ──────────────────────────────────────

  /** Track a named event with optional properties. */
  trackEvent(eventName: string, properties?: Record<string, unknown>): void {
    this._enqueueAsync({ event_name: eventName, properties, priority: 'normal' });
  }

  /** Track an Error with optional additional context. Priority: 'system'. */
  trackError(error: Error, context?: Record<string, unknown>): void {
    this._enqueueAsync({
      event_name: 'error',
      priority: 'system',
      properties: {
        error_name: error.name,
        error_message: error.message,
        error_stack: error.stack,
        ...context,
      },
    });
  }

  /** Track a numeric metric with optional tags. */
  trackMetric(metricName: string, value: number, tags?: Record<string, unknown>): void {
    this._enqueueAsync({
      event_name: 'metric',
      priority: 'normal',
      properties: { metric_name: metricName, metric_value: value, ...tags },
    });
  }

  /** Track a page view with optional properties. */
  trackPageView(pageName: string, properties?: Record<string, unknown>): void {
    this._enqueueAsync({
      event_name: 'page_view',
      priority: 'normal',
      properties: { page_name: pageName, ...properties },
    });
  }

  /** Force an immediate flush of pending queue items to all providers. */
  async flush(): Promise<void> {
    await this._dispatchPendingBatch();
  }

  /** Teardown: stop flush interval. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Get all events that have dead-lettered for at least one provider */
  async getDeadLetterEvents(): Promise<TelemetryQueueItem[]> {
    return this.queue.getDeadLetterEvents();
  }

  /** Reset status of dead-lettered providers back to pending for retry */
  async retryDeadLetterEvent(eventId: string): Promise<void> {
    return this.queue.retryDeadLetterEvent(eventId);
  }

  /** Permanently delete a dead letter event */
  async clearDeadLetterEvent(eventId: string): Promise<void> {
    return this.queue.clearDeadLetterEvent(eventId);
  }

  /** Get current health snapshot of the queue */
  async getQueueHealth(): Promise<import('./types').QueueHealth> {
    const providerNames = this.config.providers.map(p => p.name);
    return this.queue.getQueueHealth(providerNames);
  }

  // ── Private internals ──────────────────────────────────────────────────

  /**
   * Synchronously injects idempotency metadata (`event_id`, `timestamp_utc`, `session_id`),
   * runs the PII sanitizer and size-limit enforcer, then asynchronously writes
   * the enriched event to the IndexedDB queue (fire-and-forget).
   *
   * This method NEVER blocks the call site — all I/O is async.
   */
  private _enqueueAsync(raw: RawTelemetryEvent): void {
    // ── Synchronous metadata injection (instant, no await) ──
    const eventId = crypto.randomUUID();
    const timestampUtc = new Date().toISOString();

    // Run PII sanitizer + 10KB size limit (synchronous CPU work only)
    const rawProps = raw.properties ?? {};
    const sanitizedProps = sanitize(rawProps);
    const cappedProps = enforcePayloadSizeLimit(sanitizedProps);
    const payloadBytes = measurePayloadBytes(cappedProps);

    const enriched: EnrichedTelemetryEvent = {
      event_name: raw.event_name,
      event_id: eventId,
      timestamp_utc: timestampUtc,
      session_id: this.sessionId,
      priority: raw.priority ?? 'normal',
      properties: cappedProps,
      correlation_id: raw.correlation_id,
    };

    // Build initial per-provider state map (all pending)
    const providerStates: Record<string, 'pending'> = {};
    const providerRetryCounts: Record<string, number> = {};
    for (const p of this.config.providers) {
      providerStates[p.name] = 'pending';
      providerRetryCounts[p.name] = 0;
    }

    const priority: EventPriority = enriched.priority;

    // ── Async fire-and-forget: write to IndexedDB ──
    this.queue.enqueue({
      event_id: eventId,
      event_name: raw.event_name,
      payload: enriched as unknown as Record<string, unknown>,
      provider_states: providerStates,
      retry_count: 0,
      provider_retry_counts: providerRetryCounts,
      created_at: timestampUtc,
      priority,
      payload_size_bytes: payloadBytes,
    }).catch(err => {
      console.warn('[TelemetryAdapter] enqueue error (non-fatal):', err);
    });
  }

  private _startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      this._dispatchPendingBatch().catch(err => {
        console.warn('[TelemetryAdapter] flush loop error (non-fatal):', err);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Dispatches up to `batchSize` pending events to all providers in parallel.
   * Guards against concurrent flushes with `isFlushing` flag.
   */
  private async _dispatchPendingBatch(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      const runFlush = async () => {
        const providerNames = this.config.providers.map(p => p.name);
        const maxRetries = this.config.maxRetriesBeforeDLQ ?? 10;
        const pending = await this.queue.getPending(providerNames, maxRetries, this.config.batchSize);
        const batch = pending;

        if (batch.length === 0) return;

        // Check eviction policy before dispatching
        const totalCount = await this.queue.count();
        if (totalCount > this.config.evictionThresholdCount) {
          const evictCount = Math.ceil(totalCount * 0.1); // evict 10% oldest normal events
          await this.queue.evictOldestNormal(evictCount);
        }

        await Promise.all(batch.map(item => this._dispatchItem(item)));
      };

      if (MultiTabCoordinator.isSupported() && this.coordinator) {
        await this.coordinator.tryAcquireAndRun(runFlush);
      } else {
        await runFlush();
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Delivers a single queue item to ALL providers that still have 'pending' state.
   * Each provider runs independently inside its own try/catch — one failing provider
   * NEVER prevents others from succeeding or causes the caller to throw.
   */
  private async _dispatchItem(item: TelemetryQueueItem): Promise<void> {
    const enriched = item.payload as unknown as EnrichedTelemetryEvent;
    const providerNames = this.config.providers.map(p => p.name);

    await Promise.all(
      this.config.providers.map(async (provider: TelemetryProvider) => {
        const currentState = item.provider_states[provider.name];
        if (currentState !== 'pending') return; // already sent or dead letter or failed

        // Check Circuit Breaker
        const cb = this.circuitBreakers.get(provider.name);
        if (cb && cb.isOpen()) {
          if (this.config.debugLogging) {
            console.debug(`[TelemetryAdapter] Circuit open for ${provider.name}. Skipping dispatch.`);
          }
          return;
        }

        try {
          await provider.send(enriched);
          
          if (cb) cb.recordSuccess();

          await this.queue.updateProviderStatus(
            item.event_id, provider.name, 'sent', providerNames,
          );
          if (this.config.debugLogging) {
            console.debug(`[TelemetryAdapter] ✅ ${provider.name} → ${item.event_name}`);
          }
        } catch (err) {
          if (cb) cb.recordFailure();

          // ── Isolate provider failure — never re-throw ──
          const currentRetryCount = item.provider_retry_counts?.[provider.name] ?? item.retry_count;
          const maxRetries = this.config.maxRetriesBeforeDLQ ?? 10;

          if (currentRetryCount + 1 >= maxRetries) {
            await this.queue.incrementProviderRetry(item.event_id, provider.name);
            await this.queue.updateProviderStatus(
              item.event_id, provider.name, 'dead_letter', providerNames,
            );
            if (this.config.debugLogging) {
              console.warn(
                `[TelemetryAdapter] 💀 ${provider.name} exceeded max retries. Event ${item.event_id} moved to DLQ.`,
              );
            }
          } else {
            await this.queue.updateProviderStatus(
              item.event_id, provider.name, 'failed', providerNames,
            );

            if (this.config.debugLogging) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.warn(
                `[TelemetryAdapter] ❌ ${provider.name} failed for ${item.event_name}: ${errMsg}`,
              );
            }

            // Schedule retry with exponential backoff
            const delay = calcBackoff(
              currentRetryCount, this.config.backoffBaseMs, this.config.backoffMaxMs,
            );
            setTimeout(async () => {
              await this.queue.incrementProviderRetry(item.event_id, provider.name);
            }, delay);
          }
        }
      }),
    );
  }
}
