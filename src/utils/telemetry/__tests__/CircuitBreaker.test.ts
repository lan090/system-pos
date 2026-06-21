// src/utils/telemetry/__tests__/CircuitBreaker.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker } from '../CircuitBreaker';
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

function makeConfig(providers: TelemetryProvider[], threshold = 3, cooldown = 5000): TelemetryAdapterConfig {
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
    circuitBreakerFailureThreshold: threshold,
    circuitBreakerCooldownMs: cooldown,
  };
}

describe('CircuitBreaker Class', () => {
  it('starts CLOSED', () => {
    const cb = new CircuitBreaker(3, 100);
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isOpen()).toBe(false);
  });

  it('transitions CLOSED -> OPEN after failureThreshold consecutive failures', () => {
    const cb = new CircuitBreaker(3, 100);
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('CLOSED');
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.isOpen()).toBe(true);
  });

  it('cooldown elapsed transitions OPEN -> HALF_OPEN', async () => {
    const cb = new CircuitBreaker(3, 20);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');

    await sleep(30);
    expect(cb.getState()).toBe('HALF_OPEN');
    expect(cb.isOpen()).toBe(false);
  });

  it('transitions HALF_OPEN -> OPEN on failure', async () => {
    const cb = new CircuitBreaker(3, 20);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    await sleep(30);
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.recordFailure();
    expect(cb.getState()).toBe('OPEN');
    expect(cb.isOpen()).toBe(true);
  });

  it('transitions HALF_OPEN -> CLOSED on success', async () => {
    const cb = new CircuitBreaker(3, 20);
    cb.recordFailure();
    cb.recordFailure();
    cb.recordFailure();

    await sleep(30);
    expect(cb.getState()).toBe('HALF_OPEN');

    cb.recordSuccess();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.isOpen()).toBe(false);
  });
});

describe('Circuit Breaker Integration', () => {
  let adapter: TelemetryAdapter;
  const queueEngine = new IndexedDBQueueEngine();

  beforeEach(async () => {
    await queueEngine.clear();
  });

  afterEach(() => {
    adapter?.destroy();
  });

  it('skips dispatching to provider when circuit is open', async () => {
    const failing = new FailingProvider('FailingProv');
    // Threshold = 2, Cooldown = 5000ms (5s)
    adapter = new TelemetryAdapter(makeConfig([failing], 2, 5000));

    // Send 1st failure
    adapter.trackEvent('event_1');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    // Send 2nd failure -> trips circuit to OPEN
    adapter.trackEvent('event_2');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    // Call count is 3: event_1 first attempt, event_1 retry, event_2 first attempt
    expect(failing.callCount).toBe(3);

    // Send 3rd event. Since circuit is OPEN, it should skip dispatch to FailingProv
    adapter.trackEvent('event_3');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    // Call count should remain 3!
    expect(failing.callCount).toBe(3);
  });

  it('provider isolation: open circuit for one provider does not affect another', async () => {
    const failing = new FailingProvider('FailingProv');
    const success = new SuccessProvider('SuccessProv');
    // Threshold = 1, Cooldown = 5000ms
    adapter = new TelemetryAdapter(makeConfig([failing, success], 1, 5000));

    // Send 1st event -> FailingProv fails (trips circuit to OPEN), SuccessProv succeeds
    adapter.trackEvent('event_1');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    expect(failing.callCount).toBe(1);
    expect(success.received.length).toBe(1);

    // Send 2nd event -> should skip FailingProv, but SuccessProv should receive it
    adapter.trackEvent('event_2');
    await sleep(20);
    await adapter.flush();
    await sleep(20);

    expect(failing.callCount).toBe(1); // remains 1 (skipped due to OPEN circuit)
    expect(success.received.length).toBe(2); // increased to 2
  });
});
