# Desain Pengaturan Unduh Aplikasi PWA (AuraDesk)

Spesifikasi desain ini menjelaskan rencana implementasi untuk menambahkan fitur unduh/instal aplikasi PWA AuraDesk langsung dari menu **Pengaturan & Sinkronisasi**. Fitur ini akan mendeteksi status instalasi secara dinamis dan menyediakan panduan instalasi yang ramah pengguna berdasarkan sistem operasi dan browser yang digunakan.

---

## 1. Arsitektur & Logika Deteksi PWA (`usePWAInstall` Hook)

Kami akan membuat sebuah custom hook React baru di [usePWAInstall.ts](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/hooks/usePWAInstall.ts) untuk mengisolasi logika PWA:
* **State & Event Listener:**
  * Mendengarkan event `beforeinstallprompt` pada objek `window`.
  * Menyimpan event tersebut dalam state `deferredPrompt` agar bisa dipanggil nanti.
  * Mengatur state `isInstallable` menjadi `true` jika event tertangkap.
* **Deteksi Mode Standalone:**
  * Memeriksa apakah aplikasi sedang berjalan sebagai standalone app (sudah diinstal).
  * Kriteria pengecekan: `window.matchMedia('(display-mode: standalone)').matches` atau `(navigator as any).standalone === true` (khusus iOS Safari).
* **Deteksi Sistem Operasi (iOS/Safari):**
  * Mendeteksi perangkat iOS (iPhone/iPad) dengan memeriksa `navigator.userAgent`. Karena iOS Safari tidak mendukung `beforeinstallprompt`, pengguna iOS memerlukan panduan manual "Add to Home Screen".
* **Fungsi Instalasi (`triggerInstall`):**
  * Memanggil `.prompt()` pada event `deferredPrompt` yang disimpan.
  * Menunggu respon pilihan user (`choiceResult`).
  * Mereset state `deferredPrompt` setelah instalasi berhasil atau ditolak.

---

## 2. Rancangan Antarmuka Pengguna (UI) di Menu Pengaturan

Kami akan menambahkan kartu baru di tab **Pengaturan & Sinkronisasi** di [App.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/App.tsx) di bawah grid pengaturan yang sudah ada.

### 2.1 Kartu PWA Installer
* **Judul:** "Aplikasi Native Desktop & Mobile (PWA)"
* **Deskripsi:** "Jalankan AuraDesk sebagai aplikasi standalone untuk akses offline yang lebih cepat, ikon aplikasi di desktop/HP, dan pengalaman kerja yang lebih stabil."
* **Tiga Kondisi Tampilan (Dynamic UI States):**

#### A. Kondisi: Sudah Terinstal (Standalone Mode)
* **Visual:** Badge hijau dengan ikon centang (`CheckCircle` dari Lucide).
* **Teks:** "Aplikasi Terpasang (Standalone Mode)"
* **Subteks:** "AuraDesk saat ini berjalan sebagai aplikasi native terinstal. Anda mendapatkan performa optimal dan perlindungan data offline terbaik."
* **Tombol:** (Tidak ada tombol instal, hanya informasi status aktif).

#### B. Kondisi: Dapat Diinstal Secara Otomatis (Chrome, Edge, Android Chrome, dll.)
* **Visual:** Tombol instal utama berukuran besar dengan warna khas AuraDesk (`#F7477B` ke `#C0365A`).
* **Ikon:** `Download` dari Lucide.
* **Teks Tombol:** "Unduh & Pasang Aplikasi AuraDesk"
* **Subteks:** "Klik untuk memasang aplikasi langsung ke layar utama komputer atau handphone Anda secara instan."

#### C. Kondisi: Perangkat iOS / Safari (Panduan Manual)
* **Visual:** Tampilan langkah demi langkah (step-by-step) dengan latar belakang lembut `#FFF7FA`.
* **Langkah Panduan (Bahasa Indonesia):**
  1. Ketuk tombol **Bagikan (Share)** <kbd>📥</kbd> atau <kbd>⎋</kbd> di bagian bawah Safari.
  2. Gulir ke bawah dan pilih **"Tambahkan ke Layar Utama" (Add to Home Screen)** <kbd>＋</kbd>.
  3. Konfirmasi nama aplikasi dan ketuk **"Tambah" (Add)** di sudut kanan atas.

---

## 3. Detail Perubahan File

### 3.1 [NEW] `src/hooks/usePWAInstall.ts`
Berisi custom hook untuk melacak dan mengontrol status instalasi PWA.

### 3.2 [MODIFY] `src/App.tsx`
* Mengimpor dan menggunakan hook `usePWAInstall`.
* Menambahkan bagian UI baru di panel `{currentTab === 'settings' && (...)}` untuk menampilkan kartu instalasi PWA sesuai statusnya.

---

## 4. Rencana Pengujian (Verification Plan)

### 4.1 Pengujian Otomatis / Manual Simulator
* Membuka aplikasi menggunakan Google Chrome atau Microsoft Edge di localhost / dev server.
* Memastikan kartu PWA muncul di menu **Pengaturan & Sinkronisasi**.
* Menekan tombol "Unduh & Pasang Aplikasi AuraDesk" dan memverifikasi bahwa dialog instalasi native browser muncul.
* Melakukan instalasi, lalu memastikan tampilan berubah menjadi status **"Aplikasi Terpasang (Standalone Mode)"**.

### 4.2 Pengujian Perangkat Mobile (Responsive & Safari Simulator)
* Membuka web menggunakan Safari di iPhone atau simulator iOS.
* Memverifikasi bahwa kartu mendeteksi perangkat iOS dan menampilkan **"Panduan Instalasi Manual iOS Safari"** dengan instruksi langkah-demi-langkah.
