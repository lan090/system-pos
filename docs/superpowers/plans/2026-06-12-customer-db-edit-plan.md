# Customer Database Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable editing of customer records from the Customer Database view with offline-first support and RBAC controls.

**Architecture:** Extend the existing drawer in `CustomerDBView` to support dual-mode (Add/Edit), pre-populate customer fields on edit click, adapt duplication checks to avoid self-collision, update cache (`LOCAL_CUSTOMER_CACHE`), and queue `UPDATE_CUSTOMER` mutations to the sync engine.

**Tech Stack:** React, TypeScript, Supabase, IndexedDB (idb).

---

### Task 1: Sync Engine Update
Add support for the `UPDATE_CUSTOMER` mutation in the offline sync engine and align payload fields.

**Files:**
- Modify: [syncEngine.js](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/utils/syncEngine.js)

- [ ] **Step 1: Update CREATE_CUSTOMER and implement UPDATE_CUSTOMER block in doFlushMutationQueue**
  Open [syncEngine.js](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/utils/syncEngine.js) and update the `CREATE_CUSTOMER` payload to include `email`. Then add the handler for `UPDATE_CUSTOMER` right below it.

  ```javascript
      } else if (mut.type === 'CREATE_CUSTOMER') {
        const customerPayload = {
          id: mut.payload.id,
          nama_lengkap: mut.payload.name,
          nomor_telepon: mut.payload.phone || null,
          email: mut.payload.email || null,
          discount_id: mut.payload.discount_id || null,
          catatan_khusus: mut.payload.notes || null,
          membership_tier: mut.payload.tier || 'Silver',
          total_omset: mut.payload.totalOmset || 0.00,
          total_kunjungan: mut.payload.totalVisits || 1,
          customer_type: mut.payload.customer_type || 'STANDARD'
        };
        console.log('[CREATE_CUSTOMER] Payload sebelum dikirim ke Supabase:', JSON.stringify(customerPayload));

        const query = supabase
          .from('customers')
          .upsert(customerPayload)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        console.log('[CREATE_CUSTOMER] Respons Supabase:', JSON.stringify({ data, error, status }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };

      } else if (mut.type === 'UPDATE_CUSTOMER') {
        const customerPayload = {
          id: mut.payload.id,
          nama_lengkap: mut.payload.name,
          nomor_telepon: mut.payload.phone || null,
          email: mut.payload.email || null,
          discount_id: mut.payload.discount_id || null,
          catatan_khusus: mut.payload.notes || null,
          membership_tier: mut.payload.tier || 'Silver',
          total_omset: mut.payload.totalOmset || 0.00,
          total_kunjungan: mut.payload.totalVisits || 0,
          customer_type: mut.payload.customer_type || 'STANDARD'
        };
        console.log('[UPDATE_CUSTOMER] Payload sebelum dikirim ke Supabase:', JSON.stringify(customerPayload));

        const query = supabase
          .from('customers')
          .upsert(customerPayload)
          .select();
        query.headers['X-Correlation-Id'] = mut.correlationId || 'NO_CORRELATION';
        const { data, error, status } = await query;

        console.log('[UPDATE_CUSTOMER] Respons Supabase:', JSON.stringify({ data, error, status }));

        response = {
          ok: !error,
          status: status,
          json: async () => error ? error : data,
          text: async () => JSON.stringify(error || data)
        };
  ```

- [ ] **Step 2: Verify compilation of syncEngine.js**
  Ensure the syntax is correct and the file compiles without issues.

---

### Task 2: App-Level Edit Handler
Implement the customer update logic in `src/App.tsx`.

**Files:**
- Modify: [App.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/App.tsx)

- [ ] **Step 1: Add handleEditCustomer function**
  Open [App.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/App.tsx) and implement `handleEditCustomer` right below `handleAddCustomer` (around line 887).

  ```typescript
    const handleEditCustomer = async (customer: Customer) => {
      setCustomers(prev =>
        prev.map(c => (c.id === customer.id ? customer : c))
      );
      setNotifications(prev => [`Perubahan data pelanggan "${customer.name}" disimpan secara lokal.`, ...prev]);
      setNotificationsCount(n => n + 1);

      console.log('[SYNC-TRACE] handleEditCustomer fired.', {
        id: customer.id,
        name: customer.name,
        isOnline
      });

      try {
        const db = await openSecureDB();
        const cacheTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
        await cacheTx.objectStore('LOCAL_CUSTOMER_CACHE').put(customer);
        await cacheTx.done;
        console.log('[SYNC-TRACE] Wrote updated customer to LOCAL_CUSTOMER_CACHE.');

        await safeAddToQueue({ type: 'UPDATE_CUSTOMER', payload: customer });
        await loadQueueCounts();

        if (isOnline) {
          triggerManualSync();
        }
      } catch (err) {
        console.error("Failed to queue customer update:", err);
      }
    };
  ```

