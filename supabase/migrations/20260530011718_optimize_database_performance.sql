-- ====================================================================
-- OPTIMASI INDEKS: HAPUS REPLIKA INDEKS DUPLIKAT
-- ====================================================================
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS uq_transaction_id;

-- ====================================================================
-- OPTIMASI RLS: RESOLUSI INITPLAN (SELECT AUTH.UID) FOR PERFORMANCE AT SCALE
-- ====================================================================

-- 1. Tabel public.transactions
DROP POLICY IF EXISTS "Secure insert for authenticated cashiers" ON public.transactions;
CREATE POLICY "Secure insert for authenticated cashiers" 
ON public.transactions 
FOR INSERT 
TO authenticated 
WITH CHECK (coalesce((SELECT auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid) = processed_by);

-- 2. Tabel public.transaction_items
DROP POLICY IF EXISTS "Secure authenticated insert for transaction_items" ON public.transaction_items;
CREATE POLICY "Secure authenticated insert for transaction_items" 
ON public.transaction_items 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions 
    WHERE public.transactions.id = transaction_items.transaction_id 
    AND public.transactions.processed_by = (SELECT auth.uid())
  )
);

-- 3. Tabel public.cash_shifts
DROP POLICY IF EXISTS "Cashiers can manage their shifts" ON public.cash_shifts;
CREATE POLICY "Cashiers can manage their shifts"
ON public.cash_shifts
FOR ALL
TO authenticated
USING (cashier_id = (SELECT auth.uid()))
WITH CHECK (cashier_id = (SELECT auth.uid()));

-- 4. Tabel public.users
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.users;
CREATE POLICY "Allow users to update their own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));
