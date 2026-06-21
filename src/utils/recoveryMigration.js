/**
 * FSRMS Customer ID Recovery Migration
 * ====================================
 * Repairs all local IndexedDB records where a customer was created with a
 * non-UUID id (e.g. Math.random().toString(36).substring(2,9) → "omwdwi1").
 *
 * Repair strategy:
 *  1. Scan LOCAL_CUSTOMER_CACHE, QUARANTINED_MUTATIONS, OFFLINE_MUTATION_QUEUE
 *  2. Build a remapping table: { shortId → newUUID }
 *  3. Repair and re-queue CREATE_CUSTOMER mutations from QUARANTINED_MUTATIONS
 *  4. Update customer_id foreign key references in the queue, appointment cache, transaction cache
 *  5. Return structured stats report
 *
 * Safe to run multiple times (idempotent — already-valid UUIDs are skipped).
 */

import {
  getStorageAdapter,
  getSessionCredentials,
  decryptData,
  encryptData
} from './storageEngine.js';

// RFC 4122 UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Run the full customer ID recovery migration.
 * @returns {Promise<RecoveryStats>}
 */
export async function runCustomerIdRecovery() {
  const stats = {
    scanned: 0,
    repaired: 0,
    references: 0,
    errors: [],
    idRemapping: {},    // { oldShortId: newUUID }
    details: []
  };

  console.log('[Recovery] Starting customer ID recovery migration...');

  let db;
  try {
    db = await getStorageAdapter();
  } catch (err) {
    stats.errors.push(`Failed to get Storage Adapter: ${err.message}`);
    return stats;
  }

  const credentials = await getSessionCredentials().catch(() => null);
  const sessionToken = credentials?.token || '';

  // =========================================================================
  // PHASE 1: DISCOVERY — collect all bad IDs and build remap table
  // =========================================================================

  const idRemapping = new Map(); // shortId → newUUID

  // 1a. LOCAL_CUSTOMER_CACHE
  let cachedCustomers = [];
  try {
    cachedCustomers = await db.getAll('LOCAL_CUSTOMER_CACHE');
    for (const cust of cachedCustomers) {
      stats.scanned++;
      if (!isValidUUID(cust.id)) {
        if (!idRemapping.has(cust.id)) {
          idRemapping.set(cust.id, crypto.randomUUID());
        }
        stats.details.push({ source: 'LOCAL_CUSTOMER_CACHE', oldId: cust.id, name: cust.name });
        console.warn(`[Recovery] Bad ID in LOCAL_CUSTOMER_CACHE: "${cust.id}" (${cust.name})`);
      }
    }
  } catch (err) {
    stats.errors.push(`LOCAL_CUSTOMER_CACHE scan failed: ${err.message}`);
  }

  // 1b. QUARANTINED_MUTATIONS — stored decrypted
  let quarantinedMutations = [];
  try {
    quarantinedMutations = await db.getAll('QUARANTINED_MUTATIONS');
    for (const mut of quarantinedMutations) {
      stats.scanned++;
      if (mut.type === 'CREATE_CUSTOMER' && mut.payload) {
        if (!isValidUUID(mut.payload.id)) {
          if (!idRemapping.has(mut.payload.id)) {
            idRemapping.set(mut.payload.id, crypto.randomUUID());
          }
          stats.details.push({ source: 'QUARANTINED_MUTATIONS', oldId: mut.payload.id, name: mut.payload.name });
          console.warn(`[Recovery] Bad ID in QUARANTINED_MUTATIONS: "${mut.payload.id}" (${mut.payload.name})`);
        }
      }
    }
  } catch (err) {
    stats.errors.push(`QUARANTINED_MUTATIONS scan failed: ${err.message}`);
  }

  // 1c. OFFLINE_MUTATION_QUEUE — encrypted, must decrypt first
  let queueItems = [];
  const decryptedQueue = []; // { item, decrypted }
  try {
    queueItems = await db.getAll('OFFLINE_MUTATION_QUEUE');
    for (const item of queueItems) {
      stats.scanned++;
      try {
        const decrypted = await decryptData(item.payload, sessionToken);
        decryptedQueue.push({ item, decrypted });
        if (decrypted.type === 'CREATE_CUSTOMER' && decrypted.payload) {
          if (!isValidUUID(decrypted.payload.id)) {
            if (!idRemapping.has(decrypted.payload.id)) {
              idRemapping.set(decrypted.payload.id, crypto.randomUUID());
            }
            stats.details.push({ source: 'OFFLINE_MUTATION_QUEUE', oldId: decrypted.payload.id, name: decrypted.payload.name });
            console.warn(`[Recovery] Bad ID in OFFLINE_MUTATION_QUEUE: "${decrypted.payload.id}" (${decrypted.payload.name})`);
          }
        }
      } catch (decErr) {
        stats.errors.push(`Queue decrypt failed for item ${item.id}: ${decErr.message}`);
      }
    }
  } catch (err) {
    stats.errors.push(`OFFLINE_MUTATION_QUEUE scan failed: ${err.message}`);
  }

  if (idRemapping.size === 0) {
    console.log('[Recovery] ✅ No invalid customer IDs found. All customer IDs are valid UUIDs.');
    stats.idRemapping = {};
    return stats;
  }

  console.log(`[Recovery] Found ${idRemapping.size} invalid customer ID(s) to repair. Building remap table...`);
  stats.idRemapping = Object.fromEntries(idRemapping);

  // =========================================================================
  // PHASE 2: REPAIR LOCAL_CUSTOMER_CACHE
  // =========================================================================
  try {
    const cacheTx = db.transaction('LOCAL_CUSTOMER_CACHE', 'readwrite');
    const cacheStore = cacheTx.objectStore('LOCAL_CUSTOMER_CACHE');
    for (const cust of cachedCustomers) {
      if (idRemapping.has(cust.id)) {
        const newId = idRemapping.get(cust.id);
        await cacheStore.delete(cust.id);
        await cacheStore.put({ ...cust, id: newId });
        stats.repaired++;
        console.log(`[Recovery] LOCAL_CUSTOMER_CACHE: "${cust.id}" → "${newId}" (${cust.name})`);
      }
    }
    await cacheTx.done;
  } catch (err) {
    stats.errors.push(`LOCAL_CUSTOMER_CACHE repair failed: ${err.message}`);
  }

  // =========================================================================
  // PHASE 3: REPAIR QUARANTINED_MUTATIONS
  //   → Remove from quarantine, update payload ID, re-encrypt, put in queue
  // =========================================================================
  try {
    for (const mut of quarantinedMutations) {
      if (mut.type === 'CREATE_CUSTOMER' && mut.payload && idRemapping.has(mut.payload.id)) {
        const oldId = mut.payload.id;
        const newId = idRemapping.get(oldId);

        // Build repaired mutation
        const repairedMutation = {
          type: 'CREATE_CUSTOMER',
          payload: { ...mut.payload, id: newId }
        };

        // Encrypt repaired mutation
        const encryptedPayload = await encryptData(repairedMutation, sessionToken);

        // Write to OFFLINE_MUTATION_QUEUE with new UUID as the queue record key
        const requeueTx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
        await requeueTx.objectStore('OFFLINE_MUTATION_QUEUE').put({
          id: newId,
          encrypted: true,
          payload: encryptedPayload,
          created_at: mut.quarantinedAt || new Date().toISOString()
        });
        await requeueTx.done;

        // Remove from QUARANTINED_MUTATIONS — use queueId as keyPath
        const quarantineKeyPath = mut.queueId || mut.id || oldId;
        const removeTx = db.transaction('QUARANTINED_MUTATIONS', 'readwrite');
        await removeTx.objectStore('QUARANTINED_MUTATIONS').delete(quarantineKeyPath);
        await removeTx.done;

        stats.repaired++;
        stats.references++;
        console.log(`[Recovery] QUARANTINED → QUEUE: "${oldId}" → "${newId}" (${mut.payload.name})`);
      }
    }
  } catch (err) {
    stats.errors.push(`QUARANTINED_MUTATIONS repair failed: ${err.message}`);
  }

  // =========================================================================
  // PHASE 4: REPAIR OFFLINE_MUTATION_QUEUE
  //   - For CREATE_CUSTOMER entries already in queue with bad IDs
  //   - For any other mutation whose customer_id references a bad customer ID
  // =========================================================================
  try {
    for (const { item, decrypted } of decryptedQueue) {
      let changed = false;

      // 4a. CREATE_CUSTOMER with bad payload.id (directly in queue, not quarantined)
      if (decrypted.type === 'CREATE_CUSTOMER' && decrypted.payload && idRemapping.has(decrypted.payload.id)) {
        const oldId = decrypted.payload.id;
        const newId = idRemapping.get(oldId);
        decrypted.payload.id = newId;
        changed = true;

        // Delete old queue record, will write new one below
        const delTx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
        await delTx.objectStore('OFFLINE_MUTATION_QUEUE').delete(item.id);
        await delTx.done;

        // Re-encrypt and put with new ID
        const reEncrypted = await encryptData(decrypted, sessionToken);
        const putTx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
        await putTx.objectStore('OFFLINE_MUTATION_QUEUE').put({
          id: newId,
          encrypted: true,
          payload: reEncrypted,
          created_at: item.created_at
        });
        await putTx.done;

        stats.repaired++;
        console.log(`[Recovery] OFFLINE_MUTATION_QUEUE CREATE_CUSTOMER: "${oldId}" → "${newId}"`);
        continue; // already handled
      }

      // 4b. Other mutation types that reference customer_id
      if (decrypted.payload?.customer_id && idRemapping.has(decrypted.payload.customer_id)) {
        const oldRef = decrypted.payload.customer_id;
        decrypted.payload.customer_id = idRemapping.get(oldRef);
        changed = true;
        stats.references++;
        console.log(`[Recovery] OFFLINE_MUTATION_QUEUE ${decrypted.type} customer_id: "${oldRef}" → "${decrypted.payload.customer_id}"`);
      }

      if (changed) {
        const reEncrypted = await encryptData(decrypted, sessionToken);
        const updateTx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
        await updateTx.objectStore('OFFLINE_MUTATION_QUEUE').put({
          ...item,
          payload: reEncrypted
        });
        await updateTx.done;
      }
    }
  } catch (err) {
    stats.errors.push(`OFFLINE_MUTATION_QUEUE repair failed: ${err.message}`);
  }

  // =========================================================================
  // PHASE 5: REPAIR LOCAL_APPOINTMENT_CACHE — update customer_id FK references
  // =========================================================================
  try {
    const apptTx = db.transaction('LOCAL_APPOINTMENT_CACHE', 'readwrite');
    const apptStore = apptTx.objectStore('LOCAL_APPOINTMENT_CACHE');
    const appointments = await apptStore.getAll();
    for (const app of appointments) {
      if (app.customer_id && idRemapping.has(app.customer_id)) {
        const oldRef = app.customer_id;
        app.customer_id = idRemapping.get(oldRef);
        await apptStore.put(app);
        stats.references++;
        console.log(`[Recovery] LOCAL_APPOINTMENT_CACHE appt ${app.id}: customer_id "${oldRef}" → "${app.customer_id}"`);
      }
    }
    await apptTx.done;
  } catch (err) {
    stats.errors.push(`LOCAL_APPOINTMENT_CACHE repair failed: ${err.message}`);
  }

  // =========================================================================
  // PHASE 6: REPAIR LOCAL_TRANSACTION_CACHE — update customer_id FK references
  // =========================================================================
  try {
    const txCacheTx = db.transaction('LOCAL_TRANSACTION_CACHE', 'readwrite');
    const txCacheStore = txCacheTx.objectStore('LOCAL_TRANSACTION_CACHE');
    const transactions = await txCacheStore.getAll();
    for (const txRecord of transactions) {
      if (txRecord.customer_id && idRemapping.has(txRecord.customer_id)) {
        const oldRef = txRecord.customer_id;
        txRecord.customer_id = idRemapping.get(oldRef);
        await txCacheStore.put(txRecord);
        stats.references++;
        console.log(`[Recovery] LOCAL_TRANSACTION_CACHE tx ${txRecord.id}: customer_id "${oldRef}" → "${txRecord.customer_id}"`);
      }
    }
    await txCacheTx.done;
  } catch (err) {
    stats.errors.push(`LOCAL_TRANSACTION_CACHE repair failed: ${err.message}`);
  }

  // =========================================================================
  // PHASE 7: SUMMARY
  // =========================================================================
  console.log(`[Recovery] ✅ Migration complete:
  - Scanned:   ${stats.scanned} entries
  - Repaired:  ${stats.repaired} customer records
  - References updated: ${stats.references}
  - Errors:    ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.error('[Recovery] Errors encountered:', stats.errors);
  }

  // Trigger sync after recovery if online
  if (typeof window !== 'undefined' && navigator.onLine) {
    console.log('[Recovery] Triggering sync after recovery...');
    window.dispatchEvent(new CustomEvent('pos-queue-updated'));
  }

  return stats;
}

/**
 * Quick check: returns true if any non-UUID customer IDs exist in local stores.
 * Lightweight — does NOT decrypt the mutation queue.
 */
export async function hasInvalidCustomerIds() {
  try {
    const db = await getStorageAdapter();
    const cachedCustomers = await db.getAll('LOCAL_CUSTOMER_CACHE');
    if (cachedCustomers.some(c => !isValidUUID(c.id))) return true;

    const quarantined = await db.getAll('QUARANTINED_MUTATIONS');
    if (quarantined.some(m => m.type === 'CREATE_CUSTOMER' && !isValidUUID(m.payload?.id))) return true;

    return false;
  } catch {
    return false;
  }
}
