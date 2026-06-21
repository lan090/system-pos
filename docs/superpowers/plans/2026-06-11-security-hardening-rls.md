# Supabase RLS Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate and enforce database-level Row-Level Security (RLS) on all Supabase tables so that the database is not solely reliant on client-side RBAC for access control.

**Architecture:** The system uses a Generic Terminal Account model — `cashier-terminal@fenina.com` and `owner-terminal@fenina.com` as shared Supabase Auth identities. Real individual identity tracking is done via `processed_by` / `cashier_id` fields on transactional tables, and via a centralized `get_current_user_role()` helper function that reads role from the JWT `user_metadata`. RLS policies must be written against `get_current_user_role()`, not against `auth.uid()` for most tables (because all cashiers share a single Supabase Auth identity).

**Tech Stack:** Supabase PostgreSQL, Row-Level Security (RLS), PL/pgSQL, Supabase SQL Editor / `supabase db push`

---

## SECURITY AUDIT REPORT

### Audit Scope: All Tables in `public` schema

| Table | RLS Enabled | Effective Policies | Risk Level |
|---|---|---|---|
| `users` | ✅ (schema.sql) | ⚠️ Only one UPDATE policy (`Allow users to update their own profile`) — no SELECT or INSERT block | 🔴 **CRITICAL** |
| `transactions` | ✅ | Two overlapping policy sets — final state after migrations unclear | 🟡 **HIGH** |
| `transaction_items` | ✅ | Conflicting policies from multiple migrations — final state unclear | 🟡 **HIGH** |
| `cash_shifts` | ✅ | Uses `auth.uid()` for cashier isolation — **broken** with Generic Terminal Account model | 🔴 **CRITICAL** |
| `customers` | ✅ | Merged policy allows both Owner and Kasir ALL operations — no per-row isolation | 🟠 **MEDIUM** |
| `appointments` | ✅ | Same merged policy — no per-row isolation | 🟠 **MEDIUM** |
| `services` | ✅ | Allows Kasir ALL operations — Kasir should only read, not edit catalog | 🟡 **HIGH** |
| `discounts` | ✅ | Allows Kasir ALL operations — Kasir should only read, not edit discounts | 🟡 **HIGH** |
| `therapists` | ✅ | Allows Kasir ALL operations — Kasir should only read therapist list | 🟠 **MEDIUM** |
| `audit_logs` | ✅ | Owner-only SELECT/INSERT/DELETE — but INSERT is blocked for `fn_log_table_activity` trigger unless it runs SECURITY DEFINER | 🟡 **HIGH** |
| `telemetry_logs` | ✅ | `TO public WITH CHECK (true)` allows anonymous INSERT — effectively open append | 🟠 **MEDIUM** |

### Tables with NO RLS policies confirmed:
- `users` — RLS is **enabled** but only has one UPDATE policy. No SELECT policy exists. Any authenticated user can read all rows including `password_hash` and `password_salt`.

---

## VULNERABILITY FINDINGS

### 🔴 CRITICAL-1: `users` Table Exposes Password Hashes to All Authenticated Users

**Location:** `schema.sql` L24 + `migrations/20260530011718_optimize_database_performance.sql` L42-48

**Problem:** `users` table has RLS enabled but only one `FOR UPDATE` policy that lets users update their own row. There is NO `FOR SELECT` policy. In PostgreSQL, when RLS is enabled and no SELECT policy exists, **no rows are returned by default** — UNLESS the `BYPASSRLS` attribute is set, or policies from an older migration are still active.

**Actual risk:** The login flow in `useAuth.ts` fetches `password_salt` (Step 1) and then `password_hash` (Step 3) for any username. If an authenticated Kasir calls `supabase.from('users').select('*')`, they currently receive all user rows including `password_hash` and `password_salt` for all other staff — because the merged permissive policy `Manage customers based on role` does NOT cover users, but old legacy policies may be lingering in-database. The `UserManagementView.tsx` fetches all users without hash/salt, but the client Supabase SDK is not restricted at query level.

**Exploit path:** A Kasir-role terminal makes a direct Supabase API request: `GET /rest/v1/users?select=*` → receives all `password_hash` + `password_salt` → performs offline dictionary attack against Owner password.

**Fix:** Add explicit `FOR SELECT` policies on `users` table (see Task 2).

---

### 🔴 CRITICAL-2: `cash_shifts` RLS Uses `auth.uid()` — Broken Under Generic Terminal Account Model

**Location:** `migrations/20260530011718_optimize_database_performance.sql` L33-39

