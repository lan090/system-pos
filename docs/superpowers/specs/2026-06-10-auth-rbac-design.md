# FSRMS v2.0 - Custom Database-Driven Auth & RBAC Proposal

This document outlines the architecture, database schema, migration plan, and security risk assessment for implementing a fully local, offline-first authentication and Role-Based Access Control (RBAC) system for the Fenina Salon & Reflexology Management System (FSRMS).

---

## 1. RBAC Architecture Proposal

We are decoupling the user sessions and authentication from Supabase Auth. The application will manage its own user identity domain using a custom public `users` table.

### Permission Matrix

| Feature / Operation | Owner/Manager | Kasir/Front Desk | Terapis | Rationale |
| :--- | :---: | :---: | :---: | :--- |
| **Manage Users** (CRUD staff) | ✅ | ❌ | ❌ | Owner-only administrative action |
| **View Profit & Financial Metrics** | ✅ | ❌ | ❌ | Sensitive financial reporting |
| **Manage System Settings & IT Sync** | ✅ | ❌ | ❌ | Prevent accidental configuration changes |
| **Resume Sync Engine** (Control Plane) | ✅ | ❌ | ❌ | High-risk administrative action |
| **Void/Delete Transactions** | ✅ | ❌ | ❌ | Prevent cashier fraud / audit trail safety |
| **Create/Read/Update Customers** | ✅ | ✅ | ❌ (Read Only) | Standard POS operational CRU |
| **Manage Service Catalog** (CRUD catalog) | ✅ | ❌ (Read Only) | ❌ (Read Only) | Keep catalog pricing consistent and owner-controlled |
| **Checkout (POS Terminal)** | ✅ | ✅ | ❌ | Operational cash register functions |
| **Print Receipts** | ✅ | ✅ | ❌ | Checkout workflow output |
| **Open / Close Cash Shifts** | ✅ | ✅ | ❌ | Cash drawer flow safety |
| **View Appointments / Scheduler** | ✅ | ✅ | ✅ (Read Only) | Coordination of therapy lanes |
| **View Own Transactions** | ✅ | ✅ | ❌ | Cashier audit trail tracking |

### Centralized Permission Layer

We will implement a centralized access control layer at `src/utils/accessControl.ts`. All checks will query this service rather than performing hardcoded role string matching.

```typescript
import { SystemUser } from '../types';

export const canManageUsers = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canViewProfit = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canManageSettings = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canResumeSync = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canDeleteTransaction = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canManageCatalog = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager';
};

export const canCheckout = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager' || user.role === 'Kasir/Front Desk';
};

export const canManageCustomers = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager' || user.role === 'Kasir/Front Desk';
};

export const canManageShifts = (user: SystemUser): boolean => {
  return user.role === 'Owner/Manager' || user.role === 'Kasir/Front Desk';
};
```

---

## 2. Users Table Schema

We will extend the public `users` table to store local login credentials securely, using PBKDF2 with SHA-256 for password hashing.

### Database Table Definition (`public.users`)

| Field | SQL Type | Nullable | Default | Constraints / Description |
| :--- | :--- | :---: | :--- | :--- |
| **id** | UUID | NOT NULL | gen_random_uuid() | PRIMARY KEY |
| **username** | VARCHAR(100) | NOT NULL | — | UNIQUE, case-insensitive index |
| **email** | VARCHAR(255) | NOT NULL | — | UNIQUE, backward-compatible email |
| **password_hash** | VARCHAR(255) | NOT NULL | — | PBKDF2 + SHA-256 hashed password |
| **password_salt** | VARCHAR(255) | NOT NULL | — | Unique random salt generated per user |
| **nama_lengkap** | VARCHAR(150) | NOT NULL | — | Full display name (full_name) |
| **role** | VARCHAR(50) | NOT NULL | — | CHECK IN ('Owner/Manager', 'Kasir/Front Desk') |
| **is_active** | BOOLEAN | NOT NULL | TRUE | Soft-disable user |
| **created_at** | TIMESTAMPTZ | NOT NULL | NOW() | Created timestamp |
| **updated_at** | TIMESTAMPTZ | NOT NULL | NOW() | Updated timestamp |

### Cryptographic Hashing Strategy (Web Crypto API)

We will use the browser-native **Web Crypto API** (`window.crypto.subtle`) for hashing. This is:
1. Highly secure (native browser implementation).
2. Zero external npm dependencies.
3. Fully functional in both online and offline modes.

