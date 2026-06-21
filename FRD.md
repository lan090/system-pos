**FUNCTIONAL REQUIREMENTS DOCUMENT**

**(FRD)**

**Fenina Salon & Reflexology**

**Management System**

**( F S R M S )**

|  |  |
|----|----|
| **Version** | 2.0 --- Final Approved Specification |
| **Arsitektur** | PWA (Vite + Tailwind CSS) \| Supabase (PostgreSQL & Storage) \| Vercel |
| **Klasifikasi** | Internal --- Developer & QA Production Reference |
| **Status** | Final & Sah |

**DOKUMEN INTERNAL --- RAHASIA PERUSAHAAN**

**Daftar Isi**

1\. Pendahuluan & Matriks Hak Akses (RBAC)

FSRMS adalah platform Progressive Web App (PWA) internal enterprise yang berfungsi mendigitalisasi operasional ritel tunggal Fenina Salon & Reflexology. Dokumen ini menjadi panduan mutlak bagi tim Developer untuk proses coding dan tim QA untuk penyusunan test case.

1.1 Matriks Peran dan Izin Akses (Roles & Permissions)

Hak akses dikontrol ketat di sisi klien dan diperkuat di sisi server menggunakan *Supabase Row-Level Security (RLS)*.

| **Modul / Fitur** | **Owner / Manager** | **Kasir / Front Desk** | **Terapis** |
|:---|:---|:---|:---|
| **M01: Authentication** | Full Access | Login, Logout | No Access |
| **M02: POS Terminal** | View Only / Override Diskon | Full Access (Cart, Checkout) | No Access |
| **M03: Customer DB** | Full Access (CRUD) | Create, Read, Update | Read Only |
| **M04: Service Catalog** | Full Access (CRUD Catalog) | Read Only (Quick-add) | Read Only |
| **M05: Membership** | Konfigurasi Aturan Tier | View Badge & Assign | View Badge Only |
| **M06: Dashboard** | Full Analytics & Reports | No Access | No Access |
| **M07: Appointment** | Full Access | Input & Update Status | View Schedule |

2\. Arsitektur PWA & Kebijakan Offline

Sistem wajib berjalan secara reliable meskipun koneksi internet salon mengalami gangguan total.

2.1 Sinkronisasi Data dan Mekanisme Penyimpanan

- **Kondisi Online ---** Data langsung dibaca dan ditulis ke cloud database Supabase (PostgreSQL).

- **Kondisi Offline ---** UI PWA tetap berfungsi penuh menggunakan aset yang di-cache oleh Service Worker (**@vitejs/plugin-pwa**) dengan strategi **StaleWhileRevalidate**. Data transaksi baru dialihkan secara otomatis ke IndexedDB (Lokal Browser).

- **Mekanisme Auto-Sync ---** Sistem wajib memonitor status jaringan via Event Listener **navigator.onLine**. Begitu koneksi internet pulih, antrean transaksi di IndexedDB otomatis diunggah (background sync) ke Supabase berurutan berdasarkan timestamp asli transaksi.

3\. Aturan Bisnis (Business Rules)

3.1 Otomatisasi Tingkatan Keanggotaan (Membership Tier)

Mengatasi celah spesifikasi pada konsep awal, peningkatan tier dihitung otomatis oleh database trigger di server Supabase setelah transaksi berstatus *Done*:

- **Silver (Default) ---** Diberikan otomatis kepada setiap pelanggan baru yang terdaftar.

- **Gold ---** Upgrade otomatis jika akumulasi transaksi \> Rp2.000.000 ATAU total kunjungan \> 10 kali.

- **Platinum ---** Upgrade otomatis jika akumulasi transaksi \> Rp5.000.000 ATAU total kunjungan \> 25 kali.

3.2 Siklus Hidup Janji Temu (Appointment State)

Transisi status reservasi bersifat searah dan wajib mematuhi aturan berikut:

- **Scheduled** ➔ **In Progress** ➔ **Done** (Memicu pembuatan draf transaksi di POS).

- Status **Cancelled** dapat diaktifkan dari state **Scheduled** maupun **In Progress** (State akhir, tidak bisa diubah lagi).

