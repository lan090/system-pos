-- =============================================================================
-- FSRMS Security Hardening — Task 3
-- Fix RLS policies broken under the Generic Terminal Account model.
--
-- Problem: Several policies use auth.uid() to identify individual cashiers.
-- Under the Generic Terminal Account model, ALL cashiers share the same
-- Supabase Auth identity (cashier-terminal@fenina.com), so auth.uid()
-- returns the shared terminal UUID — not the individual cashier UUID.
-- This breaks:
--   - cash_shifts: Kasir cannot open/read their own shifts (auth.uid() mismatch)
--   - transactions INSERT: processed_by = auth.uid() always fails
--   - transaction_items INSERT: EXISTS check uses auth.uid() — always fails
--
-- Fix: Replace auth.uid() row-level checks with get_current_user_role()
-- role-level gating. Individual cashier accountability is maintained via
-- the processed_by / cashier_id domain fields, not via auth.uid().
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. cash_shifts: Replace broken auth.uid() policy with role-level gating
-- =========================================================================
DROP POLICY IF EXISTS "Cashiers can manage their shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Owner full access on Cash Shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Kasir can manage Cash Shifts" ON public.cash_shifts;

CREATE POLICY "Owner full access on Cash Shifts"
ON public.cash_shifts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

-- Kasir can INSERT new shifts and SELECT all shifts for duplicate open-shift detection.
-- Per-cashier isolation enforced at application layer (cashier_id field), not DB layer.
CREATE POLICY "Kasir can manage Cash Shifts"
ON public.cash_shifts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- 2. transactions: Replace broken auth.uid() INSERT policy
-- =========================================================================

-- Remove ALL conflicting transaction policies and recreate clean
DROP POLICY IF EXISTS "Secure insert for authenticated cashiers" ON public.transactions;
DROP POLICY IF EXISTS "Manage transactions based on role" ON public.transactions;
DROP POLICY IF EXISTS "Owner full access on Transactions" ON public.transactions;
DROP POLICY IF EXISTS "Kasir can handle POS Checkout" ON public.transactions;

-- Single unified policy: role-level gating only
-- Individual cashier identity tracked via processed_by field (set by application)
CREATE POLICY "Manage transactions based on role"
ON public.transactions
FOR ALL
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- =========================================================================
-- 3. transaction_items: Clean up conflicting policies
-- =========================================================================
DROP POLICY IF EXISTS "Secure authenticated insert for transaction_items" ON public.transaction_items;
DROP POLICY IF EXISTS "Manage transaction items based on role" ON public.transaction_items;
DROP POLICY IF EXISTS "Owner full access on Transaction Items" ON public.transaction_items;
DROP POLICY IF EXISTS "Kasir can list/add Cart Items" ON public.transaction_items;

-- Single unified policy aligned with transactions policy
CREATE POLICY "Manage transaction items based on role"
ON public.transaction_items
FOR ALL
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

COMMIT;
