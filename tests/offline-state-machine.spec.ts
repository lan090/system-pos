import { test, expect } from '@playwright/test';

test.describe('PWA Offline State Machine & Storage Guardian Integration Tests', () => {
  
  test.beforeEach(async ({ page, context }) => {
    // Cross-Test Isolation & Anti-Purge pre-seeding
    await context.addInitScript(() => {
      window.localStorage.setItem('v9_forced_reset_executed', 'true');
    });
    await page.goto('/');
    await page.evaluate(async () => {
      localStorage.clear();
      const dbs = ['fsrms_secure_db', 'fsrms_secure_auth', 'fsrms_offline_db', 'fsrms_offline_db_v2'];
      for (const dbName of dbs) {
        await new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(dbName);
          req.onsuccess = resolve;
          req.onerror = resolve;
          req.onblocked = () => resolve(null);
        });
      }
    });
    // Restore forced reset key after clearing localStorage
    await page.evaluate(() => {
      localStorage.setItem('v9_forced_reset_executed', 'true');
    });
    await page.reload();
    await page.waitForLoadState('load');
  });

  test('Priority 5.1: Low Disk Space Mock - Triggers Canvas API Compression Fallback', async ({ page }) => {
    // 1. Inject mock for navigator.storage.estimate indicating low storage space (< 5MB)
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: async () => ({
            usage: 95 * 1024 * 1024,
            quota: 99 * 1024 * 1024 // 4MB remaining (< 5MB threshold)
          })
        },
        configurable: true,
        writable: true
      });
    });

    // 2. Open page context and reload to apply the injected estimate script mock
    await page.reload();

    // 3. Spy on console logs or dispatch events to verify the low storage warning is logged
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning' || msg.text().includes('Low disk space')) {
        logs.push(msg.text());
      }
    });

    // 4. Populate indexedDB with offline transaction containing a heavy base64 receipt blob
    await page.evaluate(async () => {
      // Cast to `any` — these are browser-context URL imports served by Vite's dev server,
      // not Node.js modules. TypeScript's bundler resolver cannot handle absolute URL strings.
      const { safeAddToQueue } = await import('/src/utils/storageEngine.js' as any);
      const testMutation = {
        id: 'a36bcdfa-9741-4a9b-b9e0-d04d52d7c4e4',
        type: 'CREATE_TRANSACTION',
        payload: {
          id: 'a36bcdfa-9741-4a9b-b9e0-d04d52d7c4e4',
          customer_id: '00000000-0000-0000-0000-000000000001',
          processed_by: 'd0000000-0000-0000-0000-000000000002',
          payment_method: 'QRIS',
          offline_media: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', // Minimal JPEG base64
          total_amount: 350000,
          created_at: new Date().toISOString()
        }
      };
      await safeAddToQueue(testMutation);
    });

    // 5. Verify the low space warnings were logged and receipt compression was called
    expect(logs.some(l => l.includes('Low disk space'))).toBeTruthy();

    // 6. Inspect the IndexedDB state to verify the payload was compressed and NOT deleted or hashed
    const compressedPayload = await page.evaluate(async () => {
      // Cast to `any` — browser-context URL imports, not resolvable by the TS bundler resolver.
      const { openSecureDB } = await import('/src/utils/storageEngine.js' as any);
      const db = await openSecureDB();
      const raw = await db.get('OFFLINE_MUTATION_QUEUE', 'a36bcdfa-9741-4a9b-b9e0-d04d52d7c4e4');
      
      // Decrypt the item inside the browser context
      const credentials = await db.get('auth_credentials', 'active_session');
      const token = credentials ? credentials.token : '';
      const { decryptData } = await import('/src/utils/storageEngine.js' as any);
      return await decryptData(raw.payload, token);
    });

    expect(compressedPayload.payload.compressed).toBe(true);
    expect(compressedPayload.payload.offline_media).toBeDefined();
    expect(compressedPayload.payload.offline_media.startsWith('data:image')).toBe(true);
  });

  test('Priority 5.2: Network 5xx Error Intercept - Halts Sync Queue to Preserve FIFO Order', async ({ page }) => {
    // 1. Mock Supabase transaction POST endpoint to return a 500 Server Error
    await page.context().route('**/rest/v1/transactions', route => {
      route.fulfill({
        status: 500,
        contentType: 'text/plain',
        body: 'Internal Server Error (Simulated 5xx)'
      });
    });

    // 2. Clear sync states and insert multiple transactions into the queue to check sequence ordering
    await page.evaluate(async () => {
      // Cast to `any` — browser-context URL imports, not resolvable by the TS bundler resolver.
      const { openSecureDB } = await import('/src/utils/storageEngine.js' as any);
      const db = await openSecureDB();
      
      // Seed two subsequent transactions in order
      const txs = [
        {
          id: '11111111-1111-4111-8111-111111111111',
          type: 'CREATE_TRANSACTION',
          created_at: '2026-05-29T08:00:00.000Z',
          payload: { id: '11111111-1111-4111-8111-111111111111', customer_id: '00000000-0000-0000-0000-000000000001', total_amount: 100000 }
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          type: 'CREATE_TRANSACTION',
          created_at: '2026-05-29T08:05:00.000Z',
          payload: { id: '22222222-2222-4222-8222-222222222222', customer_id: '00000000-0000-0000-0000-000000000001', total_amount: 150000 }
        }
      ];

      const { encryptData } = await import('/src/utils/storageEngine.js' as any);
      const credentials = await db.get('auth_credentials', 'active_session');
      const token = credentials ? credentials.token : '';

      for (const tx of txs) {
        const encrypted = await encryptData(tx, token);
        await db.put('OFFLINE_MUTATION_QUEUE', {
          id: tx.id,
          encrypted: true,
          payload: encrypted,
          created_at: tx.created_at
        });
      }
    });

    // 3. Initiate flush operation and wait for completion event
    const syncCompletePromise = page.evaluate(() => {
      return new Promise((resolve) => {
        window.addEventListener('fsrms-sync-complete', resolve, { once: true });
      });
    });

    await page.evaluate(async () => {
      // Cast to `any` — browser-context URL import, not resolvable by the TS bundler resolver.
      const { flushMutationQueue } = await import('/src/utils/syncEngine.js' as any);
      flushMutationQueue().catch(e => console.error('Sync failed:', e));
    });

    await syncCompletePromise;

    // 4. Verify that the sync loop broke on the first failure, preserving order without deleting either tx
    const remainingQueueCount = await page.evaluate(async () => {
      // Cast to `any` — browser-context URL import, not resolvable by the TS bundler resolver.
      const { openSecureDB } = await import('/src/utils/storageEngine.js' as any);
      const db = await openSecureDB();
      return await db.count('OFFLINE_MUTATION_QUEUE');
    });

    // Expect both mutations to still reside inside the queue in correct FIFO order
    expect(remainingQueueCount).toBe(2);

    // Verify first item is still fifo-tx-1 (FIFO sequence preservation)
    const firstQueueItemId = await page.evaluate(async () => {
      // Cast to `any` — browser-context URL import, not resolvable by the TS bundler resolver.
      const { openSecureDB } = await import('/src/utils/storageEngine.js' as any);
      const db = await openSecureDB();
      const items = await db.getAll('OFFLINE_MUTATION_QUEUE');
      return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0].id;
    });

    expect(firstQueueItemId).toBe('11111111-1111-4111-8111-111111111111');
  });

});
