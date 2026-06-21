// =========================================================================
// src/utils/telemetry/IndexedDBQueueEngine.ts
// FSRMS v2.0 — Telemetry Adapter Queue Engine
// =========================================================================
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
   * (with per-provider retry count < maxRetries) among the given active provider names.
   * Sorted oldest-first for FIFO dispatch.
   */
  async getPending(
    activeProviderNames: string[],
    maxRetries: number = 5,
    limit?: number,
  ): Promise<TelemetryQueueItem[]> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const index = store.index('by_created_at');

      const pending: TelemetryQueueItem[] = [];
      let cursor = await index.openCursor();

      while (cursor) {
        const item = cursor.value as TelemetryQueueItem;
        const isPending = activeProviderNames.some(name => {
          const state = item.provider_states[name];
          const retryCount = item.provider_retry_counts?.[name] ?? item.retry_count;
          return (state === 'pending' || state === 'failed') && retryCount < maxRetries;
        });

        if (isPending) {
          const migrated = this._migrateLegacyItem(item);
          if (migrated) {
            await cursor.update(item);
          }
          pending.push(item);

          if (limit !== undefined && pending.length >= limit) {
            break;
          }
        }
        cursor = await cursor.continue();
      }

      await tx.done;
      return pending;
    } catch (err) {
      console.warn('[TelemetryQueue] getPending failed (non-fatal):', err);
      return [];
    }
  }

  /**
   * Updates the delivery status for a single provider on a given event.
   * If ALL active providers are now 'sent', the item is automatically
   * deleted from the store.
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
      
      this._migrateLegacyItem(item);
      item.provider_states[providerName] = status;
      if (status === 'dead_letter' && !item.dlq_at) {
        item.dlq_at = new Date().toISOString();
      }

      // Determine if item can be removed: all registered providers are 'sent'
      const providers = activeProviderNames ?? Object.keys(item.provider_states);
      const allSent = providers.every(name => item.provider_states[name] === 'sent');

      if (allSent) {
        await store.delete(eventId);
      } else {
        await store.put(item);
      }
      await tx.done;
    } catch (err) {
      console.warn('[TelemetryQueue] updateProviderStatus failed (non-fatal):', err);
    }
  }

  /**
   * Increments retry_count for an event and resets 'failed' providers back to 'pending'
   * so they are retried on the next flush cycle.
   */
  async incrementRetry(eventId: string): Promise<void> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const item = await store.get(eventId);
      if (!item) { await tx.done; return; }
      
      this._migrateLegacyItem(item);
      item.retry_count += 1;
      
      // Reset failed providers to pending so they are retried
      for (const name of Object.keys(item.provider_states)) {
        if (item.provider_states[name] === 'failed') {
          item.provider_states[name] = 'pending';
        }
        if (item.provider_retry_counts) {
          item.provider_retry_counts[name] = (item.provider_retry_counts[name] ?? 0) + 1;
        }
      }
      await store.put(item);
      await tx.done;
    } catch (err) {
      console.warn('[TelemetryQueue] incrementRetry failed (non-fatal):', err);
    }
  }

  /**
   * Increments retry count for a specific provider, updates global retry_count for compatibility,
   * and resets status back to pending if it was failed.
   */
  async incrementProviderRetry(eventId: string, providerName: string): Promise<void> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const item = await store.get(eventId);
      if (!item) {
        await tx.done;
        return;
      }

      this._migrateLegacyItem(item);
      if (!item.provider_retry_counts) {
        item.provider_retry_counts = {};
      }

      item.provider_retry_counts[providerName] = (item.provider_retry_counts[providerName] ?? 0) + 1;
      item.retry_count = Math.max(item.retry_count, item.provider_retry_counts[providerName]);

      if (item.provider_states[providerName] === 'failed') {
        item.provider_states[providerName] = 'pending';
      }

      await store.put(item);
      await tx.done;
    } catch (err) {
      console.warn('[TelemetryQueue] incrementProviderRetry failed (non-fatal):', err);
    }
  }

  /**
   * Retrieves all dead-lettered events.
   */
  async getDeadLetterEvents(): Promise<TelemetryQueueItem[]> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const all: TelemetryQueueItem[] = [];
      let cursor = await store.openCursor();
      while (cursor) {
        const item = cursor.value as TelemetryQueueItem;
        const isDeadLetter = Object.values(item.provider_states).some(state => state === 'dead_letter');
        if (isDeadLetter) {
          all.push(item);
        }
        cursor = await cursor.continue();
      }
      await tx.done;
      return all;
    } catch (err) {
      console.warn('[TelemetryQueue] getDeadLetterEvents failed:', err);
      return [];
    }
  }

  /**
   * Resets dead-lettered providers back to pending for retry, clears dlq_at,
   * and resets retry counts for affected providers.
   */
  async retryDeadLetterEvent(eventId: string): Promise<void> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const item = await store.get(eventId);
      if (!item) {
        await tx.done;
        return;
      }

      this._migrateLegacyItem(item);
      delete item.dlq_at;

      if (!item.provider_retry_counts) {
        item.provider_retry_counts = {};
      }

      for (const name of Object.keys(item.provider_states)) {
        if (item.provider_states[name] === 'dead_letter') {
          item.provider_states[name] = 'pending';
          item.provider_retry_counts[name] = 0;
        }
      }

      // Sync global retry_count
      item.retry_count = 0;

      await store.put(item);
      await tx.done;
    } catch (err) {
      console.warn('[TelemetryQueue] retryDeadLetterEvent failed:', err);
    }
  }

  /**
   * Permanently deletes a dead letter event from the queue.
   */
  async clearDeadLetterEvent(eventId: string): Promise<void> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      await store.delete(eventId);
      await tx.done;
    } catch (err) {
      console.warn('[TelemetryQueue] clearDeadLetterEvent failed:', err);
    }
  }

  /**
   * Returns current health of the telemetry queue.
   */
  async getQueueHealth(activeProviderNames: string[]): Promise<import('./types').QueueHealth> {
    try {
      const db = await openSecureDB();
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);

      const queue_size = await store.count();
      let dead_letter_count = 0;
      const failedProviders = new Set<string>();
      let oldestPendingTime: number | null = null;
      let pending_event_count = 0;

      const index = store.index('by_created_at');
      let cursor = await index.openCursor();
      const now = Date.now();

      while (cursor) {
        const item = cursor.value as TelemetryQueueItem;
        let isDeadLetter = false;
        let isPending = false;

        for (const providerName of activeProviderNames) {
          const status = item.provider_states[providerName];
          if (status === 'dead_letter') {
            isDeadLetter = true;
          }
          if (status === 'failed') {
            failedProviders.add(providerName);
            isPending = true;
          }
          if (status === 'pending') {
            isPending = true;
          }
        }

        if (isDeadLetter) {
          dead_letter_count++;
        }

        if (isPending) {
          pending_event_count++;
          if (oldestPendingTime === null) {
            oldestPendingTime = new Date(item.created_at).getTime();
          }
        }

        cursor = await cursor.continue();
      }

      await tx.done;
      const oldest_event_age_ms = oldestPendingTime !== null ? now - oldestPendingTime : null;

      return {
        queue_size,
        dead_letter_count,
        failed_provider_count: failedProviders.size,
        oldest_event_age_ms,
        pending_event_count,
        checked_at: new Date().toISOString(),
      };
    } catch (err) {
      console.warn('[TelemetryQueue] getQueueHealth failed:', err);
      return {
        queue_size: 0,
        dead_letter_count: 0,
        failed_provider_count: 0,
        oldest_event_age_ms: null,
        pending_event_count: 0,
        checked_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Private helper to lazy migrate legacy items missing provider_retry_counts.
   */
  private _migrateLegacyItem(item: TelemetryQueueItem): boolean {
    if (!item.provider_retry_counts) {
      item.provider_retry_counts = {};
      for (const name of Object.keys(item.provider_states)) {
        item.provider_retry_counts[name] = item.retry_count;
      }
      return true;
    }
    return false;
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
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const index = store.index('by_created_at');

      const toDelete: string[] = [];
      let cursor = await index.openCursor();

      while (cursor && toDelete.length < n) {
        const item = cursor.value as TelemetryQueueItem;
        if (item.priority === 'normal') {
          const hasDeadLetter = Object.values(item.provider_states).includes('dead_letter');
          if (!hasDeadLetter) {
            toDelete.push(item.event_id);
          }
        }
        cursor = await cursor.continue();
      }

      for (const id of toDelete) {
        await store.delete(id);
      }

      await tx.done;
      if (toDelete.length > 0) {
        console.warn(`[TelemetryQueue] Evicted ${toDelete.length} normal-priority events (storage pressure).`);
      }
    } catch (err) {
      console.warn('[TelemetryQueue] evictOldestNormal failed (non-fatal):', err);
    }
  }

  /** Clears ALL items from the queue. Use only in tests or emergency reset. */
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
