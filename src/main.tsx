// EMERGENCY ONE-TIME DATABASE PURGE (V9 MIGRATION FIX)
(async () => {
  if (typeof window === 'undefined') return;

  // 1. Verify localStorage is supported and writable (Private Browsing protection)
  let isStorageWritable = false;
  try {
    const testKey = '__fsrms_storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    isStorageWritable = true;
  } catch (e) {
    isStorageWritable = false;
  }

  if (!isStorageWritable) {
    console.warn('⚠️ localStorage is not writable (e.g. Private Browsing). Programmatic database purge bypassed to prevent infinite loops.');
    return;
  }

  // 2. Prevent infinite reload loops via sessionStorage limit
  const MAX_PURGE_RELOADS = 3;
  let purgeReloads = 0;
  try {
    purgeReloads = parseInt(sessionStorage.getItem('v9_purge_reload_counter') || '0', 10);
  } catch (e) {}

  if (purgeReloads >= MAX_PURGE_RELOADS) {
    console.error(`❌ Purge reload limit (${MAX_PURGE_RELOADS}) exceeded. Bailing out to prevent crash loop.`);
    try {
      localStorage.setItem('v9_forced_reset_executed', 'true');
    } catch (e) {}
    return;
  }

  if (!localStorage.getItem('v9_forced_reset_executed')) {
    console.warn('⚠️ ENGINEERING NOTICE: Executing programmatic database purge for Version 9 migration...');
    const dbName = 'fsrms_secure_db';

    // Track reload attempt
    try {
      sessionStorage.setItem('v9_purge_reload_counter', (purgeReloads + 1).toString());
    } catch (e) {}

    // 1. Force absolute unregistration of all service workers and wait for completion
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
        console.log('✅ All service workers successfully unregistered.');
      } catch (swErr) {
        console.error('❌ Failed to clear service workers:', swErr);
      }
    }

    // 2. Open the delete request
    const deleteRequest = indexedDB.deleteDatabase(dbName);

    deleteRequest.onsuccess = () => {
      console.log('✅ Database fsrms_secure_db successfully purged.');
      try {
        localStorage.setItem('v9_forced_reset_executed', 'true');
        sessionStorage.removeItem('v9_purge_reload_counter');
        sessionStorage.removeItem('v9_purge_retries');
      } catch (e) {}
      window.location.reload();
    };

    deleteRequest.onerror = () => {
      console.error('❌ Critical error during IndexedDB purge event.');
      try {
        localStorage.setItem('v9_forced_reset_executed', 'true'); // Prevents infinite loops on hard error
      } catch (e) {}
      window.location.reload();
    };

    deleteRequest.onblocked = () => {
      let retries = 0;
      try {
        retries = parseInt(sessionStorage.getItem('v9_purge_retries') || '0', 10);
      } catch (e) {}

      if (retries < 3) {
        console.warn(`⚠️ Purge blocked by open connections. Retry attempt ${retries + 1}/3...`);
        try {
          sessionStorage.setItem('v9_purge_retries', (retries + 1).toString());
        } catch (e) {}
        window.location.reload();
      } else {
        console.error('❌ Purge permanently blocked by other open tabs. Proceeding to boot with stale state.');
        try {
          localStorage.setItem('v9_forced_reset_executed', 'true'); // Bail out to prevent browser tab crash
        } catch (e) {}
        window.location.reload();
      }
    };
  }
})();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { openDB } from 'idb';
import App from './App.tsx';
import './index.css';

// 1. Configure the QueryClient with offlineFirst networkMode
// React Query is configured as the sole cache owner for all Supabase/API dynamic data.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      gcTime: 1000 * 60 * 60 * 24 * 7, // Keep cache entries for 7 days
      staleTime: 1000 * 60 * 5,       // Consider data fresh for 5 minutes
      retry: 2,
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

// 2. Set up IndexedDB-based Persister wrapper using idb
const createIndexedDBPersister = (dbName = 'fsrms-query-cache') => {
  const dbPromise = openDB(dbName, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('query-cache')) {
        db.createObjectStore('query-cache');
      }
    },
  });

  return {
    persistClient: async (client: any) => {
      try {
        const db = await dbPromise;
        await db.put('query-cache', client, 'client-state');
      } catch (err) {
        console.error('React Query Persister: Failed to save query cache to IndexedDB:', err);
      }
    },
    restoreClient: async () => {
      try {
        const db = await dbPromise;
        return await db.get('query-cache', 'client-state');
      } catch (err) {
        console.error('React Query Persister: Failed to restore query cache from IndexedDB:', err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        const db = await dbPromise;
        await db.delete('query-cache', 'client-state');
      } catch (err) {
        console.error('React Query Persister: Failed to delete query cache from IndexedDB:', err);
      }
    },
  };
};

const persister = createIndexedDBPersister();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days cache validity
      }}
    >
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
