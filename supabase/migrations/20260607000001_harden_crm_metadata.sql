BEGIN;

-- 1. Make customer phone nullable
ALTER TABLE public.customers ALTER COLUMN nomor_telepon DROP NOT NULL;

-- 2. Create loyalty ledger table
CREATE TABLE IF NOT EXISTS public.customer_loyalty_ledger (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID        NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
    customer_id    UUID        NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    visits_count   INTEGER     NOT NULL DEFAULT 1 CHECK (visits_count >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Drop legacy trigger on transactions
DROP TRIGGER IF EXISTS trg_on_transaction_finished ON transactions;
DROP FUNCTION IF EXISTS fn_recalculate_loyalty_tier_and_visits();

-- 4. Create trigger to sync transaction done/void to ledger
CREATE OR REPLACE FUNCTION fn_sync_transaction_to_ledger()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'Done' AND NEW.customer_id IS NOT NULL THEN
        INSERT INTO customer_loyalty_ledger (transaction_id, customer_id, amount, visits_count)
        VALUES (NEW.id, NEW.customer_id, NEW.total_amount, 1)
        ON CONFLICT (transaction_id) DO UPDATE SET
            customer_id = EXCLUDED.customer_id,
            amount = EXCLUDED.amount;
    ELSIF NEW.status = 'Voided' THEN
        DELETE FROM customer_loyalty_ledger WHERE transaction_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_transaction_ledger
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_sync_transaction_to_ledger();

-- 5. Create trigger to recalculate customer aggregates from ledger
CREATE OR REPLACE FUNCTION fn_recalculate_customer_loyalty()
RETURNS TRIGGER AS $$
DECLARE
    v_omset NUMERIC(12,2);
    v_kunjungan INT;
    v_new_tier VARCHAR(20);
    v_cust_id UUID;
    v_exists BOOLEAN;
BEGIN
    v_cust_id := COALESCE(NEW.customer_id, OLD.customer_id);

    -- Ensure customer still exists (in case of cascade delete)
    SELECT EXISTS(SELECT 1 FROM customers WHERE id = v_cust_id) INTO v_exists;
    IF NOT v_exists THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(SUM(amount), 0.00), COALESCE(SUM(visits_count), 0)
    INTO v_omset, v_kunjungan
    FROM customer_loyalty_ledger
    WHERE customer_id = v_cust_id;

    IF v_omset >= 5000000.00 AND v_kunjungan >= 25 THEN v_new_tier := 'Platinum';
    ELSIF v_omset >= 2000000.00 AND v_kunjungan >= 10 THEN v_new_tier := 'Gold';
    ELSE v_new_tier := 'Silver';
    END IF;

    UPDATE customers
    SET total_omset = v_omset,
        total_kunjungan = v_kunjungan,
        membership_tier = v_new_tier
    WHERE id = v_cust_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recalculate_loyalty
AFTER INSERT OR UPDATE OR DELETE ON customer_loyalty_ledger
FOR EACH ROW
EXECUTE FUNCTION fn_recalculate_customer_loyalty();

-- 6. Enforce customer link immutability for non-managers
CREATE OR REPLACE FUNCTION fn_enforce_customer_link_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role VARCHAR(50);
BEGIN
    IF OLD.status = 'Done' AND OLD.customer_id IS NOT NULL THEN
        IF NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
            BEGIN
                v_user_role := get_current_user_role();
            EXCEPTION WHEN OTHERS THEN
                v_user_role := 'Terapis';
            END;

            IF v_user_role <> 'Owner/Manager' THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Customer link on finalized transactions can only be modified by Owner/Manager.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_customer_immutability
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_enforce_customer_link_immutability();

COMMIT;
