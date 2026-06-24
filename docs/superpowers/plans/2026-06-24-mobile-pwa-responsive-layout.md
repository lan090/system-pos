# Mobile PWA Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengimplementasikan tampilan PWA yang responsif penuh untuk perangkat mobile (< 768px) pada sistem AuraDesk POS, termasuk navigasi bawah (Bottom Nav), katalog POS dengan laci belanja geser (FAB + Bottom Sheet), timeline janji temu vertikal, responsivitas Dashboard, serta penyesuaian halaman login/pengaturan.

**Architecture:** Mendeteksi lebar viewport di `src/App.tsx` menggunakan React state + event listener `'resize'`, menyembunyikan Sidebar statis di mobile dan menampilkan BottomNavigationBar, membungkus panel keranjang belanja POS dalam laci geser (bottom sheet) meluncur dari bawah yang diaktifkan oleh Floating Action Button (FAB) di mobile, dan menyaring visual matriks janji temu menjadi timeline vertikal per-terapis yang dipilih melalui horizontal swiper.

**Tech Stack:** React 19, Vite, Tailwind CSS v4, Lucide React (untuk ikon).

---

### Task 1: Responsive Layout Shell & Bottom Navigation Bar

**Files:**
- Modify: `src/App.tsx` (Implementasi deteksi layar, wrapper responsif, BottomNavigationBar mobile, dan Drawer Menu Lainnya)
- Modify: `src/components/Sidebar.tsx` (Penyembunyian sidebar di layar kecil)

- [ ] **Step 1: Modifikasi `src/components/Sidebar.tsx` agar tersembunyi pada layar mobile**
  Ganti kelas CSS pembungkus utama `<aside>` untuk menyembunyikannya pada layar kecil (< 768px):
  ```tsx
  // Target: line 58-59
  // Ganti:
  // return (
  //   <aside className="bg-white border-r border-[#FFE4EC] shadow-premium-sm h-screen w-[260px] fixed left-0 top-0 flex flex-col z-40 font-sans">
  // Menjadi:
  return (
    <aside className="hidden md:flex bg-white border-r border-[#FFE4EC] shadow-premium-sm h-screen w-[260px] fixed left-0 top-0 flex-col z-40 font-sans">
  ```

- [ ] **Step 2: Tambahkan deteksi ukuran layar di `src/App.tsx`**
  Definisikan state `isMobile` di dalam komponen `App()` (baris ~100):
  ```tsx
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  ```

