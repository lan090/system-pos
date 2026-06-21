# Telemetry Monitoring System — Telemetry Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a resilient, fault-tolerant, non-blocking Telemetry Adapter that uses Composite Pattern for multi-provider delivery, per-provider granular queue tracking in IndexedDB, PII sanitization middleware, exponential backoff retry, and FIFO eviction policy.

**Architecture:** A new `TelemetryAdapter` class (Composite Pattern) accepts pluggable `TelemetryProvider` implementations. Every tracked event is synchronously enriched with idempotency metadata (`event_id`, `timestamp_utc`, `session_id`) then persisted asynchronously to a dedicated `TELEMETRY_QUEUE` IndexedDB object store (separate from `OFFLINE_MUTATION_QUEUE`). A `PIISanitizer` middleware scrubs sensitive keys before data reaches storage. An async dispatcher loops over pending queue items, fans out to each provider in parallel, and tracks per-provider state. Exponential backoff governs retries per provider. FIFO eviction protects against storage overflow. The existing `sendTelemetry()` in `storageEngine.js` is **replaced** by delegating to this adapter.

**Tech Stack:** TypeScript, `idb` v8, Vitest v4, browser Web Crypto API, environment-based config via `import.meta.env`.

---

## File Structure

```
src/utils/telemetry/
  ├── types.ts                         [NEW] All TypeScript interfaces & enums
  ├── PIISanitizer.ts                  [NEW] PII masking middleware
  ├── IndexedDBQueueEngine.ts          [NEW] IndexedDB queue persistence layer
  ├── TelemetryAdapter.ts              [NEW] Main adapter (Composite Pattern)
  ├── providers/
  │   ├── ConsoleTelemetryProvider.ts  [NEW] Console/debug provider
  │   └── SupabaseAnalyticsProvider.ts [NEW] Supabase HTTP provider (stub)
  └── index.ts                         [NEW] Public API & singleton export

src/utils/telemetry/__tests__/
  ├── PIISanitizer.test.ts             [NEW] Unit tests for PII masking
  ├── IndexedDBQueueEngine.test.ts     [NEW] Unit tests for queue engine
  └── TelemetryAdapter.test.ts        [NEW] Unit tests for adapter (partial failure)
```

**Modified files:**
- `src/utils/storageEngine.js` — bump DB version to 12, add `TELEMETRY_QUEUE` object store
- `src/utils/storageEngine.js` — replace `sendTelemetry()` to delegate to adapter singleton

---

## Environment Config Reference

`import.meta.env.MODE`:
- `development` → ConsoleTelemetryProvider (verbose), short flush interval (3s)
- `staging`     → Console + SupabaseAnalyticsProvider, debug logging on
- `production`  → SupabaseAnalyticsProvider only, debug logging off

---

## Task 1: TypeScript Interfaces & Shared Types

Define all contracts. Every downstream task depends on these types.

**Files:**
- Create: `src/utils/telemetry/types.ts`

- [ ] **Step 1: Write the failing type-check test**

  Create `src/utils/telemetry/__tests__/PIISanitizer.test.ts` with an import that will fail until types exist:

  ```typescript
  // src/utils/telemetry/__tests__/PIISanitizer.test.ts
  import { describe, it, expect } from 'vitest';
  import type { TelemetryQueueItem, ProviderStatus } from '../types';

  describe('Types: TelemetryQueueItem', () => {
    it('should have correct shape for a queue item', () => {
      const item: TelemetryQueueItem = {
        event_id: 'test-uuid',
        event_name: 'test_event',
        payload: { key: 'value' },
        provider_states: { ConsoleTelemetryProvider: 'pending' },
        retry_count: 0,
        created_at: new Date().toISOString(),
        priority: 'normal',
        payload_size_bytes: 42,
      };
      const status: ProviderStatus = 'pending';
      expect(item.event_id).toBe('test-uuid');
      expect(status).toBe('pending');
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  Run: `npx vitest run src/utils/telemetry/__tests__/PIISanitizer.test.ts`
  Expected: FAIL — "Cannot find module '../types'"

- [ ] **Step 3: Create `src/utils/telemetry/types.ts`**

  ```typescript
  // src/utils/telemetry/types.ts

  /** Per-provider delivery status for a single queued event */
  export type ProviderStatus = 'pending' | 'sent' | 'failed';

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
  }
  ```

- [ ] **Step 4: Run test to confirm it passes**

  Run: `npx vitest run src/utils/telemetry/__tests__/PIISanitizer.test.ts`
  Expected: PASS (shape test passes, types are valid)

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/telemetry/types.ts src/utils/telemetry/__tests__/PIISanitizer.test.ts
  git commit -m "feat(telemetry): define TypeScript interfaces and shared types"
  ```

