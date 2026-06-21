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
