-- ====================================================================
-- OPTIMASI AKHIR: COVERING INDEX UNTUK KOLOM RELASI CASH SHIFTS
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_cash_shifts_cashier_id ON public.cash_shifts(cashier_id);
