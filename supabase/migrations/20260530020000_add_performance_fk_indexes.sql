-- ====================================================================
-- OPTIMASI COV_INDEX: MENUTUP CELAH UNINDEXED FOREIGN KEYS
-- ====================================================================

-- 1. Tabel public.transaction_items (Sangat Prioritas)
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON public.transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_service_id ON public.transaction_items(service_id);

-- 2. Tabel public.transactions (Sangat Prioritas)
CREATE INDEX IF NOT EXISTS idx_transactions_processed_by ON public.transactions(processed_by);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shift_id ON public.transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_appointment_id ON public.transactions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_discount_id ON public.transactions(discount_id);
CREATE INDEX IF NOT EXISTS idx_transactions_voided_by ON public.transactions(voided_by);

-- 3. Tabel public.appointments
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_therapist_id ON public.appointments(therapist_id);

-- 4. Tabel public.audit_logs & customers
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_customers_discount_id ON public.customers(discount_id);