**Problem:** The final effective policy on `cash_shifts` is:
```sql
USING (cashier_id = (SELECT auth.uid()))
WITH CHECK (cashier_id = (SELECT auth.uid()))
```
Under the Generic Terminal Account model, ALL cashiers log in to Supabase Auth as `cashier-terminal@fenina.com`. Therefore `auth.uid()` returns the *same UUID* (`e0000000-0000-0000-0000-000000000002`) for every Kasir login. This means:
1. **Kasir A can read Kasir B's cash shifts** (because `cashier_id` is individual UUID, but `auth.uid()` is the shared terminal UUID — they won't match → Kasir can read NOTHING).
2. **No cashier can open a new shift** (WITH CHECK will always fail because individual UUID ≠ terminal UUID).

**Fix:** Change `cash_shifts` policy to use `get_current_user_role()` for role-level gating (see Task 3).

---

### 🟡 HIGH-1: `services` and `discounts` Allow Kasir Full Write Access

**Location:** `migrations/20260530030000_merge_permissive_policies.sql` L43-48, L32-37

**Problem:** The merged policy grants `Kasir/Front Desk` ALL operations (SELECT, INSERT, UPDATE, DELETE) on both `services` and `discounts`. This contradicts the RBAC requirement that only Owners can manage the service catalog and discount rules.

**Exploit path:** A rogue Kasir can modify `harga_jual` on a service to 0, or deactivate discount entries — directly affecting revenue calculations.

**Fix:** Separate Kasir policy to SELECT-only on `services` and `discounts` (see Task 4).

---

### 🟡 HIGH-2: `upsert_transaction` RPC Still Uses `SECURITY DEFINER` After Partial Rollback

**Location:** `migrations/20260530000000_fix_security_lints.sql` L2-3

**Problem:** `ALTER FUNCTION public.upsert_transaction(jsonb) SECURITY INVOKER;` was applied to downgrade the privilege. However, the function was later recreated in `20260529000002_idempotency_security.sql` as `SECURITY DEFINER`. Migration ordering means the `SECURITY INVOKER` change may have been overwritten.

**Risk:** If `upsert_transaction` runs as SECURITY DEFINER (i.e., as the superuser/postgres role), it bypasses all RLS checks entirely — a Kasir could theoretically trigger arbitrary data mutations by crafting a malicious JSONB payload.

**Fix:** Ensure `upsert_transaction` is SECURITY INVOKER after all migrations are applied (see Task 5).

---

### 🟡 HIGH-3: Audit Trigger `fn_log_table_activity` — `performed_by` is NULL for non-transactional tables

**Location:** `migrations/20260610000000_database_driven_auth.sql` L104-111

**Problem:** For tables other than `transactions` and `cash_shifts`, the audit trigger falls back to `auth.uid()` to populate `performed_by`. Under the Generic Terminal Account model, `auth.uid()` returns the shared terminal UUID — meaning audit logs for `customers`, `services`, `appointments`, and `therapists` cannot distinguish which individual operator made the change.

**Fix:** For all non-transactional tables, add a `modified_by` or `updated_by` column so that the client explicitly passes the real operator UUID, or use a Postgres session variable set at connection time (see Task 6).

---

### 🟡 HIGH-4: `transactions` INSERT Policy Tied to `auth.uid()` — Incompatible with Generic Terminal Model

**Location:** `migrations/20260530011718_optimize_database_performance.sql` L11-16

**Problem:** The INSERT policy requires `processed_by = auth.uid()`. Under the Generic Terminal Account model, `auth.uid()` is the cashier terminal UUID, but `processed_by` stores the real individual cashier UUID. These will never match — meaning every transaction INSERT will be rejected by RLS.

**Current workaround:** The `Manage transactions based on role` merged policy (which has no per-row check) was likely the effective policy before `remove_legacy_permissive_policies.sql` removed it. The actual live state of policies on the production database is unknown and must be audited before hardening.

**Fix:** Transaction INSERT policy should use `get_current_user_role()` role check only, not `auth.uid() = processed_by` (see Task 3).

---

### 🟠 MEDIUM-1: `telemetry_logs` Has Open Anonymous INSERT

**Location:** `migrations/20260529000100_telemetry_schema.sql` L25-28

**Problem:**
```sql
CREATE POLICY "Enable insert for all users" ON public.telemetry_logs
    FOR INSERT TO public WITH CHECK (true);
```
`TO public` means this policy applies to anonymous (unauthenticated) users. Any external actor who knows the Supabase project URL and anon key can spam telemetry_logs with arbitrary data, bloating storage and potentially injecting false observability signals.

**Fix:** Restrict to `TO authenticated` only (see Task 4).

---

### 🟠 MEDIUM-2: Integrity Checker RPCs are SECURITY DEFINER with No Auth Guard

**Location:** `migrations/20260605000002_integrity_checker_rpcs.sql`

**Problem:** `check_orphan_transaction_items()`, `check_stale_drafts()`, and `check_zero_amount_transactions()` all run as `SECURITY DEFINER` with no caller-identity check. Any authenticated user (including a Kasir) can call these RPCs and receive internal diagnostic data counts.

