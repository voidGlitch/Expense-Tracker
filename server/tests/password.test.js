/** Password hashing (the "hash then compare" requirement) — no HTTP involved. */
import { describe, expect, it } from 'vitest';
import {
  PASSWORD_MAX_LENGTH,
  describePasswordProblem,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from '../src/auth/password.js';

describe('password hashing', () => {
  it('never stores the plain text and produces a bcrypt hash', async () => {
    const hash = await hashPassword('budget2026');
    expect(hash).not.toContain('budget2026');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('salts: the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('budget2026'), hashPassword('budget2026')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('budget2026', a)).toBe(true);
    expect(await verifyPassword('budget2026', b)).toBe(true);
  });

  it('verifies the right password and rejects wrong ones', async () => {
    const hash = await hashPassword('budget2026');
    expect(await verifyPassword('budget2026', hash)).toBe(true);
    expect(await verifyPassword('budget2025', hash)).toBe(false);
    expect(await verifyPassword('Budget2026', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('rejects an unknown account without throwing (timing stays flat)', async () => {
    expect(await verifyPassword('budget2026', undefined)).toBe(false);
    expect(await verifyPassword('budget2026', null)).toBe(false);
    expect(await verifyPassword('budget2026', 'not-a-hash')).toBe(false);
  });

  it('handles passwords longer than bcrypt\'s 72-byte limit without truncating', async () => {
    const long = `${'a'.repeat(80)}1`;
    const alsoLong = `${'a'.repeat(80)}2`;
    const hash = await hashPassword(long);
    expect(await verifyPassword(long, hash)).toBe(true);
    // Without the SHA-256 pre-hash these two would collide after 72 bytes.
    expect(await verifyPassword(alsoLong, hash)).toBe(false);
  });

  it('enforces the documented password rules', () => {
    expect(describePasswordProblem('short1')).toMatch(/at least 8/);
    expect(describePasswordProblem('allletters')).toMatch(/letter and one number/);
    expect(describePasswordProblem('12345678')).toMatch(/letter and one number/);
    expect(describePasswordProblem('a'.repeat(PASSWORD_MAX_LENGTH + 1) + '1')).toMatch(/at most/);
    expect(describePasswordProblem('budget2026')).toBeNull();
  });

  it('rejects a weak password at the hashing boundary too', async () => {
    await expect(hashPassword('abc')).rejects.toThrow(/at least 8/);
  });

  it('normalises emails so case and spacing cannot create duplicates', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com');
    expect(normalizeEmail(undefined)).toBe('');
  });
});