- [ ] **Step 2: Pass onEditCustomer to CustomerDBView**
  Find the `<CustomerDBView>` instantiation (around line 1298) and pass the new `onEditCustomer` prop:

  ```tsx
            <CustomerDBView 
              customers={customers} 
              onAddCustomer={handleAddCustomer} 
              onEditCustomer={handleEditCustomer}
              userRole={userRole}
            />
  ```

---

### Task 3: CustomerDBView State and Validations
Add state variables, define RBAC rules without hardcoding "Terapis", and update the phone/name duplicate checking rules to bypass self-collision.

**Files:**
- Modify: [CustomerDBView.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/components/CustomerDBView.tsx)

- [ ] **Step 1: Declare new states and props**
  Open [CustomerDBView.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/components/CustomerDBView.tsx). Add `onEditCustomer` to the interface props and define the state variables:

  ```typescript
  interface CustomerDBViewProps {
    customers: Customer[];
    onAddCustomer: (customer: Customer) => void;
    onEditCustomer: (customer: Customer) => void;
    userRole?: string;
  }
  ```

  Inside `CustomerDBView` component body:
  ```typescript
    const [editCustomerId, setEditCustomerId] = useState<string | null>(null);
    const [activeMenuCustomerId, setActiveMenuCustomerId] = useState<string | null>(null);

    // RBAC logic to determine edit/registration privileges
    const canEditCustomer = userRole === 'Owner/Manager' || userRole === 'Kasir/Front Desk';
  ```

- [ ] **Step 2: Update Duplicate Customer Memo Validations**
  Modify the `duplicateCustomer` and `duplicateNameCustomer` memos to exclude the current customer being edited when checking for collisions:

  ```typescript
    // Check if phone number is already registered under another customer
    const duplicateCustomer = useMemo(() => {
      if (!formData.phone.trim()) return null;
      const cleanPhone = formData.phone.trim().replace(/\D/g, '');
      
      return customers.find(c => {
        if (editCustomerId && c.id === editCustomerId) return false;
        const existingClean = c.phone.replace(/\D/g, '');
        return existingClean === cleanPhone;
      });
    }, [formData.phone, customers, editCustomerId]);

    // Check if name is already registered (case-insensitive)
    const duplicateNameCustomer = useMemo(() => {
      if (!formData.name.trim()) return null;
      return customers.find(c => {
        if (editCustomerId && c.id === editCustomerId) return false;
        return c.name.toLowerCase().trim() === formData.name.toLowerCase().trim();
      });
    }, [formData.name, customers, editCustomerId]);
  ```

---

### Task 4: Drawer Refactoring for Edit Mode
Adapt the side-drawer code to load selected details on edit, check existing customer integrity, and trigger `onEditCustomer` on submit.

**Files:**
- Modify: [CustomerDBView.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/components/CustomerDBView.tsx)

- [ ] **Step 1: Add Edit Drawer Open Helper & Reset Drawer Closers**
  Update drawer state handling helpers to properly handle the edit mode lifecycle.

  ```typescript
    const openEditCustomerDrawer = (customer: Customer) => {
      setEditCustomerId(customer.id);
      setFormData({
        name: customer.name,
        phone: customer.phone,
        email: customer.email || '',
        notes: customer.notes || '',
        tier: customer.tier
      });
      setIsDrawerOpen(true);
    };

    // Update openNewCustomerDrawer:
    const openNewCustomerDrawer = () => {
      setEditCustomerId(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        notes: '',
        tier: 'Silver'
      });
      setIsDrawerOpen(true);
    };
  ```

  Also, make sure the drawer backdrop click and X button reset `editCustomerId`:
  ```tsx
  // Find backdrop click
  onClick={() => { setIsDrawerOpen(false); setEditCustomerId(null); }}
  // Find X button click
  onClick={() => { setIsDrawerOpen(false); setEditCustomerId(null); }}
  // Find Batal button click
  onClick={() => { setIsDrawerOpen(false); setEditCustomerId(null); }}
  ```