4\. Workflows & User Stories

4.1 Alur Kerja Utama: Proses Checkout POS Terminal

*Alur berikut berlaku untuk kondisi Online maupun Offline. Titik percabangan utama berada pada verifikasi pembayaran non-tunai.*

<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<tbody>
<tr>
<td colspan="2" style="text-align: center;"><strong>MULAI · Cari Profil Pelanggan · Masukkan Layanan ke Cart · Pilih Metode Pembayaran</strong></td>
</tr>
<tr>
<td colspan="2" style="text-align: center;"><strong>▼</strong></td>
</tr>
<tr>
<td style="text-align: center;"><strong>KONDISI ONLINE</strong></td>
<td style="text-align: center;"><strong>KONDISI OFFLINE</strong></td>
</tr>
<tr>
<td style="text-align: center;"><strong>Pilih QRIS / Transfer</strong></td>
<td style="text-align: center;"><strong>Pilih QRIS / Transfer</strong></td>
</tr>
<tr>
<td style="text-align: center;"><strong>Cek Validasi Sistem</strong></td>
<td style="text-align: center;"><strong>Pilih Opsi: Input Nama / Foto Bukti</strong></td>
</tr>
<tr>
<td colspan="2" style="text-align: center;"><strong>▼</strong></td>
</tr>
<tr>
<td colspan="2" style="text-align: center;"><strong>Simpan ke Database (Supabase / IndexedDB)</strong></td>
</tr>
<tr>
<td colspan="2" style="text-align: center;"><strong>▼</strong></td>
</tr>
<tr>
<td colspan="2" style="text-align: center;"><strong>Picu Dialog Cetak Struk ➔ SELESAI</strong></td>
</tr>
</tbody>
</table>

4.2 User Stories & Kriteria Penerimaan

**User Story Kasir --- Efisiensi Pembayaran Offline**

Sebagai Kasir, saya ingin tetap bisa memproses pembayaran non-tunai (QRIS/Transfer) milik pelanggan dengan cepat meski internet mati, tanpa harus mengetik nomor referensi bank yang panjang.

**Kriteria Penerimaan**

- Sistem menyediakan opsi ambil foto bukti transfer atau ketik nama singkat.

- Kamera terbuka dalam waktu \< 1 detik dan gambar dikompresi secara otomatis.

- Checkout dapat diselesaikan dalam waktu **\< 2 menit** dalam kondisi offline.

5\. Spesifikasi Fungsional Detil per Modul

M01 --- Authentication & Access Control

> **Tujuan:** Membatasi akses masuk sistem dan mengidentifikasi peran pengguna.
>
> **Trigger:** Pengguna membuka URL PWA.
>
> **Input:** Email, Password.
>
> **Proses:** Autentikasi via Supabase Auth. Jika sukses, sistem membaca data **role** pengguna dan membuka halaman sesuai hak aksesnya.
>
> **Output:** Pengalihan ke halaman **/pos** (Kasir) atau **/dashboard** (Owner).
>
> **Error Handling:** Jika kredensial salah atau jaringan mati saat login pertama, tampilkan pesan: *"Gagal masuk. Periksa email/password atau koneksi internet Anda."*

M02 --- POS Terminal (Titik Penjualan)

> **Tujuan:** Memproses transaksi penjualan layanan secara terstandarisasi.
>
> **Trigger:** Kasir memicu proses pembayaran pelanggan.
>
> **Input: customer_id**, **service_id** (Array), **discount_id** (Opsional), **payment_method** (Cash/QRIS/Bank Transfer), **offline_verification_media** (Opsional).
>
> **Proses Terkait Fitur Offline Non-Cash:**

1.  Jika status sistem Offline DAN **payment_method** bernilai QRIS atau Bank Transfer, sistem memunculkan komponen Offline Verification.

2.  Kasir memilih salah satu dari dua opsi wajib:

    - **Opsi A (Teks Singkat) ---** Kasir menginput nama pengirim (Contoh: "BCA Mandiri Dian").

    - **Opsi B (Foto Kamera) ---** Kasir mengambil foto bukti transfer di HP pelanggan. Frontend wajib mengompresi gambar otomatis menjadi resolusi maks 800x600 px, format .jpg/.webp, ukuran \< 150 KB.

