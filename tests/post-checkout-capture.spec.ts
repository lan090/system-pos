import { test, expect } from '@playwright/test';

test.describe('POS Checkout V2 — Post-Checkout Capture E2E', () => {

  test.beforeEach(async ({ page, context }) => {
    page.on('console', msg => console.log('PAGE CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    // Wildcard handler for any unmocked Supabase REST request to prevent network hangs/timeouts
    await context.route('**/rest/v1/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Enable CHECKOUT_V2_ENABLED flag in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('fsrms_feature_flags', JSON.stringify({
        CHECKOUT_V2_ENABLED: true
      }));
    });

    // Mock Supabase Auth Login
    await context.route('**/auth/v1/token?grant_type=password', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
          user: {
            id: 'd0000000-0000-0000-0000-000000000002',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'manager@fenina.com',
            email_confirmed_at: new Date().toISOString(),
            phone: '',
            confirmed_at: new Date().toISOString(),
            last_sign_in_at: new Date().toISOString(),
            app_metadata: { provider: 'email', providers: ['email'] },
            user_metadata: {
              nama_lengkap: 'Fenina Owner Manager',
              role: 'Owner/Manager'
            },
            identities: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        })
      });
    });

    // Mock Supabase Auth User retrieval
    await context.route('**/auth/v1/user', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'd0000000-0000-0000-0000-000000000002',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'manager@fenina.com',
          email_confirmed_at: new Date().toISOString(),
          phone: '',
          confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {
            nama_lengkap: 'Fenina Owner Manager',
            role: 'Owner/Manager'
          },
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });
    });

    // Mock Supabase REST calls for Users (salt and profile queries for custom DB-driven auth)
    // Legacy format: kept for backwards compat if fallback path is triggered
    await context.route('**/rest/v1/users*', async (route, request) => {
      const url = request.url();
      if (url.includes('select=password_salt')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            password_salt: '9f72b64d1f2e4a8b',
            is_active: true,
            role: 'Owner/Manager'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'd0000000-0000-0000-0000-000000000002',
            email: 'manager@fenina.com',
            username: 'manager',
            nama_lengkap: 'Fenina Owner Manager',
            role: 'Owner/Manager',
            is_active: true,
            password_hash: 'mocked-hash',
            password_salt: '9f72b64d1f2e4a8b',
            created_at: new Date().toISOString()
          })
        });
      }
    });

    // Mock new RPC: get_user_salt — used by Task 2 login flow
    await context.route('**/rest/v1/rpc/get_user_salt', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ salt: '9f72b64d1f2e4a8b', is_active: true, role: 'Owner/Manager' }])
      });
    });

    // Mock new RPC: verify_user_credentials — used by Task 2 login flow
    await context.route('**/rest/v1/rpc/verify_user_credentials', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'd0000000-0000-0000-0000-000000000002',
          email: 'manager@fenina.com',
          username: 'manager',
          nama_lengkap: 'Fenina Owner Manager',
          role: 'Owner/Manager',
          is_active: true,
          created_at: new Date().toISOString()
        }])
      });
    });

    // Mock Edge Function: authenticate — used by Task 7 terminal login
    await context.route('**/functions/v1/authenticate', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'd0000000-0000-0000-0000-000000000002',
            email: 'manager@fenina.com',
            username: 'manager',
            nama_lengkap: 'Fenina Owner Manager',
            role: 'Owner/Manager',
            is_active: true
          },
          access_token: 'mock-access-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600
        })
      });
    });

    // Mock Supabase REST calls for Services Catalog
    await context.route('**/rest/v1/services*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: '11111111-1111-1111-1111-111111111111',
            nama_layanan: 'Potong Rambut Pria',
            harga_jual: 50000,
            kategori: 'Hair Care',
            duration_minutes: 30,
            available_offline: true,
            is_active: true
          }
        ])
      });
    });

    // Mock Supabase REST calls for Customers
    await context.route('**/rest/v1/customers*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'd0000000-0000-0000-0000-000000000010',
            nama_lengkap: 'Budi Santoso',
            nomor_telepon: '081234567890',
            membership_tier: 'Gold',
            total_omset: 2500000,
            total_kunjungan: 12
          }
        ])
      });
    });

    // Mock other REST endpoints
    await context.route('**/rest/v1/discounts*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await context.route('**/rest/v1/appointments*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await context.route('**/rest/v1/therapists*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'db000000-0000-0000-0000-000000000001', nama: 'Budi', is_active: true }
        ])
      });
    });

    await context.route('**/rest/v1/cash_shifts*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await context.route('**/rest/v1/transactions*', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      } else {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Transaction Inserted' })
        });
      }
    });

    await context.route('**/rest/v1/transaction_items*', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Transaction Items Inserted' })
      });
    });
  });

  const loginAndOpenShift = async (page) => {
    await page.goto('/');
    
    // Auth Login
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await emailInput.isVisible()) {
      await emailInput.fill('manager@fenina.com');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
    }

    // Shift Open
    const openShiftBtn = page.getByRole('button', { name: /Buka Shift/i });
    await openShiftBtn.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('#operator-name-input').fill('Siti Aminah');
    await page.getByPlaceholder('0').fill('500000');
    await openShiftBtn.click();

    // Select Treatment to add to Cart
    await page.waitForSelector('text=Select Treatment Catalog');
    const catalogItem = page.locator('.grid > div.cursor-pointer').first();
    await catalogItem.click();
  };

  test('Scenario 1 & 5: Guest Checkout + Skip Customer Modal', async ({ page }) => {
    await loginAndOpenShift(page);

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Verify Customer Capture modal is visible
    const captureModal = page.getByText('Simpan Data Pelanggan');
    await expect(captureModal).toBeVisible();

    // Click Skip / Lewati
    const skipBtn = page.locator('#capture-skip-btn');
    await skipBtn.click();

    // Verify capture modal is closed and receipt modal is open
    await expect(captureModal).not.toBeVisible();
    const receiptModal = page.getByText('Transaksi Sukses!');
    await expect(receiptModal).toBeVisible();

    // Verify receipt has Walk-in Guest
    const receiptCustomer = page.locator('#thermal-receipt-area').getByText('Walk-in Guest');
    await expect(receiptCustomer).toBeVisible();
  });

  test('Scenario 2 & 11: Checkout + Name Only (Create PARTIAL Customer)', async ({ page }) => {
    let customerCreatedPayload: any = null;
    let transactionUpdatedPayload: any = null;

    // Capture Supabase REST inserts to verify payloads
    await page.context().route('**/rest/v1/customers*', async (route, request) => {
      if (request.method() === 'POST') {
        customerCreatedPayload = JSON.parse(request.postData() || '{}');
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await page.context().route('**/rest/v1/transactions*', async (route, request) => {
      if (request.method() === 'PATCH' || request.method() === 'PUT') {
        transactionUpdatedPayload = JSON.parse(request.postData() || '{}');
      }
      await route.fallback();
    });

    await loginAndOpenShift(page);

    // Checkout
    await page.locator('#checkout-btn').click();

    // Input Name only (Aiko Tanaka)
    await page.locator('#capture-customer-name').fill('Aiko Tanaka');
    await page.locator('#capture-save-btn').click();

    // Trigger sync manually in browser context to process queued customer creation mutation!
    await page.evaluate(async () => {
      const { flushMutationQueue } = await import('/src/utils/syncEngine.js' as any);
      await flushMutationQueue().catch(e => console.error('Sync failed:', e));
    });

    // Verify receipt is open and displays Aiko Tanaka
    const receiptCustomer = page.locator('#thermal-receipt-area').getByText('Aiko Tanaka');
    await expect(receiptCustomer).toBeVisible();

    // Wait a brief moment to catch async API calls
    await page.waitForTimeout(500);

    // Verify partial customer creation payload
    expect(customerCreatedPayload).not.toBeNull();
    expect(customerCreatedPayload.nama_lengkap).toBe('Aiko Tanaka');
    expect(customerCreatedPayload.nomor_telepon).toBeNull();
    expect(customerCreatedPayload.customer_type).toBe('PARTIAL');
  });

  test('Scenario 3: Checkout + WhatsApp Only (Standard customer creation)', async ({ page }) => {
    let customerCreatedPayload: any = null;
    await page.context().route('**/rest/v1/customers*', async (route, request) => {
      if (request.method() === 'POST') {
        customerCreatedPayload = JSON.parse(request.postData() || '{}');
      }
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    });

    await loginAndOpenShift(page);
    await page.locator('#checkout-btn').click();

    // Input WA only
    await page.locator('#capture-customer-wa').fill('081234567899');
    await page.locator('#capture-save-btn').click();

    // Verify receipt is open and displays WhatsApp Customer
    const receiptCustomer = page.locator('#thermal-receipt-area').getByText('WhatsApp Customer');
    await expect(receiptCustomer).toBeVisible();

    // Trigger sync manually in browser context to process queued customer creation mutation!
    await page.evaluate(async () => {
      const { flushMutationQueue } = await import('/src/utils/syncEngine.js' as any);
      await flushMutationQueue().catch(e => console.error('Sync failed:', e));
    });

    await page.waitForTimeout(500);

    expect(customerCreatedPayload).not.toBeNull();
    expect(customerCreatedPayload.nama_lengkap).toBe('WhatsApp Customer');
    expect(customerCreatedPayload.nomor_telepon).toBe('081234567899');
    expect(customerCreatedPayload.customer_type).toBe('STANDARD');
  });

  test('Scenario 4: Checkout + Reuse Existing Customer by WhatsApp Match', async ({ page }) => {
    let customerCreatedCalls = 0;
    let transactionUpdatedPayload: any = null;

    await page.context().route('**/rest/v1/customers*', async (route, request) => {
      if (request.method() === 'POST') {
        customerCreatedCalls++;
      }
      await route.fallback();
    });

    await page.context().route('**/rest/v1/transactions*', async (route, request) => {
      if (request.method() === 'PATCH' || request.method() === 'PUT') {
        transactionUpdatedPayload = JSON.parse(request.postData() || '{}');
      }
      await route.fallback();
    });

    await loginAndOpenShift(page);
    await page.locator('#checkout-btn').click();

    // Input name and Budi Santoso's phone (081234567890)
    await page.locator('#capture-customer-name').fill('Budi Santoso');
    await page.locator('#capture-customer-wa').fill('081234567890');
    await page.locator('#capture-save-btn').click();

    // Verify Budi Santoso is on receipt
    const receiptCustomer = page.locator('#thermal-receipt-area').getByText('Budi Santoso');
    await expect(receiptCustomer).toBeVisible();

    await page.waitForTimeout(500);

    // Should NOT have created a new customer record since it matches the mock budi phone
    expect(customerCreatedCalls).toBe(0);

    // Linked transaction customer_id should match Budi's id
    expect(transactionUpdatedPayload).not.toBeNull();
    expect(transactionUpdatedPayload.customer_id).toBe('d0000000-0000-0000-0000-000000000010');
  });

  test('Scenario 6 & 7: Offline Guest Checkout + Offline Capture', async ({ page, context }) => {
    await loginAndOpenShift(page);

    // Go offline
    await context.setOffline(true);

    await page.locator('#checkout-btn').click();

    // Input customer capture details while offline
    await page.locator('#capture-customer-name').fill('Lani');
    await page.locator('#capture-customer-wa').fill('081234567111');
    await page.locator('#capture-save-btn').click();

    // Verify offline receipt shows Lani & TERCATAT LOKAL
    const receiptCustomer = page.locator('#thermal-receipt-area').getByText('Lani');
    await expect(receiptCustomer).toBeVisible();
    const localStatus = page.locator('#thermal-receipt-area').getByText('TERCATAT LOKAL');
    await expect(localStatus).toBeVisible();
  });
});