**Fix:** Add `GRANT EXECUTE ON FUNCTION ... TO authenticated` selectively, or add a role-check guard inside the function body (see Task 5).

---

### 🟠 MEDIUM-3: `useAuth.ts` Hardcoded Terminal Password in Source Code

**Location:** `src/hooks/useAuth.ts` L227

**Problem:**
```typescript
password: 'TerminalPassword123!' // Try logging in
```
The shared terminal account password is hardcoded in the client-side JavaScript bundle, which will be shipped to all browsers. Any user who inspects the production bundle can extract this password and independently authenticate as `cashier-terminal@fenina.com` against Supabase Auth, obtaining a valid JWT with `Kasir/Front Desk` permissions.

**Severity:** This is a *design-level* limitation of the Generic Terminal Account model. The anon key is already semi-public, but having the terminal password embedded is worse — it allows creation of arbitrary Supabase Auth sessions.

**Fix:** Move terminal login to a Supabase Edge Function that validates the custom credential first, then performs the terminal login server-side — never exposing the terminal password to the client (see Task 7).

---

### 🟢 LOW-1: Session Encryption Key Has Static Fallback

**Location:** `src/hooks/useAuth.ts` L4

**Problem:**
```typescript
const AUTH_KEY_SALT = import.meta.env.VITE_AUTH_SESSION_SECRET || 'fsrms-isolated-auth-static-fallback-key-2026';
```
If `VITE_AUTH_SESSION_SECRET` is not set, AES-GCM session encryption uses a known static key. The encrypted `fsrms_secure_auth` localStorage value can be decrypted offline by anyone who knows the fallback key (which is now in the public source code history).

**Fix:** Remove the static fallback, make the env var mandatory with a startup guard (see Task 8).

---

### 🟢 LOW-2: `get_current_user_role()` Trusts JWT Claims Without Schema Validation

**Location:** `schema.sql` L313-322

**Problem:**
```sql
RETURN COALESCE(
    current_setting('request.jwt.claims', true)::json->>'user_metadata'->>'role',
    'Terapis'
);
```
The function reads the `role` value from the JWT `user_metadata` claim but does not validate that the value is one of the allowed roles. If a JWT is crafted (or Supabase Auth is misconfigured) with a non-standard `role` value like `'Owner/Manager'`, it could bypass policies designed for the `Terapis` fallback.

**Impact:** Low, because Supabase Auth JWTs are signed with the project secret — external users cannot forge them. Risk only materializes if Supabase Auth is compromised or the service role key is leaked.

**Fix:** Add a `IN (...)` validation check (see Task 1).

---

## RISK MATRIX

| ID | Finding | Likelihood | Impact | Priority |
|---|---|---|---|---|
| CRIT-1 | `users` table password hash exposure | High | Critical | P0 |
| CRIT-2 | `cash_shifts` RLS broken under terminal model | High | High | P0 |
| HIGH-1 | Kasir can write to `services`/`discounts` | Medium | High | P1 |
| HIGH-2 | `upsert_transaction` SECURITY DEFINER state unclear | Medium | High | P1 |
| HIGH-3 | Audit trail loses individual identity for non-tx tables | High | Medium | P1 |
| HIGH-4 | Transaction INSERT policy broken under terminal model | High | High | P1 |
| MED-1 | Open anonymous INSERT on `telemetry_logs` | Medium | Medium | P2 |
| MED-2 | Integrity RPCs callable by any authenticated user | Low | Medium | P2 |
| MED-3 | Terminal password hardcoded in client bundle | High | High | P1 |
| LOW-1 | Static AES session key fallback | Low | Low | P3 |
| LOW-2 | `get_current_user_role()` no enum validation | Low | Low | P3 |

---

## PROPOSED CHANGES (FILE MAP)

### New Files
- `supabase/migrations/20260611000001_rls_users_table_policies.sql` — Task 2
- `supabase/migrations/20260611000002_rls_fix_terminal_model_policies.sql` — Task 3
- `supabase/migrations/20260611000003_rls_fix_kasir_write_access.sql` — Task 4
- `supabase/migrations/20260611000004_rls_fix_security_definer_and_rpcs.sql` — Task 5
- `supabase/migrations/20260611000005_rls_audit_trail_identity.sql` — Task 6
- `supabase/functions/authenticate/index.ts` — Task 7 (Edge Function)
- (Modify) `src/hooks/useAuth.ts` — Task 7 (client-side terminal login removal)
- (Modify) `src/hooks/useAuth.ts` — Task 8 (remove static fallback key)

---

## RECOMMENDED EXECUTION ORDER

Execute tasks in this exact order. Each task produces a testable, independently verifiable migration. Do NOT skip ahead.

