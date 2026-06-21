// src/utils/telemetry/__tests__/DLQ.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TelemetryAdapter } from '../TelemetryAdapter';
import { IndexedDBQueueEngine } from '../IndexedDBQueueEngine';
import type { TelemetryProvider, EnrichedTelemetryEvent, TelemetryAdapterConfig } from '../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class FailingProvider implements TelemetryProvider {
  readonly name: string;
  callCount = 0;
  constructor(name: string) { this.name = name; }
  async send(_: EnrichedTelemetryEvent): Promise<void> {
    this.callCount++;
    throw new Error('Failure');
  }
}

class SuccessProvider implements TelemetryProvider {
  readonly name: string;
  received: EnrichedTelemetryEvent[] = [];
  constructor(name: string) { this.name = name; }
  async send(event: EnrichedTelemetryEvent): Promise<void> {
    this.received.push(event);
  }
}

function makeConfig(providers: TelemetryProvider[], maxRetriesBeforeDLQ = 2): TelemetryAdapterConfig {
  return {
    providers,
    flushIntervalMs: 60_000,
    batchSize: 50,
    maxRetries: 5,
    backoffBaseMs: 1,
    backoffMaxMs: 5,
    evictionThresholdBytes: 20_000_000,
    evictionThresholdCount: 10_000,
    debugLogging: false,
    maxRetriesBeforeDLQ,
  };
}

describe('Dead Letter Queue (DLQ)', () => {
  let adapter: TelemetryAdapter;
  const queueEngine = new IndexedDBQueueEngine();

  beforeEach(async () => {
    await queueEngine.clear();
  });

  afterEach(() => {
    adapter?.destroy();
  });

  it('moves an event to DLQ when provider retry count exceeds maxRetriesBeforeDLQ', async () => {
    const failing = new FailingProvider('FailingProv');
    adapter = new TelemetryAdapter(makeConfig([failing], 2));

    adapter.trackEvent('test_event');
    await sleep(20);

    // 1st Flush: first attempt (retry count = 0). Fails. state -> 'failed', schedules retry.
    await adapter.flush();
    await sleep(20);

    // 2nd Flush: second attempt (retry count = 1). Fails. Exceeds maxRetriesBeforeDLQ (2). state -> 'dead_letter'.
    await adapter.flush();
    await sleep(20);

    const dlqEvents = await adapter.getDeadLetterEvents();
    expect(dlqEvents.length).toBe(1);
    expect(dlqEvents[0].provider_states['FailingProv']).toBe('dead_letter');
    expect(dlqEvents[0].dlq_at).toBeDefined();
    expect(typeof dlqEvents[0].dlq_at).toBe('string');
  });

  it('allows retrieval of dead letter events via getDeadLetterEvents()', async () => {
    const failing = new FailingProvider('FailingProv');
    adapter = new TelemetryAdapter(makeConfig([failing], 1));

    adapter.trackEvent('event_1');
    adapter.trackEvent('event_2');
    await sleep(20);

    // Flush to DLQ both: maxRetriesBeforeDLQ is 1, so 1st attempt (0) fails and immediately DLQs.
    await adapter.flush();
    await sleep(20);

    const dlqEvents = await adapter.getDeadLetterEvents();
    expect(dlqEvents.length).toBe(2);
    expect(dlqEvents.map(e => e.event_name)).toContain('event_1');
    expect(dlqEvents.map(e => e.event_name)).toContain('event_2');
  });

  it('resets state and clears dlq_at when retryDeadLetterEvent() is called', async () => {
    const failing = new FailingProvider('FailingProv');
    adapter = new TelemetryAdapter(makeConfig([failing], 1));

    adapter.trackEvent('test_event');
    await sleep(20);

    // Flush to DLQ (1st attempt (0) fails -> exceeds 1 -> dead_letter)
    await adapter.flush();
    await sleep(20);

    const dlqEventsBefore = await adapter.getDeadLetterEvents();
    expect(dlqEventsBefore.length).toBe(1);
    const eventId = dlqEventsBefore[0].event_id;

    // Retry DLQ event
    await adapter.retryDeadLetterEvent(eventId);

    const dlqEventsAfter = await adapter.getDeadLetterEvents();
    expect(dlqEventsAfter.length).toBe(0);

    const health = await adapter.getQueueHealth();
    expect(health.pending_event_count).toBe(1);
    expect(health.dead_letter_count).toBe(0);
  });

  it('permanently deletes event when clearDeadLetterEvent() is called', async () => {
    const failing = new FailingProvider('FailingProv');
    adapter = new TelemetryAdapter(makeConfig([failing], 1));

    adapter.trackEvent('test_event');
    await sleep(20);

    // Flush to DLQ
    await adapter.flush();
    await sleep(20);

    const dlqEvents = await adapter.getDeadLetterEvents();
    const eventId = dlqEvents[0].event_id;

    await adapter.clearDeadLetterEvent(eventId);

    const dlqEventsAfter = await adapter.getDeadLetterEvents();
    expect(dlqEventsAfter.length).toBe(0);

    const health = await adapter.getQueueHealth();
    expect(health.queue_size).toBe(0);
  });

  it('DLQ events do not block other pending events from being delivered', async () => {
    const failing = new FailingProvider('FailingProv');
    const success = new SuccessProvider('SuccessProv');
    adapter = new TelemetryAdapter(makeConfig([failing, success], 1));

    // Track event 1 (fails on FailingProv, succeeds on SuccessProv)
    adapter.trackEvent('event_dlq');
    await sleep(20);

    // Flush 1st attempt (0) -> event_dlq exceeds 1 -> dead_letter on FailingProv, sent on SuccessProv
    await adapter.flush();
    await sleep(20);

    const dlqEvents = await adapter.getDeadLetterEvents();
    expect(dlqEvents.length).toBe(1);

    // Track event 2 (normal success)
    adapter.trackEvent('event_success');
    await sleep(20);

    await adapter.flush();
    await sleep(20);

    expect(success.received.map(e => e.event_name)).toContain('event_success');
  });

  it('does not evict DLQ events during storage pressure eviction', async () => {
    const failing = new FailingProvider('FailingProv');
    adapter = new TelemetryAdapter(makeConfig([failing], 1));

    // Track a normal event and force it to DLQ
    adapter.trackEvent('event_dlq');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    const dlqBefore = await adapter.getDeadLetterEvents();
    expect(dlqBefore.length).toBe(1);

    // Track a regular event (which will not DLQ, it stays pending)
    adapter.trackEvent('event_regular');
    await sleep(20);

    // Evict 2 normal items. Under the old buggy implementation, both would be deleted.
    // Under the new implementation, 'event_dlq' should be skipped, and only 'event_regular' should be evicted.
    await queueEngine.evictOldestNormal(2);

    const dlqAfter = await adapter.getDeadLetterEvents();
    expect(dlqAfter.length).toBe(1); // DLQ item is preserved!
    expect(dlqAfter[0].event_name).toBe('event_dlq');

    const health = await adapter.getQueueHealth();
    expect(health.queue_size).toBe(1); // Only event_dlq remains
  });
});
