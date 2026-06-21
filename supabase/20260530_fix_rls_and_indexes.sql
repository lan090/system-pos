-- =============================================================================
-- FSRMS v2.0 — Database Migration: Fix RLS Policies, Indexes & Schema Lints
-- Generated: 2026-05-30
-- Safe to re-run: All statements are idempotent (IF EXISTS guards).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- LAYER A: Remove Redundant Permissive RLS Policies
-- Supabase Lint: "Multiple Permissive Policies" for same operation on same role
-- causes Postgres to evaluate ALL policies, creating unnecessary overhead and
-- potential data leakage paths.
-- ─────────────────────────────────────────────────────────────────────────────

-- A.1: Drop the overly-broad "Manage transaction items based on role" policy
--      on public.transaction_items.
--      The specific INSERT and SELECT policies are retained — this catch-all
--      is redundant and creates a duplicate permissive evaluation path.
DROP POLICY IF EXISTS "Manage transaction items based on role"
  ON public.transaction_items;

-- A.2: Drop the overly-broad "Manage transactions based on role" policy
--      on public.transactions.
--      Same reasoning: specific INSERT/SELECT/UPDATE policies handle RBAC;
--      this catch-all triggers the "Multiple Permissive Policies" lint.
DROP POLICY IF EXISTS "Manage transactions based on role"
  ON public.transactions;

-- ─────────────────────────────────────────────────────────────────────────────
-- LAYER B: Drop 12 Unused Indexes (0 Index Scans Recorded)
-- These indexes have 0 scans recorded in pg_stat_user_indexes, meaning Postgres
-- never chose them for any query plan. They consume write overhead on every
-- INSERT/UPDATE/DELETE (critical for offline-first sync bursts) with zero benefit.
-- ─────────────────────────────────────────────────────────────────────────────

-- Transactions table indexes (6 unused)
DROP INDEX IF EXISTS public.idx_transactions_processed_by;
DROP INDEX IF EXISTS public.idx_transactions_customer_id;
DROP INDEX IF EXISTS public.idx_transactions_shift_id;
DROP INDEX IF EXISTS public.idx_transactions_appointment_id;
DROP INDEX IF EXISTS public.idx_transactions_discount_id;
DROP INDEX IF EXISTS public.idx_transactions_voided_by;

-- Transaction items indexes (2 unused)
DROP INDEX IF EXISTS public.idx_transaction_items_transaction_id;
DROP INDEX IF EXISTS public.idx_transaction_items_service_id;

-- Appointments indexes (2 unused)
DROP INDEX IF EXISTS public.idx_appointments_customer_id;
DROP INDEX IF EXISTS public.idx_appointments_therapist_id;

-- Audit & customers indexes (2 unused)
DROP INDEX IF EXISTS public.idx_audit_logs_performed_by;
DROP INDEX IF EXISTS public.idx_customers_discount_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- LAYER C: Create Missing Covering Index
-- idx_cash_shifts_cashier_id is required for efficient cashier-based shift
-- lookups used by the POS Terminal's shift open/close flow.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_cash_shifts_cashier_id
  ON public.cash_shifts (cashier_id);

-- =============================================================================
-- END OF MIGRATION
-- Run via Supabase SQL Editor or:
--   supabase db push  (if using local Supabase CLI)
-- =============================================================================