```
Task 1 → Harden get_current_user_role() enum validation (LOW risk, sets foundation)
Task 2 → Fix users table RLS policies (CRIT-1 — highest priority)
Task 3 → Fix terminal-model-broken policies: cash_shifts + transactions (CRIT-2 + HIGH-4)
Task 4 → Fix Kasir write access: services, discounts, therapists + telemetry anon insert (HIGH-1 + MED-1)
Task 5 → Fix SECURITY DEFINER state on upsert_transaction + integrity RPCs (HIGH-2 + MED-2)
Task 6 → Patch audit trail for individual operator identity (HIGH-3)
Task 7 → Move terminal password to Edge Function (MED-3)
Task 8 → Harden AES session key fallback (LOW-1)
```

---

## TASK DETAILS

### Task 1: Harden `get_current_user_role()` Enum Validation

**Files:**
- Create: `supabase/migrations/20260611000000_rls_harden_role_fn.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260611000000_rls_harden_role_fn.sql
BEGIN;

CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS VARCHAR AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := COALESCE(
    current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role',
    'anonymous'
  );
  -- Strict allowlist validation — reject unrecognized roles
  IF v_role NOT IN ('Owner/Manager', 'Kasir/Front Desk') THEN
    RETURN 'anonymous';
  END IF;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY INVOKER;

COMMIT;
```

- [ ] **Step 2: Apply migration (LOCAL first)**

```bash
npx supabase db push --local
# Expected: Migration applied successfully
```

- [ ] **Step 3: Verify function behavior**

Run in Supabase SQL Editor (or psql):
```sql
-- Should return 'anonymous' for unknown roles
SELECT get_current_user_role();
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611000000_rls_harden_role_fn.sql
git commit -m "security: harden get_current_user_role() with strict enum allowlist"
```

---

### Task 2: Fix `users` Table RLS Policies (CRIT-1)

**Files:**
- Create: `supabase/migrations/20260611000001_rls_users_table_policies.sql`

**Goal:** Prevent any authenticated user from reading password_hash/salt of other users. Only Owner can read all users. Cashier can read only their own row (minus sensitive fields). Login flow (salt fetch) must work via a restricted anon-accessible function.

- [ ] **Step 1: Create a secure salt-fetching RPC for login**

The double-query login flow needs to fetch `password_salt` by username. Since login happens before auth (no JWT yet), we need an anon-accessible function that returns ONLY the salt — never the hash.

```sql
-- supabase/migrations/20260611000001_rls_users_table_policies.sql
BEGIN;

-- =========================================================================
-- 1. Secure RPC: get_user_salt — callable by anon for login flow
-- Returns ONLY the salt for a given username or email. Never returns hash.
-- Rate limiting must be enforced at API Gateway / Edge level.
-- =========================================================================
CREATE OR REPLACE FUNCTION get_user_salt(p_identifier TEXT)
RETURNS TABLE(salt TEXT, is_active BOOLEAN, role TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    password_salt,
    is_active,
    role
  FROM users
  WHERE username = p_identifier OR email = p_identifier
  LIMIT 1;
$$;

-- Grant anon access to this function for the login flow
GRANT EXECUTE ON FUNCTION get_user_salt(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_user_salt(TEXT) TO authenticated;

-- =========================================================================
-- 2. Secure RPC: verify_user_credentials — validates hash match
-- Returns full profile (EXCEPT password_hash/salt) if hash matches.
-- Called after client-side hash computation.
-- =========================================================================
CREATE OR REPLACE FUNCTION verify_user_credentials(
  p_identifier TEXT,
  p_computed_hash TEXT
)
RETURNS TABLE(
  id UUID,
  email TEXT,
  username TEXT,
  nama_lengkap TEXT,
  role TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    email,
    username,
    nama_lengkap,
    role,
    is_active,
    created_at
  FROM users
  WHERE (username = p_identifier OR email = p_identifier)
    AND password_hash = p_computed_hash
    AND is_active = TRUE
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION verify_user_credentials(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_user_credentials(TEXT, TEXT) TO authenticated;

-- =========================================================================
-- 3. Drop any existing policies on users table
-- =========================================================================
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.users;

-- =========================================================================
-- 4. RLS Policies for users table
-- Owner: full CRUD on all users
-- Kasir: SELECT own row only (no hash/salt — use a view or column-level security)
-- Anon: NO direct table access — use get_user_salt() RPC instead
-- =========================================================================

-- Owner full access
CREATE POLICY "Owner full control on users"
ON public.users
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

-- Kasir can read their own row only
CREATE POLICY "Kasir can read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (
  get_current_user_role() = 'Kasir/Front Desk'
  AND id = (
    SELECT u.id FROM public.users u 
    WHERE u.username = current_setting('request.jwt.claims', true)::json->'user_metadata'->>'username'
    LIMIT 1
  )
);

COMMIT;
```

- [ ] **Step 2: Apply and verify**

