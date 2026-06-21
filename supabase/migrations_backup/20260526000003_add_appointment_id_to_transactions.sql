-- =========================================================================
-- MIGRATION: 20260526_003_add_appointment_id_to_transactions
-- Issue Fix: Audit Finding 2.3 & 3.12 — link appointment to transaction
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- STEP 1: Add appointment_id column to transactions referencing appointments(id)
-- -------------------------------------------------------------------------
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS appointment_id UUID NULL REFERENCES appointments(id) ON DELETE SET NULL;

COMMIT;
