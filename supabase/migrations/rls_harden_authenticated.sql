-- =========================================================================
-- FSRMS v2.0 — RLS HARDENING MIGRATION
-- Tujuan: Menambahkan TO authenticated secara eksplisit pada semua policy
--         tabel transaksional untuk mencegah akses dari anonymous users.
--
-- PENTING: Jalankan skrip ini di Supabase SQL Editor (Dashboard → SQL Editor).
-- Uji terlebih dahulu di lingkungan staging sebelum production.
-- =========================================================================

-- -------------------------------------------------------------------------
-- TABEL: transactions
-- Hapus policy lama (implicit role) dan buat ulang dengan TO authenticated
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full access on Transactions" ON transactions;
CREATE POLICY "Owner full access on Transactions"
ON transactions FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can handle POS Checkout" ON transactions;
CREATE POLICY "Kasir can handle POS Checkout"
ON transactions FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- -------------------------------------------------------------------------
-- TABEL: transaction_items
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full access on Transaction Items" ON transaction_items;
CREATE POLICY "Owner full access on Transaction Items"
ON transaction_items FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can list/add Cart Items" ON transaction_items;
CREATE POLICY "Kasir can list/add Cart Items"
ON transaction_items FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- -------------------------------------------------------------------------
-- TABEL: cash_shifts
-- Tabel ini mungkin belum memiliki policy — tambahkan lengkap
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full access on Cash Shifts" ON cash_shifts;
CREATE POLICY "Owner full access on Cash Shifts"
ON cash_shifts FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can manage Cash Shifts" ON cash_shifts;
CREATE POLICY "Kasir can manage Cash Shifts"
ON cash_shifts FOR ALL
TO authenticated
USING (
  get_current_user_role() = 'Kasir/Front Desk'
  -- Kasir hanya bisa melihat/mengubah shift miliknya sendiri
  AND (cashier_id = auth.uid() OR get_current_user_role() = 'Owner/Manager')
)
WITH CHECK (
  get_current_user_role() = 'Kasir/Front Desk'
  AND cashier_id = auth.uid()
);

-- -------------------------------------------------------------------------
-- TABEL: appointments
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full control on Bookings" ON appointments;
CREATE POLICY "Owner full control on Bookings"
ON appointments FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can manage Scheduler" ON appointments;
CREATE POLICY "Kasir can manage Scheduler"
ON appointments FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- -------------------------------------------------------------------------
-- TABEL: customers
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full control on Customers" ON customers;
CREATE POLICY "Owner full control on Customers"
ON customers FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can read or modify Customers" ON customers;
CREATE POLICY "Kasir can read or modify Customers"
ON customers FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- Hapus policy lama SELECT USING (true) yang mengizinkan anon read
DROP POLICY IF EXISTS "Terapis can read Customers only" ON customers;
CREATE POLICY "Terapis can read Customers"
ON customers FOR SELECT
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk', 'Terapis'));

-- -------------------------------------------------------------------------
-- TABEL: services
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner can edit catalog" ON services;
CREATE POLICY "Owner can edit catalog"
ON services FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

-- Hapus SELECT USING (true) — ubah ke authenticated
DROP POLICY IF EXISTS "Kasir and Terapis can read services list" ON services;
CREATE POLICY "Kasir and Terapis can read services list"
ON services FOR SELECT
TO authenticated
USING (true);

-- -------------------------------------------------------------------------
-- TABEL: discounts
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full control on Discounts" ON discounts;
CREATE POLICY "Owner full control on Discounts"
ON discounts FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can read Discounts list" ON discounts;
CREATE POLICY "Kasir can read Discounts list"
ON discounts FOR SELECT
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- -------------------------------------------------------------------------
-- TABEL: therapists
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full control on Therapists" ON therapists;
CREATE POLICY "Owner full control on Therapists"
ON therapists FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can read Therapists list" ON therapists;
CREATE POLICY "Kasir can read Therapists list"
ON therapists FOR SELECT
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- -------------------------------------------------------------------------
-- TABEL: audit_logs
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Owner full control on audit_logs" ON audit_logs;
CREATE POLICY "Owner full control on audit_logs"
ON audit_logs FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager');

-- =========================================================================
-- VERIFIKASI: Query ini harus dijalankan setelah skrip di atas.
-- Pastikan semua policy terdaftar dengan roles = {authenticated}
-- =========================================================================

-- SELECT schemaname, tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
