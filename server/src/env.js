/**
 * Environment configuration — one place, validated once at boot.
 * Reads `expense-manager/.env` first, then `server/.env` as a fallback.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';

const serverDir = path.resolve(import.meta.dirname, '..');
const rootDir = path.resolve(serverDir, '..');

dotenv.config({
  path: [path.join(rootDir, '.env'), path.join(serverDir, '.env')],
  quiet: true,
});

const raw = process.env;
const nodeEnv = raw.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const problems = [];

// --- Storage -----------------------------------------------------------------
// "file" needs no setup at all; "mongo" needs MONGODB_URI (see README).
let storageDriver = (raw.STORAGE_DRIVER || '').toLowerCase();
if (!storageDriver) storageDriver = raw.MONGODB_URI ? 'mongo' : 'file';
if (!['file', 'mongo', 'memory'].includes(storageDriver)) {
  problems.push(`STORAGE_DRIVER must be "file", "mongo" or "memory" (got "${storageDriver}")`);
}
if (storageDriver === 'mongo' && !raw.MONGODB_URI) {
  problems.push('STORAGE_DRIVER=mongo requires MONGODB_URI');
}

// --- Auth secret -------------------------------------------------------------
let jwtSecret = raw.JWT_SECRET || '';
let ephemeralSecret = false;
if (!jwtSecret) {
  if (isProduction) {
    problems.push('JWT_SECRET is required in production — put a long random string in .env');
  } else {
    jwtSecret = crypto.randomBytes(48).toString('hex');
    ephemeralSecret = true;
  }
} else if (jwtSecret.length < 32 && isProduction) {
  problems.push('JWT_SECRET must be at least 32 characters in production');
}

if (problems.length > 0) {
  throw new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
}

export const config = {
  nodeEnv,
  isProduction,
  host: raw.HOST || '127.0.0.1',
  port: int(raw.PORT, 4000),
  rootDir,
  serverDir,

  storageDriver,
  mongoUri: raw.MONGODB_URI || '',
  mongoDbName: raw.MONGODB_DB || 'expense_manager',
  dataFile: raw.DATA_FILE
    ? path.resolve(rootDir, raw.DATA_FILE)
    : path.join(serverDir, '.data', 'db.json'),

  jwtSecret,
  ephemeralSecret,
  jwtExpiresIn: raw.JWT_EXPIRES_IN || '30d',
  bcryptRounds: Math.min(Math.max(int(raw.BCRYPT_ROUNDS, 12), 10), 15),
  cookieName: raw.COOKIE_NAME || 'em_session',
  cookieSecure: bool(raw.COOKIE_SECURE, isProduction),
  cookieSameSite: raw.COOKIE_SAMESITE || 'lax',

  // Comma-separated list. Empty = same-origin only (the Vite dev proxy).
  corsOrigins: (raw.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  allowRegistration: bool(raw.ALLOW_REGISTRATION, true),
  clientDist: path.join(rootDir, 'client', 'dist'),
};

export function describeConfig() {
  return [
    `env         ${config.nodeEnv}`,
    `storage     ${config.storageDriver}${config.storageDriver === 'file' ? ` (${config.dataFile})` : ''}`,
    `listening   http://${config.host}:${config.port}`,
    `signup      ${config.allowRegistration ? 'open' : 'closed'}`,
  ].join('\n  ');
}
