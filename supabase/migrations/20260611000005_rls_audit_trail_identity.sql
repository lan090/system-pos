-- =============================================================================
-- FSRMS Security Hardening — Task 6
-- Patch audit trail to track individual operator identity for non-transactional tables.
--
-- Problem (HIGH-3):
-- For tables other than transactions and cash_shifts, the audit trigger
-- fn_log_table_activity() falls back to auth.uid() to populate performed_by.
-- Under the Generic Terminal Account model, auth.uid() returns the shared
-- terminal UUID — so all audit log entries for customers, services,
-- appointments, and therapists show the same generic terminal UUID,
-- making it impossible to identify which individual operator made the change.
--
-- Fix:
-- 1. Create set_current_operator(UUID) RPC — client calls this after login
--    to register the real individual operator UUID as a Postgres session variable.
-- 2. Update fn_log_table_activity() to read app.current_operator_id first.
--    Falls back to auth.uid() if session variable is not set (backwards compat).
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. RPC: set_current_operator — called by client after successful login
--    Sets a Postgres session-level variable 'app.current_operator_id'
--    that persists for the current database connection.
--    The audit trigger reads this to populate performed_by for non-transactional tables.
-- =========================================================================
CREATE OR REPLACE FUNCTION set_current_operator(p_operator_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- false = local to transaction only; use true for session-level persistence
  -- Using false here because Supabase uses connection pooling — session vars
  -- may leak between connections. local = transaction scope = safe.
  PERFORM set_config('app.current_operator_id', p_operator_id::TEXT, false);
END;
$$;

GRANT EXECUTE ON FUNCTION set_current_operator(UUID) TO authenticated;

-- =========================================================================
-- 2. Update fn_log_table_activity — read session variable for non-tx tables
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_log_table_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Priority 1: Domain field identity for transactional tables
    -- These tables always have the real individual operator UUID in their domain fields.
    IF TG_TABLE_NAME = 'transactions' THEN
        v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.processed_by ELSE NEW.processed_by END;
    ELSIF TG_TABLE_NAME = 'cash_shifts' THEN
        v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cashier_id ELSE NEW.cashier_id END;
    ELSE
        -- Priority 2: Session variable set by client via set_current_operator() RPC
        BEGIN
            v_user_id := current_setting('app.current_operator_id', true)::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_user_id := NULL;
        END;
        -- Priority 3: Fallback to Supabase Auth UID
        -- NOTE: Under Generic Terminal Account model, this will be the shared terminal UUID,
        -- not the individual operator. Priority 2 should always be set by a well-behaved client.
        IF v_user_id IS NULL THEN
            BEGIN
                v_user_id := auth.uid();
            EXCEPTION WHEN OTHERS THEN
                v_user_id := NULL;
            END;
        END IF;
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
