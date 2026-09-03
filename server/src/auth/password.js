/**
 * Password hashing.
 *
 * Plain text is SHA-256'd (base64, 44 chars) before bcrypt so that passwords
 * longer than bcrypt's 72-byte input limit are not silently truncated. The stored
 * value is a standard bcrypt hash; verification re-runs the same pipeline and
 * compares, so the plain password never needs to be kept anywhere.
 */
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../env.js';

/** A real bcrypt hash of an unguessable value, used to keep login timing flat. */
let dummyHash = null;
function getDummyHash() {
  if (!dummyHash) {
    dummyHash = bcrypt.hashSync(prehash(randomBytes(32).toString('hex')), config.bcryptRounds);
  }
  return dummyHash;
}

const prehash = (plain) => createHash('sha256').update(String(plain), 'utf8').digest('base64');

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export function describePasswordProblem(plain) {
  const value = String(plain ?? '');
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

export async function hashPassword(plain) {
  const problem = describePasswordProblem(plain);
  if (problem) throw new Error(problem);
  return bcrypt.hash(prehash(plain), config.bcryptRounds);
}

/** Constant-ish time: an unknown user still costs one bcrypt comparison. */
export async function verifyPassword(plain, hash) {
  const known = typeof hash === 'string' && hash.startsWith('$2');
  const matches = await bcrypt.compare(prehash(plain), known ? hash : getDummyHash());
  return known && matches;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
