-- Migration: Add is_active to services (Issue 3.5)
-- Ensures catalog items can be logically disabled without breaking historical transaction data.

ALTER TABLE services 
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Create an index to speed up filtering of active services in the POS catalog
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active) WHERE is_active = TRUE;
-- Migration: Fix Composite Index Ordering (Issue 3.10)
-- Replaces the inefficient composite index with a targeted B-Tree for exact phone matching
-- and a highly optimized GIN index for partial/full-text name matching.

-- 1. Drop the incorrect composite index
DROP INDEX IF EXISTS idx_customers_search;

-- 2. Create optimized B-Tree index for phone numbers
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (nomor_telepon);

-- 3. Create high-performance GIN index for text search
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers USING GIN (to_tsvector('indonesian', nama_lengkap));
-- Migration: Add Void Transaction Flow (Issue 2.7 & 3.12)
-- Enables secure tracking of voided transactions to prevent financial discrepancies

ALTER TABLE transactions
ADD COLUMN voided_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN voided_at TIMESTAMPTZ,
ADD COLUMN void_reason TEXT;

-- Note: The chk_transaction_status constraint and loyalty recalculation trigger
-- have already been updated in a previous migration to support 'Voided' status.
-- Migration: Add Shift Management (Issue 2.8)
-- Introduces a daily cash shift ledger to ensure strict financial reconciliation

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

-- Enable RLS on cash_shifts
ALTER TABLE cash_shifts ENABLE ROW LEVEL SECURITY;

-- Allow cashiers to manage their own shifts and managers to see all
CREATE POLICY "Cashiers can manage their shifts" 
ON cash_shifts FOR ALL TO authenticated 
USING (cashier_id = auth.uid() OR get_current_user_role() = 'Owner/Manager');

-- Link transactions to their respective shift
ALTER TABLE transactions 
ADD COLUMN shift_id UUID REFERENCES cash_shifts(id) ON DELETE RESTRICT;

-- Index for quickly finding active shifts
CREATE INDEX idx_cash_shifts_active ON cash_shifts (cashier_id, status) WHERE status = 'Open';
-- Migration: Fix Membership Logic (Issue 2.4)
-- Changes loyalty tier threshold calculation from OR to strict AND conditions

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

    -- Tier Progression logic based on the atomically updated variables (Issue 2.4 Fix)
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
