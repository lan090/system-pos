CREATE OR REPLACE FUNCTION seed_test_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_customer_id UUID;
  v_service_id UUID;
  v_result JSONB;
BEGIN
  -- Create or get User
  v_user_id := 'd0000000-0000-0000-0000-000000000001'::UUID;
  INSERT INTO users (id, email, nama_lengkap, role, is_active)
  VALUES (v_user_id, 'chaos-cashier@test.com', 'Chaos Cashier', 'Kasir/Front Desk', true)
  ON CONFLICT (id) DO NOTHING;
  
  -- Create or get Customer
  v_customer_id := '00000000-0000-0000-0000-000000000001'::UUID;
  INSERT INTO customers (id, nama_lengkap, nomor_telepon, membership_tier, total_omset, total_kunjungan)
  VALUES (v_customer_id, 'Chaos Customer', '081234567890', 'Silver', 0, 0)
  ON CONFLICT (id) DO NOTHING;
  
  -- Create or get Service
  v_service_id := '00000000-0000-0000-0000-000000000002'::UUID;
  INSERT INTO services (id, nama_layanan, harga_jual, kategori, is_active)
  VALUES (v_service_id, 'Chaos Service', 100000, 'Treatment', true)
  ON CONFLICT (id) DO NOTHING;
  
  v_result := jsonb_build_object(
    'customer_id', v_customer_id,
    'service_id', v_service_id,
    'processed_by', v_user_id
  );
  
  RETURN v_result;
END;
$$;
