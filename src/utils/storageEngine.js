import { openDB } from 'idb';

const SECURE_DB_NAME = 'fsrms_secure_db';
const SECURE_DB_VERSION = 12;

// Initialize secure promise-based IndexedDB engine (Version 2)
// upgrade callback manages transition safely without wiping user data
export async function openSecureDB() {
  return openDB(SECURE_DB_NAME, SECURE_DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      console.log(`IndexedDB Upgrade: Migrating database from v${oldVersion} to v${newVersion}`);
      if (!db.objectStoreNames.contains('OFFLINE_MUTATION_QUEUE')) {
        db.createObjectStore('OFFLINE_MUTATION_QUEUE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('LOCAL_TRANSACTION_CACHE')) {
        db.createObjectStore('LOCAL_TRANSACTION_CACHE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('auth_credentials')) {
        db.createObjectStore('auth_credentials', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('SYSTEM_KEY_STORE')) {
        db.createObjectStore('SYSTEM_KEY_STORE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('LOCAL_CUSTOMER_CACHE')) {
        db.createObjectStore('LOCAL_CUSTOMER_CACHE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('LOCAL_APPOINTMENT_CACHE')) {
        db.createObjectStore('LOCAL_APPOINTMENT_CACHE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('LOCAL_THERAPIST_CACHE')) {
        db.createObjectStore('LOCAL_THERAPIST_CACHE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('LOCAL_SERVICE_CACHE')) {
        db.createObjectStore('LOCAL_SERVICE_CACHE', { keyPath: 'id' });
      }
      // v7: Secure offline credential store — password hash only, never plaintext
      if (!db.objectStoreNames.contains('SECURE_USER_STORE')) {
        const secureStore = db.createObjectStore('SECURE_USER_STORE', { keyPath: 'email' });
        secureStore.createIndex('by_email', 'email', { unique: true });
      }
      // v8: Active shift store — menyimpan satu record sesi shift aktif (operator_name, dll)
      // Key tunggal 'current' — hanya satu shift aktif per perangkat pada satu waktu
      if (!db.objectStoreNames.contains('ACTIVE_SHIFT_STORE')) {
        db.createObjectStore('ACTIVE_SHIFT_STORE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('QUARANTINED_MUTATIONS')) {
        db.createObjectStore('QUARANTINED_MUTATIONS', { keyPath: 'queueId' });
      }
      // v10: Observability + Anomaly + Incident management stores
      if (!db.objectStoreNames.contains('FSRMS_EVENT_LOG')) {
        const logStore = db.createObjectStore('FSRMS_EVENT_LOG', { keyPath: 'event_id' });
        logStore.createIndex('by_trace',     'trace_id',   { unique: false });
        logStore.createIndex('by_timestamp', 'timestamp',  { unique: false });
        logStore.createIndex('by_type',      'event_type', { unique: false });
        logStore.createIndex('by_severity',  'severity',   { unique: false });
      }
      if (!db.objectStoreNames.contains('SYNC_ENGINE_STATE')) {
        db.createObjectStore('SYNC_ENGINE_STATE', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('FSRMS_INCIDENTS')) {
        const incidentStore = db.createObjectStore('FSRMS_INCIDENTS', { keyPath: 'incident_id' });
        incidentStore.createIndex('by_status', 'status',    { unique: false });
        incidentStore.createIndex('by_code',   'code',      { unique: false });
        incidentStore.createIndex('by_time',   'opened_at', { unique: false });
      }

      // v11 Upgrade: Backfill existing records with correlationId and retryCount
      if (oldVersion < 11 && db.objectStoreNames.contains('OFFLINE_MUTATION_QUEUE')) {
        const store = transaction.objectStore('OFFLINE_MUTATION_QUEUE');
        store.getAll().then((items) => {
          if (items) {
            for (const item of items) {
              let changed = false;
              if (item.correlationId === undefined) {
                item.correlationId = crypto.randomUUID();
                changed = true;
              }
              if (item.retryCount === undefined) {
                item.retryCount = 0;
                changed = true;
              }
              if (changed) {
                store.put(item);
              }
            }
          }
        }).catch((err) => {
          console.error('[MIGRATION] Failed to migrate offline queue to v11:', err);
        });
      }

      // v12: Telemetry Adapter queue — per-provider delivery tracking
      if (!db.objectStoreNames.contains('TELEMETRY_QUEUE')) {
        const telStore = db.createObjectStore('TELEMETRY_QUEUE', { keyPath: 'event_id' });
        telStore.createIndex('by_priority',   'priority',    { unique: false });
        telStore.createIndex('by_created_at', 'created_at',  { unique: false });
        telStore.createIndex('by_retry',      'retry_count', { unique: false });
      }
    },
  });
}

export class IndexedDBAdapter {
  constructor(db) {
    this.db = db;
  }
  get objectStoreNames() {
    return this.db.objectStoreNames;
  }
  async get(storeName, key) {
    return this.db.get(storeName, key);
  }
  async put(storeName, value) {
    return this.db.put(storeName, value);
  }
  async delete(storeName, key) {
    return this.db.delete(storeName, key);
  }
  async getAll(storeName) {
    return this.db.getAll(storeName);
  }
  async count(storeName) {
    return this.db.count(storeName);
  }
  close() {
    // No-op to keep the shared singleton IndexedDB connection open across concurrent requests
  }
  transaction(storeNames, mode = 'readonly') {
    const tx = this.db.transaction(storeNames, mode);
    return {
      objectStore(name) {
        const store = tx.objectStore(name);
        return {
          async get(key) { return store.get(key); },
          async put(value) { return store.put(value); },
          async delete(key) { return store.delete(key); },
          async getAll() { return store.getAll(); },
          async count() { return store.count(); }
        };
      },
      done: tx.done
    };
  }
}

export class MemoryAdapter {
  constructor() {
    this.stores = new Map();
  }
  get objectStoreNames() {
    return {
      contains(name) {
        const knownStores = [
          'OFFLINE_MUTATION_QUEUE', 'LOCAL_TRANSACTION_CACHE', 'auth_credentials', 
          'SYSTEM_KEY_STORE', 'LOCAL_CUSTOMER_CACHE', 'LOCAL_APPOINTMENT_CACHE', 
          'LOCAL_THERAPIST_CACHE', 'LOCAL_SERVICE_CACHE', 'SECURE_USER_STORE', 
          'ACTIVE_SHIFT_STORE', 'QUARANTINED_MUTATIONS', 'FSRMS_EVENT_LOG', 
          'SYNC_ENGINE_STATE', 'FSRMS_INCIDENTS'
        ];
        return knownStores.includes(name);
      }
    };
  }
  _getStore(name) {
    if (!this.stores.has(name)) {
      this.stores.set(name, new Map());
    }
    return this.stores.get(name);
  }
  async get(storeName, key) {
    return this._getStore(storeName).get(key) ?? null;
  }
  async put(storeName, value) {
    let key;
    if (storeName === 'SECURE_USER_STORE') {
      key = value.email;
    } else if (storeName === 'QUARANTINED_MUTATIONS') {
      key = value.queueId;
    } else if (storeName === 'FSRMS_EVENT_LOG') {
      key = value.event_id;
    } else if (storeName === 'FSRMS_INCIDENTS') {
      key = value.incident_id;
    } else {
      key = value.id;
    }
    this._getStore(storeName).set(key, value);
    return value;
  }
  async delete(storeName, key) {
    this._getStore(storeName).delete(key);
  }
  async getAll(storeName) {
    return Array.from(this._getStore(storeName).values());
  }
  async count(storeName) {
    return this._getStore(storeName).size;
  }
  close() {
    // No-op
  }
  transaction(storeNames, mode = 'readonly') {
    const self = this;
    return {
      objectStore(name) {
        const store = self._getStore(name);
        return {
          async get(key) { return store.get(key) ?? null; },
          async put(value) {
            let key;
            if (name === 'SECURE_USER_STORE') {
              key = value.email;
            } else if (name === 'QUARANTINED_MUTATIONS') {
              key = value.queueId;
            } else if (name === 'FSRMS_EVENT_LOG') {
              key = value.event_id;
            } else if (name === 'FSRMS_INCIDENTS') {
              key = value.incident_id;
            } else {
              key = value.id;
            }
            store.set(key, value);
            return value;
          },
          async delete(key) { store.delete(key); },
          async getAll() { return Array.from(store.values()); },
          async count() { return store.size; }
        };
      },
      done: Promise.resolve()
    };
  }
}

let activeAdapter = null;

export async function getStorageAdapter() {
  if (activeAdapter) return activeAdapter;

  try {
    // Runtime Probe: Attempt to open IndexedDB
    const db = await openSecureDB();
    activeAdapter = new IndexedDBAdapter(db);
    console.log('Storage Engine: IndexedDBAdapter initialized successfully via runtime probe.');
    return activeAdapter;
  } catch (err) {
    console.warn('Storage Engine: IndexedDB probe failed (e.g. Node/SSR environment, privacy mode, restricted context). Falling back to MemoryAdapter.', err);
    activeAdapter = new MemoryAdapter();
    return activeAdapter;
  }
}

// =========================================================================
// SECURE OFFLINE CREDENTIAL STORE
// Menyimpan hash SHA-256 password (BUKAN plaintext) + profil user untuk
// autentikasi lokal saat koneksi internet terputus di lapangan.
// Dipanggil setelah login online berhasil via supabase.auth.signInWithPassword.
// =========================================================================

/**
 * Simpan credential offline kasir setelah login online berhasil.
 * Hanya menyimpan PBKDF2 hash dari password — tidak pernah plaintext.
 * @param {string} email - Email/username kasir
 * @param {string} password - Password plaintext
 * @param {object} userProfile - Objek user dari database (termasuk hash dan salt)
 * @param {number} expiresAt - Unix timestamp (seconds) sesi berakhir
 */
export async function saveOfflineUserCredential(email, password, userProfile, expiresAt) {
  if (!email || !userProfile || !userProfile.password_hash || !userProfile.password_salt) {
    console.error('saveOfflineUserCredential: Parameter tidak lengkap atau hash/salt tidak ditemukan.');
    return;
  }
  try {
    const db = await getStorageAdapter();
    await db.put('SECURE_USER_STORE', {
      email: email.toLowerCase().trim(),
      passwordHash: userProfile.password_hash,
      passwordSalt: userProfile.password_salt,
      profile: userProfile,
      // Offline cache valid 30 hari dari saat login online terakhir
      offlineCacheExpiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
      supabaseSessionExpiresAt: expiresAt || 0,
      savedAt: new Date().toISOString()
    });
    console.log('[OfflineAuth] Credential offline berhasil disimpan untuk:', email);
  } catch (err) {
    console.error('[OfflineAuth] Gagal menyimpan credential offline:', err);
  }
}

/**
 * Verifikasi kredensial secara offline — membandingkan hash PBKDF2.
 * @param {string} email - Email/username kasir
 * @param {string} password - Password plaintext dari form input
 * @returns {Promise<{ success: boolean, profile: object|null, error: string|null }>}
 */
export async function verifyOfflineCredential(email, password) {
  if (!email || !password) {
    return { success: false, profile: null, error: 'Email/username dan password wajib diisi.' };
  }
  try {
    const db = await getStorageAdapter();
    const record = await db.get('SECURE_USER_STORE', email.toLowerCase().trim());

    if (!record) {
      return {
        success: false,
        profile: null,
        error: 'Akun ini belum pernah login online di perangkat ini. Hubungkan ke internet untuk login pertama kali.'
      };
    }

    // Cek apakah offline cache masih berlaku (30 hari)
    const nowSec = Math.floor(Date.now() / 1000);
    if (record.offlineCacheExpiresAt && nowSec > record.offlineCacheExpiresAt) {
      return {
        success: false,
        profile: null,
        error: 'Cache login offline telah kedaluwarsa (>30 hari). Hubungkan ke internet untuk memperbarui.'
      };
    }

    // Bandingkan hash password menggunakan PBKDF2
    const { hashPassword } = await import('./crypto');
    const inputHash = await hashPassword(password, record.passwordSalt);
    if (inputHash !== record.passwordHash) {
      return { success: false, profile: null, error: 'Email/username atau password salah.' };
    }

    console.log('[OfflineAuth] Verifikasi offline berhasil untuk:', email);
    return { success: true, profile: record.profile, error: null };
  } catch (err) {
    console.error('[OfflineAuth] Gagal verifikasi offline credential:', err);
    return { success: false, profile: null, error: 'Kesalahan sistem saat verifikasi offline.' };
  }
}

/**
 * Hapus credential offline untuk email tertentu (dipanggil saat logout).
 * @param {string} email - Email kasir
 */
export async function clearOfflineUserCredential(email) {
  if (!email) return;
  try {
    const db = await getStorageAdapter();
    await db.delete('SECURE_USER_STORE', email.toLowerCase().trim());
    console.log('[OfflineAuth] Credential offline dihapus untuk:', email);
  } catch (err) {
    console.error('[OfflineAuth] Gagal menghapus offline credential:', err);
  }
}

// Convert base64 data to Binary Blob for worker compatibility
export function base64ToBlob(base64Data, contentType = 'image/jpeg') {
  const parts = base64Data.split(',');
  const byteCharacters = atob(parts[1] || parts[0]);
  const byteArrays = [];
  
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  
  return new Blob(byteArrays, { type: contentType });
}

// Hybrid Cross-Thread Image Compression Engine
// Supports both Main Thread (Canvas Element) and Worker/Service Worker Context (OffscreenCanvas)
export async function compressImageHybrid(base64Data, maxWidth = 800, maxHeight = 600) {
  try {
    const match = base64Data.match(/^data:([^;]+);base64,/);
    const contentType = match ? match[1] : 'image/jpeg';

    if (typeof document !== 'undefined') {
      // 1. Main Thread execution using standard HTML5 Canvas Element
      return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Data;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Data);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const compressedData = canvas.toDataURL(contentType, 0.3); // Target <40KB
          resolve(compressedData);
        };

        img.onerror = () => {
          resolve(base64Data);
        };
      });
    } else {
      // 2. Service Worker/Worker Thread Context using OffscreenCanvas + ImageBitmap
      if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
        console.warn('Hybrid Compress Engine: Worker environment does not support createImageBitmap or OffscreenCanvas.');
        return base64Data;
      }

      const blob = base64ToBlob(base64Data, contentType);
      const imgBitmap = await createImageBitmap(blob);

      let width = imgBitmap.width;
      let height = imgBitmap.height;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const offscreen = new OffscreenCanvas(width, height);
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        imgBitmap.close();
        return base64Data;
      }

      ctx.drawImage(imgBitmap, 0, 0, width, height);
      imgBitmap.close(); // Clean memory immediately

      // Compress and convert back to Blob inside worker
      const compressedBlob = await offscreen.convertToBlob({ type: contentType, quality: 0.3 });

      // Convert Blob to base64 Data URL inside worker
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result);
        };
        reader.onerror = () => {
          resolve(base64Data);
        };
        reader.readAsDataURL(compressedBlob);
      });
    }
  } catch (err) {
    console.error('Hybrid Compress Engine: High-res downscaling failed. Retaining original payload.', err);
    return base64Data;
  }
}