- [ ] **Step 2: Update handleFormSubmit with existing guard**
  Modify `handleFormSubmit` to call `onEditCustomer` if `editCustomerId` is not null. Include an safety guard to prevent runtime crashes if the customer being edited is not found:

  ```typescript
    const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (hasValidationError) return;

      if (editCustomerId) {
        const existing = customers.find(c => c.id === editCustomerId);
        if (!existing) {
          console.error('Customer not found');
          return;
        }

        const updatedCustomer: Customer = {
          ...existing,
          id: editCustomerId,
          name: formData.name,
          phone: formData.phone.trim().replace(/\D/g, ''),
          tier: formData.tier,
          email: formData.email || undefined,
          notes: formData.notes || undefined,
          totalVisits: existing.totalVisits
        };
        onEditCustomer(updatedCustomer);
      } else {
        const newCustomer: Customer = {
          id: crypto.randomUUID(),
          name: formData.name,
          phone: formData.phone.trim().replace(/\D/g, ''),
          totalVisits: 0,
          joinDate: new Date().toLocaleDateString('id-ID', { month: 'short', year: 'numeric' }),
          tier: formData.tier,
          email: formData.email || undefined,
          notes: formData.notes || undefined
        };
        onAddCustomer(newCustomer);
      }

      setIsDrawerOpen(false);
      setEditCustomerId(null);
      setFormData({
        name: '',
        phone: '',
        email: '',
        notes: '',
        tier: 'Silver'
      });
    };
  ```

- [ ] **Step 3: Update Drawer Header and Save Button Text**
  Replace the drawer header title:
  ```tsx
                {editCustomerId ? 'Edit Data Pelanggan' : 'Tambah Pelanggan Baru'}
  ```

  And the submit button text:
  ```tsx
                    {editCustomerId ? 'Simpan Perubahan' : 'Simpan Data'}
  ```

- [ ] **Step 4: Update Add Customer Button check**
  Replace the check for "Register New Client" (around line 150) to use `canEditCustomer`:
  ```tsx
            {canEditCustomer ? (
              <button 
                onClick={openNewCustomerDrawer}
                ...
  ```

---

### Task 5: 3-Dot Action Dropdown Menu UI
Implement the action menu dropdown using the strict `canEditCustomer` RBAC check.

**Files:**
- Modify: [CustomerDBView.tsx](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/components/CustomerDBView.tsx)

- [ ] **Step 1: Render Dropdown Menu in the Customer Row**
  Update the table row action cell (around line 238) to display the menu button and popover dropdown if `canEditCustomer`.

  ```tsx
                    <td className="py-3.5 px-6 text-right relative">
                      {canEditCustomer ? (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuCustomerId(activeMenuCustomerId === customer.id ? null : customer.id);
                            }}
                            className="text-[#D98897] hover:text-[#6B3A44] transition-colors p-1.5 rounded-full hover:bg-[#FFF8F9] border border-[#F2C6CE]/30 cursor-pointer"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          
                          {activeMenuCustomerId === customer.id && (
                            <>
                              <div 
                                className="fixed inset-0 z-10 cursor-default" 
                                onClick={() => setActiveMenuCustomerId(null)}
                              />
                              <div className="absolute right-6 mt-1 w-36 bg-white border border-[#F2C6CE] rounded-lg shadow-lg py-1 z-20 text-left">
                                <button
                                  type="button"
                                  onClick={() => {
                                    openEditCustomerDrawer(customer);
                                    setActiveMenuCustomerId(null);
                                  }}
                                  className="w-full px-4 py-2 text-xs font-bold text-[#6B3A44] hover:bg-[#FFF8F9] hover:text-[#D98897] transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                  Edit Pelanggan
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] text-stone-400 font-semibold select-none italic">Restricted</span>
                      )}
                    </td>
  ```

---

### Task 6: Verification and Test Run
Verify IndexedDB key стратегия, run linter, build, and tests.

**IndexedDB Key Strategy Verification:**
* As checked in [storageEngine.js:25](file:///c:/Claude-Cowork/02_Projects/System%20POS/src/utils/storageEngine.js#L25):
  `db.createObjectStore('LOCAL_CUSTOMER_CACHE', { keyPath: 'id' });`
  The store uses `keyPath: 'id'`, making `.put()` safe and idempotent.

**Files:**
- Run Verification Commands

- [ ] **Step 1: Run linter/compiler checks**
  Run: `npm run lint`
  Expected: Success without errors.

- [ ] **Step 2: Run build validation**
  Run: `npm run build`
  Expected: Success without TypeScript or build issues.

- [ ] **Step 3: Run Unit Tests**
  Run: `npx vitest run src/`
  Expected: All unit tests in `src/` PASS.

- [ ] **Step 4: Run Manual Verification Checklist**
  - **Owner/Kasir role:** verify they can open dropdown, open form, edit fields, save changes.
  - **Therapist role:** verify 3-dot dropdown and add customer buttons are hidden and display "Restricted".
  - **Self-edit duplicate check:** edit a customer's notes without changing phone or name; verify the edit is allowed.
  - **Collision duplicate check:** edit a customer's phone to a phone already used by another customer; verify database conflict warning prevents submission.
  - **Offline Flow & Persistence:** disconnect network, edit customer. Verify React UI updates, IndexedDB contains updated data (survives refresh), and offline queue has `UPDATE_CUSTOMER` item.
  - **Online Sync & Idempotency:** reconnect, trigger sync, verify queue is empty and Supabase is updated with no duplicate customer records.