---

## Task 2: PIISanitizer Middleware

Recursive masking of sensitive keys. Runs synchronously before data enters the queue.

**Files:**
- Create: `src/utils/telemetry/PIISanitizer.ts`
- Modify: `src/utils/telemetry/__tests__/PIISanitizer.test.ts` (add full test suite)

- [ ] **Step 1: Write full failing test suite in `PIISanitizer.test.ts`**

  Replace the file content with:

  ```typescript
  // src/utils/telemetry/__tests__/PIISanitizer.test.ts
  import { describe, it, expect } from 'vitest';
  import type { TelemetryQueueItem, ProviderStatus } from '../types';
  import { sanitize, enforcePayloadSizeLimit } from '../PIISanitizer';

  describe('Types: TelemetryQueueItem', () => {
    it('should have correct shape for a queue item', () => {
      const item: TelemetryQueueItem = {
        event_id: 'test-uuid',
        event_name: 'test_event',
        payload: { key: 'value' },
        provider_states: { ConsoleTelemetryProvider: 'pending' },
        retry_count: 0,
        created_at: new Date().toISOString(),
        priority: 'normal',
        payload_size_bytes: 42,
      };
      const status: ProviderStatus = 'pending';
      expect(item.event_id).toBe('test-uuid');
      expect(status).toBe('pending');
    });
  });

  describe('PIISanitizer.sanitize()', () => {
    it('masks top-level PII keys', () => {
      const result = sanitize({
        username: 'alice',
        password: 'hunter2',
        event: 'login',
      });
      expect(result['password']).toBe('[REDACTED]');
      expect(result['username']).toBe('alice');
      expect(result['event']).toBe('login');
    });

    it('masks PII keys case-insensitively', () => {
      const result = sanitize({ PASSWORD: 'secret', Token: 'abc123' });
      expect(result['PASSWORD']).toBe('[REDACTED]');
      expect(result['Token']).toBe('[REDACTED]');
    });

    it('recursively masks nested PII keys', () => {
      const result = sanitize({
        user: {
          email: 'test@example.com',
          address: {
            ssn: '123-45-6789',
            city: 'Jakarta',
          },
        },
      });
      expect((result['user'] as any)['email']).toBe('[REDACTED]');
      expect((result['user'] as any)['address']['ssn']).toBe('[REDACTED]');
      expect((result['user'] as any)['address']['city']).toBe('Jakarta');
    });

    it('masks all required PII key names: password, token, secret, authorization, credit_card, email, phone, ssn', () => {
      const input: Record<string, string> = {
        password: 'x', token: 'x', secret: 'x', authorization: 'x',
        credit_card: 'x', email: 'x', phone: 'x', ssn: 'x',
      };
      const result = sanitize(input);
      for (const key of Object.keys(input)) {
        expect(result[key]).toBe('[REDACTED]');
      }
    });

    it('does not mutate the original object', () => {
      const original = { password: 'secret', name: 'alice' };
      sanitize(original);
      expect(original.password).toBe('secret');
    });

    it('handles arrays within the payload by sanitizing each element', () => {
      const result = sanitize({
        users: [
          { email: 'a@b.com', age: 30 },
          { email: 'c@d.com', age: 25 },
        ],
      });
      const users = result['users'] as any[];
      expect(users[0]['email']).toBe('[REDACTED]');
      expect(users[0]['age']).toBe(30);
      expect(users[1]['email']).toBe('[REDACTED]');
    });

    it('passes through non-object primitives untouched', () => {
      const result = sanitize({ count: 42, active: true, label: 'test' });
      expect(result['count']).toBe(42);
      expect(result['active']).toBe(true);
      expect(result['label']).toBe('test');
    });
  });

  describe('PIISanitizer.enforcePayloadSizeLimit()', () => {
    it('returns payload unchanged when under 10KB', () => {
      const small = { data: 'hello world' };
      const result = enforcePayloadSizeLimit(small);
      expect(result).toEqual(small);
    });

    it('truncates payload and injects _truncated flag when over 10KB', () => {
      // Build a payload larger than 10240 bytes
      const largeValue = 'x'.repeat(11000);
      const big = { data: largeValue };
      const result = enforcePayloadSizeLimit(big);
      expect(result['_truncated']).toBe(true);
      const serialized = JSON.stringify(result);
      expect(serialized.length).toBeLessThanOrEqual(10240 + 100); // small overhead for _truncated key
    });

    it('does not add _truncated flag when payload is exactly at limit', () => {
      const borderlineData = 'x'.repeat(10200);
      // JSON.stringify wraps in {"data":"..."} adding ~9 chars overhead
      const result = enforcePayloadSizeLimit({ data: borderlineData });
      // 10200 + 9 overhead = 10209, under 10240 → no truncation
      expect(result['_truncated']).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run test to confirm it fails**

  Run: `npx vitest run src/utils/telemetry/__tests__/PIISanitizer.test.ts`
  Expected: FAIL — "Cannot find module '../PIISanitizer'"

- [ ] **Step 3: Implement `src/utils/telemetry/PIISanitizer.ts`**

  ```typescript
  // src/utils/telemetry/PIISanitizer.ts

  const MAX_PAYLOAD_BYTES = 10240; // 10 KB

  /**
   * Lowercase set of PII-sensitive key names.
   * Keys are matched case-insensitively against object properties.
   */
  const PII_KEYS = new Set([
    'password', 'token', 'secret', 'authorization',
    'credit_card', 'email', 'phone', 'ssn',
  ]);

  const REDACTED = '[REDACTED]';

  /**
   * Recursively deep-clones `obj` while masking any key whose lowercase name
   * appears in PII_KEYS. Arrays are handled element-by-element.
   *
   * Does NOT mutate the input object.
   */
  export function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    return sanitizeValue(obj) as Record<string, unknown>;
  }

  function sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = PII_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeValue(val);
      }
      return result;
    }
    // Primitive — return as-is
    return value;
  }

  /**
   * Enforces a 10 KB size cap on the serialized payload.
   * If the payload exceeds the limit, the value of the largest key is truncated
   * and a `_truncated: true` flag is injected.
   *
   * Returns a new object; never mutates the input.
   */
  export function enforcePayloadSizeLimit(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const serialized = JSON.stringify(payload);
    if (serialized.length <= MAX_PAYLOAD_BYTES) {
      return payload;
    }

    // Return a minimal marker payload so the event is not silently dropped
    return {
      _truncated: true,
      _original_size_bytes: serialized.length,
      _event_name: (payload['event_name'] as string | undefined) ?? 'unknown',
    };
  }

  /**
   * Calculates byte size of the serialized payload for storage tracking.
   */
  export function measurePayloadBytes(payload: Record<string, unknown>): number {
    return new TextEncoder().encode(JSON.stringify(payload)).length;
  }
  ```

- [ ] **Step 4: Run tests to confirm they pass**

  Run: `npx vitest run src/utils/telemetry/__tests__/PIISanitizer.test.ts`
  Expected: All tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/telemetry/PIISanitizer.ts src/utils/telemetry/__tests__/PIISanitizer.test.ts
  git commit -m "feat(telemetry): implement PIISanitizer middleware with recursive masking and 10KB limit"
  ```