// Save active session token and Supabase credentials upon successful login
export async function saveSessionCredentials(token, supabaseUrl, supabaseAnonKey) {
  // Guard: jangan simpan nilai undefined/kosong ke IndexedDB
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    console.error('saveSessionCredentials: Satu atau lebih parameter kosong/undefined. Dibatalkan.', { token: !!token, supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey });
    return;
  }
  const db = await getStorageAdapter();
  await db.put('auth_credentials', {
    id: 'active_session',
    token,
    supabaseUrl,
    supabaseAnonKey,
    updated_at: new Date().toISOString()
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('fsrms_session_token', token);
  }
}

// Bootstrap: Simpan public credentials (URL + Anon Key) ke IndexedDB saat app pertama load.
// Dipanggil dari main thread SEBELUM login, agar Service Worker selalu punya
// supabaseAnonKey yang valid tanpa harus mengandalkan import.meta.env (tidak tersedia di SW).
export async function bootstrapPublicCredentials(supabaseUrl, supabaseAnonKey) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('bootstrapPublicCredentials: URL atau AnonKey kosong. SW tidak akan bisa sync.');
    return;
  }
  try {
    const db = await getStorageAdapter();
    const existing = await db.get('auth_credentials', 'active_session');
    // Hanya update supabaseUrl dan supabaseAnonKey, pertahankan token yang sudah ada
    await db.put('auth_credentials', {
      id: 'active_session',
      token: existing?.token || '',
      supabaseUrl,
      supabaseAnonKey,
      updated_at: new Date().toISOString()
    });
    console.log('bootstrapPublicCredentials: Anon key berhasil disimpan ke IndexedDB untuk SW.');
  } catch (err) {
    console.error('bootstrapPublicCredentials: Gagal menyimpan ke IndexedDB.', err);
  }
}