```bash
npx supabase db push --local
```

Verify in SQL Editor:
```sql
-- As an authenticated Kasir JWT: should return 0 rows for other users
SELECT id, email, role FROM users WHERE role = 'Owner/Manager';

-- Test RPC works for salt fetch:
SELECT * FROM get_user_salt('kasir');
-- Expected: {salt: "9f72b64d1f2e4a8b", is_active: true, role: "Kasir/Front Desk"}
```

- [ ] **Step 3: Update `useAuth.ts` to use RPCs instead of direct table queries**

Modify `src/hooks/useAuth.ts` `handleLogin` function:

```typescript
// Step 1: Fetch salt via RPC instead of direct table access
const { data: saltData, error: saltError } = await supabase
  .rpc('get_user_salt', { p_identifier: emailOrUsername });

if (saltError || !saltData?.length) {
  return { success: false, error: 'Email atau username tidak ditemukan.' };
}
const { salt, is_active, role } = saltData[0];

// Step 2: Compute hash locally (unchanged)
const computedHash = await hashPassword(password, salt);

// Step 3: Verify via RPC instead of direct table query
const { data: profileData, error: profileError } = await supabase
  .rpc('verify_user_credentials', { 
    p_identifier: emailOrUsername, 
    p_computed_hash: computedHash 
  });

if (profileError || !profileData?.length) {
  return { success: false, error: 'Password salah. Periksa kembali kredensial Anda.' };
}
const userProfile = profileData[0];
```

- [ ] **Step 4: Run E2E tests**

```bash
npx playwright test tests/network-chaos.spec.ts --reporter=list
# Expected: All tests pass
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611000001_rls_users_table_policies.sql src/hooks/useAuth.ts
git commit -m "security(CRIT-1): restrict users table access, add get_user_salt + verify_user_credentials RPCs"
```

---

### Task 3: Fix Terminal-Model-Broken Policies: `cash_shifts` + `transactions` (CRIT-2 + HIGH-4)

**Files:**
- Create: `supabase/migrations/20260611000002_rls_fix_terminal_model_policies.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260611000002_rls_fix_terminal_model_policies.sql
BEGIN;

-- =========================================================================
-- DESIGN NOTE: Under the Generic Terminal Account model, auth.uid() returns
-- the shared terminal UUID — NOT the individual cashier UUID.
-- Therefore, per-row isolation based on auth.uid() does NOT work.
-- We rely on role-level gating via get_current_user_role() instead.
-- Individual cashier accountability is maintained via processed_by / cashier_id fields.
-- =========================================================================

-- 1. cash_shifts: Fix broken auth.uid() policy
DROP POLICY IF EXISTS "Cashiers can manage their shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Owner full access on Cash Shifts" ON public.cash_shifts;
DROP POLICY IF EXISTS "Kasir can manage Cash Shifts" ON public.cash_shifts;

CREATE POLICY "Owner full access on Cash Shifts"
ON public.cash_shifts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

-- Kasir can INSERT new shifts and read all shifts (needed to detect duplicate open shifts)
-- Per-cashier shift isolation is enforced at application layer, not DB layer (see design note above)
CREATE POLICY "Kasir can manage Cash Shifts"
ON public.cash_shifts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk')
WITH CHECK (get_current_user_role() = 'Kasir/Front Desk');

-- 2. transactions: Fix INSERT policy that used auth.uid()
DROP POLICY IF EXISTS "Secure insert for authenticated cashiers" ON public.transactions;
DROP POLICY IF EXISTS "Manage transactions based on role" ON public.transactions;

-- SELECT/UPDATE/DELETE: role-based
CREATE POLICY "Manage transactions based on role"
ON public.transactions
FOR ALL
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

-- 3. transaction_items: Clean up conflicting INSERT policy
DROP POLICY IF EXISTS "Secure authenticated insert for transaction_items" ON public.transaction_items;
DROP POLICY IF EXISTS "Manage transaction items based on role" ON public.transaction_items;

CREATE POLICY "Manage transaction items based on role"
ON public.transaction_items
FOR ALL
TO authenticated
USING (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'))
WITH CHECK (get_current_user_role() IN ('Owner/Manager', 'Kasir/Front Desk'));

COMMIT;
```

- [ ] **Step 2: Apply and test**

```bash
npx supabase db push --local
npx playwright test tests/network-chaos.spec.ts --reporter=list
# Expected: 16/16 pass — sync engine must still be able to push transactions
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000002_rls_fix_terminal_model_policies.sql
git commit -m "security(CRIT-2): fix cash_shifts and transactions RLS broken under Generic Terminal Account model"
```

---

### Task 4: Fix Kasir Write Access + Telemetry Anonymous Insert (HIGH-1 + MED-1)

