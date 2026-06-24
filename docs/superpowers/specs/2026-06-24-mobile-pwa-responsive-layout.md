# Desain Layout Mobile PWA (AuraDesk - Fenina Salon & Reflexology)

Dokumen spesifikasi desain ini merinci implementasi tampilan Progressive Web App (PWA) khusus mobile pada sistem FSRMS (AuraDesk). Desain ini mengoptimalkan seluruh modul aplikasi agar ramah jempol (thumb-friendly), responsif pada layar kecil (< 768px), serta mempertahankan keandalan offline-first.

---

## 1. Tata Letak Utama (App Shell & Navigation)

Tujuan utama bagian ini adalah menyembunyikan navigasi desktop sidebar tradisional dan menggantinya dengan bottom navigation bar khusus mobile.

### 1.1 Responsive Shell di `src/App.tsx`
* **Desktop (width >= 768px):**
  * `Sidebar` statis tetap tampil di sebelah kiri (`w-[260px]`).
  * Tag `<main>` memiliki kelas CSS `ml-[260px]`.
  * `BottomNavigationBar` tidak dirender.
* **Mobile (width < 768px):**
  * `Sidebar` disembunyikan (`hidden`).
  * Tag `<main>` disesuaikan menjadi `ml-0` dan ditambahkan padding bawah `pb-20` agar konten tidak bertumpuk dengan navigasi bawah.
  * Menampilkan komponen `BottomNavigationBar` di bagian paling bawah layar.

### 1.2 Komponen `BottomNavigationBar` (Mobile-Only)
Bar navigasi yang diposisikan secara absolut di bagian bawah layar:
* **Posisi:** `fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#FFE4EC] h-16 px-4 flex justify-around items-center`
* **Tombol Navigasi:**
  1. **POS** (Ikon: `ShoppingBag`, Tab Target: `'pos'`)
  2. **Appointments** (Ikon: `Calendar`, Tab Target: `'appointments'`)
  3. **Customers** (Ikon: `Users`, Tab Target: `'customers'`)
  4. **Lainnya** (Ikon: `Menu` atau `MoreHorizontal`, Membuka Bottom Sheet menu tambahan)

### 1.3 Bottom Sheet "Menu Lainnya"
Saat tab "Lainnya" ditekan, bottom sheet geser ke atas akan muncul:
* **Posisi & Efek:** `fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs`
* **Daftar Menu Tambahan:**
  * **Dashboard** (Hanya dirender jika `userRole === 'Owner/Manager'`)
  * **Katalog Layanan** (Tab Target: `'catalog'`)
  * **Manajemen Pengguna** (Tab Target: `'users'`, hanya jika Owner/Manager)
  * **Pengaturan & Sinkronisasi** (Tab Target: `'settings'`)
  * **Sesi Info & Keluar:** Menampilkan nama user aktif, role, dan tombol **Keluar Sistem (Logout)**.

---

## 2. Terminal Kasir (POS Terminal Mobile)

Mengubah visual POS yang sebelumnya terbagi atas kolom kiri (katalog) dan kolom kanan (keranjang) menjadi alur mobile yang interaktif menggunakan Floating Action Button (FAB) dan Bottom Sheet.

### 2.1 Modifikasi `POSTerminalView.tsx`
* **Struktur Layout Utama:**
  * Menggunakan CSS responsive Tailwind pada grid pembungkus: `flex-col lg:flex-row`.
  * Pada mobile, katalog layanan (`ProductCatalog`) mengambil lebar penuh layar (`w-full`), sementara panel keranjang (`CartPanel`) disembunyikan dari rendering utama di kanan.
* **Floating Action Button (FAB) Keranjang:**
  * Dirender hanya di mobile saat keranjang belanja terisi (`cart.length > 0`).
  * **Posisi:** `fixed bottom-20 right-5 z-40`
  * **Visual:** Tombol melingkar dengan gradasi warna `#F7477B` ke `#C0365A`, bayangan melayang yang kuat (`shadow-lg`), efek hover/active skala dinamis, dan teks badge jumlah item, misalnya: `🛒 3 Layanan`.
* **Laci Keranjang (Cart Bottom Sheet):**
  * Ketika FAB diklik, state `isMobileCartOpen` disetel menjadi `true`.
  * Laci geser meluncur dari bawah: `fixed inset-x-0 bottom-0 top-16 z-50 rounded-t-3xl bg-white shadow-2xl flex flex-col`.
  * Di dalam laci ini, komponen `CartPanel` dirender secara utuh dengan tinggi yang menyesuaikan laci, memiliki scroll bar internal pada list belanjaan, dan tombol pembayaran besar di bagian bawah yang *sticky*.