#### Hashing Implementation (`src/utils/crypto.ts`)

```typescript
/**
 * Generates a cryptographically strong random salt.
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashes a plaintext password using PBKDF2 with SHA-256 and 100,000 iterations.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(salt);

  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

---

## 3. Migration Plan

Since we need backward compatibility and must preserve existing data, we will follow a structured migration path.

### Step 1: Database Migration (`supabase/migrations/20260610000000_database_driven_auth.sql`)

1. **Alter existing `users` table** to add columns `username`, `password_hash`, `password_salt`, and `updated_at`.
2. **Backfill existing users** (e.g. `kasir@fenina.com`):
   - Generate default usernames from email prefix.
   - Pre-calculate standard hashes for default passwords (e.g. `owner123` and `kasir123`) using the PBKDF2 algorithm so existing accounts can log in immediately.
3. **Enforce constraints**: Set columns to `NOT NULL` after backfilling.
4. **Trigger for `updated_at`**: Attach a standard trigger function to automatically update `updated_at` on modification.

#### SQL Migration Script Snippet:
```sql
BEGIN;

-- Add new columns as nullable first
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Seed fallback credentials for default kasir (aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)
-- Password: kasir123
-- Salt: 9f72b64d1f2e4a8b
-- PBKDF2/100000/SHA-256 Hash of 'kasir123' with salt: 'de72477c7772740263cc823fb8869c9b5f54316d2b38be357e6274431f4a9b6c' (example)
UPDATE users 
SET username = 'kasir',
    password_salt = '9f72b64d1f2e4a8b',
    password_hash = 'de72477c7772740263cc823fb8869c9b5f54316d2b38be357e6274431f4a9b6c'
WHERE email = 'kasir@fenina.com';

