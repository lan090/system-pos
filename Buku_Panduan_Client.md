# Buku Panduan Penggunaan & Kredensial Akses
## AuraDesk — Fenina Salon & Reflexology Management System (FSRMS v2.0)

Selamat datang di **AuraDesk (FSRMS v2.0)**, platform manajemen *Point of Sale* (POS), reservasi (appointment), dan basis data pelanggan yang dirancang khusus untuk operasional **Fenina Salon & Reflexology**. Dokumen ini berfungsi sebagai panduan serah terima sistem kepada klien, mencakup kredensial akses default, fitur utama, cara penggunaan, serta panduan teknis operasional.

---

## 🔑 1. Kredensial Akses Default (Akun Pengguna)

Sistem AuraDesk mengimplementasikan kontrol akses berbasis peran (*Role-Based Access Control* / RBAC) yang ketat. Berikut adalah akun default yang telah terkonfigurasi di database untuk pengujian dan penggunaan awal:

### A. Akun Owner / Manager (Akses Penuh)
Akun ini memiliki wewenang tertinggi untuk melihat laporan keuangan, mengelola katalog layanan, mendaftarkan staf/terapis, dan mengonfigurasi aturan keanggotaan.
*   **Email:** `owner@fenina.com`
*   **Username:** `owner`
*   **Password:** `ownerpassword`
*   **Role:** `Owner/Manager`
*   **Hak Akses Utama:**
    *   Melihat dashboard analitik & laporan keuangan *real-time*.
    *   Manajemen penuh basis data pelanggan (CRUD).
    *   Mengedit & menambah katalog layanan/perawatan.
    *   Mengatur konfigurasi tingkatan loyalitas (*membership tiers*).
    *   Manajemen staf & terapis (User Management).
    *   Melakukan verifikasi & kontrol sistem (Control Plane).

### B. Akun Kasir / Front Desk (Operasional POS)
Akun ini digunakan oleh staf kasir atau meja depan untuk melayani checkout pelanggan dan mengelola jadwal reservasi harian.
*   **Email:** `kasir@fenina.com`
*   **Username:** `kasir`
*   **Password:** `kasirpassword`
*   **Role:** `Kasir/Front Desk`
*   **Hak Akses Utama:**
    *   Menggunakan Terminal POS (mengisi keranjang, memproses checkout, cetak struk).
    *   Membuat, membaca, dan memperbarui profil pelanggan.
    *   Melihat katalog layanan (tidak dapat mengubah harga/layanan).
    *   Membuat & mengubah status reservasi (*appointments*).
    *   *Dibatasi:* Tidak dapat mengakses Dashboard Analitik Keuangan atau Manajemen Akun Staf.

> ⚠️ **PENTING UNTUK KEAMANAN:**
> Demi menjaga keamanan data operasional salon, mohon segera ganti kata sandi default di atas setelah sistem berhasil diserahterimakan dan dijalankan di lingkungan produksi (*production*).

---

## 🌟 2. Fitur & Modul Utama

AuraDesk dirancang sebagai aplikasi **Progressive Web App (PWA)** dengan kapabilitas **Offline-First**. Artinya, sistem dapat terus digunakan untuk melayani pelanggan meskipun koneksi internet salon terputus total.

### 💳 A. Terminal POS (Point of Sale)
Modul kasir yang responsif untuk mencatat penjualan layanan.
1.  **Keranjang Belanja (Cart):** Masukkan layanan yang dipilih pelanggan dengan satu klik dari katalog.
2.  **Diskon Dinamis:** Menerapkan diskon nominal atau persentase (membutuhkan persetujuan/override kode jika diatur oleh Owner).
3.  **Metode Pembayaran:** Mendukung Tunai (Cash), QRIS, dan Transfer Bank.
4.  **Cetak Struk:** Begitu transaksi selesai, sistem akan memicu dialog cetak struk otomatis (`window.print()`) untuk dicetak ke printer termal kasir.

### 🌐 B. Mode Offline & Auto-Sync (Teknologi Offline-First)
Jika koneksi internet salon terputus:
*   Aplikasi tetap berjalan normal tanpa kehilangan data.
*   Transaksi baru akan disimpan sementara secara lokal di dalam database browser terenkripsi (**IndexedDB** menggunakan enkripsi *AES-GCM*).
*   **Verifikasi Pembayaran Non-Tunai Offline:** Untuk pembayaran QRIS/Transfer saat offline, Kasir wajib mengisi nama pengirim (contoh: "BCA Mandiri Dian") atau mengambil foto bukti transfer menggunakan kamera perangkat. Gambar bukti transfer akan dikompres secara otomatis oleh sistem menjadi resolusi maksimal `800x600 px` (< 150 KB) untuk menghemat ruang penyimpanan cloud database.
*   **Sinkronisasi Otomatis:** Begitu koneksi internet kembali pulih (`navigator.onLine` mendeteksi jaringan), sistem akan otomatis mengunggah seluruh antrean transaksi lokal ke cloud database Supabase sesuai urutan waktu asli transaksi (*FIFO - First In First Out*).

### 👥 C. Database & Loyalitas Pelanggan (Customer & Membership)
*   **Validasi Data:** Nomor telepon pelanggan wajib berupa angka murni sepanjang 10-14 digit untuk mencegah duplikasi data.
*   **Kategori Loyalitas Otomatis (Membership Tier):**
    Tingkatan keanggotaan pelanggan akan diperbarui secara otomatis oleh server Supabase berdasarkan transaksi yang berstatus *Done*:
    *   **Silver:** Default untuk setiap pelanggan baru.
    *   **Gold:** Akumulasi transaksi melebihi **Rp 2.000.000** ATAU total kunjungan > **10 kali**.
    *   **Platinum:** Akumulasi transaksi melebihi **Rp 5.000.000** ATAU total kunjungan > **25 kali**.
    *   *Badge* keanggotaan (Silver, Gold, Platinum) akan langsung muncul secara visual saat kasir memanggil profil pelanggan di Terminal POS untuk memberikan layanan terbaik.