---

## 3. Matriks Janji Temu Mobile (Appointments Mobile)

Menyederhanakan grid matrix jadwal terapis yang padat menjadi timeline terarah pada layar kecil.

### 3.1 Modifikasi `AppointmentsView.tsx`
* **Saringan Terapis Horizontal (Horizontal Swipeable Tab Bar):**
  * Pada mobile, baris header terapis yang statis diganti dengan container horizontal scroll: `flex overflow-x-auto gap-2 p-4 bg-white border-b border-[#FFE4EC]`.
  * Menampilkan tombol pilihan terapis: "Semua Terapis" serta tombol individu nama terapis aktif.
* **Timeline Vertikal Jam Kerja:**
  * Menampilkan satu daftar timeline vertikal jam kerja dari 09:00 hingga 17:00.
  * Jika terapis tertentu dipilih: Tampilkan slot waktu hari itu untuk terapis tersebut. Jika jam terisi, tampilkan kartu detail janji temu dengan warna sesuai kategorinya. Jika kosong, tampilkan area bersih bergaris putus-putus dengan tombol tambah `(+)` untuk langsung mengisi reservasi pada jam tersebut.
  * Jika "Semua Terapis" terpilih: Tampilkan seluruh janji temu hari itu secara kronologis.
* **Form Booking & Aksi Modal:**
  * Laci pendaftaran reservasi baru (`New Booking`) dibuat lebar penuh (`w-full`) di layar mobile agar input nama pelanggan, terapis, layanan, dan jam mulai terasa nyaman.
  * Modal detail aksi jadwal diperkecil fit dengan rasio layar mobile.

---

## 4. Responsivitas Halaman Pendukung

### 4.1 Login View (`LoginView.tsx`)
* Di desktop, terdapat ilustrasi salon lebar di sisi kiri.
* Di mobile (`hidden md:block` pada pembungkus gambar), gambar ilustrasi disembunyikan. Pembungkus form login meregang penuh (`w-full max-w-md mx-auto py-8 px-6`).

### 4.2 Dashboard (`DashboardView.tsx`)
* Kisi metrik utama diubah dari `grid-cols-2 lg:grid-cols-4` menjadi `grid-cols-1 md:grid-cols-2` pada mobile.
* Container grafik dibuat responsif agar meregang penuh mengikuti lebar layar HP dengan tinggi dinamis.

### 4.3 Basis Data Pelanggan & Katalog Layanan
* Pencarian data diletakkan di bagian atas secara sticky.
* Daftar list pelanggan atau katalog diubah menjadi tumpukan kartu vertikal (`flex flex-col gap-3`) dengan informasi badge (Silver, Gold, Platinum) yang terlihat jelas.

### 4.4 Pengaturan & Queue Inspector (`QueueInspector.tsx`)
* Panel telemetri IndexedDB dan ringkasan antrean disesuaikan menjadi tumpukan vertikal.
* Tabel mutasi transaksi offline yang belum disinkronkan dibungkus kelas `overflow-x-auto` agar data tidak pecah dan dapat digeser ke samping kanan-kiri.

---

## 5. Rencana Pengujian (Verification Plan)

### 5.1 Pengujian Responsif (Layout & Navigasi)
* Mengubah ukuran viewport browser ke ukuran Mobile (iPhone 12/13/14 Pro - 390x844px).
* Memastikan sidebar desktop menghilang dan Bottom Navigation Bar muncul di bawah.
* Menguji penekanan tombol "Lainnya" untuk memastikan drawer menu meluncur dengan benar dan dapat berpindah halaman.

### 5.2 Pengujian Alur POS Terminal Mobile
* Membuka halaman POS Terminal di viewport mobile.
* Memilih layanan dari katalog dan memastikan FAB Keranjang muncul di kanan bawah dengan jumlah item yang sesuai.
* Menekan FAB Keranjang untuk memastikan laci bottom sheet terbuka meluncur ke atas.
* Melakukan checkout transaksi via QRIS/Transfer dalam kondisi offline, memastikan form verifikasi media/teks pengirim tampil dan tombol checkout dapat ditekan.
* Memastikan struk thermal tercetak pas sesuai lebar viewport cetak.

### 5.3 Pengujian Matriks Janji Temu Mobile
* Membuka halaman Appointments di mobile.
* Memastikan horizontal swiper terapis tampil dan memfilter jadwal dengan benar saat ditekan.
* Menguji klik tombol `(+)` pada jam kosong untuk membuka form pendaftaran reservasi.
