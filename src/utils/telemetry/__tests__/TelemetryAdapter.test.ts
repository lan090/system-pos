// src/utils/telemetry/__tests__/TelemetryAdapter.test.ts
//
// Uses fake-indexeddb to provide real IndexedDB in the Vitest/Node.js environment.
// Tests the TelemetryAdapter end-to-end, including partial failure isolation.

import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { TelemetryAdapter } from '../TelemetryAdapter';
import { IndexedDBQueueEngine } from '../IndexedDBQueueEngine';
import type { TelemetryProvider, EnrichedTelemetryEvent, TelemetryAdapterConfig } from '../types';

// ── Test double providers ──────────────────────────────────────────────────

/** Spy provider that records all received events */
class SuccessProvider implements TelemetryProvider {
  readonly name: string;
  received: EnrichedTelemetryEvent[] = [];
  constructor(name: string) { this.name = name; }
  async send(event: EnrichedTelemetryEvent): Promise<void> {
    this.received.push(event);
  }
}

/** Provider that always throws */
class FailingProvider implements TelemetryProvider {
  readonly name: string;
  callCount = 0;
  constructor(name: string) { this.name = name; }
  async send(_: EnrichedTelemetryEvent): Promise<void> {
    this.callCount++;
    throw new Error('Provider error: network timeout');
  }
}

// ── Config factory ─────────────────────────────────────────────────────────

function makeConfig(providers: TelemetryProvider[]): TelemetryAdapterConfig {
  return {
    providers,
    flushIntervalMs: 60_000, // disable auto-flush during tests; use adapter.flush() manually
    batchSize: 50,
    maxRetries: 3,
    backoffBaseMs: 10,
    backoffMaxMs: 100,
    evictionThresholdBytes: 20_000_000,
    evictionThresholdCount: 10_000,
    debugLogging: false,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('TelemetryAdapter', () => {
  let adapter: TelemetryAdapter;

  beforeEach(async () => {
    // Clear IndexedDB queue between tests to prevent state leakage
    const queueEngine = new IndexedDBQueueEngine();
    await queueEngine.clear();
  });

  afterEach(() => {
    adapter?.destroy();
  });

  it('trackEvent synchronously returns undefined (non-blocking)', () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    const result = adapter.trackEvent('page_loaded', { page: 'home' });
    expect(result).toBeUndefined();
  });

  it('trackEvent injects event_id, timestamp_utc, and session_id into payload', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    adapter.trackEvent('test_event', { key: 'value' });
    await adapter.flush();
    expect(provider.received.length).toBe(1);
    const event = provider.received[0];
    expect(event.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(event.timestamp_utc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof event.session_id).toBe('string');
    expect(event.session_id.length).toBeGreaterThan(0);
  });

  it('sanitizes PII from event properties before delivery', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    adapter.trackEvent('user_action', {
      username: 'alice',
      password: 'super-secret',
      action: 'click',
    });
    await adapter.flush();
    const event = provider.received[0];
    expect(event.properties?.['password']).toBe('[REDACTED]');
    expect(event.properties?.['username']).toBe('alice');
    expect(event.properties?.['action']).toBe('click');
  });

  it('partial failure: Provider A succeeds, Provider B fails — Provider A still receives the event', async () => {
    const successProvider = new SuccessProvider('ProviderA');
    const failingProvider = new FailingProvider('ProviderB');
    adapter = new TelemetryAdapter(makeConfig([successProvider, failingProvider]));
    adapter.trackEvent('sale_completed', { amount: 150000 });
    await adapter.flush();
    // Provider A must have received the event
    expect(successProvider.received.length).toBe(1);
    // Provider B must have been attempted
    expect(failingProvider.callCount).toBeGreaterThan(0);
  });

  it('partial failure: failing provider does not prevent success provider from receiving subsequent events', async () => {
    const successProvider = new SuccessProvider('ProviderA');
    const failingProvider = new FailingProvider('ProviderB');
    adapter = new TelemetryAdapter(makeConfig([successProvider, failingProvider]));
    adapter.trackEvent('event_one');
    adapter.trackEvent('event_two');
    await adapter.flush();
    // Both events must be delivered to the success provider
    expect(successProvider.received.length).toBe(2);
  });

  it('provider exception is caught and does not propagate to caller', async () => {
    const failingProvider = new FailingProvider('Failing');
    adapter = new TelemetryAdapter(makeConfig([failingProvider]));
    expect(() => adapter.trackEvent('crash_test')).not.toThrow();
    await expect(adapter.flush()).resolves.not.toThrow();
  });

  it('trackError captures error name, message and stack in properties', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    const error = new Error('Test error');
    adapter.trackError(error, { component: 'CheckoutView' });
    await adapter.flush();
    const event = provider.received[0];
    expect(event.event_name).toBe('error');
    expect(event.properties?.['error_message']).toBe('Test error');
    expect(event.properties?.['error_name']).toBe('Error');
    expect(event.properties?.['component']).toBe('CheckoutView');
  });

  it('trackMetric sends event_name as "metric" with value and metric_name', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    adapter.trackMetric('checkout_duration_ms', 420, { screen: 'pos' });
    await adapter.flush();
    const event = provider.received[0];
    expect(event.event_name).toBe('metric');
    expect(event.properties?.['metric_name']).toBe('checkout_duration_ms');
    expect(event.properties?.['metric_value']).toBe(420);
  });

  it('trackPageView sends event_name as "page_view" with page_name', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    adapter.trackPageView('DashboardView', { referrer: 'POS' });
    await adapter.flush();
    const event = provider.received[0];
    expect(event.event_name).toBe('page_view');
    expect(event.properties?.['page_name']).toBe('DashboardView');
  });

  it('session_id is consistent across multiple events in the same adapter instance', async () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    adapter.trackEvent('event_one');
    adapter.trackEvent('event_two');
    await adapter.flush();
    expect(provider.received.length).toBe(2);
    expect(provider.received[0].session_id).toBe(provider.received[1].session_id);
  });

  it('destroy stops the flush interval timer', () => {
    const provider = new SuccessProvider('A');
    adapter = new TelemetryAdapter(makeConfig([provider]));
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    adapter.destroy();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
