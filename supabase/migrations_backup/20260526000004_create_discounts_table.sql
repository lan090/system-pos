-- =========================================================================
-- MIGRATION: 20260526_004_create_discounts_table
-- Issue Fix: Audit Finding 2.2 & 3.8 — Create discounts table & associate customers/transactions
-- =========================================================================

BEGIN;

-- -------------------------------------------------------------------------
-- STEP 1: Create discounts table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discounts (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    nama        VARCHAR(100)  NOT NULL,
    tipe        VARCHAR(20)   NOT NULL CHECK (tipe IN ('percentage', 'nominal')),
    nilai       NUMERIC(12,2) NOT NULL CHECK (nilai > 0),
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Enable RLS on discounts
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- STEP 2: Add discount_id foreign key to customers
-- -------------------------------------------------------------------------
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL;

-- -------------------------------------------------------------------------
-- STEP 3: Add discount columns to transactions
-- -------------------------------------------------------------------------
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00;

-- -------------------------------------------------------------------------
-- STEP 4: Seed default discounts matching customer membership tiers
-- -------------------------------------------------------------------------
INSERT INTO discounts (id, nama, tipe, nilai, is_active)
VALUES 
    ('d0000000-0000-0000-0000-000000000010'::uuid, 'Platinum Member 10%', 'percentage', 10.00, TRUE),
    ('d0000000-0000-0000-0000-000000000005'::uuid, 'Gold Member 5%', 'percentage', 5.00, TRUE)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------------------
-- STEP 5: Associate existing customers with their respective tier discount
-- -------------------------------------------------------------------------
UPDATE customers 
SET discount_id = 'd0000000-0000-0000-0000-000000000010'::uuid
WHERE membership_tier = 'Platinum';

UPDATE customers 
SET discount_id = 'd0000000-0000-0000-0000-000000000005'::uuid
WHERE membership_tier = 'Gold';

-- -------------------------------------------------------------------------
-- STEP 6: Define RLS policies for discounts (idempotent: drop before create)
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Owner full control on Discounts" ON discounts;
CREATE POLICY "Owner full control on Discounts"
ON discounts FOR ALL
USING (get_current_user_role() = 'Owner/Manager');

DROP POLICY IF EXISTS "Kasir can read Discounts list" ON discounts;
CREATE POLICY "Kasir can read Discounts list"
ON discounts FOR SELECT
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

COMMIT;