- [ ] **Step 3: Sesuaikan padding dan layout `<main>` di `src/App.tsx`**
  Sesuaikan margin kiri dan padding bawah di `App.tsx` (baris ~1223):
  ```tsx
  // Modifikasi kelas CSS pada tag <main>
  <main className={`${isMobile ? 'ml-0 pb-20' : 'ml-[260px]'} flex-1 flex flex-col h-screen bg-[#FAF6F6] relative z-0`}>
  ```

- [ ] **Step 4: Tambahkan `BottomNavigationBar` dan Drawer "Lainnya" di `src/App.tsx`**
  Rerender navigasi bawah dan laci menu tambahan pada mobile. Tambahkan state drawer:
  ```tsx
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  ```
  Masukkan JSX `BottomNavigationBar` di dalam return `App.tsx` (di akhir main container, sebelum `<UpdateNotificationBanner />`):
  ```tsx
  {isMobile && (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#F2C6CE] flex justify-around items-center z-40 shadow-lg px-2">
      <button 
        onClick={() => { setCurrentTab('pos'); setIsMobileMenuOpen(false); }}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'pos' ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
      >
        <ShoppingBag className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Terminal POS</span>
      </button>
      <button 
        onClick={() => { setCurrentTab('appointments'); setIsMobileMenuOpen(false); }}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'appointments' ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
      >
        <Calendar className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Janji Temu</span>
      </button>
      <button 
        onClick={() => { setCurrentTab('customers'); setIsMobileMenuOpen(false); }}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${currentTab === 'customers' ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
      >
        <Users className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Pelanggan</span>
      </button>
      <button 
        onClick={() => setIsMobileMenuOpen(true)}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${isMobileMenuOpen ? 'text-[#C0365A] font-bold' : 'text-gray-400'}`}
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Lainnya</span>
      </button>
    </div>
  )}

  {/* Drawer Menu Lainnya */}
  {isMobile && isMobileMenuOpen && (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={() => setIsMobileMenuOpen(false)} />
      <div className="relative bg-white rounded-t-3xl p-6 shadow-2xl max-h-[70vh] overflow-y-auto space-y-5 animate-slide-up">
        <div className="flex justify-between items-center pb-2 border-b border-[#FFE4EC]">
          <h3 className="text-sm font-bold text-[#6B3A44] uppercase tracking-wider">AuraDesk Menu</h3>
          <button onClick={() => setIsMobileMenuOpen(false)} className="text-zinc-400 hover:text-zinc-600 font-bold p-1">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {userRole === 'Owner/Manager' && (
            <button 
              onClick={() => { setCurrentTab('dashboard'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'dashboard' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
            >
              <LayoutDashboard className="w-4 h-4 text-[#F7477B]" />
              <span>Dashboard</span>
            </button>
          )}
          <button 
            onClick={() => { setCurrentTab('catalog'); setIsMobileMenuOpen(false); }}
            className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'catalog' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
          >
            <Bookmark className="w-4 h-4 text-[#F7477B]" />
            <span>Katalog Layanan</span>
          </button>
          {userRole === 'Owner/Manager' && (
            <button 
              onClick={() => { setCurrentTab('users'); setIsMobileMenuOpen(false); }}
              className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'users' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
            >
              <Users className="w-4 h-4 text-[#F7477B]" />
              <span>Manajemen Staf</span>
            </button>
          )}
          <button 
            onClick={() => { setCurrentTab('settings'); setIsMobileMenuOpen(false); }}
            className={`flex items-center gap-3 p-3.5 border rounded-2xl ${currentTab === 'settings' ? 'bg-[#FFF0F5] border-[#F2C6CE] text-[#C0365A] font-bold' : 'border-zinc-100 text-zinc-600 hover:bg-zinc-50'}`}
          >
            <Settings className="w-4 h-4 text-[#F7477B]" />
            <span>Pengaturan</span>
          </button>
        </div>

        <div className="border-t border-[#FFE4EC] pt-4 flex flex-col gap-3.5">
          <div className="flex items-center gap-3 bg-[#FFF7FA] p-3 rounded-2xl border border-[#FFE4EC]">
            <div className="w-8 h-8 rounded-lg bg-[#F7477B] flex items-center justify-center text-white"><User className="w-4 h-4" /></div>
            <div>
              <span className="text-xs font-bold text-[#C0365A] block leading-tight">{currentUser.nama_lengkap}</span>
              <span className="text-[9px] font-bold text-gray-400 block uppercase mt-0.5">{userRole}</span>
            </div>
          </div>
          <button 
            onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
            className="w-full py-3 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-2xl text-xs flex justify-center items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Keluar Sistem
          </button>
        </div>
      </div>
    </div>
  )}
  ```

- [ ] **Step 5: Verifikasi perubahan App Shell**
  Jalankan build test lokal / lint: `npm run lint` untuk memastikan tidak ada kesalahan impor atau state.

---

### Task 2: Responsive POS Terminal View & FAB Cart Drawer

**Files:**
- Modify: `src/components/POSTerminalView.tsx` (Menyediakan layout tumpukan mobile, FAB, dan penanganan Bottom Sheet Drawer Keranjang)
- Modify: `src/components/pos/ProductCatalog.tsx` (Mengoptimalkan grid katalog di layar kecil)
- Modify: `src/components/pos/CartPanel.tsx` (Membuat laci checkout scrollable)

- [ ] **Step 1: Tambahkan deteksi mobile di `src/components/POSTerminalView.tsx`**
  Tambahkan prop `isMobile` ke type interface `POSTerminalViewProps` di `POSTerminalView.tsx` (line 37):
  ```tsx
  isMobile?: boolean;
  ```
  Masukkan state `isMobileCartOpen` di awal fungsi `POSTerminalView` (line 65):
  ```tsx
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  ```

- [ ] **Step 2: Modifikasi struktur kolom utama `POSTerminalView.tsx`**
  Sesuaikan pembungkus Flex layout utama agar menyembunyikan `CartPanel` statis pada mobile dan membungkusnya dalam Bottom Sheet jika `isMobileCartOpen` aktif:
  ```tsx
  // Target: line 809
  // Ganti:
  // return (
  //   <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full max-w-[1280px] mx-auto w-full overflow-hidden bg-[#FAFAFA] font-sans" id="pos-terminal-view">
  // Menjadi:
  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full max-w-[1280px] mx-auto w-full overflow-hidden bg-[#FAFAFA] font-sans relative" id="pos-terminal-view">
  ```
  Modifikasi bagian rendering `ProductCatalog` dan `CartPanel` (line 864-901):
  ```tsx
  {/* LEFT COLUMN: Product / Service Catalog */}
  <div className="flex-1 overflow-y-auto">
    <ProductCatalog
      filteredTreatments={filteredTreatments}
      cart={cart}
      addToCart={addToCart}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      onOpenCloseShift={() => setIsCloseShiftModalOpen(true)}
    />
  </div>

  {/* RIGHT COLUMN: Cart Panel (Statis di desktop, Drawer Geser di mobile) */}
  {!isMobile ? (
    <div className="w-[380px] flex-shrink-0">
      <CartPanel
        cart={cart}
        removeFromCart={removeFromCart}
        subtotal={subtotal}
        discountAmount={discountAmount}
        activeDiscount={activeDiscount}
        grandTotal={grandTotal}
        activeCustomer={activeCustomer}
        selectedCustomerId={selectedCustomerId}
        setSelectedCustomerId={setSelectedCustomerId}
        customers={customers}
        CHECKOUT_V2_ENABLED={CHECKOUT_V2_ENABLED}
        isCheckoutDisabled={isCheckoutDisabled}
        hasPendingClose={hasPendingClose}
        requiresOfflineVerification={requiresOfflineVerification}
        offlineVerificationMode={offlineVerificationMode}
        setOfflineVerificationMode={setOfflineVerificationMode}
        senderName={senderName}
        setSenderName={setSenderName}
        compressedImageMeta={compressedImageMeta}
        isCompressing={isCompressing}
        triggerFileSelect={triggerFileSelect}
        handleCheckout={handleCheckout}
        paymentMethod={paymentMethod}
        setPaymentMethod={setPaymentMethod}
        isOnline={isOnline}
      />
    </div>
  ) : (
    /* Laci Geser Keranjang Mobile */
    isMobileCartOpen && (
      <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-xs">
        <div className="absolute inset-0" onClick={() => setIsMobileCartOpen(false)} />
        <div className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col h-[85vh] animate-slide-up">
          <div className="px-6 py-4 border-b border-[#FFE4EC] flex justify-between items-center flex-shrink-0 bg-[#FFF7FA]">
            <div>
              <h3 className="text-sm font-bold text-[#6B3A44] uppercase tracking-wider">Keranjang Belanja</h3>
              <span className="text-[10px] text-zinc-400">Total: {cart.length} item layanan</span>
            </div>
            <button 
              onClick={() => setIsMobileCartOpen(false)} 
              className="text-zinc-400 hover:text-[#6B3A44] font-bold p-1 bg-white border border-[#FFE4EC] rounded-full w-8 h-8 flex items-center justify-center shadow-sm"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 pb-20">
            <CartPanel
              cart={cart}
              removeFromCart={removeFromCart}
              subtotal={subtotal}
              discountAmount={discountAmount}
              activeDiscount={activeDiscount}
              grandTotal={grandTotal}
              activeCustomer={activeCustomer}
              selectedCustomerId={selectedCustomerId}
              setSelectedCustomerId={setSelectedCustomerId}
              customers={customers}
              CHECKOUT_V2_ENABLED={CHECKOUT_V2_ENABLED}
              isCheckoutDisabled={isCheckoutDisabled}
              hasPendingClose={hasPendingClose}
              requiresOfflineVerification={requiresOfflineVerification}
              offlineVerificationMode={offlineVerificationMode}
              setOfflineVerificationMode={setOfflineVerificationMode}
              senderName={senderName}
              setSenderName={setSenderName}
              compressedImageMeta={compressedImageMeta}
              isCompressing={isCompressing}
              triggerFileSelect={triggerFileSelect}
              handleCheckout={async () => {
                await handleCheckout();
                setIsMobileCartOpen(false);
              }}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
              isOnline={isOnline}
            />
          </div>
        </div>
      </div>
    )
  )}

  {/* Floating Action Button (FAB) Keranjang di Mobile */}
  {isMobile && cart.length > 0 && !isMobileCartOpen && (
    <button 
      onClick={() => setIsMobileCartOpen(true)}
      className="fixed bottom-20 right-5 z-40 bg-gradient-to-r from-[#F7477B] to-[#C0365A] text-white font-extrabold py-3.5 px-6 rounded-full flex items-center gap-2 shadow-2xl animate-bounce hover:scale-105 active:scale-95 transition-all text-xs uppercase tracking-wider"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </span>
      <span>Tinjau Keranjang ({cart.length})</span>
      <span className="font-mono bg-white/20 px-2 py-0.5 rounded-md">Rp {(grandTotal / 1000).toFixed(0)}K</span>
    </button>
  )}
  ```

- [ ] **Step 3: Kirim prop `isMobile` ke `POSTerminalView` di `src/App.tsx`**
  Modifikasi pemanggilan komponen `POSTerminalView` di `src/App.tsx` (baris ~1418):
  ```tsx
  // Modifikasi tag pembuka:
  <POSTerminalView 
    treatments={treatments.filter(t => t.is_active !== false)} 
    onAddTransaction={handleNewTransaction}
    customers={customers}
    isOnline={isOnline}
    onRefreshQueues={loadQueueCounts}
    preFilledCart={posDraft}
    onClearPreFilledCart={() => setPosDraft(null)}
    discounts={discounts}
    currentUser={currentUser}
    isAuthReady={isAuthReady}
    offlineQueue={offlineQueue}
    isMobile={isMobile} // Tambahkan ini
  />
  ```

- [ ] **Step 4: Modifikasi layout `src/components/pos/ProductCatalog.tsx`**
  Ganti kelas CSS grid katalog agar responsif pada mobile. Buka file `src/components/pos/ProductCatalog.tsx` dan ubah:
  ```tsx
  // Ganti grid layout katalog agar dinamis 1 atau 2 kolom di layar kecil:
  // Misal mengubah grid layout kelas pembungkus:
  // "grid grid-cols-3 gap-4" -> "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4"
  ```

---

### Task 3: Adaptive Appointments View & Timeline Mobile

**Files:**
- Modify: `src/components/AppointmentsView.tsx` (Pemisahan tab terapis horizontal, timeline jam kerja vertikal, responsivitas drawer)

- [ ] **Step 1: Tambahkan deteksi layar mobile di `AppointmentsView.tsx`**
  Tambahkan pendeteksian `isMobile` di dalam komponen `AppointmentsView` (line 100):
  ```tsx
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  ```
  Masukkan state filter terapis mobile (pilih terapis default pertama):
  ```tsx
  const [selectedTherapistId, setSelectedTherapistId] = useState<string>('ALL');
  ```

- [ ] **Step 2: Desain layout matrix bersyarat di `AppointmentsView.tsx`**
  Ganti pembungkus matrix scheduling (line 324-429) dengan percabangan responsif:
  ```tsx
  {/* Kondisi Mobile vs Desktop */}
  {isMobile ? (
    <div className="space-y-4">
      {/* 1. Swiper Terapis Horizontal */}
      <div className="flex overflow-x-auto gap-2 p-3 bg-white border border-[#F5E1E4] rounded-2xl shadow-sm no-scrollbar scroll-smooth">
        <button 
          onClick={() => setSelectedTherapistId('ALL')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex-shrink-0 cursor-pointer ${
            selectedTherapistId === 'ALL' 
              ? 'bg-[#D98897] text-white shadow-sm' 
              : 'bg-[#FAF3F4] text-[#6B3A44] border border-[#F5E1E4]/50'
          }`}
        >
          Semua Terapis
        </button>
        {activeTherapists.map(t => (
          <button 
            key={t.id}
            onClick={() => setSelectedTherapistId(t.id)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex-shrink-0 cursor-pointer ${
              selectedTherapistId === t.id 
                ? 'bg-[#D98897] text-white shadow-sm' 
                : 'bg-[#FAF3F4] text-[#6B3A44] border border-[#F5E1E4]/50'
            }`}
          >
            {t.nama}
          </button>
        ))}
      </div>

      {/* 2. Timeline Jam Kerja Vertikal */}
      <div className="bg-white border border-[#F5E1E4] rounded-2xl shadow-md p-4 space-y-3 max-h-[600px] overflow-y-auto">
        {hours.map((hour) => {
          // Cari janji temu di jam ini untuk terapis yang difilter
          const matchedApps = dynamicAppointments.filter(app => {
            const matchesTime = app.timeSlot === hour;
            const matchesTherapist = selectedTherapistId === 'ALL' || app.therapistId === selectedTherapistId;
            return matchesTime && matchesTherapist;
          });

          return (
            <div key={hour} className="flex gap-4 items-start py-2 border-b border-zinc-100 last:border-0">
              <span className="w-12 text-xs font-mono font-bold text-[#6B3A44] pt-1">{hour}</span>
              <div className="flex-1 space-y-2">
                {matchedApps.length > 0 ? (
                  matchedApps.map(app => {
                    const catStyle = getPastelColor(app.category);
                    return (
                      <div 
                        key={app.id}
                        onClick={() => setSelectedAppIdForAction(app.id)}
                        className={`p-3 rounded-xl border-l-[3px] border ${catStyle.border} ${catStyle.borderLeft} ${catStyle.bg} cursor-pointer hover:shadow-sm`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-[#6B3A44]">{app.treatmentName}</span>
                          <span className="text-[9px] font-bold text-gray-400 font-mono uppercase">{app.therapistName}</span>
                        </div>
                        <p className="text-[11px] font-bold text-zinc-500 mt-1 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D98897]"></span>
                          {app.customerName}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  // Tombol tambah slot kosong
                  <button 
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        timeSlot: hour,
                        therapistId: selectedTherapistId !== 'ALL' ? selectedTherapistId : (activeTherapists[0]?.id || '')
                      }));
                      setIsDrawerOpen(true);
                    }}
                    className="w-full py-2.5 border border-dashed border-zinc-200 hover:border-[#D98897] rounded-xl flex items-center justify-center text-[10px] font-semibold text-zinc-400 hover:text-[#D98897] transition-all"
                  >
                    + Tambah Jadwal Slot {hour}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  ) : (
    /* Render Desktop Matrix (Baris-Kolom asli) */
    /* Taruh JSX Desktop Matrix di sini */
  )}
  ```

---

### Task 4: Responsive Secondary Views (Login, Dashboard, Customers, Settings)

**Files:**
- Modify: `src/components/LoginView.tsx` (Penyembunyian dekorasi gambar di mobile)
- Modify: `src/components/DashboardView.tsx` (Penyusunan grid metrik, chart, dan RLS banner)
- Modify: `src/components/QueueInspector.tsx` (Pembungkusan scroll horizontal untuk tabel log)

- [ ] **Step 1: Sembunyikan Ilustrasi Login di `src/components/LoginView.tsx`**
  Modifikasi pembungkus ilustrasi salon agar disembunyikan pada layar kecil (< 768px):
  ```tsx
  // Tambahkan kelas responsive "hidden md:block" atau "hidden lg:flex" pada kolom ilustrasi.
  // Pastikan form login mengambil lebar "w-full md:w-[450px] lg:w-[500px]" secara bersih.
  ```

- [ ] **Step 2: Rapikan layout Metrik Dashboard di `src/components/DashboardView.tsx`**
  Ganti kelas CSS pembungkus metrik agar menjadi tumpukan satu kolom di mobile:
  ```tsx
  // Contoh:
  // "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
  ```
  Bungkus grafik analitik ke dalam wrapper CSS yang responsif agar lebarnya `w-full` dengan horizontal scroll fallback jika dibutuhkan.

- [ ] **Step 3: Tambahkan pembungkus gulir horizontal di `src/components/QueueInspector.tsx`**
  Bungkus elemen `<table>` log sinkronisasi IndexedDB dengan kelas overflow:
  ```tsx
  <div className="overflow-x-auto w-full border border-[#F5E1E4] rounded-xl">
    <table className="min-w-full divide-y divide-zinc-200">
      {/* isi table */}
    </table>
  </div>
  ```

---

### Task 5: Verification & Verification Testing

- [ ] **Step 1: Jalankan dev server lokal**
  Run: `npm run dev`
- [ ] **Step 2: Buka browser menggunakan Playwright / Manual Inspector**
  Periksa visualisasi navigasi bottom nav, pembukaan FAB bottom sheet keranjang, pengguliran horizontal terapis janji temu, dan tumpukan grid dashboard pada lebar dimensi 390px (Mobile standard).
- [ ] **Step 3: Verifikasi build produksi**
  Run: `npm run build`
  Pastikan build berhasil tanpa peringatan TypeScript atau syntax error Tailwind v4.
