import { useState, useEffect, useRef } from 'react';

// --- Isolated Crypto Module (Finding #1: Crypto Deadlock Mitigation) ---
// AUTH_KEY_SALT must be set via VITE_AUTH_SESSION_SECRET env var.
// Generate a strong random secret: openssl rand -hex 32
// IMPORTANT: Do NOT add a static fallback here — a hardcoded key would allow
// offline decryption of any session stored in localStorage by anyone with the source code.
const AUTH_KEY_SALT = import.meta.env.VITE_AUTH_SESSION_SECRET;
if (!AUTH_KEY_SALT) {
  console.error(
    '[FSRMS] CRITICAL: VITE_AUTH_SESSION_SECRET is not set in .env.local.\n' +
    'Session encryption is disabled — sessions will fail to encrypt/decrypt.\n' +
    'Generate a strong key: openssl rand -hex 32\n' +
    'Add it to .env.local: VITE_AUTH_SESSION_SECRET=<your-key>'
  );
}

async function getIsolatedCryptoKey() {
  const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(AUTH_KEY_SALT));
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

async function saveSecureAuthSession(sessionData: any) {
  if (typeof localStorage === 'undefined') return;
  try {
    const key = await getIsolatedCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(JSON.stringify(sessionData));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedData);
    const payload = {
      iv: btoa(String.fromCharCode(...iv)),
      data: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
    };
    localStorage.setItem('fsrms_secure_auth', JSON.stringify(payload));
  } catch (err) {
    console.error('Isolated Auth: Failed to encrypt session', err);
  }
}

async function getSecureAuthSession() {
  if (typeof localStorage === 'undefined') return null;
  const stored = localStorage.getItem('fsrms_secure_auth');
  if (!stored) return null;
  try {
    const encryptedObj = JSON.parse(stored);
    const key = await getIsolatedCryptoKey();
    const iv = new Uint8Array(atob(encryptedObj.iv).split('').map(c => c.charCodeAt(0)));
    const ciphertext = new Uint8Array(atob(encryptedObj.data).split('').map(c => c.charCodeAt(0)));
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decryptedBuffer));
  } catch (err) {
    console.error('Isolated Auth: Failed to decrypt session', err);
    return null;
  }
}

async function clearSecureAuthSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem('fsrms_secure_auth');
}

// Self-healing identity repair helper
async function performIdentityRepair(sessionUser: any) {
  const STALE_UUID = 'd0000000-0000-0000-0000-000000000002';
  if (!sessionUser || !sessionUser.id || sessionUser.id === STALE_UUID) return;

  try {
    // 1. Repair localStorage session cache
    const cachedSession = await getSecureAuthSession();
    if (cachedSession && cachedSession.user && cachedSession.user.id === STALE_UUID) {
      console.warn(`[STARTUP_VALIDATION] Mismatch detected: cached local user ID is ${STALE_UUID}, active Supabase user ID is ${sessionUser.id}. Repairing localStorage.`);
      cachedSession.user.id = sessionUser.id;
      await saveSecureAuthSession(cachedSession);
    }

    // 2. Repair IndexedDB stores (SECURE_USER_STORE, OFFLINE_MUTATION_QUEUE, etc.)
    const { repairStaleUserIds } = await import('../utils/storageEngine');
    const result = await repairStaleUserIds(sessionUser.id);
    if (result.repairedCount > 0) {
      console.log(`[STARTUP_VALIDATION] Identity repair successfully updated ${result.repairedCount} records across all client-side databases.`);
    }
  } catch (err) {
    console.error('[STARTUP_VALIDATION] Exception during performIdentityRepair:', err);
  }
}
// ------------------------------------------------------------------------

