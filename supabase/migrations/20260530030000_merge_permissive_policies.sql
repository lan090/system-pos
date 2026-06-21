-- ====================================================================
-- REFACTOR RLS SCOPES: MERGE OVERLAPPING PERMISSIVE POLICIES
-- ====================================================================

-- 1. appointments
DROP POLICY IF EXISTS "Kasir can manage Scheduler" ON public.appointments;
DROP POLICY IF EXISTS "Owner full control on Bookings" ON public.appointments;

CREATE POLICY "Manage appointments based on role" 
ON public.appointments 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 2. customers
DROP POLICY IF EXISTS "Kasir can read or modify Customers" ON public.customers;
DROP POLICY IF EXISTS "Owner full control on Customers" ON public.customers;
DROP POLICY IF EXISTS "Terapis can read Customers only" ON public.customers;

CREATE POLICY "Manage customers based on role" 
ON public.customers 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 3. discounts
DROP POLICY IF EXISTS "Kasir can read Discounts list" ON public.discounts;
DROP POLICY IF EXISTS "Owner full control on Discounts" ON public.discounts;

CREATE POLICY "Manage discounts based on role" 
ON public.discounts 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 4. services
DROP POLICY IF EXISTS "Kasir and Terapis can read services list" ON public.services;
DROP POLICY IF EXISTS "Owner can edit catalog" ON public.services;

CREATE POLICY "Manage services based on role" 
ON public.services 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 5. therapists
DROP POLICY IF EXISTS "Kasir can read Therapists list" ON public.therapists;
DROP POLICY IF EXISTS "Owner full control on Therapists" ON public.therapists;

CREATE POLICY "Manage therapists based on role" 
ON public.therapists 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 6. transaction_items
DROP POLICY IF EXISTS "Kasir can list/add Cart Items" ON public.transaction_items;
DROP POLICY IF EXISTS "Owner full access on Transaction Items" ON public.transaction_items;

CREATE POLICY "Manage transaction items based on role" 
ON public.transaction_items 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 7. transactions
DROP POLICY IF EXISTS "Kasir can handle POS Checkout" ON public.transactions;
DROP POLICY IF EXISTS "Owner full access on Transactions" ON public.transactions;

CREATE POLICY "Manage transactions based on role" 
ON public.transactions 
FOR ALL 
TO authenticated 
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));
