BEGIN;

-- Add new auth columns to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Seed default cashier: kasir@fenina.com
-- Username: kasir, Password: kasirpassword
-- Salt: 9f72b64d1f2e4a8b
-- Hash: 315a8c4f14ed9b2bf09fb48af8be56a0aead98230f273a5a7cce2538a278856d
UPDATE users 
SET username = 'kasir',
    password_salt = '9f72b64d1f2e4a8b',
    password_hash = '315a8c4f14ed9b2bf09fb48af8be56a0aead98230f273a5a7cce2538a278856d'
WHERE email = 'kasir@fenina.com';

-- Seed default owner: owner@fenina.com
-- Username: owner, Password: ownerpassword
-- Salt: 5c91a32b8e0f1d7a
-- Hash: 75e2c1fb2e2554f62b188ae39a1469e573d6c3744e550048cff47f4584a701b5
INSERT INTO users (id, email, username, nama_lengkap, role, password_salt, password_hash, is_active)
VALUES (
    'e0000000-0000-0000-0000-000000000001',
    'owner@fenina.com',
    'owner',
    'Owner Utama',
    'Owner/Manager',
    '5c91a32b8e0f1d7a',
    '75e2c1fb2e2554f62b188ae39a1469e573d6c3744e550048cff47f4584a701b5',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Seed generic role-based Supabase Auth mirror users
-- These are required so that the client can log in under-the-hood to obtain valid JWTs for PostgreSQL RLS.
-- cashier-terminal@fenina.com (Kasir/Front Desk)
-- owner-terminal@fenina.com (Owner/Manager)
INSERT INTO users (id, email, username, nama_lengkap, role, password_salt, password_hash, is_active)
VALUES (
    'e0000000-0000-0000-0000-000000000002',
    'cashier-terminal@fenina.com',
    'cashier_terminal',
    'Terminal Kasir',
    'Kasir/Front Desk',
    'dummy_salt',
    'dummy_hash',
    TRUE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, email, username, nama_lengkap, role, password_salt, password_hash, is_active)
VALUES (
    'e0000000-0000-0000-0000-000000000003',
    'owner-terminal@fenina.com',
    'owner_terminal',
    'Terminal Owner',
    'Owner/Manager',
    'dummy_salt',
    'dummy_hash',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Alter constraints to not null
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_salt SET NOT NULL;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;

-- Attach trigger to users table
DROP TRIGGER IF EXISTS trg_update_users_timestamp ON users;
CREATE TRIGGER trg_update_users_timestamp
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Update audit trigger performed_by mapping (Task 8 Step 2)
-- For transactions, map audit performed_by directly to processed_by.
-- For cash shifts, map audit performed_by directly to cashier_id.
CREATE OR REPLACE FUNCTION fn_log_table_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Extract user ID based on target table columns first to preserve cashier accountability
    IF TG_TABLE_NAME = 'transactions' THEN
        IF TG_OP = 'DELETE' THEN
            v_user_id := OLD.processed_by;
        ELSE
            v_user_id := NEW.processed_by;
        END IF;
    ELSIF TG_TABLE_NAME = 'cash_shifts' THEN
        IF TG_OP = 'DELETE' THEN
            v_user_id := OLD.cashier_id;
        ELSE
            v_user_id := NEW.cashier_id;
        END IF;
    ELSE
        -- Fallback to Supabase Auth UID
        BEGIN
            v_user_id := auth.uid();
        EXCEPTION WHEN OTHERS THEN
            v_user_id := NULL;
        END;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::JSONB, v_user_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
