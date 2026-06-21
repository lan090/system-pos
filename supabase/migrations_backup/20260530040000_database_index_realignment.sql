-- ====================================================================
-- PART 1: DROP 10 UNUSED INDEXES (Meringankan beban komputasi write)
-- ====================================================================
DROP INDEX IF EXISTS public.idx_therapists_active;
DROP INDEX IF EXISTS public.idx_services_catalog;
DROP INDEX IF EXISTS public.idx_transactions_dashboard;
DROP INDEX IF EXISTS public.idx_transactions_updated_at;
DROP INDEX IF EXISTS public.idx_telemetry_logs_created_at;
DROP INDEX IF EXISTS public.idx_telemetry_logs_event;
DROP INDEX IF EXISTS public.idx_services_active;
DROP INDEX IF EXISTS public.idx_customers_phone;
DROP INDEX IF EXISTS public.idx_customers_name;
DROP INDEX IF EXISTS public.idx_cash_shifts_active;

-- ====================================================================
-- PART 2: CREATE 12 COVERING INDEXES FOR UNINDEXED FOREIGN KEYS
-- ====================================================================
-- Tabel appointments
CREATE INDEX IF NOT EXISTS idx_appointments_customer_id ON public.appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_therapist_id ON public.appointments(therapist_id);

-- Tabel audit_logs & customers
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_customers_discount_id ON public.customers(discount_id);

-- Tabel transaction_items
CREATE INDEX IF NOT EXISTS idx_transaction_items_service_id ON public.transaction_items(service_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction_id ON public.transaction_items(transaction_id);

-- Tabel transactions
CREATE INDEX IF NOT EXISTS idx_transactions_processed_by ON public.transactions(processed_by);
CREATE INDEX IF NOT EXISTS idx_transactions_appointment_id ON public.transactions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_discount_id ON public.transactions(discount_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shift_id ON public.transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_voided_by ON public.transactions(voided_by);