// Retrieve active session credentials
export async function getSessionCredentials() {
  const db = await getStorageAdapter();
  const credentials = await db.get('auth_credentials', 'active_session');
  if (credentials && credentials.supabaseAnonKey) {
    return credentials;
  }
  // FIX: Hapus fallback import.meta.env — tidak tersedia di Service Worker context.
  // Jika IndexedDB kosong, kembalikan null agar SW abort dengan pesan yang jelas.
  return null;
}

// Clear session credentials upon logout
export async function clearSessionCredentials() {
  const db = await getStorageAdapter();
  await db.delete('auth_credentials', 'active_session');
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('fsrms_session_token');
  }
}

// Derive cryptographic AES-GCM key
export async function getCryptoKey(sessionToken) {
  const db = await getStorageAdapter();
  const cached = await db.get('SYSTEM_KEY_STORE', 'aes_gcm_key');
  if (cached && cached.key) {
    return cached.key;
  }

  const salt = sessionToken || 'fsrms-fallback-session-salt-secure-key-generation-constant';
  const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt));
  const newKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );

  await db.put('SYSTEM_KEY_STORE', { id: 'aes_gcm_key', key: newKey });
  return newKey;
}

// Encrypt payload using AES-GCM
export async function encryptData(payload, sessionToken) {
  const key = await getCryptoKey(sessionToken);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedData = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encodedData
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
}

