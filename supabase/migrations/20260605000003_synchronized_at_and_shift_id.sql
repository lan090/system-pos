-- =============================================================================
-- FSRMS v2.0 — Migration: Ensure synchronized_at and shift_id on Transactions
-- Generated: 2026-06-05
-- Author: Senior DB Architect
-- =============================================================================

BEGIN;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS synchronized_at TIMESTAMPTZ NULL;

-- If shift_id was not added, add it
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES cash_shifts(id) ON DELETE RESTRICT;

COMMIT;
