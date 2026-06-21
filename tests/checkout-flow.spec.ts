import { test, expect } from '@playwright/test';

test.describe('POS Terminal Critical Path', () => {

  test.beforeEach(async ({ page, context }) => {
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
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
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
            id: 'db000000-0000-0000-0000-000000000001',
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

  test('Langkah A-C: Checkout Transaksi Normal (Online)', async ({ page }) => {
    // Tangkap error console browser agar tes gagal jika ada runtime crash
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      console.error('PAGE ERROR:', err.message);
      errors.push(err.message);
    });
    page.on('console', (msg) => {
      const text = msg.text();
      console.log('PAGE CONSOLE:', text);
      // Ignore missing resources and expected offline fallback warnings in E2E tests
      if (
        msg.type() === 'error' && 
        !text.includes('Failed to load resource') &&
        !text.includes('falling back to local offline queue')
      ) {
        errors.push(text);
      }
    });

    // Langkah A: Buka halaman utama
    await page.goto('/');
    
    // Bypass Login Mockup
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await emailInput.isVisible()) {
      await emailInput.fill('manager@fenina.com');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
    }

    // Pastikan berada di tab POS Terminal
    const posTab = page.getByRole('button', { name: 'POS Terminal' });
    if (await posTab.isVisible()) {
      await posTab.click();
    }

    // Buka shift karena ini Mandatory Gatekeeper
    const openShiftBtn = page.getByRole('button', { name: /Buka Shift/i });
    await openShiftBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    // Fill Operator Name (added in Task 1)
    await page.locator('#operator-name-input').fill('Siti Aminah');
    await page.getByPlaceholder('0').fill('500000');
    await openShiftBtn.click();

    // Langkah B: Pilih layanan aktif dan masukkan keranjang
    await page.waitForSelector('text=Select Treatment Catalog');
    
    // Pilih item katalog pertama (asumsi dapat diklik dan ditambahkan ke keranjang)
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Pilih customer mock
    const selectCustomer = page.locator('select').filter({ hasText: /Pilih Pelanggan/i });
    if (await selectCustomer.isVisible()) {
      await selectCustomer.selectOption({ index: 1 });
    }

    // Tekan tombol Checkout
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Langkah C: Verifikasi Mutasi Data (Receipt Modal Terbuka tanpa crash)
    const receiptModal = page.getByText(/Transaksi Sukses/i);
    await expect(receiptModal).toBeVisible();

    // Pastikan tidak ada runtime crash
    expect(errors).toHaveLength(0);
  });

  test('Skenario 2: Ketahanan Offline (Fallback ke IndexedDB)', async ({ page, context }) => {
    // Buka aplikasi saat online
    await page.goto('/');

    // Bypass Login Mockup
    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await emailInput.isVisible()) {
      await emailInput.fill('manager@fenina.com');
      await page.locator('input[type="password"]').fill('password123');
      await page.locator('button[type="submit"]').click();
    }

    const posTab = page.getByRole('button', { name: 'POS Terminal' });
    if (await posTab.isVisible()) {
      await posTab.click();
    }

    // Buka shift jika diperlukan (Mandatory Gatekeeper)
    const openShiftBtn = page.getByRole('button', { name: /Buka Shift/i });
    await openShiftBtn.waitFor({ state: 'visible', timeout: 10000 });
    
    // Fill Operator Name (added in Task 1)
    await page.locator('#operator-name-input').fill('Siti Aminah');
    await page.getByPlaceholder('0').fill('500000');
    await openShiftBtn.click();

    // Matikan konektivitas jaringan browser
    await context.setOffline(true);

    await page.waitForSelector('text=Select Treatment Catalog');
    
    // Tambahkan ke keranjang
    const catalogItems = page.locator('.grid > div.cursor-pointer');
    await catalogItems.first().click();

    // Tekan tombol Checkout (asumsi metode Cash tidak butuh verifikasi offline)
    const checkoutBtn = page.locator('#checkout-btn');
    await expect(checkoutBtn).not.toBeDisabled();
    await checkoutBtn.click();

    // Verifikasi bahwa receipt modal menyebutkan data dicatat offline (IndexedDB)
    const receiptModal = page.getByText(/TERCATAT LOKAL/i);
    await expect(receiptModal).toBeVisible();
  });

});