**Files:**
- Create: `supabase/migrations/20260611000003_rls_fix_kasir_write_access.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260611000003_rls_fix_kasir_write_access.sql
BEGIN;

-- =========================================================================
-- services: Owner can write, Kasir can only SELECT (read catalog for POS)
-- =========================================================================
DROP POLICY IF EXISTS "Manage services based on role" ON public.services;
DROP POLICY IF EXISTS "Owner can edit catalog" ON public.services;
DROP POLICY IF EXISTS "Kasir and Terapis can read services list" ON public.services;

CREATE POLICY "Owner can manage services"
ON public.services
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read services catalog"
ON public.services
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- discounts: Owner can write, Kasir can only SELECT (for POS discount lookup)
-- =========================================================================
DROP POLICY IF EXISTS "Manage discounts based on role" ON public.discounts;
DROP POLICY IF EXISTS "Owner full control on Discounts" ON public.discounts;
DROP POLICY IF EXISTS "Kasir can read Discounts list" ON public.discounts;

CREATE POLICY "Owner can manage discounts"
ON public.discounts
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read discounts"
ON public.discounts
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- therapists: Owner can write, Kasir can only SELECT (for appointment scheduler)
-- =========================================================================
DROP POLICY IF EXISTS "Manage therapists based on role" ON public.therapists;
DROP POLICY IF EXISTS "Owner full control on Therapists" ON public.therapists;
DROP POLICY IF EXISTS "Kasir can read Therapists list" ON public.therapists;

CREATE POLICY "Owner can manage therapists"
ON public.therapists
FOR ALL
TO authenticated
USING (get_current_user_role() = 'Owner/Manager')
WITH CHECK (get_current_user_role() = 'Owner/Manager');

CREATE POLICY "Kasir can read therapists"
ON public.therapists
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Kasir/Front Desk');

-- =========================================================================
-- telemetry_logs: Close anonymous INSERT — restrict to authenticated only
-- =========================================================================
DROP POLICY IF EXISTS "Enable insert for all users" ON public.telemetry_logs;
DROP POLICY IF EXISTS "Secure authenticated insert for telemetry_logs" ON public.telemetry_logs;

CREATE POLICY "Authenticated insert for telemetry_logs"
ON public.telemetry_logs
FOR INSERT
TO authenticated
WITH CHECK (id IS NOT NULL);

-- Owner can read telemetry data
CREATE POLICY "Owner can read telemetry logs"
ON public.telemetry_logs
FOR SELECT
TO authenticated
USING (get_current_user_role() = 'Owner/Manager');

COMMIT;
```

- [ ] **Step 2: Apply and run full E2E test suite**

```bash
npx supabase db push --local
npx playwright test --reporter=list
# Expected: 16/16 pass
# Verify: Kasir terminal cannot POST to services table
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260611000003_rls_fix_kasir_write_access.sql
git commit -m "security(HIGH-1,MED-1): restrict Kasir write access to services/discounts/therapists, close anon telemetry insert"
```

---

### Task 5: Fix SECURITY DEFINER State + Restrict Integrity RPCs (HIGH-2 + MED-2)

**Files:**
- Create: `supabase/migrations/20260611000004_rls_fix_security_definer.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260611000004_rls_fix_security_definer.sql
BEGIN;

-- =========================================================================
-- upsert_transaction: Ensure SECURITY INVOKER (not DEFINER)
-- This was changed to INVOKER in fix_security_lints.sql but recreated as 
-- DEFINER in idempotency_security.sql — enforce INVOKER as final state.
-- =========================================================================
ALTER FUNCTION public.upsert_transaction(jsonb) SECURITY INVOKER;

-- =========================================================================
-- Integrity RPCs: Add Owner-only guard inside function body
-- check_orphan_transaction_items, check_stale_drafts, check_zero_amount_transactions
-- =========================================================================
CREATE OR REPLACE FUNCTION check_orphan_transaction_items()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only';
  END IF;
  RETURN (
    SELECT json_build_object('count', COUNT(ti.id))
    FROM transaction_items ti
    LEFT JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.id IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION check_stale_drafts()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only';
  END IF;
  RETURN (
    SELECT json_build_object('count', COUNT(id))
    FROM transactions
    WHERE status = 'Draft'
      AND created_at < NOW() - INTERVAL '1 hour'
  );
END;
$$;

CREATE OR REPLACE FUNCTION check_zero_amount_transactions()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF get_current_user_role() <> 'Owner/Manager' THEN
    RAISE EXCEPTION 'Access denied: Owner only';
  END IF;
  RETURN (
    SELECT json_build_object('count', COUNT(id))
    FROM transactions
    WHERE status = 'Done'
      AND total_amount <= 0
  );
END;
$$;

COMMIT;
```

- [ ] **Step 2: Verify upsert_transaction privilege**

```sql
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_name = 'upsert_transaction';
-- Expected: security_type = 'INVOKER'
```

