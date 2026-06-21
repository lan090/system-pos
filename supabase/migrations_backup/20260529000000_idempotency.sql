-- Supabase Ingestion Idempotency Migration (Version 2.0)
-- Implementing Last-Write-Wins (LWW) conflict reconciliation

-- 1. Ensure updated_at column exists in transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE transactions ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    CREATE INDEX idx_transactions_updated_at ON transactions(updated_at);
    RAISE NOTICE 'Migration: Created updated_at column in transactions table.';
  END IF;
END;
$$;

-- 2. Ensure uq_transaction_id constraint exists securely on transactions.id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_transaction_id'
  ) THEN
    ALTER TABLE transactions ADD CONSTRAINT uq_transaction_id UNIQUE (id);
    RAISE NOTICE 'Migration: Added uq_transaction_id unique key constraint.';
  END IF;
END;
$$;

-- 3. Refactor upsert_transaction(p_transaction_payload JSONB) RPC function
-- Uses ON CONFLICT (id) DO UPDATE SET to resolve the Silent Data Suppression bug
CREATE OR REPLACE FUNCTION upsert_transaction(p_transaction_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  -- Extract variables
  v_id := (p_transaction_payload->>'id')::UUID;
  v_updated_at := COALESCE((p_transaction_payload->>'updated_at')::TIMESTAMPTZ, NOW());

  -- Perform idempotent insertion with Last-Write-Wins (LWW) timestamp rule
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
    customer_id = EXCLUDED.customer_id,
    processed_by = EXCLUDED.processed_by,
    appointment_id = EXCLUDED.appointment_id,
    discount_id = EXCLUDED.discount_id,
    discount_amount = EXCLUDED.discount_amount,
    payment_method = EXCLUDED.payment_method,
    offline_sender = EXCLUDED.offline_sender,
    offline_media = EXCLUDED.offline_media,
    status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    updated_at = EXCLUDED.updated_at
  WHERE EXCLUDED.updated_at > transactions.updated_at;
  
  -- If update is ignored due to older/identical timestamp, exits successfully with 0 rows affected.
END;
$$ LANGUAGE plpgsql;
