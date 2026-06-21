-- =============================================================================
-- FSRMS Security Hardening — Task 4
-- Fix Kasir write access to services/discounts/therapists + close anon telemetry insert.
--
-- Problems addressed:
-- HIGH-1: Merged permissive policies grant Kasir ALL operations (INSERT/UPDATE/DELETE)
--         on services, discounts, and therapists. Kasir should only READ these tables.
--         Only Owner should be able to modify catalog, pricing, and staff data.
-- MED-1:  telemetry_logs INSERT policy is TO public WITH CHECK (true) — allows any
--         anonymous actor to spam the telemetry table with arbitrary data.
-- =============================================================================

BEGIN;

-- =========================================================================
-- 1. services: Owner full control, Kasir SELECT only
--    Kasir needs to read the service catalog for POS checkout.
--    Only Owner can add/edit/remove services.
-- =========================================================================
DROP POLICY IF EXISTS "Manage services based on role" ON public.services;
DROP POLICY IF EXISTS "Owner can edit catalog" ON public.services;
DROP POLICY IF EXISTS "Kasir and Terapis can read services list" ON public.services;

CREATE POLICY "Owner can manage services"
ON public.services
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read services catalog"
ON public.services
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- 2. discounts: Owner full control, Kasir SELECT only
--    Kasir needs to read discounts to apply them at POS checkout.
--    Only Owner can create/modify/delete discount rules.
-- =========================================================================
DROP POLICY IF EXISTS "Manage discounts based on role" ON public.discounts;
DROP POLICY IF EXISTS "Owner full control on Discounts" ON public.discounts;
DROP POLICY IF EXISTS "Kasir can read Discounts list" ON public.discounts;

CREATE POLICY "Owner can manage discounts"
ON public.discounts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read discounts"
ON public.discounts
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- 3. therapists: Owner full control, Kasir SELECT only
--    Kasir reads therapist list for the appointment scheduler.
--    Only Owner can add/edit/deactivate therapists.
-- =========================================================================
DROP POLICY IF EXISTS "Manage therapists based on role" ON public.therapists;
DROP POLICY IF EXISTS "Owner full control on Therapists" ON public.therapists;
DROP POLICY IF EXISTS "Kasir can read Therapists list" ON public.therapists;

CREATE POLICY "Owner can manage therapists"
ON public.therapists
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read therapists"
ON public.therapists
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- 4. telemetry_logs: Close anonymous INSERT
--    Original policy: TO public WITH CHECK (true) — allows anon writes.
--    Fix: Restrict to authenticated users only.
--    Owner can also read telemetry for SRE observability dashboard.
-- =========================================================================
DROP POLICY IF EXISTS "Enable insert for all users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Secure authenticated insert for telemetry_logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Authenticated insert for telemetry_logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Owner can read telemetry logs" ON public.telemetry_logs;

CREATE POLICY "Authenticated insert for telemetry_logs"
ON public.telemetry_logs
FOR INSERT
TO authenticated
WITH CHECK (id IS NOT NULL);

CREATE POLICY "Owner can read telemetry logs"
ON public.telemetry_logs
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Owner/Manager');

COMMIT;
