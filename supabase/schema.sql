-- =========================================================================
-- FSRMS v2.0 - SUPABASE (POSTGRESQL) MASTER DDL DATABASE SCHEMA
-- Designed by: Senior Database Architect / Full-Stack Developer
-- Targets: Supabase PostgreSQL, Storage, Row-Level Security (RLS)
-- =========================================================================

-- Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------------------
-- 1. Table: users (Staff Credentials & RBAC)
-- -------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    nama_lengkap VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    -- Fix Audit 2.1a: 'Terapis' removed — therapists are NOT auth users
    role VARCHAR(50) NOT NULL CONSTRAINT chk_user_role CHECK (role IN ('Owner/Manager', 'Kasir/Front Desk')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 1b. Table: therapists (Scheduling reference entity — NOT auth users)
-- Fix: Audit 2.1a — Therapists decoupled from users/auth table
-- Owner manages this list directly from the UI without Supabase Auth admin
-- -------------------------------------------------------------------------
CREATE TABLE therapists (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nama       VARCHAR(150) NOT NULL,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_therapists_active ON therapists (is_active, nama) WHERE is_active = TRUE;

-- Enable RLS on therapists
ALTER TABLE therapists ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 1c. Table: discounts (Loyalty promotion rules & catalog cuts)
-- -------------------------------------------------------------------------
CREATE TABLE discounts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nama        VARCHAR(100) NOT NULL,
    tipe        VARCHAR(20) NOT NULL CHECK (tipe IN ('percentage', 'nominal')),
    nilai       NUMERIC(12,2) NOT NULL CHECK (nilai > 0),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on discounts
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 2. Table: customers (Client loyalty ledger)
-- -------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_lengkap VARCHAR(150) NOT NULL,
    nomor_telepon VARCHAR(14) NOT NULL UNIQUE CONSTRAINT chk_clean_phone CHECK (nomor_telepon ~ '^[0-9]{10,14}$'),
    discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL,
    catatan_khusus TEXT NULL,
    membership_tier VARCHAR(20) NOT NULL DEFAULT 'Silver' CONSTRAINT chk_membership_tier CHECK (membership_tier IN ('Silver', 'Gold', 'Platinum')),
    total_omset NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    total_kunjungan INTEGER NOT NULL DEFAULT 0 CONSTRAINT chk_visits_non_negative CHECK (total_kunjungan >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 3. Table: services (Catalog items)
-- -------------------------------------------------------------------------
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama_layanan VARCHAR(150) NOT NULL,
    harga_jual NUMERIC(12,2) NOT NULL CONSTRAINT chk_positive_service_price CHECK (harga_jual > 0),
    kategori VARCHAR(100) NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60 CONSTRAINT chk_positive_duration CHECK (duration_minutes > 0),
    description TEXT NULL,
    available_offline BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on services
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 4. Table: appointments (Scheduler resource board)
-- -------------------------------------------------------------------------
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    therapist_id UUID NOT NULL REFERENCES therapists(id) ON DELETE RESTRICT,
    service_id   UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    appointment_ts TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Scheduled' CONSTRAINT chk_appointment_status CHECK (status IN ('Scheduled', 'In Progress', 'Done', 'Cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 5. Table: cash_shifts (Daily register tracking)
-- -------------------------------------------------------------------------
CREATE TABLE cash_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    starting_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    expected_cash NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    actual_cash NUMERIC(12,2),
    status VARCHAR(20) NOT NULL DEFAULT 'Open' CONSTRAINT chk_shift_status CHECK (status IN ('Open', 'Closed'))
);

ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 6. Table: transactions (POS transaction headers)
-- -------------------------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY, -- Locally generated on client (UUIDv4) to guarantee zero offline clashes
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    appointment_id UUID NULL REFERENCES appointments(id) ON DELETE SET NULL,
    processed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_method VARCHAR(30) NOT NULL CONSTRAINT chk_payment_method CHECK (payment_method IN ('Cash', 'QRIS', 'Bank Transfer')),
    offline_sender VARCHAR(100) NULL, -- Opsi A offline verification
    offline_media VARCHAR(512) NULL, -- Opsi B offline Supabase Storage URL
    status VARCHAR(20) NOT NULL DEFAULT 'Draft' CONSTRAINT chk_transaction_status CHECK (status IN ('Draft', 'Done', 'Voided')),
    voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    shift_id UUID REFERENCES cash_shifts(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synchronized_at TIMESTAMPTZ NULL
);

-- Enable RLS on transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 6. Table: transaction_items (POS cart bridges)
-- -------------------------------------------------------------------------
CREATE TABLE transaction_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
    price_at_sale NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on transaction_items
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- PERFORMANCE OPTIMIZATION INDEXING
-- =========================================================================

-- Speed up customer profile searching (Audit 3.10)
-- 1. Index spesifik untuk B-Tree pencarian nomor HP (query lookup tercepat)
CREATE INDEX idx_customers_phone ON customers (nomor_telepon);

-- 2. GIN Index untuk pencarian nama dengan kapabilitas Full-Text Search
CREATE INDEX idx_customers_name ON customers USING GIN (to_tsvector('indonesian', nama_lengkap));

-- Speed up catalog searches inside POS ledger terminal (M04)
CREATE INDEX idx_services_catalog ON services (nama_layanan, kategori);

-- Speed up Owner dashboard metrics rendering
CREATE INDEX idx_transactions_dashboard ON transactions (status, created_at) WHERE status = 'Done';


-- =========================================================================
-- DATABASE TRIGGER: AUTOMATED LOYALTY TIER CALCULATION (M05)
-- Run database-side recalculation once transaction status becomes 'Done'
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_recalculate_loyalty_tier_and_visits()
RETURNS TRIGGER AS $$
DECLARE
    v_omset NUMERIC(12,2);
    v_kunjungan INT;
    v_new_tier VARCHAR(20);
BEGIN
    -- Atomic inline update to prevent race conditions (Issue 3.6 & 7.1)
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status = 'Done' AND OLD.status <> 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset + NEW.total_amount,
                total_kunjungan = total_kunjungan + 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        ELSIF NEW.status = 'Voided' AND OLD.status = 'Done' THEN
            UPDATE customers
            SET total_omset = total_omset - NEW.total_amount,
                total_kunjungan = total_kunjungan - 1
            WHERE id = NEW.customer_id
            RETURNING total_omset, total_kunjungan INTO v_omset, v_kunjungan;
        END IF;
    END IF;

    -- Tier Progression logic based on the atomically updated variables
    IF v_omset IS NOT NULL THEN
        IF (v_omset >= 5000000.00 AND v_kunjungan >= 25) THEN
            v_new_tier := 'Platinum';
        ELSIF (v_omset >= 2000000.00 AND v_kunjungan >= 10) THEN
            v_new_tier := 'Gold';
        ELSE
            v_new_tier := 'Silver';
        END IF;

        -- Apply membership tier calculation
        UPDATE customers
        SET membership_tier = v_new_tier
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition for automatic progression
DROP TRIGGER IF EXISTS trg_on_transaction_finished ON transactions;
CREATE TRIGGER trg_on_transaction_finished
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW
WHEN (NEW.status IN ('Done', 'Voided'))
EXECUTE FUNCTION fn_recalculate_loyalty_tier_and_visits();


-- =========================================================================
-- DATABASE TRIGGER: APPOINTMENT OVERLAP & DURATION CONSTRAINT (Audit 3.1 & 3.2)
-- Prevent scheduling overlaps for the same therapist at the database level.
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_prevent_appointment_overlap()
RETURNS TRIGGER AS $$
DECLARE
    v_service_duration INT;
    v_overlap_exists BOOLEAN;
    v_therapist_name VARCHAR(150);
BEGIN
    -- Get active status and duration of the selected service
    SELECT duration_minutes INTO v_service_duration 
    FROM services 
    WHERE id = NEW.service_id;
    
    IF v_service_duration IS NULL THEN
        v_service_duration := 60; -- Safe fallback
    END IF;

    -- Query therapist's name for more informative exception messages
    SELECT nama INTO v_therapist_name
    FROM therapists
    WHERE id = NEW.therapist_id;

    -- Check if therapist has any overlapping appointment
    -- Range 1: NEW.appointment_ts to NEW.appointment_ts + v_service_duration
    -- Range 2: a.appointment_ts to a.appointment_ts + s.duration_minutes
    SELECT EXISTS (
        SELECT 1 
        FROM appointments a
        JOIN services s ON a.service_id = s.id
        WHERE a.therapist_id = NEW.therapist_id
          AND a.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND a.status <> 'Cancelled'
          AND NEW.status <> 'Cancelled'
          AND NEW.appointment_ts < a.appointment_ts + (s.duration_minutes * INTERVAL '1 minute')
          AND a.appointment_ts < NEW.appointment_ts + (v_service_duration * INTERVAL '1 minute')
    ) INTO v_overlap_exists;

    IF v_overlap_exists THEN
        RAISE EXCEPTION 'Database Overlap Constraint: Terapis % sudah memiliki agenda aktif pada jam tersebut!', COALESCE(v_therapist_name, NEW.therapist_id::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_on_appointment_overlap_check
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_appointment_overlap();


-- =========================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES (RBAC Implementation)
-- Role Permissions:
-- 1. Owner / Manager: Full access (ALL permissions on all tables)
-- 2. Kasir / Front Desk: Create/Read/Update operations on POS, Customers, Catalog, Appointments
-- 3. Terapis: Read-only on bookings and catalog
-- =========================================================================

-- Helper function to fetch current user role from auth metadata
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
BEGIN
    -- Extracted safely from user custom metadata in Supabase Auth JWT
    RETURN COALESCE(
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role',
        'Terapis' -- Default fallback to safe read-only role
    );
END;
$$ LANGUAGE plpgsql;

-- A. Policies for Customers Table
CREATE POLICY "Owner full control on Customers" 
ON customers FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read or modify Customers" 
ON customers FOR ALL USING (get_current_user_role() = 'Kasir/Front Desk');

CREATE POLICY "Terapis can read Customers only" 
ON customers FOR SELECT USING (true);

-- B. Policies for Services Table
CREATE POLICY "Owner can edit catalog" 
ON services FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir and Terapis can read services list" 
ON services FOR SELECT USING (true);

-- C. Policies for Appointments Table
CREATE POLICY "Owner full control on Bookings" 
ON appointments FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can manage Scheduler" 
ON appointments FOR ALL USING (get_current_user_role() = 'Kasir/Front Desk');

-- D. Policies for therapists Table (Audit Fix 2.1a)
CREATE POLICY "Owner full control on Therapists"
ON therapists FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read Therapists list"
ON therapists FOR SELECT USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- D. Policies for Transactions Table
CREATE POLICY "Owner full access on Transactions" 
ON transactions FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can handle POS Checkout" 
ON transactions FOR ALL USING (get_current_user_role() = 'Kasir/Front Desk');

-- E. Policies for Transaction Items
CREATE POLICY "Owner full access on Transaction Items" 
ON transaction_items FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can list/add Cart Items" 
ON transaction_items FOR ALL USING (get_current_user_role() = 'Kasir/Front Desk');

-- F. Policies for discounts Table
CREATE POLICY "Owner full control on Discounts"
ON discounts FOR ALL USING (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read Discounts list"
ON discounts FOR SELECT USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));


-- =========================================================================
-- DATABASE TRIGGER: PREVENT TRANSACTION TAMPERING (Audit 5.7)
-- Recalculate true transaction total at the database side to prevent client tampering.
-- =========================================================================

CREATE OR REPLACE FUNCTION fn_recalculate_and_validate_transaction_total()
RETURNS TRIGGER AS $$
DECLARE
    v_items_subtotal NUMERIC(12,2);
    v_discount_val NUMERIC(12,2) := 0.00;
    v_discount_type VARCHAR(20) := 'percentage';
    v_discount_amount NUMERIC(12,2) := 0.00;
    v_has_items BOOLEAN;
BEGIN
    -- Only recalculate for transactions with status 'Done'
    IF NEW.status = 'Done' THEN
        -- Check if there are any transaction items already inserted for this transaction
        SELECT EXISTS (
            SELECT 1 FROM transaction_items WHERE transaction_id = NEW.id
        ) INTO v_has_items;

        IF v_has_items THEN
            -- Sum up actual service prices from services table
            SELECT COALESCE(SUM(s.harga_jual), 0.00) INTO v_items_subtotal
            FROM transaction_items ti
            JOIN services s ON ti.service_id = s.id
            WHERE ti.transaction_id = NEW.id;

            -- Fetch discount rate from discounts table if discount_id is set
            IF NEW.discount_id IS NOT NULL THEN
                SELECT nilai, tipe INTO v_discount_val, v_discount_type
                FROM discounts
                WHERE id = NEW.discount_id AND is_active = TRUE;

                IF FOUND THEN
                    IF v_discount_type = 'percentage' THEN
                        v_discount_amount := ROUND(v_items_subtotal * v_discount_val / 100);
                    ELSE
                        v_discount_amount := ROUND(v_discount_val);
                    END IF;
                END IF;
            END IF;

            -- Enforce server-side rounding to nearest integer for IDR
            NEW.discount_amount := v_discount_amount;
            NEW.total_amount := ROUND(v_items_subtotal - v_discount_amount);
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_transaction_total ON transactions;
CREATE TRIGGER trg_validate_transaction_total
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_recalculate_and_validate_transaction_total();


-- =========================================================================
-- STORAGE BUCKETS & SECURITY RULES (Audit 5.2)
-- Configure transaction receipts bucket to be PRIVATE and add RLS policies.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS storage;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'transaction-receipts', 
    'transaction-receipts', 
    FALSE,
    153600,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = FALSE, 
    file_size_limit = 153600,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner and Kasir can read transaction receipts" ON storage.objects;
CREATE POLICY "Owner and Kasir can read transaction receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'transaction-receipts'
    AND get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk')
);

DROP POLICY IF EXISTS "Kasir can upload transaction receipts" ON storage.objects;
CREATE POLICY "Kasir can upload transaction receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'transaction-receipts'
    AND get_current_user_role() = 'Kasir/Front Desk'
);

-- =========================================================================
-- DATABASE AUDIT LOGGING (Audit 3.9)
-- Strict financial tracking for transactions, customers, services, and appointments
-- =========================================================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_value JSONB,
    new_value JSONB,
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full control on audit_logs" 
ON audit_logs FOR ALL USING (get_current_user_role() = 'Owner/Manager');

-- Universal Trigger Function
CREATE OR REPLACE FUNCTION fn_log_table_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Extract user ID from Supabase auth session context
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::JSONB, v_user_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Triggers to Critical Tables
CREATE TRIGGER trg_audit_transactions
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION fn_log_table_activity();

CREATE TRIGGER trg_audit_services
AFTER INSERT OR UPDATE OR DELETE ON services
FOR EACH ROW EXECUTE FUNCTION fn_log_table_activity();

CREATE TRIGGER trg_audit_appointments
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION fn_log_table_activity();

CREATE TRIGGER trg_audit_customers
AFTER INSERT OR UPDATE OR DELETE ON customers
FOR EACH ROW EXECUTE FUNCTION fn_log_table_activity();