// Decrypt payload using AES-GCM
export async function decryptData(encryptedObj, sessionToken) {
  const key = await getCryptoKey(sessionToken);
  const iv = new Uint8Array(atob(encryptedObj.iv).split('').map(c => c.charCodeAt(0)));
  const ciphertext = new Uint8Array(atob(encryptedObj.data).split('').map(c => c.charCodeAt(0)));

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(decryptedBuffer));
}

// Safe storage write driver with low disk space downscaling fallback and quota guardians
export async function safeAddToQueue(mutationData, isMigration = false) {
  try {
    const MAX_QUEUE_DEPTH = 500;
    
    // Explicit Memory Pressure Fallback
    if (typeof performance !== 'undefined' && performance.memory) {
      const { usedJSHeapSize, jsHeapLimit } = performance.memory;
      if (usedJSHeapSize && jsHeapLimit && usedJSHeapSize > jsHeapLimit * 0.8) {
        console.warn(`[MEM-PRESSURE] Used JS Heap size (${usedJSHeapSize} B) exceeds 80% limit (${jsHeapLimit} B).`);
        const overflowErr = new Error(`Memory pressure limit reached. Ingestion of mutation "${mutationData.type}" blocked.`);
        overflowErr.code = 'fsrms-backpressure-overflow';
        throw overflowErr;
      }
    }

    const preCheckDb = await getStorageAdapter();
    const currentCount = await preCheckDb.count('OFFLINE_MUTATION_QUEUE');

    if (!isMigration) {
      // 1. Deterministic Queue Size Estimator (Fallback for Safari/Firefox/Node.js/SSR + RAM spikes)
      const allItems = await preCheckDb.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []);
      const totalSize = allItems.reduce((sum, item) => sum + (item.payload ? JSON.stringify(item.payload).length : 0), 0);
      if (totalSize > 10 * 1024 * 1024) { // 10MB limit
        console.warn(`[MEM-PRESSURE] Total serialized queue size (${(totalSize / (1024*1024)).toFixed(2)} MB) exceeds 10MB SRE limit.`);
        const overflowErr = new Error(`Memory pressure limit reached (Total queue size exceeds 10MB limit). Ingestion of mutation "${mutationData.type}" blocked.`);
        overflowErr.code = 'fsrms-backpressure-overflow';
        throw overflowErr;
      }

      // 2. Payload Limit Guard (Prevent large transaction/media spikes)
      const payloadStr = JSON.stringify(mutationData);
      if (payloadStr.length > 2 * 1024 * 1024) { // 2MB payload size limit
        const sizeErr = new Error(`Mutation payload size (${(payloadStr.length / (1024*1024)).toFixed(2)} MB) exceeds strict 2MB SRE limit. Ingestion of "${mutationData.type}" blocked.`);
        sizeErr.code = 'fsrms-backpressure-overflow';
        throw sizeErr;
      }
    }
    
    // Generate End-to-End correlation ID if not present
    const correlationId = mutationData.correlationId || crypto.randomUUID();
    mutationData.correlationId = correlationId;

    const CRITICAL_MUTATION_TYPES = ['CREATE_TRANSACTION', 'CREATE_CASH_SHIFT'];
    const NON_CRITICAL_BUSINESS_MUTATION_TYPES = ['UPDATE_TRANSACTION', 'CREATE_CUSTOMER', 'CREATE_SERVICE', 'CREATE_APPOINTMENT', 'UPDATE_APPOINTMENT'];
    const DROPPABLE_TELEMETRY_OR_METRIC_MUTATION_TYPES = ['ADD_CUSTOMER_VISIT', 'UPDATE_CUSTOMER'];

    const isCritical = CRITICAL_MUTATION_TYPES.includes(mutationData.type);
    const isNonCriticalBusiness = NON_CRITICAL_BUSINESS_MUTATION_TYPES.includes(mutationData.type);
    const isDroppable = DROPPABLE_TELEMETRY_OR_METRIC_MUTATION_TYPES.includes(mutationData.type);

    if (!isMigration && currentCount >= MAX_QUEUE_DEPTH) {
      if (isCritical || isNonCriticalBusiness || !isDroppable) {
        const overflowErr = new Error(`Queue overflow limit (500) reached. Mutation "${mutationData.type}" blocked.`);
        overflowErr.code = 'fsrms-backpressure-overflow';
        throw overflowErr;
      } else {
        // Non-critical droppable items can drop oldest non-critical droppable item
        const tx = preCheckDb.transaction(['OFFLINE_MUTATION_QUEUE'], 'readwrite');
        const store = tx.objectStore('OFFLINE_MUTATION_QUEUE');
        const items = await store.getAll();
        const droppableItems = items.filter(item => DROPPABLE_TELEMETRY_OR_METRIC_MUTATION_TYPES.includes(item.type));
        
        if (droppableItems.length > 0) {
          droppableItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const droppedItem = droppableItems[0];
          await store.delete(droppedItem.id);
          console.warn(`Backpressure: Queue full. Dropped oldest telemetry/metric queue mutation #${droppedItem.id} (type: ${droppedItem.type}).`);
          
          try {
            // SRE Hardening: Dispatch telemetry warn event to prevent silent data loss and maintain observability
            const { emitWarn } = await import('./observability');
            await emitWarn({
              correlationId: droppedItem.correlationId || 'NO_CORRELATION',
              eventType: 'QUEUE_ITEM_DROPPED',
              layer: 'STORAGE',
              message: `Queue overflow limit reached. Dropped oldest non-critical mutation #${droppedItem.id} (type: ${droppedItem.type}) to make space.`,
              metadata: {
                queueId: droppedItem.id,
                mutationType: droppedItem.type,
                droppedAt: new Date().toISOString()
              }
            });
          } catch (telemetryErr) {
            console.error('[STORAGE-TELEMETRY] Failed to emit QUEUE_ITEM_DROPPED warning:', telemetryErr);
          }
        } else {
          const overflowErr = new Error(`Queue overflow limit (500) reached with no droppable entries. Mutation "${mutationData.type}" rejected.`);
          overflowErr.code = 'fsrms-backpressure-overflow';
          await tx.done;
          throw overflowErr;
        }
        await tx.done;
      }
    }

    // 0b. UUID Validation Gate — entity creation mutations MUST have a valid UUID payload.id.
    const CREATE_MUTATION_TYPES = [
      'CREATE_CUSTOMER', 'CREATE_SERVICE', 'CREATE_APPOINTMENT',
      'CREATE_TRANSACTION', 'CREATE_TRANSACTION_ITEM', 'CREATE_CASH_SHIFT'
    ];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (CREATE_MUTATION_TYPES.includes(mutationData.type) && mutationData.payload?.id) {
      if (!UUID_RE.test(mutationData.payload.id)) {
        const uuidErr = new Error(
          `[SafeQueue] UUID_VALIDATION_FAILED: "${mutationData.payload.id}" is not a valid UUID for mutation type "${mutationData.type}". ` +
          `Use crypto.randomUUID() at the call site. Mutation rejected to prevent Supabase 22P02 quarantine.`
        );
        console.error(uuidErr.message);
        throw uuidErr;
      }
    }

    // Inject and update updated_at and created_at ISO 8601 UTC timestamp
    if (mutationData.payload) {
      const now = new Date().toISOString();
      mutationData.payload.updated_at = now;
      if (!mutationData.payload.created_at) {
        mutationData.payload.created_at = now;
      }
    }

    // 1. Quota check
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const remaining = quota - usage;
      const fiveMB = 5 * 1024 * 1024; // 5MB in bytes

      if (remaining < fiveMB) {
        // Safe hybrid cross-thread canvas compression
        if (mutationData.payload && mutationData.payload.offline_media && mutationData.payload.offline_media.startsWith('data:image')) {
          console.warn('Low disk space (<5MB). Triggering hybrid cross-thread image compression fallback.');
          mutationData.payload.offline_media = await compressImageHybrid(mutationData.payload.offline_media);
          mutationData.payload.compressed = true;
        }
      }
    }

    // 2. Encryption at rest
    const credentials = await getSessionCredentials();
    const sessionToken = credentials ? credentials.token : '';
    console.log(`[SYNC-TRACE][3a] safeAddToQueue: encrypting mutation type="${mutationData.type}" id="${mutationData.payload?.id}" | hasToken=${!!sessionToken}`);
    const encryptedPayload = await encryptData(mutationData, sessionToken);
    console.log(`[SYNC-TRACE][3b] safeAddToQueue: encryption complete.`);

    // 3. Write to OFFLINE_MUTATION_QUEUE with unencrypted metadata for fast selector queries
    const db = await getStorageAdapter();
    const queueRecordId = mutationData.payload?.id || mutationData.id || crypto.randomUUID();
    const metadata = mutationData.type === 'CREATE_TRANSACTION' ? {
      total_amount: Number(mutationData.payload?.total_amount) || 0,
      customer_id: mutationData.payload?.customer_id || null,
      service_ids: mutationData.payload?.cart?.map(item => item.service_id) || [],
      payment_method: mutationData.payload?.payment_method || null
    } : mutationData.type === 'CREATE_CASH_SHIFT' ? {
      operator_name: mutationData.payload?.operator_name || '',
      starting_cash: Number(mutationData.payload?.starting_cash) || 0
    } : mutationData.type === 'CLOSE_CASH_SHIFT' ? {
      actual_cash: Number(mutationData.payload?.actual_cash) || 0,
      expected_cash: Number(mutationData.payload?.expected_cash) || 0
    } : undefined;

    await db.put('OFFLINE_MUTATION_QUEUE', {
      id: queueRecordId,
      encrypted: true,
      payload: encryptedPayload,
      type: mutationData.type,
      correlationId: correlationId,
      retryCount: 0,
      metadata,
      created_at: new Date().toISOString()
    });
    console.log(`[SYNC-TRACE][3c] safeAddToQueue: written to OFFLINE_MUTATION_QUEUE with id="${queueRecordId}".`);

    // 4. Dispatch pos-queue-updated so App listeners react immediately (e.g. badge count + sync trigger)
    // Previously missing — without this, the App had no reactive signal after a queue write.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pos-queue-updated'));
      console.log(`[SYNC-TRACE][3d] safeAddToQueue: dispatched pos-queue-updated event.`);
    }

    // 5. Periodically trigger TTL eviction check
    await runTTLEviction();

  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.message?.includes('QuotaExceededError')) {
      // Fire global custom event to block POS UI
      if (typeof window !== 'undefined') {
        const quotaEvent = new CustomEvent('pos-quota-exceeded', {
          detail: {
            message: 'IndexedDB Quota Exceeded. Offline cache is full. New transaction block active.',
            timestamp: new Date().toISOString()
          }
        });
        window.dispatchEvent(quotaEvent);
      }
    }
    throw err;
  }
}

