// src/utils/telemetry/__tests__/MultiTabCoordinator.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiTabCoordinator } from '../MultiTabCoordinator';

describe('MultiTabCoordinator', () => {
  let originalLocks: any;

  beforeEach(() => {
    originalLocks = (navigator as any).locks;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'locks', {
      value: originalLocks,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('isSupported returns false when navigator.locks is unavailable', () => {
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      configurable: true,
    });

    expect(MultiTabCoordinator.isSupported()).toBe(false);
  });

  it('isSupported returns true when navigator.locks is available', () => {
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: () => {}
      },
      configurable: true,
    });

    expect(MultiTabCoordinator.isSupported()).toBe(true);
  });

  it('tryAcquireAndRun executes callback when lock is acquired, and returns true', async () => {
    let requestCalled = false;
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: async (name: string, options: any, cb: (lock: any) => Promise<any>) => {
          requestCalled = true;
          expect(options.mode).toBe('exclusive');
          expect(options.ifAvailable).toBe(true);
          return await cb({ name });
        }
      },
      configurable: true,
    });

    const coordinator = new MultiTabCoordinator('test_lock');
    let callbackExecuted = false;
    const result = await coordinator.tryAcquireAndRun(async () => {
      callbackExecuted = true;
    });

    expect(requestCalled).toBe(true);
    expect(callbackExecuted).toBe(true);
    expect(result).toBe(true);
  });

  it('tryAcquireAndRun returns false and does not run callback when lock is busy (lock is null)', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: async (name: string, options: any, cb: (lock: any) => Promise<any>) => {
          return await cb(null);
        }
      },
      configurable: true,
    });

    const coordinator = new MultiTabCoordinator('test_lock');
    let callbackExecuted = false;
    const result = await coordinator.tryAcquireAndRun(async () => {
      callbackExecuted = true;
    });

    expect(callbackExecuted).toBe(false);
    expect(result).toBe(false);
  });

  it('tryAcquireAndRun returns false and handles errors gracefully', async () => {
    Object.defineProperty(navigator, 'locks', {
      value: {
        request: () => {
          throw new Error('Lock request error');
        }
      },
      configurable: true,
    });

    const coordinator = new MultiTabCoordinator('test_lock');
    let callbackExecuted = false;
    const result = await coordinator.tryAcquireAndRun(async () => {
      callbackExecuted = true;
    });

    expect(callbackExecuted).toBe(false);
    expect(result).toBe(false);
  });
});
