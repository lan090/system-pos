BEGIN;

-- Create trigger function to prevent replayed guest mutations from overwriting linked customer data
CREATE OR REPLACE FUNCTION fn_preserve_transaction_customer_link()
RETURNS TRIGGER AS $$
BEGIN
    -- If transaction is already linked to a customer, do not let it be overwritten by NULL
    IF OLD.customer_id IS NOT NULL AND NEW.customer_id IS NULL THEN
        NEW.customer_id := OLD.customer_id;
    END IF;
    
    -- Also, customer_name and customer_phone should not be overwritten by NULL if they exist
    IF OLD.customer_name IS NOT NULL AND NEW.customer_name IS NULL THEN
        NEW.customer_name := OLD.customer_name;
    END IF;
    
    IF OLD.customer_phone IS NOT NULL AND NEW.customer_phone IS NULL THEN
        NEW.customer_phone := OLD.customer_phone;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_customer_link ON transactions;

CREATE TRIGGER trg_preserve_customer_link
BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_preserve_transaction_customer_link();

COMMIT;
