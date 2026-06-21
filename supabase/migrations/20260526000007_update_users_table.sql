BEGIN;

-- Add 'nama_lengkap' to users (nullable first, so existing data doesn't fail, or set default)
ALTER TABLE users ADD COLUMN IF NOT EXISTS nama_lengkap VARCHAR(150) NULL;

-- Seed existing users' nama_lengkap using email prefix as display name fallback
UPDATE users SET nama_lengkap = INITCAP(SPLIT_PART(email, '@', 1)) WHERE nama_lengkap IS NULL;

-- Enforce NOT NULL constraint on nama_lengkap after seeding
ALTER TABLE users ALTER COLUMN nama_lengkap SET NOT NULL;

-- Add 'is_active' to users with default TRUE
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Add 'created_at' if not exists (it already exists in schema.sql, but guard it just in case)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='users' AND column_name='created_at'
    ) THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END $$;

COMMIT;
