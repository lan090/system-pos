-- FSRMS v2.0 Total Reset & Master Seeding SQL
-- 1. Truncate all transactional and catalog tables using CASCADE
TRUNCATE TABLE transaction_items, transactions, appointments, cash_shifts, customers, services, therapists CASCADE;

-- 2. Seed default walk-in customer with global zero UUID
INSERT INTO customers (id, nama_lengkap, nomor_telepon, membership_tier, total_omset, total_kunjungan)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Walk-in Customer/Guest',
    '000000000000',
    'Silver',
    0.00,
    0
)
ON CONFLICT (id) DO NOTHING;

-- 3. Seed therapists (matching default UI IDs to preserve lane references)
INSERT INTO therapists (id, nama, is_active)
VALUES 
    ('db000000-0000-0000-0000-000000000001', 'Budi', TRUE),
    ('db000000-0000-0000-0000-000000000002', 'Siti', TRUE),
    ('db000000-0000-0000-0000-000000000003', 'Andi', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 4. Seed services (layanan)
INSERT INTO services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active)
VALUES 
    (
        '11111111-1111-1111-1111-111111111111', 
        'Potong Rambut Pria', 
        50000.00, 
        'Hair Care', 
        30, 
        TRUE, 
        TRUE
    ),
    (
        '22222222-2222-2222-2222-222222222222', 
        'Creambath Tradisional', 
        80000.00, 
        'Hair Care', 
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
    ),
    (
        '44444444-4444-4444-4444-444444444444', 
        'Shiatsu Full Body 90m', 
        150000.00, 
        'Body Massage', 
        90, 
        TRUE, 
        TRUE
    )
ON CONFLICT (id) DO NOTHING;