---

## Task 3: IndexedDB Queue Engine

Persists queue items in `TELEMETRY_QUEUE` store (in the existing `fsrms_secure_db`, bumped to version 12). Provides atomic read-update-write for per-provider status.

**Files:**
- Create: `src/utils/telemetry/IndexedDBQueueEngine.ts`
- Create: `src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts`
- Modify: `src/utils/storageEngine.js` — add v12 upgrade block creating `TELEMETRY_QUEUE`

- [ ] **Step 1: Add `TELEMETRY_QUEUE` store to IndexedDB schema in `storageEngine.js`**

  Open `src/utils/storageEngine.js`. At line 4, change the version:
  ```javascript
  const SECURE_DB_VERSION = 12;
  ```

  Inside the `upgrade(db, oldVersion, ...)` callback, after the last existing `if (!db.objectStoreNames.contains(...))` block (currently the v11 block starting at line 67), add:

  ```javascript
      // v12: Telemetry Adapter queue — per-provider delivery tracking
      if (!db.objectStoreNames.contains('TELEMETRY_QUEUE')) {
        const telStore = db.createObjectStore('TELEMETRY_QUEUE', { keyPath: 'event_id' });
        telStore.createIndex('by_priority',   'priority',   { unique: false });
        telStore.createIndex('by_created_at', 'created_at', { unique: false });
        telStore.createIndex('by_retry',      'retry_count', { unique: false });
      }
  ```

