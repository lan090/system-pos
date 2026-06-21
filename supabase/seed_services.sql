BEGIN;

-- 1. Truncate existing services (cascade to keep DB structure clean)
TRUNCATE TABLE public.services CASCADE;

-- 2. Insert Hair Cutting
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Pony / Bangs (Short/Min)', 35000.00, 'Hair Cutting', 15, TRUE, TRUE),
(gen_random_uuid(), 'Pony / Bangs (Long/Max)', 50000.00, 'Hair Cutting', 15, TRUE, TRUE),
(gen_random_uuid(), 'Kid''s Haircut (Short/Min)', 75000.00, 'Hair Cutting', 30, TRUE, TRUE),
(gen_random_uuid(), 'Kid''s Haircut (Long/Max)', 100000.00, 'Hair Cutting', 30, TRUE, TRUE),
(gen_random_uuid(), 'Man''s Haircut (Short/Min)', 75000.00, 'Hair Cutting', 30, TRUE, TRUE),
(gen_random_uuid(), 'Man''s Haircut (Long/Max)', 100000.00, 'Hair Cutting', 30, TRUE, TRUE),
(gen_random_uuid(), 'Short & Medium Hair (Short/Min)', 100000.00, 'Hair Cutting', 45, TRUE, TRUE),
(gen_random_uuid(), 'Short & Medium Hair (Medium/Max)', 145000.00, 'Hair Cutting', 45, TRUE, TRUE),
(gen_random_uuid(), 'Long Hair (Min)', 145000.00, 'Hair Cutting', 60, TRUE, TRUE),
(gen_random_uuid(), 'Long Hair (Max)', 185000.00, 'Hair Cutting', 60, TRUE, TRUE);