- [ ] **Step 3: Run tests**

```bash
npx playwright test tests/network-chaos.spec.ts --reporter=list
# Expected: 16/16 pass — upsert_transaction is still called by sync engine
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611000004_rls_fix_security_definer.sql
git commit -m "security(HIGH-2,MED-2): enforce SECURITY INVOKER on upsert_transaction, add Owner guard to integrity RPCs"
```

---

### Task 6: Patch Audit Trail — Individual Operator Identity for Non-Transactional Tables (HIGH-3)

**Files:**
- Create: `supabase/migrations/20260611000005_rls_audit_trail_identity.sql`

**Design:** Add a Postgres session-level variable `app.current_operator_id` that the client sets at the start of every connection. The audit trigger reads this variable to populate `performed_by` for non-transactional tables.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260611000005_rls_audit_trail_identity.sql
BEGIN;

-- =========================================================================
-- RPC: set_current_operator — client calls this after login to register
-- the real individual operator UUID for the current DB connection.
-- This is used by the audit trigger for non-transactional table changes.
-- =========================================================================
CREATE OR REPLACE FUNCTION set_current_operator(p_operator_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  PERFORM set_config('app.current_operator_id', p_operator_id::TEXT, false);
END;
$$;

GRANT EXECUTE ON FUNCTION set_current_operator(UUID) TO authenticated;

-- =========================================================================
-- Update fn_log_table_activity to use app.current_operator_id as fallback
-- =========================================================================
CREATE OR REPLACE FUNCTION fn_log_table_activity()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Priority 1: Use domain-field identity for transactional tables
    IF TG_TABLE_NAME = 'transactions' THEN
        v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.processed_by ELSE NEW.processed_by END;
    ELSIF TG_TABLE_NAME = 'cash_shifts' THEN
        v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cashier_id ELSE NEW.cashier_id END;
    ELSE
        -- Priority 2: Use session-level operator set by client via set_current_operator()
        BEGIN
            v_user_id := current_setting('app.current_operator_id', true)::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_user_id := NULL;
        END;
        -- Priority 3: Fallback to Supabase Auth UID (will be terminal UUID under generic model)
        IF v_user_id IS NULL THEN
            BEGIN
                v_user_id := auth.uid();
            EXCEPTION WHEN OTHERS THEN
                v_user_id := NULL;
            END;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, performed_by)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, v_user_id);
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_value, performed_by)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD)::JSONB, v_user_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
```

- [ ] **Step 2: Update client to call `set_current_operator` after login**

Modify `src/hooks/useAuth.ts` inside `handleLogin` after `setCurrentUser(mappedUser)`:

```typescript
// Set operator identity for audit trail on non-transactional tables
try {
  await supabase.rpc('set_current_operator', { p_operator_id: userProfile.id });
} catch (e) {
  console.warn('[Auth] Could not set operator identity for audit trail:', e);
}
```

- [ ] **Step 3: Test audit trail**

```bash
npx playwright test tests/post-checkout-capture.spec.ts --reporter=list
# Expected: All tests pass; verify audit_logs rows have non-null performed_by
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260611000005_rls_audit_trail_identity.sql src/hooks/useAuth.ts
git commit -m "security(HIGH-3): add set_current_operator RPC for audit trail identity on non-transactional tables"
```

---

### Task 7: Move Terminal Password to Supabase Edge Function (MED-3)

**Files:**
- Create: `supabase/functions/authenticate/index.ts`
- Modify: `src/hooks/useAuth.ts` (remove hardcoded terminal password)

**Design:** The client submits `{ identifier, computedHash }` to the Edge Function. The Edge Function verifies the hash server-side against the database (using the service role key), then performs the terminal Supabase Auth login server-side and returns the session token. The terminal password never reaches the browser.

- [ ] **Step 1: Create Edge Function**

```typescript
// supabase/functions/authenticate/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TERMINAL_CASHIER_EMAIL = "cashier-terminal@fenina.com";
const TERMINAL_OWNER_EMAIL = "owner-terminal@fenina.com";
const TERMINAL_PASSWORD = Deno.env.get("TERMINAL_PASSWORD")!; // Set in Edge Function env vars

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { identifier, computedHash } = await req.json();

    if (!identifier || !computedHash) {
      return new Response(JSON.stringify({ error: "Missing credentials" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify credentials server-side
    const { data: user, error } = await serviceClient
      .from("users")
      .select("id, email, username, nama_lengkap, role, is_active, created_at")
      .or(`username.eq.${identifier},email.eq.${identifier}`)
      .eq("password_hash", computedHash)
      .eq("is_active", true)
      .single();

    if (error || !user) {
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Perform terminal login server-side — password never sent to client
    const terminalEmail = user.role === "Owner/Manager" ? TERMINAL_OWNER_EMAIL : TERMINAL_CASHIER_EMAIL;
    const { data: authData, error: authError } = await serviceClient.auth.signInWithPassword({
      email: terminalEmail,
      password: TERMINAL_PASSWORD,
    });

    if (authError || !authData?.session) {
      console.error("Terminal login failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Terminal auth failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        user,
        access_token: authData.session.access_token,
        expires_at: authData.session.expires_at,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Edge Function error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Remove hardcoded terminal password from `useAuth.ts`**

Replace the inline `supabase.auth.signInWithPassword({ password: 'TerminalPassword123!' })` block (lines 221-238) with a call to the Edge Function:

```typescript
// Replace terminal login block with Edge Function call
const edgeResponse = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authenticate`,
  {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ identifier: emailOrUsername, computedHash }),
  }
);
if (!edgeResponse.ok) {
  const errData = await edgeResponse.json();
  return { success: false, error: errData.error || 'Verifikasi gagal.' };
}
const { user: userProfile, access_token: sessionToken, expires_at: expiresAt } = await edgeResponse.json();
```

- [ ] **Step 3: Deploy Edge Function**

```bash
npx supabase functions deploy authenticate --no-verify-jwt
# Set environment variable:
npx supabase secrets set TERMINAL_PASSWORD=<your-terminal-password>
```

- [ ] **Step 4: Run full test suite**

```bash
npx playwright test --reporter=list
# Expected: 16/16 pass
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/authenticate/index.ts src/hooks/useAuth.ts
git commit -m "security(MED-3): move terminal password to Edge Function, remove plaintext secret from client bundle"
```

---

### Task 8: Remove Static AES Session Key Fallback (LOW-1)

**Files:**
- Modify: `src/hooks/useAuth.ts` (L4)

- [ ] **Step 1: Remove fallback and add startup guard**

```typescript
// Replace line 4 in useAuth.ts:
// BEFORE:
const AUTH_KEY_SALT = import.meta.env.VITE_AUTH_SESSION_SECRET || 'fsrms-isolated-auth-static-fallback-key-2026';

// AFTER:
const AUTH_KEY_SALT = import.meta.env.VITE_AUTH_SESSION_SECRET;
if (!AUTH_KEY_SALT) {
  console.error('[FSRMS] CRITICAL: VITE_AUTH_SESSION_SECRET is not set. Session encryption is disabled. Set this variable in .env.local.');
}
```

- [ ] **Step 2: Update `.env.local` documentation**

Add to `README.md` or `.env.local.example`:
```bash
# Required: 32+ character random secret for AES-GCM session encryption
# Generate: openssl rand -hex 32
VITE_AUTH_SESSION_SECRET=<generate-a-strong-random-secret-here>
```

- [ ] **Step 3: Verify unit tests still pass**

```bash
npx vitest run src/utils/crypto.test.ts
# Expected: 2/2 pass
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAuth.ts README.md
git commit -m "security(LOW-1): remove static AES session key fallback, require VITE_AUTH_SESSION_SECRET env var"
```

---

## SELF-REVIEW: Spec Coverage Check

| Audit Finding | Task That Addresses It |
|---|---|
| CRIT-1: users table hash exposure | Task 2 (RPCs + SELECT policies) |
| CRIT-2: cash_shifts broken with terminal model | Task 3 |
| HIGH-1: Kasir write to services/discounts | Task 4 |
| HIGH-2: upsert_transaction SECURITY DEFINER | Task 5 |
| HIGH-3: Audit trail loses individual identity | Task 6 |
| HIGH-4: Transaction INSERT broken with terminal model | Task 3 |
| MED-1: Telemetry anon INSERT | Task 4 |
| MED-2: Integrity RPCs callable by Kasir | Task 5 |
| MED-3: Hardcoded terminal password in bundle | Task 7 |
| LOW-1: Static AES fallback key | Task 8 |
| LOW-2: get_current_user_role() no enum validation | Task 1 |

All findings are covered. No gaps.

---

## VERIFICATION PLAN

### After Each Task:
```bash
npx playwright test --reporter=list   # Must stay 16/16
npx vitest run src/                   # Must stay 8/8
```

### After Task 2 (users table fix) — Manual:
1. Log in as Kasir
2. Open browser DevTools → Network → filter `users`
3. Verify direct REST API call to `/rest/v1/users?select=*` returns 0 rows or only own row
4. Verify login still works via `get_user_salt` + `verify_user_credentials` RPCs

### After Task 7 (Edge Function) — Manual:
1. Search production JS bundle for `TerminalPassword123!`
2. Expected: string NOT found in bundle
3. Verify login flow works with Edge Function in place

### Final Database State Verification (run in Supabase SQL Editor):
```sql
-- Verify all tables have RLS enabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: rowsecurity = true for all tables

-- Verify policy list
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