export function useAuth(checkActualConnectivity: () => boolean | Promise<boolean>) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // FIX (Infinite Loop): Simpan referensi fungsi di ref agar tidak masuk
  // dependency array. Tanpa ini, setiap render App.tsx membuat instance baru
  // checkActualConnectivity → [checkActualConnectivity] berubah → useEffect
  // re-run → validateSession dipanggil lagi → infinite loop.
  const connectivityCheckRef = useRef(checkActualConnectivity);
  useEffect(() => {
    connectivityCheckRef.current = checkActualConnectivity;
  });

  useEffect(() => {
    const validateSession = async () => {
      try {
        const decrypted = await getSecureAuthSession();
        if (decrypted && decrypted.user) {
          const currentTimestamp = Math.floor(Date.now() / 1000);
          if (decrypted.expires_at > currentTimestamp) {
            let activeUser = decrypted.user;
            const isOnline = await connectivityCheckRef.current();
            
            if (isOnline) {
              try {
                const { supabase } = await import('../lib/supabaseClient');
                const { data: userProfile, error: profileError } = await supabase
                  .from('users')
                  .select('id, email, username, nama_lengkap, role, is_active, password_hash, password_salt, created_at')
                  .eq('id', decrypted.user.id)
                  .single();
                  
                if (!profileError && userProfile) {
                  if (!userProfile.is_active) {
                    // Account deactivated, clear session
                    await clearSecureAuthSession();
                    const { clearSessionCredentials } = await import('../utils/storageEngine');
                    await clearSessionCredentials();
                    setIsLoggedIn(false);
                    setCurrentUser(null);
                    return;
                  }
                  
                  // Update current user profile with latest data from DB
                  activeUser = {
                    ...userProfile,
                    user_metadata: {
                      role: userProfile.role,
                      nama_lengkap: userProfile.nama_lengkap,
                      full_name: userProfile.nama_lengkap,
                      username: userProfile.username
                    }
                  };
                  decrypted.user = activeUser;
                  await saveSecureAuthSession(decrypted);
                }
              } catch (err) {
                console.error("Error checking active status on startup", err);
              }
            }
            
            // Re-sync session token with storageEngine so syncEngine can use it
            const { saveSessionCredentials } = await import('../utils/storageEngine');
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
            const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
            await saveSessionCredentials(decrypted.access_token || supabaseAnon, supabaseUrl, supabaseAnon);

            setIsLoggedIn(true);
            setCurrentUser(activeUser);
          }
        }
      } catch (err) {
        console.error("Error validating auth session", err);
      } finally {
        setIsCheckingAuth(false);
      }
    };
    validateSession();
  }, []);

  // =========================================================================
  // handleLogin — Titik masuk autentikasi produksi (online + offline fallback)
  //
  // Path ONLINE:
  //   Verifikasi database-driven via public.users & PBKDF2 hash.
  //   Login Supabase di bawah kap menggunakan generic terminal account.
  //   Cache ke SECURE_USER_STORE + localStorage.
  //
  // Path OFFLINE:
  //   verifyOfflineCredential() → bandingkan PBKDF2 hash password dari IDB cache.
  // =========================================================================
  const handleLogin = async (
    emailOrUsername: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    const isOnline = await connectivityCheckRef.current();

    if (isOnline) {
      try {
        const { supabase } = await import('../lib/supabaseClient');

        // 1. Fetch user's salt via secure RPC — never exposes hash to client
        // get_user_salt() is a SECURITY DEFINER RPC accessible by anon, returns salt only
        const { data: saltRows, error: saltError } = await supabase
          .rpc('get_user_salt', { p_identifier: emailOrUsername });

        if (saltError || !saltRows?.length) {
          console.error('[Auth] Fetch salt failed:', saltError?.message);
          return { success: false, error: 'Email atau username tidak ditemukan.' };
        }

        const userSaltData = saltRows[0];
        if (!userSaltData.is_active) {
          return { success: false, error: 'Akun Anda dinonaktifkan. Hubungi Owner.' };
        }

        // 2. Compute hash locally using returned salt
        const { hashPassword } = await import('../utils/crypto');
        const computedHash = await hashPassword(password, userSaltData.salt);

        // 3. Verify credentials via secure RPC — returns profile WITHOUT hash/salt
        // verify_user_credentials() checks username/email AND hash match server-side
        const { data: profileRows, error: profileError } = await supabase
          .rpc('verify_user_credentials', {
            p_identifier: emailOrUsername,
            p_computed_hash: computedHash
          });

        if (profileError || !profileRows?.length) {
          console.error('[Auth] Profile verification failed:', profileError?.message);
          return { success: false, error: 'Password salah. Periksa kembali kredensial Anda.' };
        }

        const userProfile = profileRows[0];

        // 4. Authenticate under the hood via Edge Function — terminal password NEVER in client bundle
        // The 'authenticate' Edge Function performs the Supabase Auth terminal login server-side
        // using TERMINAL_PASSWORD stored as a Supabase secret (not accessible from client).
        let sessionToken = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        let expiresAt = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 30); // 30 days default

        try {
          const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/authenticate`;
          const edgeResponse = await fetch(edgeFnUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({ identifier: emailOrUsername, computedHash })
          });

          if (edgeResponse.ok) {
            const edgeData = await edgeResponse.json();
            if (edgeData.access_token) {
              sessionToken = edgeData.access_token;
              expiresAt = edgeData.expires_at;
            }
          } else {
            console.warn('[Auth] Edge Function terminal login returned non-OK. Falling back to anon key. Status:', edgeResponse.status);
          }
        } catch (e) {
          console.warn('[Auth] Edge Function terminal login error. Falling back to anon key:', e);
        }

        // 5. Structure user object with user_metadata compatibility
        const mappedUser = {
          ...userProfile,
          user_metadata: {
            role: userProfile.role,
            nama_lengkap: userProfile.nama_lengkap,
            full_name: userProfile.nama_lengkap,
            username: userProfile.username
          }
        };

        const sessionData = {
          access_token: sessionToken,
          expires_at: expiresAt,
          user: mappedUser
        };

        // Simpan sesi terenkripsi ke localStorage
        await saveSecureAuthSession(sessionData);

        // Simpan token ke IndexedDB agar Service Worker dapat sync
        const { saveSessionCredentials, saveOfflineUserCredential } = await import('../utils/storageEngine');
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
        await saveSessionCredentials(sessionToken, supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY || '');

        // Cache credential offline (SHA-256 hash password) ke SECURE_USER_STORE
        // agar kasir bisa login tanpa internet selama 30 hari ke depan.
        // Note: verify_user_credentials RPC returns profile WITHOUT hash/salt (security design).
        // We pass them explicitly from the already-computed values in steps 1-2 above.
        await saveOfflineUserCredential(
          emailOrUsername,
          password,
          { ...userProfile, password_hash: computedHash, password_salt: userSaltData.salt },
          expiresAt
        );

        setIsLoggedIn(true);
        setCurrentUser(mappedUser);

        // Register individual operator identity for audit trail on non-transactional tables.
        // The fn_log_table_activity trigger reads 'app.current_operator_id' session variable.
        // Without this, audit logs for customers/services/appointments/therapists show
        // the shared terminal UUID instead of the real individual operator UUID.
        try {
          await supabase.rpc('set_current_operator', { p_operator_id: userProfile.id });
        } catch (e) {
          // Non-blocking: audit trail degrades gracefully to terminal UUID if this fails
          console.warn('[Auth] Could not register operator identity for audit trail:', e);
        }

        return { success: true };
      } catch (err: any) {
        console.error('[Auth] Exception saat login online:', err);
        return { success: false, error: 'Terjadi kesalahan jaringan. Coba lagi.' };
      }
    } else {
      // ---- PATH OFFLINE: Verifikasi lokal dari SECURE_USER_STORE ----
      console.log('[Auth] Jaringan tidak tersedia. Mencoba verifikasi offline...');
      try {
        const { verifyOfflineCredential } = await import('../utils/storageEngine');
        const result = await verifyOfflineCredential(emailOrUsername, password);

        if (result.success && result.profile) {
          // Structure user object with user_metadata compatibility
          const mappedUser = {
            ...result.profile,
            user_metadata: {
              role: result.profile.role,
              nama_lengkap: result.profile.nama_lengkap,
              full_name: result.profile.nama_lengkap,
              username: result.profile.username
            }
          };

          // Bangun kembali sesi minimal dari cached profile
          const cachedSession = {
            access_token: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
            expires_at: Math.floor(Date.now() / 1000) + (60 * 60 * 8), // 8 jam sesi lokal
            user: mappedUser
          };
          await saveSecureAuthSession(cachedSession);

          setIsLoggedIn(true);
          setCurrentUser(mappedUser);
          return { success: true };
        }

        return { success: false, error: result.error || 'Verifikasi offline gagal.' };
      } catch (err: any) {
        console.error('[Auth] Exception saat verifikasi offline:', err);
        return { success: false, error: 'Sistem offline: gagal memuat data kredensial lokal.' };
      }
    }
  };

  const handleLoginSuccess = async (sessionData: any) => {
    if (sessionData) {
      await saveSecureAuthSession(sessionData);
      const { saveSessionCredentials } = await import('../utils/storageEngine');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
      await saveSessionCredentials(sessionData.access_token, supabaseUrl, supabaseAnon);
    }
    setIsLoggedIn(true);
  };

  const handleLogout = async () => {
    try {
      const { getQueueCount, clearSessionCredentials, clearOfflineUserCredential } = await import('../utils/storageEngine');
      const queueCount = await getQueueCount();
      
      if (queueCount > 0) {
        const errorMsg = `Gagal Keluar: Ada [${queueCount}] data transaksi yang belum sinkron dengan server pusat. Cari koneksi internet dan tunggu hingga sinkronisasi selesai sebelum keluar!`;
        alert(errorMsg);
        return false;
      }

      // Hapus semua credential dari semua store
      await clearSessionCredentials();
      await clearSecureAuthSession();

      // Hapus offline credential dari SECURE_USER_STORE jika user diketahui
      if (currentUser?.email) {
        await clearOfflineUserCredential(currentUser.email);
      }
      if (currentUser?.username) {
        await clearOfflineUserCredential(currentUser.username);
      }

      // Sign out dari Supabase Auth (invalidasi token di server)
      try {
        const { supabase } = await import('../lib/supabaseClient');
        await supabase.auth.signOut();
      } catch (signOutErr) {
        // Non-blocking: jika offline, Supabase signOut gagal tapi tidak apa-apa
        console.warn('[Auth] Supabase signOut gagal (mungkin offline):', signOutErr);
      }

      setIsLoggedIn(false);
      setCurrentUser(null);
      return true;
    } catch (err) {
      console.error("Safe Logout Interceptor: Failed to execute secure logout sequence:", err);
      setIsLoggedIn(false);
      setCurrentUser(null);
      return true;
    }
  };

  return { isLoggedIn, isCheckingAuth, currentUser, handleLogin, handleLoginSuccess, handleLogout };
}

// =========================================================================
// Helper: Terjemahkan pesan error Supabase Auth ke Bahasa Indonesia
// =========================================================================
function mapSupabaseAuthError(supabaseMsg: string): string {
  const msg = supabaseMsg.toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid_grant')) {
    return 'Email atau password salah. Periksa kembali kredensial Anda.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Email belum diverifikasi. Periksa kotak masuk email Anda.';
  }
  if (msg.includes('too many requests')) {
    return 'Terlalu banyak percobaan login. Tunggu beberapa menit dan coba lagi.';
  }
  if (msg.includes('user not found')) {
    return 'Akun dengan email ini tidak terdaftar.';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Gagal terhubung ke server. Periksa koneksi internet Anda.';
  }
  // Fallback: tampilkan pesan asli Supabase
  return `Login gagal: ${supabaseMsg}`;
}
