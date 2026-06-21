-- Uses ON CONFLICT (id) DO UPDATE SET to resolve the Silent Data Suppression bug
CREATE OR REPLACE FUNCTION upsert_transaction(p_transaction_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_updated_at TIMESTAMPTZ;
BEGIN
  v_id := (p_transaction_payload->>'id')::UUID;
  v_updated_at := COALESCE((p_transaction_payload->>'updated_at')::TIMESTAMPTZ, NOW());

  INSERT INTO transactions (
    id, customer_id, processed_by, appointment_id, discount_id, 
    discount_amount, payment_method, offline_sender, offline_media, 
    status, total_amount, created_at, updated_at
  ) VALUES (
    v_id,
    (p_transaction_payload->>'customer_id')::UUID,
    (p_transaction_payload->>'processed_by')::UUID,
    (p_transaction_payload->>'appointment_id')::UUID,
    (p_transaction_payload->>'discount_id')::UUID,
    COALESCE((p_transaction_payload->>'discount_amount')::NUMERIC, 0),
    p_transaction_payload->>'payment_method',
    p_transaction_payload->>'offline_sender',
    p_transaction_payload->>'offline_media',
    p_transaction_payload->>'status',
    (p_transaction_payload->>'total_amount')::NUMERIC,
    COALESCE((p_transaction_payload->>'created_at')::TIMESTAMPTZ, NOW()),
    v_updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_id = EXCLUDED.customer_id,
    processed_by = EXCLUDED.processed_by,
    appointment_id = EXCLUDED.appointment_id,
    discount_id = EXCLUDED.discount_id,
    discount_amount = EXCLUDED.discount_amount,
    payment_method = EXCLUDED.payment_method,
    offline_sender = EXCLUDED.offline_sender,
    offline_media = EXCLUDED.offline_media,
    status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    updated_at = EXCLUDED.updated_at
  WHERE transactions.updated_at < EXCLUDED.updated_at;

  -- Process cart items if present
  IF p_transaction_payload ? 'cart' THEN
    DECLARE
      cart_item JSONB;
    BEGIN
      FOR cart_item IN SELECT * FROM jsonb_array_elements(p_transaction_payload->'cart')
      LOOP
        INSERT INTO transaction_items (transaction_id, service_id, price_at_sale)
        VALUES (
          v_id,
          (cart_item->>'service_id')::UUID,
          (cart_item->>'price')::NUMERIC
        )
        ON CONFLICT DO NOTHING; -- Assuming you might have a conflict on ID, though they use random UUIDs
      END LOOP;
    END;
  END IF;

END;
$$;