3.  Data dibungkus ke dalam Object transaksi lokal dan disimpan ke IndexedDB.

> **Output:** ID Transaksi unik (lokal/cloud) dan pemicu dialog cetak struk (**window.print()**).
>
> **Kondisi Gagal:** Kasir memilih QRIS saat offline tetapi tidak mengisi nama pengirim ataupun mengambil foto. Tombol *"Selesaikan Transaksi"* terkunci otomatis.

M03 --- Customer Management

> **Tujuan:** CRUD data pelanggan dan riwayat kunjungan.
>
> **Trigger:** Pendaftaran pelanggan baru atau pembukaan profil di kasir.
>
> **Input:** Nama Lengkap, Nomor Telepon (Unique), Catatan/Notes Khusus.
>
> **Validasi Input:** Nomor telepon wajib divalidasi berupa angka murni (10-14 digit). Jika duplikat, munculkan peringatan: *"Nomor sudah terdaftar atas nama \[Nama Pelanggan\]."*

M04 --- Service Catalog

> **Tujuan:** Manajemen daftar layanan, kategori, dan harga resmi salon.
>
> **Trigger:** Owner menambah/mengubah data menu perawatan.
>
> **Input:** Nama Layanan, Harga Jual (Rupiah), Kategori.
>
> **Validasi:** Input harga tidak boleh bernilai minus atau nol.

M05 --- Membership Management

> **Tujuan:** Menampilkan tingkatan keanggotaan loyalitas pelanggan secara visual.
>
> **Trigger:** Kasir memanggil data pelanggan di POS Terminal.
>
> **Output:** Badge visual berwarna khusus (Silver/Gold/Platinum) yang tertera pada profil pelanggan.

M06 --- Dashboard & Analytics (Sederhana untuk MVP)

> **Tujuan:** Memberikan laporan ringkas performa bisnis real-time kepada Owner.
>
> **Trigger:** Owner mengakses halaman dashboard.
>
> **Output:** Panel metrik berisi: Total Pendapatan Hari Ini, Total Transaksi Sukses, Grafik Donut "Top Services".
>
> **Catatan Offline:** Laporan finansial pada dashboard tidak akan menghitung transaksi offline sebelum kasir salon kembali online dan melakukan sinkronisasi data ke cloud server.

M07 --- Appointment Management

> **Tujuan:** Mengatur penjadwalan harian terapis agar teratur dan tidak bentrok.
>
> **Trigger:** Input reservasi baru oleh kasir.
>
> **Input:** Nama Pelanggan, Jam & Tanggal Janji Temu, Terapis Terpilih.
>
> **Conflict Handling:** Sistem wajib memvalidasi kombinasi **tanggal + jam + terapis**. Jika slot sudah terisi, sistem menolak penyimpanan dan memunculkan error: *"Terapis telah dijadwalkan pada jam tersebut."*

6\. Kebutuhan Non-Fungsional

6.1 Performa & Batasan Penyimpanan (Storage Limits)

- **Kecepatan Query ---** Pencarian nama pelanggan atau katalog di POS wajib di bawah 0.5 detik memanfaatkan efisiensi indexing data PostgreSQL Supabase.

- **Optimasi Free-Tier ---** Karena batas media penyimpanan gratis Supabase Storage adalah 1 GB, sistem secara ketat membatasi ukuran unggahan gambar bukti transfer maksimal 150 KB per transaksi lewat skrip kompresi otomatis di frontend sebelum proses upload berjalan.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Pernyataan QA &amp; Developer Readiness</strong></p>
<p><em>Dokumen FRD v2.0 ini telah dinyatakan final dan sah. Seluruh kriteria penanganan offline, validasi input, serta aturan kompresi media wajib diimplementasikan penuh tanpa pengecualian demi menjaga kestabilan sistem di lapangan.</em></p></td>
</tr>
</tbody>
</table>
