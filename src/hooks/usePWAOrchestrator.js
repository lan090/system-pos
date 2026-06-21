import { useEffect } from 'react';
import { create } from 'zustand';
import { getStorageAdapter } from '../utils/storageEngine';
import { flushMutationQueue, initializeUniversalSync } from '../utils/syncEngine';

// Atomic, referentially stable Zustand store for PWA state
// Prevents React 18 Concurrent Mode state tearing by providing isolated atomic properties.
export const usePWAStore = create((set) => ({
  isSyncing: false,
  pendingMutationsCount: 0,
  needsUpdate: false,
  quotaExceeded: false,
  quotaErrorMessage: '',

  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingMutationsCount: (count) => set({ pendingMutationsCount: count }),
  setNeedsUpdate: (needsUpdate) => set({ needsUpdate }),
  setQuotaExceeded: (exceeded, message = '') => set({ quotaExceeded: exceeded, quotaErrorMessage: message }),
}));

// Atomic, referentially stable selector hooks to prevent concurrent state tearing
export const selectIsSyncing = (state) => state.isSyncing;
export const selectPendingCount = (state) => state.pendingMutationsCount;
export const selectNeedsUpdate = (state) => state.needsUpdate;
export const selectQuotaExceeded = (state) => state.quotaExceeded;
export const selectQuotaErrorMessage = (state) => state.quotaErrorMessage;

export function usePWAOrchestrator() {
  const isSyncing = usePWAStore(selectIsSyncing);
  const pendingMutationsCount = usePWAStore(selectPendingCount);
  const needsUpdate = usePWAStore(selectNeedsUpdate);
  const setSyncing = usePWAStore((state) => state.setSyncing);
  const setPendingMutationsCount = usePWAStore((state) => state.setPendingMutationsCount);
  const setNeedsUpdate = usePWAStore((state) => state.setNeedsUpdate);
  const setQuotaExceeded = usePWAStore((state) => state.setQuotaExceeded);

  // Helper to query remaining queue items
  const updateQueueCount = async () => {
    try {
      const db = await getStorageAdapter();
      const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readonly');
      const store = tx.objectStore('OFFLINE_MUTATION_QUEUE');
      const count = await store.count();
      setPendingMutationsCount(count);
    } catch (err) {
      console.warn('Orchestrator: Storage adapter not ready or accessible.', err);
    }
  };

  useEffect(() => {
    // 1. Initialize Universal Sync Engine on application start
    // Dynamically hooks background sync and fallback engines.
    initializeUniversalSync();

    // 2. Query initial queue count
    updateQueueCount();

    // Listen for sync completions to update count and release lock
    const handleSyncComplete = () => {
      updateQueueCount();
      setSyncing(false);
    };

    window.addEventListener('pwa-sync-complete', handleSyncComplete);
    return () => {
      window.removeEventListener('pwa-sync-complete', handleSyncComplete);
    };
  }, []);

  // 3. Passive Visible Tab Reloader
  // Background tabs reload via focus visibilitychange only if not currently syncing or holding mutations.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        updateQueueCount();

        if (needsUpdate && !isSyncing && pendingMutationsCount === 0) {
          console.log('Orchestrator: Tab focused and safe. Passive update reload triggered.');
          window.location.reload();
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [needsUpdate, isSyncing, pendingMutationsCount]);

  // 4. Windows Desktop Guard: Intercept closing/unloading if offline mutations are waiting to sync
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (pendingMutationsCount > 0) {
        event.preventDefault();
        event.returnValue = 'Warning: Unsaved offline transactions detected. Exiting now may result in data loss.';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [pendingMutationsCount]);

  // 5. Quota Exceeded and Manual Flush listener
  useEffect(() => {
    const handleQuotaExceeded = (event) => {
      console.error('Orchestrator: Storage Quota breached event caught.', event.detail);
      setQuotaExceeded(true, event.detail?.message || 'Storage quota reached.');
    };

    const handleSyncRequest = async () => {
      if (isSyncing) return;
      setSyncing(true);
      try {
        await flushMutationQueue();
      } catch (err) {
        console.error('Orchestrator: Manual sync flush failed.', err);
      } finally {
        setSyncing(false);
        updateQueueCount();
      }
    };

    window.dispatchEvent(new CustomEvent('pwa-trigger-foreground-sync'));
    window.addEventListener('pos-quota-exceeded', handleQuotaExceeded);
    window.addEventListener('pwa-trigger-foreground-sync', handleSyncRequest);

    return () => {
      window.removeEventListener('pos-quota-exceeded', handleQuotaExceeded);
      window.removeEventListener('pwa-trigger-foreground-sync', handleSyncRequest);
    };
  }, [isSyncing]);

  // 6. Controller Change Detection (Vite PWA customization)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        setNeedsUpdate(true);
      });
    }
  }, []);

  return {
    isSyncing,
    pendingMutationsCount,
    needsUpdate,
    updateQueueCount
  };
}
