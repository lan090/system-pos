/**
 * FSRMS v2.0 — Supabase Client Initialization
 *
 * FRD §4 Compliance:
 * - Uses import.meta.env.VITE_SUPABASE_URL and import.meta.env.VITE_SUPABASE_ANON_KEY
 * - Zero hardcoded strings. Values are populated from .env.local at build time.
 * - ERD requires: PostgreSQL via Supabase, Row-Level Security (RLS) enforced server-side.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// =============================================================================
// DIAGNOSTIK KUNCI SUPABASE — Dicetak sekali saat modul pertama kali di-load
// =============================================================================
console.log('=== DIAGNOSTIK KUNCI SUPABASE ===');
console.log('URL    :', supabaseUrl || '❌ KOSONG / UNDEFINED');
console.log('KEY    :', supabaseAnonKey
  ? `✅ TERSEDIA (${supabaseAnonKey.length} chars, ${supabaseAnonKey.split('.').length} parts)`
  : '❌ KOSONG / UNDEFINED (KRITIS)'
);

// Validasi format JWT: harus terdiri dari 3 bagian dipisahkan titik
const _keyParts = supabaseAnonKey ? supabaseAnonKey.split('.') : [];
const _isValidJWT = supabaseAnonKey ? _keyParts.length === 3 : false;

if (supabaseAnonKey && !_isValidJWT) {
  console.error(
    `❌ KRITIS: VITE_SUPABASE_ANON_KEY bukan format JWT valid!\n` +
    `   Format diterima : ${supabaseAnonKey.substring(0, 30)}... (${_keyParts.length} parts)\n` +
    `   Format yang wajib: eyJ...header.eyJ...payload.signature (3 parts)\n` +
    `   Solusi: Ganti dengan JWT Anon Key dari Supabase Dashboard → Project Settings → API`
  );
}
console.log('=================================');
// =============================================================================

// Guard: Fail loudly at startup if env vars are misconfigured, before any DB call is made.
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[FSRMS] ❌ KRITIS: Supabase env vars tidak terbaca!\n' +
    'Pastikan file .env.local ada di root proyek dan berisi:\n' +
    '  VITE_SUPABASE_URL=https://<project-ref>.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=eyJ... (JWT format, 3 parts)\n' +
    'Restart dev server setelah mengubah .env.local.'
  );
}

/**
 * Boolean flag: true only when BOTH env vars are present AND the key is a valid 3-part JWT.
 * Use this to gate any component that must not fire requests with malformed credentials.
 *
 * @example
 * import { isSupabaseReady } from '@/src/lib/supabaseClient';
 * if (!isSupabaseReady) return; // skip fetch
 */
export const isSupabaseReady: boolean =
  Boolean(supabaseUrl) && Boolean(supabaseAnonKey) && _isValidJWT;

/**
 * The shared Supabase client instance.
 * ALWAYS check `isSupabaseReady` before calling any Supabase method to avoid
 * sending requests with a malformed/empty Authorization header.
 *
 * @example
 * import { supabase, isSupabaseReady } from '@/src/lib/supabaseClient';
 * if (!isSupabaseReady) return;
 * const { data, error } = await supabase.from('customers').select('*');
 */
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.placeholder.placeholder',
  {
    auth: {
      // Store auth session in localStorage so it survives page refreshes
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      // Intercept every request: abort immediately with a clear error if credentials are invalid
      // This prevents the 401 spam loop from reaching the network at all.
      fetch: (url, options) => {
        if (!isSupabaseReady) {
          console.error(
            '[FSRMS] ❌ Supabase request BLOCKED: env vars tidak valid.\n' +
            'URL:', url
          );
          return Promise.reject(new Error('FSRMS: Supabase credentials not ready. Request blocked.'));
        }

        // Define request timeout (15s) to prevent indefinite hangs during network chaos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[FSRMS] Fetch request to ${url} timed out after 15s. Aborting.`);
          controller.abort();
        }, 15000);

        // Support external abort signals if provided
        if (options?.signal) {
          if (options.signal.aborted) {
            controller.abort();
          } else {
            options.signal.addEventListener('abort', () => {
              controller.abort();
            });
          }
        }

        return fetch(url, { ...options, signal: controller.signal })
          .then((res) => {
            clearTimeout(timeoutId);
            return res;
          })
          .catch((err) => {
            clearTimeout(timeoutId);
            return Promise.reject(err);
          });
      },
    },
  }
);
