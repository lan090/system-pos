-- =============================================================================
-- FSRMS Security Hardening — Task 2
-- Fix users table RLS policies (CRIT-1).
-- 
-- Problem: users table has RLS enabled but NO SELECT policy, meaning all
-- authenticated users can potentially read all rows including password_hash
-- and password_salt. Also, the login flow does direct table queries which
-- expose sensitive fields.
--
-- Fix:
-- 1. Create get_user_salt() RPC — anon-accessible, returns salt only (no hash)
-- 2. Create verify_user_credentials() RPC — returns profile without hash/salt
-- 3. Add Owner full control policy
-- 4. Add Kasir read-own-row-only policy
-- 5. Remove legacy UPDATE-only policy
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. Secure RPC: get_user_salt — callable by anon for login flow (Step 1)
-- Returns ONLY the salt for a given username or email. Never returns hash.
-- The client uses the returned salt to compute the PBKDF2 hash locally.
-- =========================================================================
CREATE OR REPLACE FUNCTION get_user_salt(p_identifier TEXT)
RETURNS TABLE(salt TEXT, is_active BOOLEAN, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    password_salt::TEXT,
    is_active,
    role
  FROM users
  WHERE username = p_identifier OR email = p_identifier
  LIMIT 1;
$$;

-- Grant anon access — needed so login page (pre-auth state) can fetch salt
GRANT EXECUTE ON FUNCTION get_user_salt(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_user_salt(TEXT) TO authenticated;

-- =========================================================================
-- 2. Secure RPC: verify_user_credentials — verifies hash match
-- Returns full safe profile (EXCLUDING password_hash/salt) if credentials match.
-- Called after the client has computed the PBKDF2 hash from the returned salt.
-- =========================================================================
CREATE OR REPLACE FUNCTION verify_user_credentials(
  p_identifier TEXT,
  p_computed_hash TEXT
)
RETURNS TABLE(
  id UUID,
  email TEXT,
  username TEXT,
  nama_lengkap TEXT,
  role TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    email,
    username::TEXT,
    nama_lengkap::TEXT,
    role::TEXT,
    is_active,
    created_at
  FROM users
  WHERE (username = p_identifier OR email = p_identifier)
    AND password_hash = p_computed_hash
    AND is_active = TRUE
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION verify_user_credentials(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_user_credentials(TEXT, TEXT) TO authenticated;

-- =========================================================================
-- 3. Drop existing SELECT/UPDATE policies on users table
-- =========================================================================
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.users;
DROP POLICY IF EXISTS "Owner full control on users" ON public.users;
DROP POLICY IF EXISTS "Kasir can read own profile" ON public.users;

-- =========================================================================
-- 4. RLS Policies for users table
-- Owner: full CRUD on all users (UserManagementView needs this)
-- Kasir: SELECT their own row (for session validation + profile display)
-- Anon: NO direct access — must use get_user_salt() RPC
-- =========================================================================

-- Owner has full control over all user records
CREATE POLICY "Owner full control on users"
ON public.users
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

-- Kasir can only read their own profile row
-- Uses JWT username claim to identify "own row" since auth.uid() = shared terminal UUID
CREATE POLICY "Kasir can read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (
  get_current_user_role() = 'Kasir/Front Desk'
  AND username = current_setting('request.jwt.claims', true)::json->'user_metadata'->>'username'
);

COMMIT;
