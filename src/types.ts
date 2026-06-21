// =========================================================================
// src/types.ts
// FSRMS v2.0 — Type Definitions
// Updated: 2026-05-26 | Fix: Audit 2.1a — Therapist decoupled from users auth
// =========================================================================

// -------------------------------------------------------------------------
// Therapist — standalone scheduling entity, NOT a system auth user
// Sourced from: therapists table (id, nama, is_active)
// -------------------------------------------------------------------------
export interface Therapist {
  id: string;
  nama: string;
  is_active: boolean;
  created_at?: string;
}

// -------------------------------------------------------------------------
// Discount — dynamic promotion logic (Issue 2.2 & 3.8)
// Sourced from: discounts table
// -------------------------------------------------------------------------
export interface Discount {
  id: string;
  nama: string;
  tipe: 'percentage' | 'nominal';
  nilai: number;
  is_active: boolean;
  created_at?: string;
}

// -------------------------------------------------------------------------
// Treatment / Service Catalog item
// Sourced from: services table
// -------------------------------------------------------------------------
export interface Treatment {
  id: string;
  nama_layanan: string;
  kategori: string;
  harga_jual: number;
  duration?: number;      // maps to duration_minutes (audit fix — field to be added)
  description?: string | null;
  availableOffline?: boolean;
  is_active?: boolean;
  icon?: string;
  isPending?: boolean;
}

// -------------------------------------------------------------------------
// Customer / Pelanggan
// Sourced from: customers table
// -------------------------------------------------------------------------
export interface Customer {
  id: string;
  name: string;           // maps to nama_lengkap
  phone: string;          // maps to nomor_telepon
  discount_id?: string;   // FK → discounts.id (dynamic promotion coupling)
  totalVisits: number;    // maps to total_kunjungan
  totalOmset?: number;    // maps to total_omset
  joinDate?: string;
  tier: 'Platinum' | 'Gold' | 'Silver';  // maps to membership_tier
  email?: string;
  notes?: string;         // maps to catatan_khusus
  customer_type?: 'STANDARD' | 'PARTIAL';
}

// -------------------------------------------------------------------------
// Appointment — scheduling record
// BREAKING CHANGE: therapist is now Therapist object (was hardcoded string union)
// therapist_id → references therapists.id, NOT users.id
// -------------------------------------------------------------------------
export interface Appointment {
  id: string;
  customer_id?: string;
  patientName: string;           // display name (from customers.nama_lengkap)
  therapist_id: string;          // FK → therapists.id
  therapistName: string;         // derived from therapists.nama (for display)
  /** @deprecated Use therapistName instead. Kept for backward compat during migration. */
  therapist?: string;
  therapistTitle?: string;
  service_id: string;            // FK → services.id (audit fix — service_id is mandatory)
  label: string;                 // display: treatment name
  startTime: string;             // HH:MM format
  endTime: string;               // HH:MM format
  status?: 'Scheduled' | 'In Progress' | 'Done' | 'Cancelled';
  isConflict?: boolean;
  conflictMessage?: string;
  dashed?: boolean;
  notes?: string;
  appointment_ts?: string;       // ISO 8601 — raw DB field
  created_at?: string;
}

// -------------------------------------------------------------------------
// Cart Item — POS terminal
// -------------------------------------------------------------------------
export interface CartItem {
  treatment: Treatment;
  quantity: number;
}

// -------------------------------------------------------------------------
// Offline Transaction Queue item (IndexedDB)
// -------------------------------------------------------------------------
export interface OfflineTransaction {
  id: string;              // UUIDv4 generated locally
  session_id: string;      // UUIDv4 generated locally, always present
  customer_id?: string | null; // Nullable for guest checkout
  customer_name?: string | null; // Customer name (guest/registered)
  customer_phone?: string | null; // Customer phone (guest/registered)
  processed_by: string;    // FK → users.id (casher tracking)
  operator_name?: string;  // Nama kasir aktif dari sesi shift harian
  appointment_id?: string; // Sourced from appointments.id (optional)
  discount_id?: string;    // Sourced from discounts.id (optional)
  discount_amount: number; // Recorded precise currency subtraction (mandatory)
  payment_method: 'Cash' | 'QRIS' | 'Bank Transfer';
  offline_sender?: string; // Opsi A: nama pengirim
  offline_media?: string;  // Opsi B: base64 image (pre-upload)
  status: 'Draft' | 'Done';
  total_amount: number;
  items: OfflineTransactionItem[];
  cart: any[];
  created_at: string;      // ISO — timestamp of original transaction
  synchronized_at?: string;
}

export interface GuestCheckoutInfo {
  customer_name?: string | null;
  customer_phone?: string | null;
}


export interface OfflineTransactionItem {
  service_id: string;
  price_at_sale: number;
  quantity: number;
}

// -------------------------------------------------------------------------
// CashShift — sesi shift harian kasir (Pendekatan 2: nama kasir dinamis)
// Sourced from: cash_shifts table
// operator_name: nama kasir asli yang bertugas, dideklarasikan saat buka shift
// -------------------------------------------------------------------------
export interface CashShift {
  id: string;
  cashier_id: string;      // FK → auth.users.id (akun global kasir)
  operator_name: string;   // Nama kasir asli yang bertugas (dinamis per shift)
  starting_cash: number;
  expected_cash: number;
  actual_cash?: number;
  status: 'Open' | 'Closed';
  start_time?: string;     // ISO 8601
  end_time?: string;       // ISO 8601
  created_at?: string;
}

// -------------------------------------------------------------------------
// SystemUser / Staff — Sourced from users table
// -------------------------------------------------------------------------
export interface SystemUser {
  id: string;
  username?: string;
  email: string;
  nama_lengkap: string; // maps to full_name/display name
  role: 'Owner/Manager' | 'Kasir/Front Desk';
  is_active: boolean;
  password_hash?: string;
  password_salt?: string;
  created_at?: string;
  updated_at?: string;
}
