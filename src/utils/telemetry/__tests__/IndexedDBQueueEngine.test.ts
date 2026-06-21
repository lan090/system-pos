// src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts
//
// Uses fake-indexeddb to polyfill IndexedDB in the Vitest/Node.js environment.
// This tests the real IndexedDBQueueEngine implementation against an in-memory
// IndexedDB (no mocks, real behavior as per TDD best practices).

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IndexedDBQueueEngine } from '../IndexedDBQueueEngine';
import type { TelemetryQueueItem } from '../types';

function makeItem(overrides: Partial<TelemetryQueueItem> = {}): TelemetryQueueItem {
  return {
    event_id: crypto.randomUUID(),
    event_name: 'test_event',
    payload: { action: 'test' },
    provider_states: {
      ConsoleTelemetryProvider: 'pending',
      SupabaseAnalyticsProvider: 'pending',
    },
    retry_count: 0,
    created_at: new Date().toISOString(),
    priority: 'normal',
    payload_size_bytes: 20,
    ...overrides,
  };
}

describe('IndexedDBQueueEngine', () => {
  let engine: IndexedDBQueueEngine;

  beforeEach(async () => {
    engine = new IndexedDBQueueEngine();
    await engine.clear(); // ensure clean state each test
  });

  it('enqueues an item and retrieves it', async () => {
    const item = makeItem();
    await engine.enqueue(item);
    const pending = await engine.getPending(['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider']);
    expect(pending.some(p => p.event_id === item.event_id)).toBe(true);
  });

  it('updates provider status for a specific provider', async () => {
    const item = makeItem();
    await engine.enqueue(item);
    await engine.updateProviderStatus(item.event_id, 'ConsoleTelemetryProvider', 'sent');
    const all = await engine.getPending(['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider']);
    // After Console is 'sent', item still pending for Supabase
    const found = all.find(p => p.event_id === item.event_id);
    expect(found).toBeDefined();
    expect(found!.provider_states['ConsoleTelemetryProvider']).toBe('sent');
    expect(found!.provider_states['SupabaseAnalyticsProvider']).toBe('pending');
  });

  it('removes item when ALL providers are sent', async () => {
    const item = makeItem();
    await engine.enqueue(item);
    await engine.updateProviderStatus(
      item.event_id, 'ConsoleTelemetryProvider', 'sent',
      ['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider'],
    );
    await engine.updateProviderStatus(
      item.event_id, 'SupabaseAnalyticsProvider', 'sent',
      ['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider'],
    );
    const pending = await engine.getPending(['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider']);
    expect(pending.find(p => p.event_id === item.event_id)).toBeUndefined();
  });

  it('does NOT remove item when only one of two providers is sent', async () => {
    const item = makeItem();
    await engine.enqueue(item);
    await engine.updateProviderStatus(
      item.event_id, 'ConsoleTelemetryProvider', 'sent',
      ['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider'],
    );
    const pending = await engine.getPending(['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider']);
    expect(pending.find(p => p.event_id === item.event_id)).toBeDefined();
  });

  it('increments retry_count when incrementRetry is called', async () => {
    const item = makeItem();
    await engine.enqueue(item);
    await engine.incrementRetry(item.event_id);
    const all = await engine.getPending(['ConsoleTelemetryProvider']);
    const found = all.find(p => p.event_id === item.event_id);
    expect(found?.retry_count).toBe(1);
  });

  it('getPending returns items sorted oldest-first (FIFO order)', async () => {
    const older = makeItem({ created_at: new Date(Date.now() - 5000).toISOString() });
    const newer = makeItem({ created_at: new Date().toISOString() });
    await engine.enqueue(newer);
    await engine.enqueue(older);
    const pending = await engine.getPending(['ConsoleTelemetryProvider']);
    const ids = pending.map(p => p.event_id);
    expect(ids.indexOf(older.event_id)).toBeLessThan(ids.indexOf(newer.event_id));
  });

  it('evictOldestNormal removes normal-priority items before system items', async () => {
    const systemItem = makeItem({ priority: 'system', event_name: 'sync_failure' });
    const normalItem = makeItem({ priority: 'normal', event_name: 'page_view' });
    await engine.enqueue(systemItem);
    await engine.enqueue(normalItem);
    await engine.evictOldestNormal(1);
    const remaining = await engine.getPending(['ConsoleTelemetryProvider']);
    expect(remaining.find(p => p.event_id === systemItem.event_id)).toBeDefined();
    expect(remaining.find(p => p.event_id === normalItem.event_id)).toBeUndefined();
  });

  it('count returns correct number of items', async () => {
    expect(await engine.count()).toBe(0);
    await engine.enqueue(makeItem());
    await engine.enqueue(makeItem());
    expect(await engine.count()).toBe(2);
  });
});
