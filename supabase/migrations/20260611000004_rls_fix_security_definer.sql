-- =============================================================================
-- FSRMS Security Hardening — Task 5
-- Fix SECURITY DEFINER state on upsert_transaction + restrict integrity RPCs.
--
-- Problems addressed:
-- HIGH-2: upsert_transaction() was changed to SECURITY INVOKER in fix_security_lints.sql
--         but then recreated as SECURITY DEFINER in idempotency_security.sql.
--         Migration ordering means the SECURITY DEFINER version wins.
--         If running as SECURITY DEFINER (postgres role), it bypasses all RLS.
-- MED-2:  check_orphan_transaction_items(), check_stale_drafts(), and
--         check_zero_amount_transactions() are SECURITY DEFINER with no auth guard.
--         Any authenticated user (including Kasir) can call these and read
--         internal diagnostic data.
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. upsert_transaction: Enforce SECURITY INVOKER as final state
--    The function was last created with SECURITY DEFINER in idempotency_security.sql.
--    This ALTER ensures it runs as the calling user's role (respects RLS).
-- =========================================================================
ALTER FUNCTION public.upsert_transaction(jsonb) SECURITY INVOKER;

-- =========================================================================
-- 2. Integrity RPCs: Add Owner-only guard inside function bodies
--    These functions are still SECURITY DEFINER (needed to bypass RLS to
--    count records), but now they check caller role before returning data.
-- =========================================================================

CREATE OR REPLACE FUNCTION check_orphan_transaction_items()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only Owner/Manager can access diagnostic data
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only function';
  END IF;
  RETURN (
    SELECT json_build_object('count',
      COUNT(ti.id)
    )
    FROM transaction_items ti
    LEFT JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.id IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION check_stale_drafts()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only function';
  END IF;
  RETURN (
    SELECT json_build_object('count',
      COUNT(id)
    )
    FROM transactions
    WHERE status = 'Draft'
      AND created_at < NOW() - INTERVAL '1 hour'
  );
END;
$$;

CREATE OR REPLACE FUNCTION check_zero_amount_transactions()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only function';
  END IF;
  RETURN (
    SELECT json_build_object('count',
      COUNT(id)
    )
    FROM transactions
    WHERE status = 'Done'
      AND total_amount <= 0
  );
END;
$$;

COMMIT;