-- Seed default owner account
-- Password: owner123
-- Salt: 5c91a32b8e0f1d7a
-- PBKDF2/100000/SHA-256 Hash of 'owner123' with salt: 'ae82387c6b412d09ef1b32d56a7e02c638ef1a729de4cf52ab6a71821cfab8c2' (example)
INSERT INTO users (id, email, username, nama_lengkap, role, password_salt, password_hash, is_active)
VALUES (
    'e0000000-0000-0000-0000-000000000001',
    'owner@fenina.com',
    'owner',
    'Owner Utama',
    'Owner/Manager',
    '5c91a32b8e0f1d7a',
    'ae82387c6b412d09ef1b32d56a7e02c638ef1a729de4cf52ab6a71821cfab8c2',
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- Enforce constraints
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
ALTER TABLE users ALTER COLUMN password_salt SET NOT NULL;

COMMIT;
```

---

## 4. Security Risk Assessment

Decoupling user accounts from Supabase Auth introduces specific challenges that we must address.

### Risk 1: Client-Side Hash Exposure
* **Description**: Since the client performs password verification, the client needs to read the `password_hash` and `password_salt` from the database. A rogue user could potentially fetch the hashes of all staff members and crack them offline.
* **Mitigation**:
  1. We will establish Row-Level Security (RLS) policies on the `users` table.
  2. Regular cashiers can only query their own user record (`id = auth.uid()` or matching their username).
  3. The `Owner/Manager` is the only role allowed to select all records in the `users` table.
  4. For the login process, the client utilizes a **double-query validation flow**:
     - The client first requests only the `password_salt` for the entered `username`.
     - The client hashes the entered password using this salt locally via PBKDF2.
     - The client then queries the full profile where *both* `username` and `password_hash` match. The database only returns a profile if the hash matches, preventing the client from ever downloading a password hash it doesn't already know.

### Risk 2: Supabase RLS Bypassing (Preserving Audit Trails & Forensics)
* **Description**: If we bypass Supabase Auth and only connect using the `anon` key, all client requests will run with the anonymous PostgreSQL role, which lacks RLS permissions.
* **Mitigation (Chosen Approach)**:
  We will use a **Device-Level/Role-Level Supabase Auth Account** under the hood.
  - The POS client app will have two fixed credentials configured:
    1. A generic cashier connection: `pos-cashier@fenina.com` (associated with the `Kasir/Front Desk` metadata role in Supabase Auth).
    2. A generic owner connection: `pos-owner@fenina.com` (associated with the `Owner/Manager` metadata role in Supabase Auth).
  - When the app launches, it automatically logs in to the `pos-cashier` account by default. Standard operations use this session, identifying the client as a cashier to PostgreSQL RLS.
  - If the Owner logs in locally, the app signs in to the `pos-owner` Supabase Auth session, updating the JWT to grant full database control permissions to the client.
* **Audit Trail & Forensics**:
  - **Individual Tracking**: Although the database sees the generic `pos-cashier` or `pos-owner` JWT, the application payload logs the cashier's specific user UUID directly in the table rows (`processed_by` in `transactions` and `cashier_id` in `cash_shifts`).
  - **Audit Trigger Modifications**: The Postgres audit log trigger `fn_log_table_activity()` will be updated to map `performed_by` to the row's `processed_by` (for transactions) or `cashier_id` (for shifts) rather than the generic `auth.uid()`, guaranteeing a precise audit trail.
  - **Incident Forensics**: Telemetry events emitted to the local `FSRMS_EVENT_LOG` and synchronized to Supabase will explicitly record both the operator's display name and individual user UUID, coupled with a unique transaction `correlation_id`.

### Risk 3: Device Compromise & Local Hash Leakage
* **Description**: If a POS terminal device is stolen or infected with malware/XSS, an attacker could extract the IndexedDB database and attempt to brute-force the cached password hashes.
* **Mitigation**:
  1. **High-iteration PBKDF2**: Using PBKDF2 with SHA-256 and 100,000 iterations makes brute-forcing/dictionary attacks on the extracted hashes extremely slow and computationally expensive.
  2. **No Global Cache (`cacheAllUsers` removed)**: We will *never* sync the entire salon's password hashes to every terminal. A terminal will only cache the credentials of users who have successfully authenticated online on that specific device.
  3. **In-Memory Active Session**: The plaintext password is never stored, and the active session profile is held in React/Zustand memory. The cached session in `localStorage` is AES-GCM encrypted using a key tied to the browser session.

---

## 5. Offline & Session Management

- **Offline Cache**: A user's profile, salt, and password hash are cached in IndexedDB `SECURE_USER_STORE` only after a successful **online** login on that specific device.
- **Offline Login Fallback**:
  - If a cashier has never logged in online on that specific terminal before, their credentials are not cached.
  - When offline, attempting to log in with an uncached account will display a descriptive message: *"Mode offline: Akun Anda belum pernah login di perangkat ini sebelumnya. Hubungkan ke internet untuk melakukan login pertama kali."*
  - **Fallback**: The cashier must ask an Owner or another cashier whose credentials *are* cached on that terminal to log in offline, or wait for internet connectivity to perform the initial login.
- **Offline Authentication**: For cached users, the system looks up the username in `SECURE_USER_STORE`, hashes the entered password with the cached salt, and compares it to the cached hash.
- **Session Persistence**: Successful logins will save a secure encrypted session JSON in `localStorage` containing the user profile and authentication token. Upon startup, this session is decrypted and restored.

---

## 6. Supabase RLS Hardening Backlog & Technical Debt

> [!WARNING]
> **Technical Debt - Database RLS Hardening is Pending**: Row-Level Security (RLS) is currently NOT enabled on the Supabase project. The current database security relies solely on client-side RBAC and application logic. We must NOT assume that the database is secure based solely on frontend RBAC constraints.

To ensure comprehensive database-level security, the following backlog items have been created for a dedicated **Security Hardening Phase for Supabase RLS** immediately following the stabilization of RBAC:

### Backlog Items for Supabase RLS Hardening
1. **RLS Activation**: Enable Row-Level Security on all database tables (specifically `users`, `transactions`, `customers`, `cash_shifts`, and `appointments`).
2. **`users` Table Policies**: Implement strict read/write policies on the `users` table:
   - Cashiers can read only their own profile.
   - Owners can perform full CRUD (read, write, delete) on all profiles.
   - Unauthenticated/anonymous users can read only salts (required for the double-query login flow) but never hashes.
3. **Owner/Cashier Access Policies**:
   - Limit cashier write operations (transactions, shifts) to cashier-owned records.
   - Prevent cashiers from editing or deleting transactions (void operations restricted to Owner).
4. **Sync-Engine Service Policies**:
   - Establish PostgreSQL RLS policies for the sync-engine to ensure offline-queued mutations are processed under correct access constraints.
5. **Dedicated Security Hardening Phase**:
   - Perform a full security audit and verification of RLS policies once RBAC is completed and stabilized.

