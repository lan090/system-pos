// =========================================================================
// src/utils/telemetry/MultiTabCoordinator.ts
// FSRMS v2.0 — Multi-Tab Lock Coordinator
// =========================================================================

export class MultiTabCoordinator {
  constructor(private readonly lockName: string) {}

  /**
   * Attempts to acquire the exclusive lock and run the callback.
   * Returns a promise that resolves to:
   * - true: if the lock was acquired and the callback was executed.
   * - false: if the lock was busy (already held by another tab) or unsupported/failed.
   */
  async tryAcquireAndRun(callback: () => Promise<void>): Promise<boolean> {
    if (!MultiTabCoordinator.isSupported()) {
      return false;
    }

    try {
      let acquired = false;
      await navigator.locks.request(
        this.lockName,
        { mode: 'exclusive', ifAvailable: true },
        async (lock) => {
          if (lock !== null) {
            acquired = true;
            await callback();
          }
        }
      );
      return acquired;
    } catch (err) {
      // Graceful fallback: treat as not acquired
      return false;
    }
  }

  /**
   * Helper to check if Web Locks API is supported.
   */
  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      navigator.locks !== undefined &&
      typeof navigator.locks.request === 'function'
    );
  }
}