// TTL Eviction Policy: Purge Done synced items older than 7 days from LOCAL_TRANSACTION_CACHE
export async function runTTLEviction() {
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction('LOCAL_TRANSACTION_CACHE', 'readwrite');
    const store = tx.objectStore('LOCAL_TRANSACTION_CACHE');
    const items = await store.getAll();
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const item of items) {
      if (item.status === 'Done') {
        const itemDate = new Date(item.created_at).getTime();
        if (now - itemDate > sevenDaysMs) {
          await store.delete(item.id);
          console.log(`TTL Eviction: Removed transaction #${item.id} (older than 7 days).`);
        }
      }
    }
  } catch (err) {
    console.error('Error running TTL eviction:', err);
  }
}

// Retrieve current offline mutation queue count atomically
export async function getQueueCount() {
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readonly');
    const store = tx.objectStore('OFFLINE_MUTATION_QUEUE');
    return await store.count();
  } catch (err) {
    console.error('Failed to retrieve offline queue count:', err);
    return 0;
  }
}

// Lightweight non-blocking telemetry beacon
// Delegates to TelemetryAdapter singleton (offline-first, per-provider queue, PII-safe)
export async function sendTelemetry(eventData) {
  try {
    // Lazy import to avoid circular dependency
    const { telemetry } = await import('./telemetry/index');
    const isCritical = (eventData.fail_count > 0) ||
                       (eventData.event === 'quarantine') ||
                       (eventData.event === 'circuit_breaker_tripped') ||
                       (eventData.event_type === 'DLQ_ACTIVATION') ||
                       (eventData.severity === 'ERROR' || eventData.severity === 'CRITICAL');

    telemetry.trackEvent(eventData.event || 'sync_execution', {
      ...eventData,
      _source: 'sendTelemetry_bridge',
      _priority: isCritical ? 'system' : 'normal',
    });
  } catch (err) {
    // Non-blocking: telemetry failures must never affect sync queue
    console.warn('[Telemetry] sendTelemetry bridge failed (non-fatal):', err);
  }
}


