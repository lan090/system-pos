/**
 * FSRMS v2.0 - Cryptographic Utilities
 * Uses browser-native Web Crypto API (PBKDF2 with SHA-256 and 100,000 iterations).
 * Zero-dependency, offline-first compatible.
 */

// Retrieve the crypto object from either window or globalThis (for Vitest/Node support)
const getCrypto = (): Crypto => {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    return globalThis.crypto as Crypto;
  }
  // Fallback to Node.js crypto module if needed
  throw new Error('Web Crypto API is not supported in this environment.');
};

/**
 * Generates a cryptographically strong random salt (in hex format).
 * @param length The byte size of the salt. Default is 16 bytes (32 hex characters).
 */
export function generateSalt(length: number = 16): string {
  const array = new Uint8Array(length);
  getCrypto().getRandomValues(array);
  return Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hashes a plaintext password using PBKDF2 with SHA-256.
 * @param password Plaintext password.
 * @param salt Unique hex salt.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = encoder.encode(salt);
  const cryptoInstance = getCrypto();

  // Import the password as a raw key
  const baseKey = await cryptoInstance.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive bits using PBKDF2 with SHA-256
  const derivedBits = await cryptoInstance.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  // Convert buffer to hex string
  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
