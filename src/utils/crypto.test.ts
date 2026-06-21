import { describe, it, expect } from 'vitest';
import { generateSalt, hashPassword } from './crypto';

describe('Crypto Utilities', () => {
  it('should generate a unique salt of specified length', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    expect(salt1.length).toBe(32); // Hex format is 2x length
    expect(salt1).not.toBe(salt2);
  });

  it('should hash a password consistently with the same salt', async () => {
    const password = 'mySecretPassword123';
    const salt = '9f72b64d1f2e4a8b';
    const hash1 = await hashPassword(password, salt);
    const hash2 = await hashPassword(password, salt);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 output is 64 hex chars
  });
});
