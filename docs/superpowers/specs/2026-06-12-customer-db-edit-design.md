# Spec Design: Customer Database Edit Feature

Date: 2026-06-12
Status: Approved

## Overview
Enable editing of customer records from the Customer Database view via the 3-dot action menu. This needs to support offline-first capabilities by writing updates to IndexedDB immediately, queuing an `UPDATE_CUSTOMER` mutation to the sync engine, and syncing with Supabase when online. Access is restricted to Owner/Manager and Kasir/Front Desk roles.

## Requirements & Constraints
1. **Access Control:** The 3-dot menu and edit option must only be available to Owner/Manager and Kasir/Front Desk roles. Therapists must be restricted.
2. **Form Pre-population:** Clicking "Edit Pelanggan" opens the customer drawer pre-populated with current details.
3. **Dual-Mode Validation:** When editing, the system must exclude the current customer's ID from duplicate phone and name checks to avoid self-collision errors.
4. **Data Sync & Cache:** Edits must be written to IndexedDB (`LOCAL_CUSTOMER_CACHE`) immediately, and a mutation of type `UPDATE_CUSTOMER` must be queued in the offline mutation queue.

## Proposed Changes

### 1. `src/components/CustomerDBView.tsx`
- Add `editCustomerId: string | null` and `activeMenuCustomerId: string | null` states.
- Render the 3-dot menu and a click-away absolute dropdown for non-Therapist roles.
- Adapt form validations (`duplicateCustomer`, `duplicateNameCustomer`) to ignore the row matching `editCustomerId`.
- Submit button should call `onEditCustomer` if in edit mode.

### 2. `src/App.tsx`
- Implement `handleEditCustomer` callback.
- Update local `customers` react state.
- Persist to IndexedDB `LOCAL_CUSTOMER_CACHE`.
- Call `safeAddToQueue` with mutation `{ type: 'UPDATE_CUSTOMER', payload: customer }`.
- Trigger manual sync if online.
- Pass `onEditCustomer` to `<CustomerDBView>`.

### 3. `src/utils/syncEngine.js`
- Implement the sync logic for `UPDATE_CUSTOMER` inside `doFlushMutationQueue`.
- Use `.upsert()` against the `customers` table for idempotency.

## Verification Plan
1. **Manual Verification:**
   - Log in as Owner/Kasir.
   - Go to Customer Database, click the 3-dot menu next to a customer, click "Edit".
   - Modify fields (e.g. email, notes, tier) and submit. Verify local state and cache are updated.
   - Verify network request/Supabase row updates successfully when online.
   - Log in as therapist, verify 3-dot menu is hidden/restricted.
