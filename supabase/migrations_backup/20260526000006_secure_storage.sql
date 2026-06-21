BEGIN;

-- Ensure storage schema exists (Supabase standard)
CREATE SCHEMA IF NOT EXISTS storage;

-- Create or update the 'transaction-receipts' bucket to PRIVATE
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'transaction-receipts', 
    'transaction-receipts', 
    FALSE,                 -- public = false (PRIVATE bucket)
    153600,                -- 150 KB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = FALSE, 
    file_size_limit = 153600,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Enable RLS on storage.objects (just in case it's not enabled)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only authenticated Owner/Manager and Kasir can read files from 'transaction-receipts'
DROP POLICY IF EXISTS "Owner and Kasir can read transaction receipts" ON storage.objects;
CREATE POLICY "Owner and Kasir can read transaction receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'transaction-receipts'
    AND get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk')
);

-- RLS Policy: Only Kasir can upload new receipts
DROP POLICY IF EXISTS "Kasir can upload transaction receipts" ON storage.objects;
CREATE POLICY "Kasir can upload transaction receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'transaction-receipts'
    AND get_current_user_role() = 'Kasir/Front Desk'
);

COMMIT;
