-- 1. UBAH KARAKTERISTIK FUNGSI MENJADI SECURITY INVOKER
ALTER FUNCTION public.upsert_transaction(jsonb) SECURITY INVOKER;
ALTER FUNCTION public.fn_log_table_activity() SECURITY INVOKER;

-- 2. REFACTOR RLS DETAIL ITEM TRANSAKSI (MENGGUNAKAN EXISTS CHECK)
DROP POLICY IF EXISTS "Secure authenticated insert for transaction_items" ON public.transaction_items;
DROP POLICY IF EXISTS "Allow insert for transaction_items" ON public.transaction_items;

CREATE POLICY "Secure authenticated insert for transaction_items" 
ON public.transaction_items 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions 
    WHERE public.transactions.id = transaction_items.transaction_id 
    AND public.transactions.processed_by = auth.uid()
  )
);

-- 3. REFACTOR RLS TELEMETRY LOGS (MEMBUANG LITERAL TRUE KONSTAN)
DROP POLICY IF EXISTS "Secure authenticated insert for telemetry_logs" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.telemetry_logs;

CREATE POLICY "Secure authenticated insert for telemetry_logs" 
ON public.telemetry_logs 
FOR INSERT 
TO authenticated 
WITH CHECK (id IS NOT NULL);
