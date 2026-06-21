-- =============================================================================
-- FSRMS v2.0 — Migration: Integrity Checker RPC Functions
-- Generated: 2026-06-05
-- Author: Senior DB Architect
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION check_orphan_transaction_items()
RETURNS JSON LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('count',
    COUNT(ti.id)
  )
  FROM transaction_items ti
  LEFT JOIN transactions t ON t.id = ti.transaction_id
  WHERE t.id IS NULL;
$$;

CREATE OR REPLACE FUNCTION check_stale_drafts()
RETURNS JSON LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('count',
    COUNT(id)
  )
  FROM transactions
  WHERE status = 'Draft'
    AND created_at < NOW() - INTERVAL '1 hour';
$$;

CREATE OR REPLACE FUNCTION check_zero_amount_transactions()
RETURNS JSON LANGUAGE sql SECURITY DEFINER AS $$
  SELECT json_build_object('count',
    COUNT(id)
  )
  FROM transactions
  WHERE status = 'Done'
    AND total_amount <= 0;
$$;

COMMIT;