- [ ] **Step 2: Write failing test for IndexedDBQueueEngine**

  Create `src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts`:

  ```typescript
  // src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts
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
      await engine.updateProviderStatus(item.event_id, 'ConsoleTelemetryProvider', 'sent');
      await engine.updateProviderStatus(item.event_id, 'SupabaseAnalyticsProvider', 'sent');
      const pending = await engine.getPending(['ConsoleTelemetryProvider', 'SupabaseAnalyticsProvider']);
      expect(pending.find(p => p.event_id === item.event_id)).toBeUndefined();
    });

    it('does NOT remove item when only one of two providers is sent', async () => {
      const item = makeItem();
      await engine.enqueue(item);
      await engine.updateProviderStatus(item.event_id, 'ConsoleTelemetryProvider', 'sent');
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
  ```

- [ ] **Step 3: Run tests to confirm they fail**

  Run: `npx vitest run src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts`
  Expected: FAIL — "Cannot find module '../IndexedDBQueueEngine'"

- [ ] **Step 4: Implement `src/utils/telemetry/IndexedDBQueueEngine.ts`**

  ```typescript
  // src/utils/telemetry/IndexedDBQueueEngine.ts
  import { openSecureDB } from '../storageEngine';
  import type { TelemetryQueueItem, ProviderStatus } from './types';

  const STORE = 'TELEMETRY_QUEUE';

  /**
   * Thread-safe IndexedDB queue engine for the Telemetry Adapter.
   * All operations use IDB transactions to avoid race conditions.
   */
  export class IndexedDBQueueEngine {
    /**
     * Persists a new telemetry event item to the queue.
     * Idempotent — if event_id already exists, the existing record is preserved (no overwrite).
     */
    async enqueue(item: TelemetryQueueItem): Promise<void> {
      try {
        const db = await openSecureDB();
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const existing = await store.get(item.event_id);
        if (!existing) {
          await store.put(item);
        }
        await tx.done;
      } catch (err) {
        console.warn('[TelemetryQueue] enqueue failed (non-fatal):', err);
      }
    }

    /**
     * Returns all items that have at least one provider still 'pending' or 'failed'
     * (with retry_count < maxRetries) among the given active provider names.
     * Sorted oldest-first for FIFO dispatch.
     */
    async getPending(
      activeProviderNames: string[],
      maxRetries: number = 5,
    ): Promise<TelemetryQueueItem[]> {
      try {
        const db = await openSecureDB();
        const all = await db.getAll(STORE);
        const pending = all.filter(item => {
          return activeProviderNames.some(name => {
            const state = item.provider_states[name];
            return (state === 'pending' || state === 'failed') && item.retry_count < maxRetries;
          });
        });
        return pending.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      } catch (err) {
        console.warn('[TelemetryQueue] getPending failed (non-fatal):', err);
        return [];
      }
    }

    /**
     * Updates the delivery status for a single provider on a given event.
     * If ALL active providers are now 'sent' or permanently failed (retry exhausted),
     * the item is automatically deleted from the store.
     *
     * @param activeProviderNames - all provider names currently registered
     */
    async updateProviderStatus(
      eventId: string,
      providerName: string,
      status: ProviderStatus,
      activeProviderNames?: string[],
    ): Promise<void> {
      try {
        const db = await openSecureDB();
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const item = await store.get(eventId);
        if (!item) {
          await tx.done;
          return;
        }
        item.provider_states[providerName] = status;

        // Determine if item can be removed: all registered providers are terminal
        const providers = activeProviderNames ?? Object.keys(item.provider_states);
        const allTerminal = providers.every(name => {
          const s = item.provider_states[name];
          return s === 'sent' || s === undefined; // undefined = provider not yet registered (ignore)
        });

        if (allTerminal) {
          await store.delete(eventId);
        } else {
          await store.put(item);
        }
        await tx.done;
      } catch (err) {
        console.warn('[TelemetryQueue] updateProviderStatus failed (non-fatal):', err);
      }
    }

    /** Increments retry_count for an event and resets 'failed' providers to 'pending'. */
    async incrementRetry(eventId: string): Promise<void> {
      try {
        const db = await openSecureDB();
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const item = await store.get(eventId);
        if (!item) { await tx.done; return; }
        item.retry_count += 1;
        // Reset failed providers to pending so they are retried
        for (const name of Object.keys(item.provider_states)) {
          if (item.provider_states[name] === 'failed') {
            item.provider_states[name] = 'pending';
          }
        }
        await store.put(item);
        await tx.done;
      } catch (err) {
        console.warn('[TelemetryQueue] incrementRetry failed (non-fatal):', err);
      }
    }

    /** Total number of items currently in the queue. */
    async count(): Promise<number> {
      try {
        const db = await openSecureDB();
        return await db.count(STORE);
      } catch {
        return 0;
      }
    }

    /**
     * Evicts the `n` oldest 'normal' priority items from the queue.
     * System/error priority items are never evicted by this method.
     */
    async evictOldestNormal(n: number): Promise<void> {
      try {
        const db = await openSecureDB();
        const all = await db.getAll(STORE);
        const normalItems = all
          .filter(item => item.priority === 'normal')
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .slice(0, n);

        if (normalItems.length === 0) return;

        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        await Promise.all(normalItems.map(item => store.delete(item.event_id)));
        await tx.done;
        console.warn(`[TelemetryQueue] Evicted ${normalItems.length} normal-priority events (storage pressure).`);
      } catch (err) {
        console.warn('[TelemetryQueue] evictOldestNormal failed (non-fatal):', err);
      }
    }

    /** Clears ALL items from the queue. Use only in tests. */
    async clear(): Promise<void> {
      try {
        const db = await openSecureDB();
        const tx = db.transaction(STORE, 'readwrite');
        await tx.objectStore(STORE).clear();
        await tx.done;
      } catch (err) {
        console.warn('[TelemetryQueue] clear failed:', err);
      }
    }
  }
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  Run: `npx vitest run src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts`
  Expected: All 8 tests PASS

- [ ] **Step 6: Commit**

  ```bash
  git add src/utils/storageEngine.js src/utils/telemetry/IndexedDBQueueEngine.ts src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts
  git commit -m "feat(telemetry): add TELEMETRY_QUEUE store (DB v12) and IndexedDBQueueEngine"
  ```

---

## Task 4: Telemetry Providers

Concrete provider implementations: Console (verbose, dev) and Supabase (staging/production).

**Files:**
- Create: `src/utils/telemetry/providers/ConsoleTelemetryProvider.ts`
- Create: `src/utils/telemetry/providers/SupabaseAnalyticsProvider.ts`

- [ ] **Step 1: Implement `ConsoleTelemetryProvider.ts`**

  ```typescript
  // src/utils/telemetry/providers/ConsoleTelemetryProvider.ts
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
      // Simulate async delivery (micro-task yield, non-blocking)
      await Promise.resolve();
    }
  }
  ```

- [ ] **Step 2: Implement `SupabaseAnalyticsProvider.ts`**

  ```typescript
  // src/utils/telemetry/providers/SupabaseAnalyticsProvider.ts
  import type { TelemetryProvider, EnrichedTelemetryEvent } from '../types';

  const TELEMETRY_ENDPOINT = '/api/v1/telemetry';
  const FETCH_TIMEOUT_MS = 8000;

  /**
   * Production/staging provider — delivers events via HTTP POST to the
   * /api/v1/telemetry edge function endpoint.
   * Throws on HTTP error or network timeout so the adapter can retry.
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
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/utils/telemetry/providers/ConsoleTelemetryProvider.ts src/utils/telemetry/providers/SupabaseAnalyticsProvider.ts
  git commit -m "feat(telemetry): implement ConsoleTelemetryProvider and SupabaseAnalyticsProvider"
  ```

---

## Task 5: Main TelemetryAdapter Class + Unit Tests for Partial Failure

The core class: Composite Pattern, metadata injection, PII pipeline, async dispatcher with exponential backoff and chunked batching.

**Files:**
- Create: `src/utils/telemetry/TelemetryAdapter.ts`
- Create: `src/utils/telemetry/__tests__/TelemetryAdapter.test.ts`

- [ ] **Step 1: Write failing unit tests for TelemetryAdapter**

  Create `src/utils/telemetry/__tests__/TelemetryAdapter.test.ts`:

  ```typescript
  // src/utils/telemetry/__tests__/TelemetryAdapter.test.ts
  import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
  import { TelemetryAdapter } from '../TelemetryAdapter';
  import type { TelemetryProvider, EnrichedTelemetryEvent, TelemetryAdapterConfig } from '../types';

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

  /** Provider that succeeds on the Nth attempt */
  class EventuallySuccessProvider implements TelemetryProvider {
    readonly name: string;
    callCount = 0;
    constructor(name: string, private successOnAttempt: number) {
      this.name = name;
    }
    async send(_: EnrichedTelemetryEvent): Promise<void> {
      this.callCount++;
      if (this.callCount < this.successOnAttempt) {
        throw new Error(`Attempt ${this.callCount} failed`);
      }
    }
  }

  function makeConfig(providers: TelemetryProvider[]): TelemetryAdapterConfig {
    return {
      providers,
      flushIntervalMs: 100,
      batchSize: 50,
      maxRetries: 3,
      backoffBaseMs: 10,
      backoffMaxMs: 100,
      evictionThresholdBytes: 20_000_000,
      evictionThresholdCount: 10_000,
      debugLogging: false,
    };
  }

  describe('TelemetryAdapter', () => {
    let adapter: TelemetryAdapter;

    afterEach(() => {
      adapter?.destroy();
    });

    it('trackEvent synchronously returns (non-blocking)', () => {
      const provider = new SuccessProvider('A');
      adapter = new TelemetryAdapter(makeConfig([provider]));
      // Should not throw and return undefined (sync)
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
      expect(event.event_id).toMatch(/^[0-9a-f-]{36}$/);
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
      // Provider A should have received the event
      expect(successProvider.received.length).toBe(1);
      // Provider B should have been attempted
      expect(failingProvider.callCount).toBeGreaterThan(0);
    });

    it('partial failure: failing provider does not prevent successful providers from receiving future events', async () => {
      const successProvider = new SuccessProvider('ProviderA');
      const failingProvider = new FailingProvider('ProviderB');
      adapter = new TelemetryAdapter(makeConfig([successProvider, failingProvider]));
      adapter.trackEvent('event_one');
      adapter.trackEvent('event_two');
      await adapter.flush();
      // Both events should be delivered to the success provider
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

    it('trackMetric sends event_name as "metric" with value and name', async () => {
      const provider = new SuccessProvider('A');
      adapter = new TelemetryAdapter(makeConfig([provider]));
      adapter.trackMetric('checkout_duration_ms', 420, { screen: 'pos' });
      await adapter.flush();
      const event = provider.received[0];
      expect(event.event_name).toBe('metric');
      expect(event.properties?.['metric_name']).toBe('checkout_duration_ms');
      expect(event.properties?.['metric_value']).toBe(420);
    });

    it('trackPageView sends event_name as "page_view" with page name', async () => {
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
      expect(provider.received[0].session_id).toBe(provider.received[1].session_id);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  Run: `npx vitest run src/utils/telemetry/__tests__/TelemetryAdapter.test.ts`
  Expected: FAIL — "Cannot find module '../TelemetryAdapter'"

- [ ] **Step 3: Implement `src/utils/telemetry/TelemetryAdapter.ts`**

  ```typescript
  // src/utils/telemetry/TelemetryAdapter.ts
  import type {
    ITelemetryAdapter, TelemetryAdapterConfig, TelemetryProvider,
    EnrichedTelemetryEvent, RawTelemetryEvent, EventPriority,
  } from './types';
  import { sanitize, enforcePayloadSizeLimit, measurePayloadBytes } from './PIISanitizer';
  import { IndexedDBQueueEngine } from './IndexedDBQueueEngine';

  /**
   * Calculates exponential backoff delay with random jitter.
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
   * inline, then async queue write is fire-and-forget.
   *
   * Dispatch to providers happens asynchronously in a background loop.
   */
  export class TelemetryAdapter implements ITelemetryAdapter {
    private readonly config: TelemetryAdapterConfig;
    private readonly queue: IndexedDBQueueEngine;
    private readonly sessionId: string;
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private isFlushing = false;

    constructor(config: TelemetryAdapterConfig) {
      this.config = config;
      this.queue = new IndexedDBQueueEngine();
      this.sessionId = crypto.randomUUID();
      this._startFlushLoop();
    }

    // ── Public track* API ──────────────────────────────────────────────────

    trackEvent(eventName: string, properties?: Record<string, unknown>): void {
      this._enqueueAsync({ event_name: eventName, properties, priority: 'normal' });
    }

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

    trackMetric(metricName: string, value: number, tags?: Record<string, unknown>): void {
      this._enqueueAsync({
        event_name: 'metric',
        priority: 'normal',
        properties: { metric_name: metricName, metric_value: value, ...tags },
      });
    }

    trackPageView(pageName: string, properties?: Record<string, unknown>): void {
      this._enqueueAsync({
        event_name: 'page_view',
        priority: 'normal',
        properties: { page_name: pageName, ...properties },
      });
    }

    async flush(): Promise<void> {
      await this._dispatchPendingBatch();
    }

    destroy(): void {
      if (this.flushTimer !== null) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
    }

    // ── Private internals ──────────────────────────────────────────────────

    /**
     * Synchronously injects idempotency metadata, runs PII sanitizer,
     * then asynchronously writes to IndexedDB queue (fire-and-forget).
     */
    private _enqueueAsync(raw: RawTelemetryEvent): void {
      // Synchronous metadata injection
      const eventId = crypto.randomUUID();
      const timestampUtc = new Date().toISOString();

      // Run PII sanitizer + size limit
      const sanitizedProps = raw.properties
        ? (sanitize(raw.properties) as Record<string, unknown>)
        : {};
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

      // Build initial provider_states map
      const providerStates: Record<string, 'pending'> = {};
      for (const p of this.config.providers) {
        providerStates[p.name] = 'pending';
      }

      const priority: EventPriority = enriched.priority;

      // Fire-and-forget async write to IndexedDB
      this.queue.enqueue({
        event_id: eventId,
        event_name: raw.event_name,
        payload: enriched as unknown as Record<string, unknown>,
        provider_states: providerStates,
        retry_count: 0,
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
     * Per-provider failures are isolated — one failing provider never blocks others.
     */
    private async _dispatchPendingBatch(): Promise<void> {
      if (this.isFlushing) return;
      this.isFlushing = true;

      try {
        const providerNames = this.config.providers.map(p => p.name);
        const pending = await this.queue.getPending(providerNames, this.config.maxRetries);
        const batch = pending.slice(0, this.config.batchSize);

        if (batch.length === 0) return;

        // Check eviction policy
        const totalCount = await this.queue.count();
        if (totalCount > this.config.evictionThresholdCount) {
          const evictCount = Math.ceil(totalCount * 0.1); // evict 10% oldest normal events
          await this.queue.evictOldestNormal(evictCount);
        }

        await Promise.all(batch.map(item => this._dispatchItem(item)));
      } finally {
        this.isFlushing = false;
      }
    }

    /**
     * Delivers a single queue item to all providers that still have 'pending' state.
     * Each provider runs independently — failure is isolated per provider.
     */
    private async _dispatchItem(item: import('./types').TelemetryQueueItem): Promise<void> {
      const enriched = item.payload as unknown as EnrichedTelemetryEvent;
      const providerNames = this.config.providers.map(p => p.name);

      await Promise.all(
        this.config.providers.map(async (provider) => {
          const currentState = item.provider_states[provider.name];
          if (currentState !== 'pending') return; // already sent or max-retried

          try {
            await provider.send(enriched);
            await this.queue.updateProviderStatus(
              item.event_id, provider.name, 'sent', providerNames,
            );
            if (this.config.debugLogging) {
              console.debug(`[TelemetryAdapter] ✅ ${provider.name} → ${item.event_name}`);
            }
          } catch (err) {
            // Isolate provider failure — never let it propagate
            await this.queue.updateProviderStatus(
              item.event_id, provider.name, 'failed', providerNames,
            );

            if (this.config.debugLogging) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.warn(`[TelemetryAdapter] ❌ ${provider.name} failed for ${item.event_name}: ${errMsg}`);
            }

            // Schedule retry with backoff if under max retries
            if (item.retry_count < this.config.maxRetries) {
              const delay = calcBackoff(item.retry_count, this.config.backoffBaseMs, this.config.backoffMaxMs);
              setTimeout(async () => {
                await this.queue.incrementRetry(item.event_id);
              }, delay);
            }
          }
        }),
      );
    }
  }
  ```

- [ ] **Step 4: Run all TelemetryAdapter tests**

  Run: `npx vitest run src/utils/telemetry/__tests__/TelemetryAdapter.test.ts`
  Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

  ```bash
  git add src/utils/telemetry/TelemetryAdapter.ts src/utils/telemetry/__tests__/TelemetryAdapter.test.ts
  git commit -m "feat(telemetry): implement TelemetryAdapter with composite pattern, backoff, and partial failure isolation"
  ```

---

## Task 6: Public API + Singleton + Replace sendTelemetry

Wire everything together. Export a pre-configured singleton. Replace the existing `sendTelemetry` in `storageEngine.js`.

**Files:**
- Create: `src/utils/telemetry/index.ts`
- Modify: `src/utils/storageEngine.js` — replace `sendTelemetry()` body

- [ ] **Step 1: Create `src/utils/telemetry/index.ts`**

  ```typescript
  // src/utils/telemetry/index.ts
  /**
   * Public API for the Telemetry Adapter module.
   *
   * Environment-based configuration:
   * - development : ConsoleTelemetryProvider (verbose), 3s flush interval
   * - staging     : Console + Supabase, 10s flush interval
   * - production  : Supabase only, 30s flush interval, debug logging off
   */
  import { TelemetryAdapter } from './TelemetryAdapter';
  import { ConsoleTelemetryProvider } from './providers/ConsoleTelemetryProvider';
  import { SupabaseAnalyticsProvider } from './providers/SupabaseAnalyticsProvider';
  import type { TelemetryAdapterConfig, TelemetryProvider } from './types';

  const mode = import.meta.env.MODE as 'development' | 'staging' | 'production';

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
      };
    }

    // production
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
    };
  }

  /** Global singleton — instantiated once on module load */
  export const telemetry = new TelemetryAdapter(buildConfig());

  // Graceful flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        telemetry.flush().catch(() => {});
      }
    });
  }

  // Re-export types and classes for consumers
  export { TelemetryAdapter } from './TelemetryAdapter';
  export type {
    ITelemetryAdapter,
    TelemetryProvider,
    TelemetryAdapterConfig,
    TelemetryQueueItem,
    EnrichedTelemetryEvent,
  } from './types';
  ```

- [ ] **Step 2: Replace `sendTelemetry()` in `storageEngine.js` to delegate to adapter**

  Open `src/utils/storageEngine.js` and find the `sendTelemetry` function (line 812–861).
  Replace the entire function body so it delegates to the adapter singleton:

  ```javascript
  // Lightweight non-blocking telemetry beacon
  // Delegates to TelemetryAdapter singleton (offline-first, per-provider queue, PII-safe)
  export async function sendTelemetry(eventData) {
    try {
      // Lazy import to avoid circular dependency
      const { telemetry } = await import('./telemetry/index');
      const isCritical = (eventData.fail_count > 0) ||
                         (eventData.event === 'quarantine') ||
                         (eventData.event === 'circuit_breaker_tripped') ||
                         (eventData.event_type === 'DLQ_ACTIVATION') ||
                         (eventData.severity === 'ERROR' || eventData.severity === 'CRITICAL');

      telemetry.trackEvent(eventData.event || 'sync_execution', {
        ...eventData,
        _source: 'sendTelemetry_bridge',
        _priority: isCritical ? 'system' : 'normal',
      });
    } catch (err) {
      // Non-blocking: telemetry failures must never affect sync queue
      console.warn('[Telemetry] sendTelemetry bridge failed (non-fatal):', err);
    }
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add src/utils/telemetry/index.ts src/utils/storageEngine.js
  git commit -m "feat(telemetry): create singleton index.ts, replace sendTelemetry bridge in storageEngine"
  ```

---

## Task 7: Full Test Suite Run + Build Verification

**Files:**
- Run commands only

- [ ] **Step 1: Run all telemetry unit tests**

  Run: `npx vitest run src/utils/telemetry/`
  Expected:
  ```
  ✓ src/utils/telemetry/__tests__/PIISanitizer.test.ts
  ✓ src/utils/telemetry/__tests__/IndexedDBQueueEngine.test.ts
  ✓ src/utils/telemetry/__tests__/TelemetryAdapter.test.ts
  All tests PASS
  ```

- [ ] **Step 2: Run crypto regression test (confirm existing tests unaffected)**

  Run: `npx vitest run src/utils/crypto.test.ts`
  Expected: 2 tests PASS

- [ ] **Step 3: Run TypeScript lint (no type errors)**

  Run: `npm run lint`
  Expected: Exit 0, no errors

- [ ] **Step 4: Run build validation**

  Run: `npm run build`
  Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit verification result**

  ```bash
  git commit --allow-empty -m "chore(telemetry): all tests pass, build verified"
  ```

---

## Verification Plan

### Automated Tests
- `npx vitest run src/utils/telemetry/` — all unit tests for PIISanitizer, IndexedDBQueueEngine, TelemetryAdapter
- `npx vitest run src/utils/crypto.test.ts` — regression check
- `npm run lint` — TypeScript type errors = zero
- `npm run build` — production build succeeds

### Manual Verification (Browser DevTools)
1. Open the app in `development` mode
2. Open DevTools Console — confirm telemetry events appear as `[TELEMETRY][NORMAL][page_view]` logs
3. Open DevTools Application → IndexedDB → `fsrms_secure_db` → `TELEMETRY_QUEUE` — observe items appear then disappear after flush
4. Disconnect network, trigger an event → confirm item persists in `TELEMETRY_QUEUE` with `SupabaseAnalyticsProvider: 'failed'`
5. Reconnect → confirm item is retried and removed from queue after successful delivery
6. Confirm `password`, `email`, `token` fields in properties are replaced with `[REDACTED]` in console logs
