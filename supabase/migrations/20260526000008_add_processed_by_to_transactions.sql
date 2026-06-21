BEGIN;

-- 1. Seed system users into users table with static UUIDs matching frontend simulator
INSERT INTO users (id, email, nama_lengkap, role, is_active)
VALUES 
  ('d0000000-0000-0000-0000-000000000001', 'kasir.fenina@gmail.com', 'Fenina Front Desk', 'Kasir/Front Desk', TRUE),
  ('d0000000-0000-0000-0000-000000000002', 'owner.manager@gmail.com', 'Fenina Owner Manager', 'Owner/Manager', TRUE),
  ('d0000000-0000-0000-0000-000000000003', 'terapis.siti@gmail.com', 'Fenina Terapis Siti', 'Kasir/Front Desk', TRUE)
ON CONFLICT (email) DO UPDATE 
SET id = EXCLUDED.id, 
    nama_lengkap = EXCLUDED.nama_lengkap, 
    role = EXCLUDED.role, 
    is_active = EXCLUDED.is_active;

-- 2. Add processed_by column to transactions as nullable initially
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processed_by UUID NULL;

-- 3. Seed existing transactions in the table with the default cashier's UUID
UPDATE transactions SET processed_by = 'd0000000-0000-0000-0000-000000000001' WHERE processed_by IS NULL;

-- 4. Enforce NOT NULL constraint on processed_by
ALTER TABLE transactions ALTER COLUMN processed_by SET NOT NULL;

-- 5. Enforce Foreign Key referencing users.id with RESTRICT
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_processed_by;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_processed_by FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE RESTRICT;

COMMIT;
