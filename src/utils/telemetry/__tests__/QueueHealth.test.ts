// src/utils/telemetry/__tests__/QueueHealth.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryAdapter } from '../TelemetryAdapter';
import { IndexedDBQueueEngine } from '../IndexedDBQueueEngine';
import { openSecureDB } from '../../storageEngine';
import type { TelemetryProvider, EnrichedTelemetryEvent, TelemetryAdapterConfig, TelemetryQueueItem } from '../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class SuccessProvider implements TelemetryProvider {
  readonly name: string;
  constructor(name: string) { this.name = name; }
  async send(_: EnrichedTelemetryEvent): Promise<void> {}
}

function makeConfig(providers: TelemetryProvider[]): TelemetryAdapterConfig {
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
    maxRetriesBeforeDLQ: 10,
  };
}

describe('Queue Health API & Legacy Migration', () => {
  let adapter: TelemetryAdapter;
  const queueEngine = new IndexedDBQueueEngine();

  beforeEach(async () => {
    await queueEngine.clear();
  });

  afterEach(() => {
    adapter?.destroy();
  });

  it('calculates queue health metrics correctly', async () => {
    const provA = new SuccessProvider('ProvA');
    const provB = new SuccessProvider('ProvB');
    adapter = new TelemetryAdapter(makeConfig([provA, provB]));

    // Health on empty queue
    let health = await adapter.getQueueHealth();
    expect(health.queue_size).toBe(0);
    expect(health.pending_event_count).toBe(0);
    expect(health.dead_letter_count).toBe(0);
    expect(health.failed_provider_count).toBe(0);
    expect(health.oldest_event_age_ms).toBeNull();

    // Enqueue 1 item
    adapter.trackEvent('event_1');
    await sleep(20);

    health = await adapter.getQueueHealth();
    expect(health.queue_size).toBe(1);
    expect(health.pending_event_count).toBe(1);
    expect(health.oldest_event_age_ms).toBeGreaterThanOrEqual(0);

    const db = await openSecureDB();
    const all = await db.getAll('TELEMETRY_QUEUE');
    const eventId = all[0].event_id;

    await queueEngine.updateProviderStatus(eventId, 'ProvA', 'failed');
    await queueEngine.updateProviderStatus(eventId, 'ProvB', 'dead_letter');

    health = await adapter.getQueueHealth();
    expect(health.queue_size).toBe(1);
    expect(health.pending_event_count).toBe(1); // still pending on ProvA (which is failed)
    expect(health.dead_letter_count).toBe(1); // dead lettered on ProvB
    expect(health.failed_provider_count).toBe(1); // ProvA is failed
  });

  it('performs lazy migration of legacy items', async () => {
    const provA = new SuccessProvider('ProvA');
    const provB = new SuccessProvider('ProvB');
    adapter = new TelemetryAdapter(makeConfig([provA, provB]));

    // Put a legacy item directly into IndexedDB without provider_retry_counts
    const legacyItem = {
      event_id: 'legacy-uuid-123',
      event_name: 'legacy_event',
      payload: { event_name: 'legacy_event', event_id: 'legacy-uuid-123' },
      provider_states: { ProvA: 'failed', ProvB: 'pending' },
      retry_count: 3, // global retry count
      created_at: new Date().toISOString(),
      priority: 'normal',
      payload_size_bytes: 100
    };

    const db = await openSecureDB();
    const tx = db.transaction('TELEMETRY_QUEUE', 'readwrite');
    await tx.objectStore('TELEMETRY_QUEUE').put(legacyItem as any);
    await tx.done;

    // Call getPending to trigger lazy migration
    const pending = await queueEngine.getPending(['ProvA', 'ProvB'], 5);
    expect(pending.length).toBe(1);
    
    // The returned item should have provider_retry_counts populated
    expect(pending[0].provider_retry_counts).toBeDefined();
    expect(pending[0].provider_retry_counts?.['ProvA']).toBe(3);
    expect(pending[0].provider_retry_counts?.['ProvB']).toBe(3);

    // Check DB to verify it was written back
    const tx2 = db.transaction('TELEMETRY_QUEUE', 'readonly');
    const savedItem = await tx2.objectStore('TELEMETRY_QUEUE').get('legacy-uuid-123') as TelemetryQueueItem;
    await tx2.done;

    expect(savedItem.provider_retry_counts).toBeDefined();
    expect(savedItem.provider_retry_counts?.['ProvA']).toBe(3);
    expect(savedItem.provider_retry_counts?.['ProvB']).toBe(3);
  });
});
