-- =============================================================================
-- FSRMS v2.0 — UP Migration: Nullable Customer + Session Tracking on Transactions
-- Generated: 2026-06-05
-- Idempotent: All statements guarded with IF NOT EXISTS / DO $$ checks
-- Author: Senior DB Architect
-- Rollback: 20260605000001_nullable_customer_on_transactions.rollback.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Make customer_id nullable on transactions
-- SAFE: existing rows are untouched (all have non-null values)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ALTER COLUMN customer_id DROP NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add analytics columns (all nullable, no constraint changes)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS session_id     UUID         DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS metadata       JSONB        NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Backfill session_id for existing rows (one-time data enrichment)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.transactions
  SET session_id = gen_random_uuid()
  WHERE session_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Update loyalty trigger to guard against NULL customer_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_recalculate_loyalty_tier_and_visits()
RETURNS TRIGGER AS $$
DECLARE
    v_omset NUMERIC(12,2);
    v_kunjungan INT;
    v_new_tier VARCHAR(20);
BEGIN
    -- GUARD: Guest transactions have no customer — skip loyalty calculation
    IF NEW.customer_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Atomic inline update to prevent race conditions (Issue 3.6 & 7.1)
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'Done' AND OLD.status <> 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        ELSIF NEW.status = 'Voided' AND OLD.status = 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset - NEW.total_amount,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Update upsert_transaction() RPC to accept nullable customer_id
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_transaction(p_transaction_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_customer_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_id := (p_transaction_payload->>'id')::UUID;
  v_updated_at := COALESCE((p_transaction_payload->>'updated_at')::TIMESTAMPTZ, NOW());
  -- NULL-SAFE: cast only if not null string
  v_customer_id := NULLIF(p_transaction_payload->>'customer_id', '')::UUID;

  INSERT INTO transactions (
    id, customer_id, session_id, customer_name, customer_phone,
    processed_by, appointment_id, discount_id,
    discount_amount, payment_method, offline_sender, offline_media,
    status, total_amount, created_at, updated_at
  ) VALUES (
    v_id,
    v_customer_id,                                    -- nullable
    COALESCE((p_transaction_payload->>'session_id')::UUID, gen_random_uuid()),
    NULLIF(p_transaction_payload->>'customer_name', ''),
    NULLIF(p_transaction_payload->>'customer_phone', ''),
    (p_transaction_payload->>'processed_by')::UUID,
    NULLIF(p_transaction_payload->>'appointment_id', '')::UUID,
    NULLIF(p_transaction_payload->>'discount_id', '')::UUID,
    COALESCE((p_transaction_payload->>'discount_amount')::NUMERIC, 0),
    (p_transaction_payload->>'payment_method'),
    NULLIF(p_transaction_payload->>'offline_sender', ''),
    NULLIF(p_transaction_payload->>'offline_media', ''),
    COALESCE(p_transaction_payload->>'status', 'Done'),
    (p_transaction_payload->>'total_amount')::NUMERIC,
    (p_transaction_payload->>'created_at')::TIMESTAMPTZ,
    v_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id    = EXCLUDED.customer_id,
    session_id     = EXCLUDED.session_id,
    customer_name  = EXCLUDED.customer_name,
    customer_phone = EXCLUDED.customer_phone,
    status         = EXCLUDED.status,
    total_amount   = EXCLUDED.total_amount,
    updated_at     = EXCLUDED.updated_at
  WHERE EXCLUDED.updated_at > transactions.updated_at;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Add index on session_id for analytics queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_session_id
  ON public.transactions (session_id);

COMMIT;