export async function getOfflineSalesAggregate() {
  try {
    const db = await getStorageAdapter();
    const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readonly');
    const store = tx.objectStore('OFFLINE_MUTATION_QUEUE');
    const items = await store.getAll();
    let sum = 0;
    let count = 0;
    const serviceCounts = {};
    const hourlyActivity = {};
    
    for (const item of items) {
      if (item.type === 'CREATE_TRANSACTION' && item.metadata) {
        // Fast path: bypass decryption using unencrypted outer metadata wrapper
        count++;
        const amount = Number(item.metadata.total_amount) || 0;
        sum += amount;
        
        const dateStr = item.created_at;
        if (dateStr) {
           const hour = new Date(dateStr).getHours();
           const label = `${hour.toString().padStart(2, '0')}:00`;
           if (!hourlyActivity[label]) hourlyActivity[label] = { value: 0, amount: 0 };
           hourlyActivity[label].value += 1;
           hourlyActivity[label].amount += amount;
        }

        if (Array.isArray(item.metadata.service_ids)) {
          item.metadata.service_ids.forEach((id) => {
            serviceCounts[id] = (serviceCounts[id] || 0) + 1;
          });
        }
        continue;
      }

      if (item.encrypted && item.payload) {
        try {
          const decrypted = await decryptData(item.payload, null);
          if (decrypted && decrypted.type === 'CREATE_TRANSACTION' && decrypted.payload && decrypted.payload.status === 'Done') {
            count++;
            const amount = Number(decrypted.payload.total_amount) || 0;
            sum += amount;
            
            // Hourly aggregation
            const dateStr = decrypted.payload.created_at || item.created_at;
            if (dateStr) {
               const hour = new Date(dateStr).getHours();
               const label = `${hour.toString().padStart(2, '0')}:00`;
               if (!hourlyActivity[label]) hourlyActivity[label] = { value: 0, amount: 0 };
               hourlyActivity[label].value += 1;
               hourlyActivity[label].amount += amount;
            }

            if (Array.isArray(decrypted.payload.cart)) {
              decrypted.payload.cart.forEach((i) => {
                if (i.service_id) {
                  serviceCounts[i.service_id] = (serviceCounts[i.service_id] || 0) + (Number(i.quantity) || 1);
                }
              });
            }
          }
        } catch(e) {
          console.warn(`[Senyap] Gagal dekripsi item antrean ${item.id}. Kemungkinan beda kunci. Menghapus item korup...`);
          try {
            await db.delete('OFFLINE_MUTATION_QUEUE', item.id);
          } catch(delErr) {
            console.error('Gagal menghapus item korup:', delErr);
          }
          continue;
        }
      }
    }
    return { sum, count, serviceCounts, hourlyActivity };
  } catch (err) {
    console.error('Failed to aggregate offline sales:', err);
    return { sum: 0, count: 0, serviceCounts: {}, hourlyActivity: {} };
  }
}

// =========================================================================
// ACTIVE SHIFT STORE — Pendekatan 2: operator_name dinamis per shift
// Menggantikan localStorage agar data shift ikut terhapus bersama IndexedDB
// dan tidak pernah korup akibat cache mismatch antar storage layer.
// Key record selalu 'current' — hanya satu shift aktif per perangkat.
// =========================================================================

/**
 * Simpan data shift aktif ke IndexedDB (ACTIVE_SHIFT_STORE).
 * Menimpa record lama jika ada (hanya satu shift aktif per perangkat).
 * @param {object} shiftData - Objek shift: { id, cashier_id, operator_name, starting_cash, ... }
 * @returns {Promise<void>}
 */
export async function saveActiveShift(shiftData) {
  if (!shiftData || !shiftData.id) {
    console.error('[ActiveShift] saveActiveShift: shiftData tidak valid, operasi dibatalkan.');
    return;
  }
  try {
    const db = await getStorageAdapter();
    // Selalu gunakan key 'current' untuk record tunggal — upsert pattern
    await db.put('ACTIVE_SHIFT_STORE', { ...shiftData, id: 'current', shift_id: shiftData.id });
    console.log('[ActiveShift] Data shift aktif berhasil disimpan ke IndexedDB:', shiftData.operator_name);
  } catch (err) {
    console.error('[ActiveShift] Gagal menyimpan data shift ke IndexedDB:', err);
  }
}

/**
 * Baca data shift aktif dari IndexedDB (ACTIVE_SHIFT_STORE).
 * Dipanggil saat komponen mount untuk restore state tanpa localStorage.
 * @returns {Promise<object|null>} - Objek shift aktif, atau null jika tidak ada
 */
