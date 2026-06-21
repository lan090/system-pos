-- Migration: Fix Membership Tier Race Condition (Issue 3.6 & 7.1)
-- Strategy: Atomic Inline Update with RETURNING clause
-- Added support for 'Voided' status to properly decrement loyalty stats

-- 1. Update the transaction status constraint to include 'Voided'
ALTER TABLE transactions DROP CONSTRAINT chk_transaction_status;
ALTER TABLE transactions ADD CONSTRAINT chk_transaction_status CHECK (status IN ('Draft', 'Done', 'Voided'));

-- 2. Refactor the trigger function for atomic update
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
        IF (v_omset > 5000000.00 OR v_kunjungan > 25) THEN
            v_new_tier := 'Platinum';
        ELSIF (v_omset > 2000000.00 OR v_kunjungan > 10) THEN
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

-- 3. Replace the trigger to fire on 'Done' or 'Voided'
DROP TRIGGER IF EXISTS trg_on_transaction_finished ON transactions;
CREATE TRIGGER trg_on_transaction_finished
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW
WHEN (NEW.status IN ('Done', 'Voided'))
EXECUTE FUNCTION fn_recalculate_loyalty_tier_and_visits();
