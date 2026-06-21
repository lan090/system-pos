-- ====================================================================
-- ELIMINASI AKHIR: HAPUS KEBIJAKAN LAMA YANG TUMPANG TINDIH
-- ====================================================================

-- 1. Bersihkan tabel public.transactions dari aturan lama
DROP POLICY IF EXISTS "Manage transactions based on role" ON public.transactions;

-- 2. Bersihkan tabel public.transaction_items dari aturan lama
DROP POLICY IF EXISTS "Manage transaction items based on role" ON public.transaction_items;