export async function loadActiveShift() {
  try {
    const db = await getStorageAdapter();
    const record = await db.get('ACTIVE_SHIFT_STORE', 'current');
    if (record) {
      // Kembalikan shift_id sebagai id asli untuk kompatibilitas state
      return { ...record, id: record.shift_id };
    }
    return null;
  } catch (err) {
    console.error('[ActiveShift] Gagal membaca data shift dari IndexedDB:', err);
    return null;
  }
}

/**
 * Hapus data shift aktif dari IndexedDB (saat kasir menutup shift).
 * @returns {Promise<void>}
 */
export async function clearActiveShift() {
  try {
    const db = await getStorageAdapter();
    await db.delete('ACTIVE_SHIFT_STORE', 'current');
    console.log('[ActiveShift] Data shift aktif berhasil dihapus dari IndexedDB.');
  } catch (err) {
    console.error('[ActiveShift] Gagal menghapus data shift dari IndexedDB:', err);
  }
}

// Self-healing function to repair stale UUID mapping across all IndexedDB stores
export async function repairStaleUserIds(currentUserId) {
  const STALE_UUID = 'd0000000-0000-0000-0000-000000000002';
  if (!currentUserId || currentUserId === STALE_UUID) {
    return { repairedCount: 0 };
  }

  console.warn(`[STARTUP_VALIDATION] Stale ID check: replacing ${STALE_UUID} with active UUID ${currentUserId}`);
  let repairedCount = 0;

  try {
    const db = await getStorageAdapter();
    const credentials = await getSessionCredentials();
    const sessionToken = credentials ? credentials.token : '';

    // 1. Repair SECURE_USER_STORE (cached offline profiles)
    if (db.objectStoreNames.contains('SECURE_USER_STORE')) {
      const records = await db.getAll('SECURE_USER_STORE');
      for (const record of records) {
        let changed = false;
        if (record.profile && record.profile.id === STALE_UUID) {
          record.profile.id = currentUserId;
          changed = true;
        }
        if (changed) {
          const tx = db.transaction('SECURE_USER_STORE', 'readwrite');
          await tx.objectStore('SECURE_USER_STORE').put(record);
          await tx.done;
          repairedCount++;
          console.warn(`[STARTUP_VALIDATION] Repaired SECURE_USER_STORE record for email: ${record.email}`);
        }
      }
    }

    // 2. Repair OFFLINE_MUTATION_QUEUE
    if (db.objectStoreNames.contains('OFFLINE_MUTATION_QUEUE')) {
      const items = await db.getAll('OFFLINE_MUTATION_QUEUE');
      for (const item of items) {
        if (item.encrypted && item.payload) {
          try {
            const decrypted = await decryptData(item.payload, sessionToken);
            let payloadChanged = false;

            if (decrypted && decrypted.payload) {
              if (decrypted.payload.processed_by === STALE_UUID) {
                decrypted.payload.processed_by = currentUserId;
                payloadChanged = true;
              }
              if (decrypted.payload.voided_by === STALE_UUID) {
                decrypted.payload.voided_by = currentUserId;
                payloadChanged = true;
              }
              if (decrypted.payload.cashier_id === STALE_UUID) {
                decrypted.payload.cashier_id = currentUserId;
                payloadChanged = true;
              }
            }

            if (payloadChanged) {
              const reEncrypted = await encryptData(decrypted, sessionToken);
              item.payload = reEncrypted;
              
              // Open short-lived write transaction
              const tx = db.transaction('OFFLINE_MUTATION_QUEUE', 'readwrite');
              await tx.objectStore('OFFLINE_MUTATION_QUEUE').put(item);
              await tx.done;
              
              repairedCount++;
              console.warn(`[STARTUP_VALIDATION] Repaired OFFLINE_MUTATION_QUEUE payload ID for mutation: ${decrypted.type}`);
            }
          } catch (decErr) {
            console.error(`[STARTUP_VALIDATION] Failed to decrypt queue item ${item.id} during identity mapping validation:`, decErr);
          }
        }
      }
    }

    // 3. Repair QUARANTINED_MUTATIONS
    if (db.objectStoreNames.contains('QUARANTINED_MUTATIONS')) {
      const items = await db.getAll('QUARANTINED_MUTATIONS');
      for (const item of items) {
        let payloadChanged = false;

        // Quarantined mutations are stored decrypted
        if (item.payload) {
          if (item.payload.processed_by === STALE_UUID) {
            item.payload.processed_by = currentUserId;
            payloadChanged = true;
          }
          if (item.payload.voided_by === STALE_UUID) {
            item.payload.voided_by = currentUserId;
            payloadChanged = true;
          }
          if (item.payload.cashier_id === STALE_UUID) {
            item.payload.cashier_id = currentUserId;
            payloadChanged = true;
          }
        }

        if (payloadChanged) {
          const tx = db.transaction('QUARANTINED_MUTATIONS', 'readwrite');
          await tx.objectStore('QUARANTINED_MUTATIONS').put(item);
          await tx.done;
          repairedCount++;
          console.warn(`[STARTUP_VALIDATION] Repaired QUARANTINED_MUTATIONS record ID for mutation: ${item.type}`);
        }
      }
    }

    // 4. Repair ACTIVE_SHIFT_STORE
    if (db.objectStoreNames.contains('ACTIVE_SHIFT_STORE')) {
      const record = await db.get('ACTIVE_SHIFT_STORE', 'current');
      if (record && record.cashier_id === STALE_UUID) {
        record.cashier_id = currentUserId;
        const tx = db.transaction('ACTIVE_SHIFT_STORE', 'readwrite');
        await tx.objectStore('ACTIVE_SHIFT_STORE').put(record);
        await tx.done;
        repairedCount++;
        console.warn('[STARTUP_VALIDATION] Repaired ACTIVE_SHIFT_STORE cashier_id mapping.');
      }
    }

    console.warn(`[STARTUP_VALIDATION] Identity repair scan finished. Total repaired IndexedDB records: ${repairedCount}`);
  } catch (err) {
    console.error('[STARTUP_VALIDATION] Error during IndexedDB identity repair scan:', err);
  }

  return { repairedCount };
}

