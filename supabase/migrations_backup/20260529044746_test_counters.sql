CREATE OR REPLACE FUNCTION count_test_transactions(p_customer_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM transactions
  WHERE customer_id = p_customer_id;
  
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION delete_test_transactions(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM transactions
  WHERE customer_id = p_customer_id;
END;
$$;
