import { createHash, randomUUID } from 'node:crypto';
import { conflict } from '../util/http.js';

export const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const ledgerRevision = (rows) => fingerprint([...rows.expenses, ...rows.settlements].map((row) => [row.id, row.revision || 1, row.deletedAt]).sort((a, b) => a[0].localeCompare(b[0])));
export function checkRevision(expected, current) {
  if (expected != null && String(expected) !== String(current)) throw conflict('This ledger changed. Refresh and review the current balance before saving.', { serverRev: current });
}
export function creationIdentity(req, prefix, payload) {
  const key = req.body?.idempotencyKey;
  const id = key ? `${prefix}_${fingerprint([req.user.id, String(key)]).slice(0, 40)}` : `${prefix}_${randomUUID()}`;
  const { expectedRevision, idempotencyKey, ...content } = payload;
  return { id, idempotencyKey: key || null, requestHash: fingerprint(content) };
}
export function checkReplay(existing, identity) {
  if (!existing) return false;
  if (existing.requestHash !== identity.requestHash) throw conflict('This submission key was already used for different details.');
  return true;
}

/** Serialize read/validate/write across processes. Mongo uses a database lease. */
const queues = new WeakMap();
export async function lockLedgerWrites(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  try {
    let release;
    if (req.repo.acquireLedgerLock) release = await req.repo.acquireLedgerLock();
    else {
      const previous = queues.get(req.repo) || Promise.resolve();
      let unlock;
      const pending = new Promise((resolve) => { unlock = resolve; });
      queues.set(req.repo, previous.then(() => pending));
      await previous;
      release = unlock;
    }
    let released = false;
    const done = () => { if (!released) { released = true; Promise.resolve(release()).catch((error) => console.error('Ledger lock release failed', error.message)); } };
    res.once('finish', done); res.once('close', done);
    next();
  } catch (error) { next(error); }
}
