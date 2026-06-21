**DESAIN DATABASE RELASIONAL**

Entity Relationship Diagram (ERD) & Data Dictionary

**Fenina Salon & Reflexology Management System (FSRMS)**

*Berdasarkan Functional Requirements Document (FRD) v2.0*

|  |  |
|----|----|
| **Arsitektur Platform** | Supabase (PostgreSQL & Storage), PWA Offline-First |
| **Strategi Primary Key** | UUIDv4 (gen_random_uuid) untuk seluruh tabel |
| **Standar Normalisasi** | Third Normal Form (3NF) dengan denormalisasi terkontrol |
| **Keamanan Akses** | Row-Level Security (RLS) berbasis peran: Owner, Kasir, Terapis |
| **Target Performa** | Pencarian profil & katalog di bawah 0.5 detik |
| **Disusun oleh** | Senior Database Architect |

Daftar Isi

1\. Pendahuluan

Dokumen ini memuat hasil analisis **Functional Requirements Document (FRD) versi 2.0** untuk Fenina Salon & Reflexology Management System (FSRMS). Sistem dirancang berjalan di atas arsitektur modern menggunakan Supabase (PostgreSQL & Storage) dengan kapabilitas offline-first melalui PWA.

Untuk memastikan sistem dapat menangani konkurensi tinggi, sinkronisasi data offline yang andal, serta pencarian super cepat di bawah 0.5 detik, dokumen ini menyajikan desain database relasional yang profesional, scalable, dan siap pakai --- mencakup ERD, kamus data, analisis relasi, normalisasi, dan strategi scaling.

2\. Entity Relationship Diagram (ERD)

Desain ini menggunakan arsitektur **UUIDv4** untuk semua Primary Key. Hal ini sangat krusial bagi sistem offline-first agar perangkat kasir dapat menggenerasi ID unik secara lokal di IndexedDB tanpa menunggu respon dari cloud database server.

![Entity Relationship Diagram Fenina Salon Management System](media/0b0e6af3e7a87edecaedd5dde70167ffcb630919.png "ERD FSRMS"){width="5.833333333333333in" height="6.1875in"}

*Gambar 1. Entity Relationship Diagram FSRMS (6 entitas inti)*

3\. Data Dictionary & Struktur Tabel

Sesuai kebijakan keamanan yang diamanatkan, kontrol ketat hak akses wajib diterapkan di tingkat database menggunakan **Supabase Row-Level Security (RLS)** berdasarkan peran pengguna (Owner, Kasir, Terapis).

3.1 Tabel: users

