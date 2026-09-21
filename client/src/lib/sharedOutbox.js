import { api } from './api.js';
const keyFor = (userId) => `expense-manager:shared-outbox:${userId}`;
export function readSharedOutbox(userId) { try { const rows = JSON.parse(window.localStorage.getItem(keyFor(userId)) || '[]'); return Array.isArray(rows) ? rows : []; } catch { return []; } }
function write(userId, rows) { window.localStorage.setItem(keyFor(userId), JSON.stringify(rows)); window.dispatchEvent(new Event('shared-outbox-updated')); }
const allowed = new Set(['createExpense', 'updateExpense', 'deleteExpense', 'restoreExpense', 'createSettlement', 'updateSettlement', 'deleteSettlement', 'settleAll', 'commentOnExpense']);
export async function saveShared(userId, operation, args) {
  if (!allowed.has(operation)) throw new Error('Unknown shared operation.');
  try { return await api[operation](...args); }
  catch (error) {
    if (!error.offline) throw error;
    const rows = readSharedOutbox(userId);
    const fingerprint = JSON.stringify([operation, args]);
    if (!rows.some((row) => JSON.stringify([row.operation, row.args]) === fingerprint)) {
      write(userId, [...rows, { id: crypto.randomUUID(), operation, args, at: new Date().toISOString(), status: 'pending' }]);
    }
    return { queued: true };
  }
}
const running = new Set();
export async function syncSharedOutbox(userId) {
  if (running.has(userId)) return;
  running.add(userId);
  try {
    for (const row of readSharedOutbox(userId)) {
      if (row.status === 'review') break;
      try {
        if (!allowed.has(row.operation)) throw new Error('Unknown queued operation.');
        await api[row.operation](...row.args);
        write(userId, readSharedOutbox(userId).filter((r) => r.id !== row.id));
        window.dispatchEvent(new Event('shared-ledger-updated'));
      } catch (error) {
        if (!error.offline) write(userId, readSharedOutbox(userId).map((r) => r.id === row.id ? { ...r, status: 'review', message: error.message } : r));
        break;
      }
    }
  } finally { running.delete(userId); }
}
export function discardSharedOutbox(userId, id) { write(userId, readSharedOutbox(userId).filter((row) => row.id !== id)); }

