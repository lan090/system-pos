-- =============================================================================
-- FSRMS Security Hardening — Task 1
-- Harden get_current_user_role() with strict enum allowlist validation.
-- Prevents crafted JWT role values from bypassing RLS policies.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(
    current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role',
    'anonymous'
  );
  -- Strict allowlist validation — reject any unrecognized role value
  IF v_role NOT IN ('Owner/Manager', 'Kasir/Front Desk') THEN
    RETURN 'anonymous';
  END IF;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

COMMIT;