*Fungsi: Menyimpan data kredensial staf dan peran untuk manajemen akses (RBAC).*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **email** | VARCHAR(255) | NOT NULL | -- | UNIQUE, validasi format email |
| **role** | VARCHAR(50) | NOT NULL | -- | CHECK IN (\'Owner/Manager\', \'Kasir/Front Desk\', \'Terapis\') |

3.2 Tabel: customers

*Fungsi: Mengelola basis data profil pelanggan dan status loyalitas (Membership).*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **nama_lengkap** | VARCHAR(150) | NOT NULL | -- | -- |
| **nomor_telepon** | VARCHAR(14) | NOT NULL | -- | UNIQUE, CHECK angka murni 10--14 digit |
| **catatan_khusus** | TEXT | YES | NULL | Preferensi / catatan riwayat pelanggan |
| **membership_tier** | VARCHAR(20) | NOT NULL | \'Silver\' | CHECK IN (\'Silver\', \'Gold\', \'Platinum\') |
| **total_omset** | NUMERIC(12,2) | NOT NULL | 0.00 | Agregasi otomatis untuk kalkulasi tier |
| **total_kunjungan** | INTEGER | NOT NULL | 0 | Agregasi jumlah kunjungan sukses |

3.3 Tabel: services

*Fungsi: Katalog referensi layanan, kategori, dan harga resmi salon.*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **nama_layanan** | VARCHAR(150) | NOT NULL | -- | -- |
| **harga_jual** | NUMERIC(12,2) | NOT NULL | -- | CHECK (harga_jual \> 0) --- tidak boleh minus/nol |
| **kategori** | VARCHAR(100) | NOT NULL | -- | Pengelompokan jenis perawatan |

3.4 Tabel: appointments

*Fungsi: Mengatur jadwal reservasi harian dan mendeteksi konflik penjadwalan terapis.*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **customer_id** | UUID | NOT NULL | -- | FOREIGN KEY → customers.id |
| **therapist_id** | UUID | NOT NULL | -- | FOREIGN KEY → users.id |
| **appointment_ts** | TIMESTAMPTZ | NOT NULL | -- | Kombinasi jam & tanggal janji temu |
| **status** | VARCHAR(30) | NOT NULL | \'Scheduled\' | CHECK IN (\'Scheduled\', \'In Progress\', \'Done\', \'Cancelled\') |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Constraint Unik (Conflict Handling)</strong></p>
<p><strong>UNIQUE (appointment_ts, therapist_id)</strong> wajib diterapkan untuk memvalidasi bahwa seorang terapis tidak dapat mengambil dua jadwal di jam yang sama. Jika bentrok, server otomatis menolak input.</p></td>
</tr>
</tbody>
</table>

3.5 Tabel: transactions

*Fungsi: Menyimpan data utama checkout pembayaran baik online maupun antrean offline.*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | -- | PRIMARY KEY (digenerate dari PWA jika offline) |
| **customer_id** | UUID | NOT NULL | -- | FOREIGN KEY → customers.id |
| **payment_method** | VARCHAR(30) | NOT NULL | -- | CHECK IN (\'Cash\', \'QRIS\', \'Bank Transfer\') |
| **offline_sender** | VARCHAR(100) | YES | NULL | Opsi A offline: nama pengirim transfer |
| **offline_media** | VARCHAR(512) | YES | NULL | Opsi B offline: URL bukti di Supabase Storage (\<150KB) |
| **status** | VARCHAR(20) | NOT NULL | \'Draft\' | CHECK IN (\'Draft\', \'Done\') |
| **total_amount** | NUMERIC(12,2) | NOT NULL | 0.00 | Nilai total final setelah diskon/penyesuaian |
| **created_at** | TIMESTAMPTZ | NOT NULL | NOW() | Timestamp asli transaksi saat dibuat di kasir |
| **synchronized_at** | TIMESTAMPTZ | YES | NULL | Penanda kapan data offline berhasil diunggah |

3.6 Tabel: transaction_items

*Fungsi: Mengatasi relasi many-to-many antara transaksi dan layanan (menguraikan array service_id).*

| **Field** | **Tipe Data** | **Nullable** | **Default** | **Constraint / Aturan Bisnis** |
|----|----|----|----|----|
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **transaction_id** | UUID | NOT NULL | -- | FOREIGN KEY → transactions.id, ON DELETE CASCADE |
| **service_id** | UUID | NOT NULL | -- | FOREIGN KEY → services.id |
| **price_at_sale** | NUMERIC(12,2) | NOT NULL | -- | Mengunci harga jual saat transaksi (audit-safe) |

4\. Penjelasan Relasi Database

- **One-to-Many (customers → appointments / transactions):** Satu pelanggan dapat melakukan banyak reservasi serta menghasilkan banyak rekam transaksi sejarah pembelian.

- **One-to-Many (users → appointments):** Satu user dengan role Terapis dapat memiliki banyak agenda janji temu terdaftar dalam satu hari kerja.

- **Many-to-Many (transactions ↔ services):** Satu transaksi POS kasir dapat memuat kombinasi beberapa layanan sekaligus (misal: Potong Rambut + Reflexology). Relasi ini diurai melalui tabel jembatan transaction_items guna mencegah redundansi data dan memenuhi kaidah normalisasi.

5\. Analisis Normalisasi

Database ini dirancang memenuhi kriteria **3NF (Third Normal Form)** untuk menjaga konsistensi data operasional:

- **1NF (First Normal Form):** Seluruh atribut bernilai atomik. Array service_id dari input aplikasi kasir telah dipecah ke baris terisolasi pada tabel transaction_items.

- **2NF (Second Normal Form):** Seluruh tabel memiliki Primary Key berbasis UUID tunggal, sehingga tidak ada ketergantungan parsial (partial dependency).

- **3NF (Third Normal Form):** Tidak ada ketergantungan transitif (transitive dependency) antar atribut non-key.

5.1 Catatan Denormalisasi Terkontrol

Pada tabel customers, field membership_tier, total_omset, dan total_kunjungan secara teoritis merupakan nilai turunan (derived values). Namun, untuk memenuhi target performa (\<0.5 detik saat kasir memanggil profil pelanggan), data ini dihitung di latar belakang menggunakan **Database Trigger** Supabase ketika status transaksi berubah menjadi \'Done\'. Ini adalah praktik best-practice industri untuk menghindari query SUM() berat secara real-time pada tabel transaksi yang terus membengkak.

6\. Rekomendasi Arsitektur & Strategi Scaling

6.1 Strategi Indexing untuk Performa Tinggi (\<0.5 Detik)

PostgreSQL menggunakan struktur data B-Tree secara default. Untuk mempercepat pencarian data oleh kasir, terapkan indeks berikut:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p>-- Mempercepat pencarian profil pelanggan (M03)</p>
<p>CREATE INDEX idx_customers_search</p>
<p>ON customers (nama_lengkap, nomor_telepon);</p>
<p>-- Mempercepat pencarian katalog menu di halaman POS (M04)</p>
<p>CREATE INDEX idx_services_catalog</p>
<p>ON services (nama_layanan, kategori);</p>
<p>-- Mempercepat dashboard finansial Owner (M06)</p>
<p>CREATE INDEX idx_transactions_dashboard</p>
<p>ON transactions (status, created_at)</p>
<p>WHERE status = 'Done';</p></td>
</tr>
</tbody>
</table>

6.2 Query Optimization via Database Views

Guna menghindari query kompleks dari frontend yang membebani database utama saat Owner membuka dashboard, logika analitik dibungkus ke dalam PostgreSQL View:

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p>CREATE VIEW v_owner_dashboard_metrics AS</p>
<p>SELECT</p>
<p>SUM(total_amount) AS total_pendapatan_hari_ini,</p>
<p>COUNT(id) AS total_transaksi_sukses</p>
<p>FROM transactions</p>
<p>WHERE status = 'Done'</p>
<p>AND created_at::date = CURRENT_DATE;</p>
<p>-- Catatan: transaksi offline terhitung setelah sinkronisasi</p></td>
</tr>
</tbody>
</table>

6.3 Strategi Scaling Database & Optimalisasi Free-Tier

1.  **UUIDv4 untuk Sinkronisasi Handal:** Karena urutan unggah antrean offline berbasis timestamp asli, penggunaan UUID menjamin tidak ada tabrakan kunci (key collision) ketika dua perangkat kasir mendaftarkan transaksi baru dalam kondisi offline secara bersamaan.

2.  **Manajemen Supabase Storage (Batas 1 GB):** Aturan ketat frontend untuk kompresi foto bukti transfer maksimal 150 KB dilindungi di sisi database dengan Storage Bucket Policy yang menolak file lebih dari 150 KB, guna menghemat kuota penyimpanan gratis.

3.  **Database Partitioning (Masa Depan):** Jika volume transaksi melampaui 100.000 data per tahun, tabel transactions dan transaction_items dapat dipartisi menggunakan Range Partitioning berbasis kolom created_at (per bulan atau per tahun) untuk menjaga ukuran indeks tetap ramping dan query tetap responsif.
