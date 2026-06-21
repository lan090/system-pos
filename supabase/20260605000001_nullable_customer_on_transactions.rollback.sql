-- =============================================================================
-- FSRMS v2.0 — DOWN Migration (ROLLBACK)
-- Reverses: 20260605000001_nullable_customer_on_transactions.sql
-- =============================================================================

BEGIN;

-- PRE-FLIGHT CHECK: Abort if any NULL customer_id transactions exist
-- These cannot be reverted without data loss.
DO $$
DECLARE
  v_null_count INT;
BEGIN
  SELECT COUNT(*) INTO v_null_count
  FROM public.transactions
  WHERE customer_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION
      'ROLLBACK BLOCKED: % transaction(s) have customer_id = NULL. '
      'Resolve these rows before running the DOWN migration. '
      'Run: SELECT id, created_at, customer_name FROM transactions WHERE customer_id IS NULL;',
      v_null_count;
  END IF;
END;
$$;

-- STEP R1: Remove analytics columns added by UP migration
ALTER TABLE public.transactions
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS customer_phone,
  DROP COLUMN IF EXISTS customer_name,
  DROP COLUMN IF EXISTS session_id;

-- STEP R2: Restore NOT NULL constraint on customer_id
ALTER TABLE public.transactions
  ALTER COLUMN customer_id SET NOT NULL;

-- STEP R3: Restore original loyalty trigger (without NULL guard)
CREATE OR REPLACE FUNCTION fn_recalculate_loyalty_tier_and_visits()
RETURNS TRIGGER AS $$
DECLARE
    v_omset NUMERIC(12,2);
    v_kunjungan INT;
    v_new_tier VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'Done' THEN
            UPDATE customers SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'Done' AND OLD.status <> 'Done' THEN
            UPDATE customers SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        ELSIF NEW.status = 'Voided' AND OLD.status = 'Done' THEN
            UPDATE customers SET total_omset = total_omset - NEW.total_amount,
                total_kunjungan = total_kunjungan - 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        END IF;
    END IF;
    IF v_omset IS NOT NULL THEN
        IF (v_omset >= 5000000.00 AND v_kunjungan >= 25) THEN v_new_tier := 'Platinum';
        ELSIF (v_omset >= 2000000.00 AND v_kunjungan >= 10) THEN v_new_tier := 'Gold';
        ELSE v_new_tier := 'Silver';
        END IF;
        UPDATE customers SET membership_tier = v_new_tier WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- STEP R4: Restore original upsert_transaction() RPC
CREATE OR REPLACE FUNCTION upsert_transaction(p_transaction_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_id := (p_transaction_payload->>'id')::UUID;
  v_updated_at := COALESCE((p_transaction_payload->>'updated_at')::TIMESTAMPTZ, NOW());
  INSERT INTO transactions (
    id, customer_id, processed_by, appointment_id, discount_id,
    discount_amount, payment_method, offline_sender, offline_media,
    status, total_amount, created_at, updated_at
  ) VALUES (
    v_id,
    (p_transaction_payload->>'customer_id')::UUID,
    (p_transaction_payload->>'processed_by')::UUID,
    (p_transaction_payload->>'appointment_id')::UUID,
    (p_transaction_payload->>'discount_id')::UUID,
    (p_transaction_payload->>'discount_amount')::NUMERIC,
    (p_transaction_payload->>'payment_method'),
    (p_transaction_payload->>'offline_sender'),
    (p_transaction_payload->>'offline_media'),
    (p_transaction_payload->>'status'),
    (p_transaction_payload->>'total_amount')::NUMERIC,
    (p_transaction_payload->>'created_at')::TIMESTAMPTZ,
    v_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id, status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount, updated_at = EXCLUDED.updated_at
  WHERE EXCLUDED.updated_at > transactions.updated_at;
END;
$$ LANGUAGE plpgsql;

-- STEP R5: Drop session_id index
DROP INDEX IF EXISTS public.idx_transactions_session_id;

COMMIT;
