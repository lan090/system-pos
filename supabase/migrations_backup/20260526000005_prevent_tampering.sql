BEGIN;

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

COMMIT;
