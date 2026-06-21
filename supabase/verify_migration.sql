-- 1. Verifikasi Kolom Baru
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'services' AND column_name = 'is_active';

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'transactions' AND column_name IN ('voided_by', 'shift_id');

-- 2. Verifikasi Tabel Shift
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE table_schema = 'public' AND table_name = 'cash_shifts'
) AS cash_shifts_exists;

-- 3. Verifikasi Index
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'customers' AND indexname IN ('idx_customers_phone', 'idx_customers_name');