export async function detectClientCorruption() {
  const db = await getStorageAdapter();
  const issues = [];

  // Check 1: QUARANTINED_MUTATIONS count
  const quarantined = await db.getAll('QUARANTINED_MUTATIONS').catch(() => []);
  if (quarantined.length > 0) {
    issues.push({ type: 'QUARANTINED', count: quarantined.length, severity: 'HIGH' });
  }

  // Check 2: Queue items older than 48h (stuck mutations)
  const queue = await db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []);
  const cutoff = Date.now() - (48 * 60 * 60 * 1000);
  const stuckItems = queue.filter(i => {
    try {
      return new Date(i.created_at || i.timestamp).getTime() < cutoff;
    } catch {
      return false;
    }
  });
  if (stuckItems.length > 0) {
    issues.push({ type: 'STUCK_MUTATIONS', count: stuckItems.length, severity: 'HIGH' });
  }

  // Check 3: SECURE_USER_STORE missing (auth credentials lost)
  const userStore = await db.getAll('SECURE_USER_STORE').catch(() => []);
  const credentials = await getSessionCredentials();
  if (credentials && credentials.token && userStore.length === 0) {
    issues.push({ type: 'AUTH_LOST', severity: 'CRITICAL' });
  }

  // Check 4: ACTIVE_SHIFT_STORE consistency
  const shifts = await db.getAll('ACTIVE_SHIFT_STORE').catch(() => []);
  const openShifts = shifts.filter(s => !s.closed_at);
  if (openShifts.length > 1) {
    issues.push({ type: 'MULTIPLE_OPEN_SHIFTS', count: openShifts.length, severity: 'MEDIUM' });
  }

  db.close();
  return issues;
}

export async function detectClockDrift() {
  const credentials = await getSessionCredentials();
  if (!credentials) return { drift: null, status: 'UNKNOWN' };
  const { supabaseUrl, supabaseAnonKey } = credentials;
  if (!supabaseUrl) return { drift: null, status: 'UNKNOWN' };
  const clientTime = Date.now();
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      headers: { 'apikey': supabaseAnonKey }
    });
    const serverTimeStr = response.headers.get('date');
    if (!serverTimeStr) return { drift: null, status: 'UNKNOWN' };

    const serverTime = new Date(serverTimeStr).getTime();
    const drift = Math.abs(clientTime - serverTime);

    const status = drift > 30 * 60 * 1000 ? 'CRITICAL'   // > 30 min
                 : drift > 5 * 60 * 1000  ? 'WARNING'    // > 5 min
                 : 'OK';

    if (status !== 'OK') {
      console.warn(`[CLOCK DRIFT] Device clock drift: ${Math.round(drift/1000)}s. Status: ${status}`);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('clock-drift-detected', {
          detail: { driftMs: drift, driftSeconds: Math.round(drift/1000), status }
        }));
      }
    }

    return { drift, driftSeconds: Math.round(drift/1000), status };
  } catch {
    return { drift: null, status: 'UNKNOWN' };
  }
}

export async function exportQueueSnapshot() {
  const db = await getStorageAdapter();
  const items = await db.getAll('OFFLINE_MUTATION_QUEUE').catch(() => []);
  db.close();
  const snapshot = JSON.stringify({
    exportedAt: new Date().toISOString(),
    version: 'fsrms_secure_db_v10',
    count: items.length,
    items: items.map(i => ({ id: i.id, created_at: i.created_at, encrypted: true }))
  });
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('fsrms_queue_snapshot_pre_deploy', snapshot);
  }
  return items.length;
}

export async function updateQueuedTransactionCustomer(txId, customerId, customerName, customerPhone) {
  try {
    const db = await openSecureDB();
    
    // 1. Fetch item from queue first
    const item = await db.get('OFFLINE_MUTATION_QUEUE', txId);
    let updatedItem = null;
    
    if (item) {
      const credentials = await getSessionCredentials();
      const sessionToken = credentials ? credentials.token : '';
      const decrypted = await decryptData(item.payload, sessionToken);
      if (decrypted && decrypted.payload) {
        decrypted.payload.customer_id = customerId;
        decrypted.payload.customer_name = customerName;
        decrypted.payload.customer_phone = customerPhone;
        
        const encryptedPayload = await encryptData(decrypted, sessionToken);
        item.payload = encryptedPayload;

        // Also update unencrypted metadata wrapper
        if (!item.metadata) {
          item.metadata = {
            total_amount: Number(decrypted.payload.total_amount) || 0,
            customer_id: customerId,
            service_ids: decrypted.payload.cart?.map(c => c.service_id) || [],
            payment_method: decrypted.payload.payment_method || null
          };
        } else {
          item.metadata.customer_id = customerId;
        }
        
        updatedItem = item;
      }
    }

    // 2. Fetch item from cache
    const cachedTx = await db.get('LOCAL_TRANSACTION_CACHE', txId);
    if (cachedTx) {
      cachedTx.customer_id = customerId;
      cachedTx.customer_name = customerName;
      cachedTx.customer_phone = customerPhone;
    }

    // 3. Write updates inside a fresh, quick transaction
    const tx = db.transaction(['OFFLINE_MUTATION_QUEUE', 'LOCAL_TRANSACTION_CACHE'], 'readwrite');
    if (updatedItem) {
      await tx.objectStore('OFFLINE_MUTATION_QUEUE').put(updatedItem);
      console.log(`[StorageEngine] Updated queued transaction ${txId} customer to ${customerId}`);
    }
    if (cachedTx) {
      await tx.objectStore('LOCAL_TRANSACTION_CACHE').put(cachedTx);
      console.log(`[StorageEngine] Updated cached transaction ${txId} customer to ${customerId}`);
    }
    await tx.done;
  } catch (err) {
    console.error('[StorageEngine] Error updating queued transaction customer:', err);
  }
}


