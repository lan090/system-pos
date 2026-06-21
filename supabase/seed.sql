-- =========================================================================
-- FSRMS v2.0 - SUPABASE MASTER DATA SEED SCRIPT
-- Menambahkan data wajib (Master Data) untuk mencegah Foreign Key Failure
-- =========================================================================

-- 1. Insert Default Kasir (users)
-- Diperlukan untuk kolom processed_by di transaksi
INSERT INTO users (id, email, nama_lengkap, is_active, role)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'kasir@fenina.com',
    'Kasir Utama',
    TRUE,
    'Kasir/Front Desk'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Default Shift Kasir (cash_shifts)
-- Diperlukan untuk kolom shift_id di transaksi
INSERT INTO cash_shifts (id, cashier_id, start_time, starting_cash, expected_cash, status)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    NOW(),
    500000.00,
    500000.00,
    'Open'
)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Default Walk-in Customer (customers)
-- Diperlukan untuk transaksi tanpa registrasi pelanggan
INSERT INTO customers (id, nama_lengkap, nomor_telepon, membership_tier, total_omset, total_kunjungan)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Walk-in Customer/Guest',
    '000000000000', -- Harus 10-14 digit angka sesuai regex
    'Silver',
    0.00,
    0
)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Sample Services (services)
-- Diperlukan agar ada layanan yang bisa dibeli (transaction_items)
INSERT INTO services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active)
VALUES 
    (
        '11111111-1111-1111-1111-111111111111', 
        'Potong Rambut Pria', 
        50000.00, 
        'Hair Cut', 
        30, 
        TRUE, 
        TRUE
    ),
    (
        '22222222-2222-2222-2222-222222222222', 
        'Creambath Tradisional', 
        80000.00, 
        'Treatment', 
        60, 
        TRUE, 
        TRUE
    ),
    (
        '33333333-3333-3333-3333-333333333333', 
        'Reflexology 60 Menit', 
        100000.00, 
        'Reflexology', 
        60, 
        TRUE, 
        TRUE
    )
ON CONFLICT (id) DO NOTHING;