-- 3. Insert Hair Styling
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Wash & Dry (Min)', 40000.00, 'Hair Styling', 30, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Dry (Max)', 65000.00, 'Hair Styling', 30, TRUE, TRUE),
(gen_random_uuid(), 'Blow / Catok (Min)', 50000.00, 'Hair Styling', 30, TRUE, TRUE),
(gen_random_uuid(), 'Blow / Catok (Max)', 75000.00, 'Hair Styling', 30, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Catok (Min)', 65000.00, 'Hair Styling', 45, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Catok (Max)', 120000.00, 'Hair Styling', 45, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Blow (Min)', 75000.00, 'Hair Styling', 45, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Blow (Max)', 100000.00, 'Hair Styling', 45, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Curly (Min)', 75000.00, 'Hair Styling', 60, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Curly (Max)', 150000.00, 'Hair Styling', 60, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Blow/Catok/Curly (Extension) (Min)', 100000.00, 'Hair Styling', 75, TRUE, TRUE),
(gen_random_uuid(), 'Wash & Blow/Catok/Curly (Extension) (Max)', 180000.00, 'Hair Styling', 75, TRUE, TRUE),
(gen_random_uuid(), 'Simple Hair Do', 150000.00, 'Hair Styling', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Accessories (Min)', 10000.00, 'Hair Styling', 5, TRUE, TRUE),
(gen_random_uuid(), 'Hair Accessories (Max)', 50000.00, 'Hair Styling', 5, TRUE, TRUE),
(gen_random_uuid(), 'Hair Spray (Min)', 10000.00, 'Hair Styling', 5, TRUE, TRUE),
(gen_random_uuid(), 'Hair Spray (Max)', 20000.00, 'Hair Styling', 5, TRUE, TRUE),
(gen_random_uuid(), 'Hair Serum Premium', 15000.00, 'Hair Styling', 5, TRUE, TRUE),
(gen_random_uuid(), 'Hair Serum Expert L''Oréal', 20000.00, 'Hair Styling', 5, TRUE, TRUE);

-- 4. Insert Hair Extensions
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Jasa Pasang Extension (Min)', 10000.00, 'Hair Extensions', 10, TRUE, TRUE),
(gen_random_uuid(), 'Jasa Pasang Extension (Max)', 15000.00, 'Hair Extensions', 10, TRUE, TRUE),
(gen_random_uuid(), 'Hair Extension / Helai (Min)', 15000.00, 'Hair Extensions', 10, TRUE, TRUE),
(gen_random_uuid(), 'Hair Extension / Helai (Max)', 25000.00, 'Hair Extensions', 10, TRUE, TRUE);

-- 5. Insert Hair Perm
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Hair Perm Short (Min)', 300000.00, 'Hair Perm', 120, TRUE, TRUE),
(gen_random_uuid(), 'Hair Perm Short (Max)', 500000.00, 'Hair Perm', 120, TRUE, TRUE),
(gen_random_uuid(), 'Hair Perm Medium (Min)', 400000.00, 'Hair Perm', 120, TRUE, TRUE),
(gen_random_uuid(), 'Hair Perm Medium (Max)', 600000.00, 'Hair Perm', 120, TRUE, TRUE),
(gen_random_uuid(), 'Hair Perm Long (Min)', 500000.00, 'Hair Perm', 150, TRUE, TRUE),
(gen_random_uuid(), 'Hair Perm Long (Max)', 800000.00, 'Hair Perm', 150, TRUE, TRUE);

-- 6. Insert Hair Smoothing
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Short (Min)', 450000.00, 'Hair Smoothing', 150, TRUE, TRUE),
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Short (Max)', 650000.00, 'Hair Smoothing', 150, TRUE, TRUE),
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Medium (Min)', 550000.00, 'Hair Smoothing', 180, TRUE, TRUE),
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Medium (Max)', 750000.00, 'Hair Smoothing', 180, TRUE, TRUE),
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Long (Min)', 750000.00, 'Hair Smoothing', 180, TRUE, TRUE),
(gen_random_uuid(), 'Hair Smoothing (Jepang/Keratin/Matrix) Long (Max)', 950000.00, 'Hair Smoothing', 180, TRUE, TRUE),
(gen_random_uuid(), 'Extra SmartPlex (Min)', 150000.00, 'Hair Smoothing', 30, TRUE, TRUE),
(gen_random_uuid(), 'Extra SmartPlex (Max)', 200000.00, 'Hair Smoothing', 30, TRUE, TRUE);

-- 7. Insert Treatment Keratin Silky
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Keratin Silky Short (Min)', 500000.00, 'Treatment Keratin Silky', 120, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Silky Short (Max)', 700000.00, 'Treatment Keratin Silky', 120, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Silky Medium (Min)', 600000.00, 'Treatment Keratin Silky', 150, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Silky Medium (Max)', 800000.00, 'Treatment Keratin Silky', 150, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Silky Long (Min)', 700000.00, 'Treatment Keratin Silky', 180, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Silky Long (Max)', 1000000.00, 'Treatment Keratin Silky', 180, TRUE, TRUE);

-- 8. Insert Creambath Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Creambath Traditional', 100000.00, 'Creambath Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Creambath Matrix', 140000.00, 'Creambath Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Creambath Makarizo', 150000.00, 'Creambath Treatment', 60, TRUE, TRUE);

-- 9. Insert Hair Spa Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Hair Spa Keratin', 155000.00, 'Hair Spa Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Spa L''Oréal', 160000.00, 'Hair Spa Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Spa Biolage', 165000.00, 'Hair Spa Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Spa Shiseido', 185000.00, 'Hair Spa Treatment', 60, TRUE, TRUE);

-- 10. Insert Hair Mask Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Hair Mask Keratin', 165000.00, 'Hair Mask Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Mask Color', 175000.00, 'Hair Mask Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Mask Makarizo', 175000.00, 'Hair Mask Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Hair Mask Jepang', 185000.00, 'Hair Mask Treatment', 60, TRUE, TRUE);

-- 11. Insert Special Hair Treatments
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Scalp L''Oréal (Ketombe)', 185000.00, 'Special Hair Treatments', 60, TRUE, TRUE),
(gen_random_uuid(), 'Scalp L''Oréal (Ketombe) & Catok Soft', 215000.00, 'Special Hair Treatments', 75, TRUE, TRUE),
(gen_random_uuid(), 'Lice Treatment (Kutu)', 200000.00, 'Special Hair Treatments', 90, TRUE, TRUE),
(gen_random_uuid(), 'Nano Infusion Hair Glow', 275000.00, 'Special Hair Treatments', 90, TRUE, TRUE);

-- 12. Insert Nail Arts
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Nails Gel', 100000.00, 'Nail Arts', 45, TRUE, TRUE),
(gen_random_uuid(), 'Nails Gel Halal Party', 125000.00, 'Nail Arts', 60, TRUE, TRUE),
(gen_random_uuid(), 'Nails Cat Eye', 135000.00, 'Nail Arts', 60, TRUE, TRUE),
(gen_random_uuid(), 'Nails Motif (Min)', 2000.00, 'Nail Arts', 10, TRUE, TRUE),
(gen_random_uuid(), 'Nails Motif (Max)', 10000.00, 'Nail Arts', 30, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extra Blink (Min)', 5000.00, 'Nail Arts', 10, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extra Blink (Max)', 25000.00, 'Nail Arts', 30, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extensions (Min)', 7000.00, 'Nail Arts', 10, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extensions (Max)', 70000.00, 'Nail Arts', 60, TRUE, TRUE),
(gen_random_uuid(), 'Nails Remover (Min)', 5000.00, 'Nail Arts', 10, TRUE, TRUE),
(gen_random_uuid(), 'Nails Remover (Max)', 50000.00, 'Nail Arts', 30, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extension Remover (Min)', 10000.00, 'Nail Arts', 15, TRUE, TRUE),
(gen_random_uuid(), 'Nails Extension Remover (Max)', 100000.00, 'Nail Arts', 45, TRUE, TRUE);

-- 13. Insert Nails Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Express Manicure', 50000.00, 'Nails Treatment', 30, TRUE, TRUE),
(gen_random_uuid(), 'Classic Manicure', 80000.00, 'Nails Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'Classic Pedicure', 100000.00, 'Nails Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Callus Foot Removal (Min)', 125000.00, 'Nails Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'Callus Foot Removal (Max)', 150000.00, 'Nails Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'Callus Removal & Reflexy (Min)', 175000.00, 'Nails Treatment', 75, TRUE, TRUE),
(gen_random_uuid(), 'Callus Removal & Reflexy (Max)', 200000.00, 'Nails Treatment', 75, TRUE, TRUE);

-- 14. Insert Eyelash Extensions
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Eyelash Single Natural', 150000.00, 'Eyelash Extensions', 60, TRUE, TRUE),
(gen_random_uuid(), 'Eyelash Cat Eyes', 170000.00, 'Eyelash Extensions', 75, TRUE, TRUE),
(gen_random_uuid(), 'Eyelash Open Eyes', 180000.00, 'Eyelash Extensions', 75, TRUE, TRUE),
(gen_random_uuid(), 'Eyelash Double 2D', 200000.00, 'Eyelash Extensions', 90, TRUE, TRUE),
(gen_random_uuid(), 'Eyelash Double 3D', 250000.00, 'Eyelash Extensions', 90, TRUE, TRUE),
(gen_random_uuid(), 'Remover Eyelash', 50000.00, 'Eyelash Extensions', 20, TRUE, TRUE);

-- 15. Insert Make Up & Hair Do
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Make Up Maternity', 350000.00, 'Make Up & Hair Do', 60, TRUE, TRUE),
(gen_random_uuid(), 'Make Up Graduation', 300000.00, 'Make Up & Hair Do', 60, TRUE, TRUE),
(gen_random_uuid(), 'Make Up Party', 300000.00, 'Make Up & Hair Do', 60, TRUE, TRUE),
(gen_random_uuid(), 'Make Up Mom', 300000.00, 'Make Up & Hair Do', 60, TRUE, TRUE),
(gen_random_uuid(), 'Simple Hair Do', 150000.00, 'Make Up & Hair Do', 45, TRUE, TRUE),
(gen_random_uuid(), 'Soflens', 50000.00, 'Make Up & Hair Do', 5, TRUE, TRUE),
(gen_random_uuid(), 'Cukur Alis', 35000.00, 'Make Up & Hair Do', 15, TRUE, TRUE);

-- 16. Insert Keratin Lash Lift
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Keratin Lash Lift', 125000.00, 'Keratin Lash Lift', 45, TRUE, TRUE),
(gen_random_uuid(), 'Keratin Lash Lift & Tint', 145000.00, 'Keratin Lash Lift', 60, TRUE, TRUE);

-- 17. Insert Woman Face Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Totok Wajah (Woman)', 85000.00, 'Woman Face Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'Totok Wajah & Face Mask (Woman)', 100000.00, 'Woman Face Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Facial Latulip (Woman)', 125000.00, 'Woman Face Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Facial Biokos (Woman)', 145000.00, 'Woman Face Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Facial Biokos, Totok & Face Mask (Woman)', 185000.00, 'Woman Face Treatment', 90, TRUE, TRUE);

-- 18. Insert Man Face Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Totok Wajah (Man)', 100000.00, 'Man Face Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'Totok Wajah & Face Mask (Man)', 120000.00, 'Man Face Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Facial Biokos (Man)', 155000.00, 'Man Face Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Facial Biokos, Totok & Face Mask (Man)', 200000.00, 'Man Face Treatment', 90, TRUE, TRUE);

-- 19. Insert Waxing Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Waxing Underarm (Ketiak) (Min)', 65000.00, 'Waxing Treatment', 20, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Underarm (Ketiak) (Max)', 85000.00, 'Waxing Treatment', 20, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Tangan/Kaki (Min)', 100000.00, 'Waxing Treatment', 30, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Tangan/Kaki (Max)', 150000.00, 'Waxing Treatment', 30, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Full Body', 300000.00, 'Waxing Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Brazilian Waxing', 250000.00, 'Waxing Treatment', 45, TRUE, TRUE),
(gen_random_uuid(), 'IPL Underarm (Ketiak) (Min)', 75000.00, 'Waxing Treatment', 20, TRUE, TRUE),
(gen_random_uuid(), 'IPL Underarm (Ketiak) (Max)', 85000.00, 'Waxing Treatment', 20, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Underarm + IPL Underarm', 100000.00, 'Waxing Treatment', 35, TRUE, TRUE),
(gen_random_uuid(), 'Scrub Underarm + Waxing Underarm', 100000.00, 'Waxing Treatment', 35, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Underarm + Mask Underarm', 100000.00, 'Waxing Treatment', 35, TRUE, TRUE),
(gen_random_uuid(), 'Waxing Underarm + IPL + Scrub + Mask', 200000.00, 'Waxing Treatment', 50, TRUE, TRUE);

-- 20. Insert Woman Body Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Full Body Massage 60m (Woman)', 120000.00, 'Woman Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 90m (Woman)', 185000.00, 'Woman Body Treatment', 90, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 120m (Woman)', 215000.00, 'Woman Body Treatment', 120, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Lulur (Woman)', 110000.00, 'Woman Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Scrub (Woman)', 115000.00, 'Woman Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Bleaching (Woman)', 155000.00, 'Woman Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Lulur & Bleaching (Woman)', 245000.00, 'Woman Body Treatment', 100, TRUE, TRUE),
(gen_random_uuid(), 'Full Scrub & Bleaching (Woman)', 250000.00, 'Woman Body Treatment', 100, TRUE, TRUE);

-- 21. Insert Man Body Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Full Body Massage 60m (Man)', 175000.00, 'Man Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 90m (Man)', 235000.00, 'Man Body Treatment', 90, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 120m (Man)', 285000.00, 'Man Body Treatment', 120, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Lulur (Man)', 150000.00, 'Man Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Scrub (Man)', 155000.00, 'Man Body Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Bleaching (Man)', 185000.00, 'Man Body Treatment', 60, TRUE, TRUE);

-- 22. Insert Additional Services
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Coin Therapy', 50000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Ear Candle Therapy', 65000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Head Therapy', 75000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Totok Miss V', 75000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Ratus Miss V', 75000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Totok Payudara & Masker', 85000.00, 'Additional Service', 45, TRUE, TRUE),
(gen_random_uuid(), 'Totok Wajah (Add-on)', 85000.00, 'Additional Service', 30, TRUE, TRUE),
(gen_random_uuid(), 'Totok Wajah & Face Mask (Add-on)', 100000.00, 'Additional Service', 45, TRUE, TRUE);

-- 23. Insert Woman Reflexology
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Back Reflexy 30m (Woman)', 75000.00, 'Woman Reflexology', 30, TRUE, TRUE),
(gen_random_uuid(), 'Back Reflexy 60m (Woman)', 105000.00, 'Woman Reflexology', 60, TRUE, TRUE),
(gen_random_uuid(), 'Foot Reflexy 30m (Woman)', 85000.00, 'Woman Reflexology', 30, TRUE, TRUE),
(gen_random_uuid(), 'Foot Reflexy 60m (Woman)', 110000.00, 'Woman Reflexology', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Pack Reflexy 60m (Foot, Hand & Back) (Woman)', 145000.00, 'Woman Reflexology', 60, TRUE, TRUE);

-- 24. Insert Man Reflexology
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Back Reflexy 30m (Man)', 85000.00, 'Man Reflexology', 30, TRUE, TRUE),
(gen_random_uuid(), 'Back Reflexy 60m (Man)', 115000.00, 'Man Reflexology', 60, TRUE, TRUE),
(gen_random_uuid(), 'Foot Reflexy 30m (Man)', 95000.00, 'Man Reflexology', 30, TRUE, TRUE),
(gen_random_uuid(), 'Foot Reflexy 60m (Man)', 125000.00, 'Man Reflexology', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Pack Reflexy 60m (Foot, Hand & Back) (Man)', 155000.00, 'Man Reflexology', 60, TRUE, TRUE);

-- 25. Insert Pregnancy Treatment
INSERT INTO public.services (id, nama_layanan, harga_jual, kategori, duration_minutes, available_offline, is_active) VALUES
(gen_random_uuid(), 'Full Body Massage 60m (Pregnancy)', 135000.00, 'Pregnancy Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 90m (Pregnancy)', 200000.00, 'Pregnancy Treatment', 90, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Massage 120m (Pregnancy)', 230000.00, 'Pregnancy Treatment', 120, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Lulur (Pregnancy)', 125000.00, 'Pregnancy Treatment', 60, TRUE, TRUE),
(gen_random_uuid(), 'Full Body Scrub (Pregnancy)', 135000.00, 'Pregnancy Treatment', 60, TRUE, TRUE);

-- 26. Force reload postgrest schema
NOTIFY pgrst, 'reload schema';

COMMIT;
