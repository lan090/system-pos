import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

test.describe('Dual-Run Checkout Validation (V1 vs V2 Parity)', () => {
  const mockUserId = randomUUID();
  const mockCustomerId = randomUUID();
  const mockTherapistId = randomUUID();
  const mockService1Id = randomUUID();
  const mockService2Id = randomUUID();

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
            id: mockUserId,
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
          id: mockUserId,
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
            id: mockUserId,
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
          id: mockUserId,
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
            id: mockUserId,
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
            id: mockService1Id,
            nama_layanan: 'Potong Rambut Pria',
            harga_jual: 50000,
            kategori: 'Hair Care',
            duration_minutes: 30,
            available_offline: true,
            is_active: true
          },
          {
            id: mockService2Id,
            nama_layanan: 'Creambath Tradisional',
            harga_jual: 80000,
            kategori: 'Hair Care',
            duration_minutes: 60,
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
            id: '00000000-0000-0000-0000-000000000000',
            nama_lengkap: 'Walk-in Customer/Guest',
            nomor_telepon: '000000000000',
            membership_tier: 'Silver',
            total_omset: 0,
            total_kunjungan: 0
          },
          {
            id: mockCustomerId,
            nama_lengkap: 'Budi Santoso',
            nomor_telepon: '081234567890',
            membership_tier: 'Gold',
            total_omset: 2500000,
            total_kunjungan: 12
          }
        ])
      });
    });

    // Mock other REST endpoints to prevent 404/401 errors
    await context.route('**/rest/v1/discounts*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await context.route('**/rest/v1/appointments*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await context.route('**/rest/v1/therapists*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: mockTherapistId,
            nama: 'Budi',
            is_active: true
          }
        ])
      });
    });

    await context.route('**/rest/v1/cash_shifts*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await context.route('**/rest/v1/transactions*', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Mocked Transaction Inserted Successfully' })
      });
    });

    await context.route('**/rest/v1/transaction_items*', async route => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Mocked Transaction Items Inserted Successfully' })
      });
    });
  });

  // Helper to bypass login and open shift
  async function performSetup(page) {
    await page.goto('/');
    
    // Login
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await emailInput.isVisible()) {
      await emailInput.fill('manager@fenina.com');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
    }

    // Go to POS
    const posTab = page.getByRole('button', { name: 'POS Terminal' });
    if (await posTab.isVisible()) {
      await posTab.click();
    }

    // Open Shift
    const openShiftBtn = page.getByRole('button', { name: /Buka Shift/i });
    await openShiftBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    await page.locator('#operator-name-input').fill('Siti Aminah');
    await page.getByPlaceholder('0').fill('500000');
    await openShiftBtn.click();

    await page.waitForSelector('text=Select Treatment Catalog');
  }

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 1: V1 Output Structure — Baseline capture
  // ──────────────────────────────────────────────────────────────────
  test('[V1-BASELINE] Checkout produces required transaction fields', async ({ page }) => {
    // Disable V2 flag
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: false }));
    });
    
    await performSetup(page);

    // Add item to cart
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Verify receipt modal
    await expect(page.getByText(/Transaksi Sukses/i)).toBeVisible();

    const txData = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    // Assert V1 contract fields
    expect(txData.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(txData.customer_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(txData.total_amount).toBeGreaterThan(0);
    expect(txData.payment_method).toMatch(/Cash|QRIS|Bank Transfer/);
    expect(Array.isArray(txData.cart)).toBe(true);
  });

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 2: V2 Output Structure — Guest checkout
  // ──────────────────────────────────────────────────────────────────
  test('[V2-GUEST] Checkout without customer produces null customer_id', async ({ page }) => {
    // Enable V2 flag
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: true }));
    });

    await performSetup(page);

    // Add item to cart
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Verify Guest Checkout Banner is visible instead of old selector controls
    await expect(page.getByText('Checkout Cepat Aktif — Data pelanggan dapat ditambahkan setelah transaksi selesai.')).toBeVisible();

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Capture modal opens -> click Skip / Lewati
    const skipBtn = page.locator('#capture-skip-btn');
    await skipBtn.waitFor({ state: 'visible' });
    await skipBtn.click();

    // Verify receipt modal
    await expect(page.getByText(/Transaksi Sukses/i)).toBeVisible();

    const txData = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    // V2 parity assertions
    expect(txData.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(txData.customer_id).toBeNull();
    expect(txData.session_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(txData.total_amount).toBeGreaterThan(0);
    expect(txData.payment_method).toMatch(/Cash|QRIS|Bank Transfer/);
    expect(Array.isArray(txData.cart)).toBe(true);
    expect(typeof txData.total_amount).toBe('number');
    expect(typeof txData.discount_amount).toBe('number');
  });

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 3: V2 Name-only checkout
  // ──────────────────────────────────────────────────────────────────
  test('[V2-NAME] Checkout with name only sets customer_name, links customer_id', async ({ page }) => {
    // Enable V2 flag
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: true }));
    });

    await performSetup(page);

    // Add item to cart
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Fill name input in the capture modal
    const nameInput = page.locator('#capture-customer-name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill('Siti Rahayu');

    // Click save in the capture modal
    await page.locator('#capture-save-btn').click();

    // Wait for capture modal to hide, ensuring the async save handler has finished execution
    await expect(page.locator('#capture-customer-name')).not.toBeVisible();

    // Trigger sync manually in browser context to process queued customer creation mutation!
    await page.evaluate(async () => {
      const { flushMutationQueue } = await import('/src/utils/syncEngine.js' as any);
      await flushMutationQueue().catch(e => console.error('Sync failed:', e));
    });

    const txData = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    expect(txData.customer_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(txData.customer_name).toBe('Siti Rahayu');
    expect(txData.customer_phone).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 4: V2 Phone match → auto-link registered customer
  // ──────────────────────────────────────────────────────────────────
  test('[V2-PHONE] Valid phone matching existing customer links customer_id', async ({ page }) => {
    // Enable V2 flag
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: true }));
    });

    await performSetup(page);

    // Add item to cart
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Fill phone number of existing user Budi Santoso (081234567890) in the capture modal
    const phoneInput = page.locator('#capture-customer-wa');
    await phoneInput.waitFor({ state: 'visible' });
    await phoneInput.fill('081234567890');

    // Also fill a name in the capture modal
    await page.locator('#capture-customer-name').fill('Budi Santoso');

    // Click save in the capture modal
    await page.locator('#capture-save-btn').click();

    // Wait for capture modal to hide, ensuring the async save handler has finished execution
    await expect(page.locator('#capture-customer-name')).not.toBeVisible();

    // Trigger sync manually in browser context to process queued customer creation mutation!
    await page.evaluate(async () => {
      const { flushMutationQueue } = await import('/src/utils/syncEngine.js' as any);
      await flushMutationQueue().catch(e => console.error('Sync failed:', e));
    });

    const txData = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    // Phone matched → customer_id auto-linked
    expect(txData.customer_id).toBe(mockCustomerId);
    expect(txData.customer_name).toBe('Budi Santoso');
  });

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 5: Meaningless input sanitization
  // ──────────────────────────────────────────────────────────────────
  test('[V2-SANITIZE] Inputs like "xxx" and "-" are treated as null', async ({ page }) => {
    // Enable V2 flag
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: true }));
    });

    await performSetup(page);

    // Add item to cart
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Click checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Fill meaningless values in the capture modal
    const nameInput = page.locator('#capture-customer-name');
    await nameInput.waitFor({ state: 'visible' });
    await nameInput.fill('xxx');
    await page.locator('#capture-customer-wa').fill('-');

    // Click save in the capture modal
    await page.locator('#capture-save-btn').click();

    // Wait for capture modal to hide, ensuring the async save handler has finished execution
    await expect(page.locator('#capture-customer-name')).not.toBeVisible();

    const txData = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    expect(txData.customer_name).toBeNull();
    expect(txData.customer_phone).toBeNull();
    expect(txData.customer_id).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 6: No regression on total_amount computation
  // ──────────────────────────────────────────────────────────────────
  test('[PARITY] total_amount matches between V1 and V2 for same cart', async ({ page }) => {
    // 1. Capture V1 Grand Total
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: false }));
    });

    await performSetup(page);

    // Click both catalog items
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.nth(0).click();
    await catalogItems.nth(1).click();

    // Checkout
    await page.locator('#checkout-btn').click();
    await page.getByRole('button', { name: /Tutup & Mulai Transaksi Baru/i }).click();

    const v1Tx = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    // 2. Capture V2 Grand Total (reload and enable v2)
    await page.addInitScript(() => {
      window.localStorage.setItem('fsrms_feature_flags', JSON.stringify({ CHECKOUT_V2_ENABLED: true }));
    });
    
    // Refresh page to load new flag value
    await page.reload();

    // Buka shift again if closed (should still be open/restored from IDB cash shift cache!)
    const openShiftBtn = page.getByRole('button', { name: /Buka Shift/i });
    if (await openShiftBtn.isVisible()) {
      await page.locator('#operator-name-input').fill('Siti Aminah');
      await page.getByPlaceholder('0').fill('500000');
      await openShiftBtn.click();
    }

    await page.waitForSelector('text=Select Treatment Catalog');

    // Click same catalog items
    const catalogItemsV2 = page.locator('.grid > div.cursor-pointer');
    await catalogItemsV2.nth(0).click();
    await catalogItemsV2.nth(1).click();

    // Checkout
    await page.locator('#checkout-btn').click();

    const v2Tx = await page.evaluate(() => {
      return JSON.parse(window.sessionStorage.getItem('fsrms_last_tx_debug') || '{}');
    });

    // Critical parity checks
    expect(v2Tx.total_amount).toBe(v1Tx.total_amount);
    expect(v2Tx.discount_amount).toBe(v1Tx.discount_amount);
    expect(v2Tx.cart.length).toBe(v1Tx.cart.length);
  });
});