### 📅 D. Manajemen Reservasi (Appointment Board)
Mencegah bentrok jadwal terapis dan mengatur alur kunjungan pelanggan secara rapi.
*   **Alur Status Janji Temu:**
    `Scheduled` (Terjadwal) ➔ `In Progress` (Sedang Berjalan) ➔ `Done` (Selesai).
    *   Saat status diubah menjadi **In Progress**, sistem otomatis membuat draf belanja di POS Terminal dengan data pelanggan dan layanan yang dipesan.
    *   Status **Cancelled** (Dibatalkan) dapat diaktifkan jika pelanggan batal berkunjung.
*   **Validasi Bentrok (Double-booking Prevention):** Sistem akan menolak pembuatan reservasi baru jika terapis yang dipilih sudah memiliki jadwal pada tanggal dan jam yang sama.

---

## 💻 3. Cara Menjalankan Aplikasi di Lingkungan Lokal (Local Development)

Ikuti langkah-langkah berikut untuk menjalankan AuraDesk di perangkat Anda:

### Prerequisites (Prasyarat)
Pastikan perangkat Anda telah terinstal **Node.js** (versi 16 atau yang lebih baru).

### Langkah-langkah Instalasi:
1.  **Ekstrak Source Code:** Ekstrak file proyek AuraDesk ke direktori pilihan Anda.
2.  **Instal Dependensi:** Buka terminal (Command Prompt/PowerShell di Windows, atau Terminal di Mac/Linux) pada folder proyek tersebut, lalu jalankan:
    ```bash
    npm install
    ```
3.  **Konfigurasi Environment Variables:**
    Pastikan file `.env.local` di root direktori sudah memiliki konfigurasi Supabase Anda. Contoh isi `.env.local`:
    ```env
    VITE_SUPABASE_URL=https://vyiubqxjngvmrmqjnhfn.supabase.co
    VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    VITE_AUTH_SESSION_SECRET=fsrms-isolated-auth-static-fallback-key-2026
    ```
4.  **Jalankan Server Lokal:**
    Jalankan perintah berikut untuk memulai server development lokal:
    ```bash
    npm run dev
    ```
5.  **Akses Aplikasi:**
    Buka browser Anda dan akses alamat yang tertera di terminal, biasanya:
    ```
    http://localhost:5173
    ```

---

## 📲 4. Cara Instalasi Aplikasi PWA (Desktop & Mobile)

AuraDesk dapat diinstal layaknya aplikasi native di laptop, tablet, atau smartphone tanpa melalui Play Store atau App Store:

### 🖥️ Di PC / Laptop (Google Chrome / Microsoft Edge):
1.  Buka aplikasi AuraDesk di browser Google Chrome atau Edge.
2.  Lihat pada bagian kanan *Address Bar* (kolom URL), akan muncul ikon **Install** (gambar monitor dengan panah bawah).
3.  Klik ikon tersebut, lalu pilih **Install**.
4.  Aplikasi sekarang akan memiliki shortcut di desktop Anda dan dapat dibuka di jendela terpisah tanpa navigasi browser.

### 📱 Di Smartphone / Tablet (iOS Safari):
1.  Buka browser Safari dan akses URL AuraDesk yang telah dideploy (misalnya di Vercel).
2.  Ketuk tombol **Share** (ikon persegi dengan panah ke atas) di bagian bawah layar.
3.  Gulir ke bawah dan pilih **Add to Home Screen** (Tambahkan ke Layar Utama).
4.  Beri nama aplikasi "AuraDesk", lalu ketuk **Add**.

---

## 🛠️ 5. Pemecahan Masalah (Troubleshooting)

### A. Apa yang harus dilakukan jika ada transaksi bertanda "Quarantined" (Karantina)?
Jika jaringan internet mati dan kasir melakukan transaksi, lalu sistem dijalankan kembali dan mendeteksi adanya data transaksi lokal yang tidak sinkron secara struktur dengan database cloud (misal terjadi kerusakan data di IndexedDB), sistem akan memindahkan transaksi tersebut ke status **Quarantined** (Karantina) demi keamanan finansial.
*   **Solusi:**
    1.  Masuk sebagai **Owner/Manager**.
    2.  Buka tab **System Settings** di sidebar kiri.
    3.  Gulir ke bawah ke bagian **Queue Inspector**.
    4.  Anda dapat melihat daftar data yang terkena karantina, mengunduh data mentah transaksi tersebut untuk dicatat manual, atau menghubungi Tim IT untuk melakukan perbaikan/resync.

### B. Cara Memaksa Sinkronisasi Manual saat Kembali Online
Jika internet salon sempat mati lama dan Anda ingin memastikan semua antrean offline segera masuk ke server cloud:
1.  Buka **System Settings**.
2.  Di bawah bagian **Status Sinkronisasi Lokal**, klik tombol **"Paksa Hubungkan ke Supabase (FIFO Sync)"** jika status masih terdeteksi offline secara sepihak oleh browser.
3.  Sistem akan segera memproses antrean dan mengosongkan antrean offline IndexedDB.

---
*Dokumen ini merupakan bagian dari paket serah terima sistem informasi operasional Fenina Salon & Reflexology. Untuk dukungan teknis lebih lanjut, silakan hubungi tim pengembang.*
