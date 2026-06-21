#!/bin/bash

# Pastikan variabel lingkungan sudah diatur
if [ -z "$SUPABASE_ACCESS_TOKEN" ] || [ -z "$PROJECT_REF" ]; then
    echo "❌ Error: SUPABASE_ACCESS_TOKEN atau PROJECT_REF belum diatur di terminal."
    exit 1
fi

echo "===================================================="
# 1. OTOMATISASI: Memulihkan Project jika Statusnya 'Paused'
echo "🔄 [1/3] Memeriksa & Mengaktifkan kembali proyek jika di-pause..."
UNPAUSE_RES=$(curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/unpause" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")

echo "Respon Unpause: $UNPAUSE_RES"
# Catatan: Jika proyek sudah aktif, API akan mengembalikan pesan error/notifikasi bahwa proyek tidak paused. Lanjutkan proses.

echo "----------------------------------------------------"
# 2. OTOMATISASI: Memperbarui "Allowed Origins" (Mengatasi CORS di Layer Cloud)
echo "🌐 [2/3] Mengonfigurasi Allowed Origins menjadi '*' untuk Staging/Testing..."
# Payload ini memaksa API Gateway Supabase mengizinkan seluruh origin eksternal (PWA)
CORS_RES=$(curl -s -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/api" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_origins": ["*"]
  }')

echo "Respon Konfigurasi API: $CORS_RES"

echo "----------------------------------------------------"
# 3. VERIFIKASI: Mengambil Anon Key Terbaru untuk Sinkronisasi .env.local
echo "🔑 [3/3] Mengambil Anon Key aktif dari Supabase Cloud untuk verifikasi lokal..."
KEYS_RES=$(curl -s -X GET "https://api.supabase.com/v1/projects/$PROJECT_REF/api-keys" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN")

# Ekstrak anon key menggunakan grep/sed sederhana (jika jq tidak terinstall)
ANON_KEY=$(echo $KEYS_RES | grep -o '"api_key":"[^"]*' | head -n 1 | cut -d'"' -f4)

if [ -n "$ANON_KEY" ]; then
    echo "✅ Berhasil mengambil Anon Key terbaru."
    echo "Silakan pastikan kunci ini sama dengan VITE_SUPABASE_ANON_KEY di file .env.local Anda:"
    echo "----------------------------------------------------"
    echo "$ANON_KEY"
    echo "----------------------------------------------------"
else
    echo "❌ Gagal mengekstrak Anon Key. Respon API: $KEYS_RES"
fi

echo "===================================================="
echo "🎉 Proses otomatisasi selesai. Silakan restart dev server PWA Anda."
