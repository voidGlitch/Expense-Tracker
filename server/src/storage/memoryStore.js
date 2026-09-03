/**
 * In-memory repository — the reference implementation of the storage interface
 * (SRS §11). `fileStore` wraps this with persistence; tests use it directly.
 *
 * Interface:
 *   init(), close()
 *   findUserByEmail(email), findUserById(id), countUsers()
 *   createUser({ email, name, passwordHash }), updateUser(id, patch)
 *   getDocument(userId) -> { store, rev, updatedAt }
 *   saveDocument(userId, store, expectedRev) -> { rev, updatedAt }
 */
import { randomUUID } from 'node:crypto';
import { emptyStore, normalizeStore } from '@expense/shared/schema';
import { conflict, notFound } from '../util/http.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

export function createMemoryRepo(seed = {}) {
  const users = new Map(Object.entries(seed.users || {}));
  const documents = new Map(Object.entries(seed.documents || {}));
  let onChange = null;

  const publicUser = (user) => (user
    ? { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }
    : null);

  const touched = () => { if (onChange) onChange(snapshot()); };

  const snapshot = () => ({
    users: Object.fromEntries(users),
    documents: Object.fromEntries(documents),
  });

  return {
    driver: 'memory',
    async init() { return this; },
    async close() { onChange = null; },
    setChangeListener(fn) { onChange = fn; },
    snapshot,

    async countUsers() { return users.size; },

    async findUserByEmail(email) {
      for (const user of users.values()) {
        if (user.email === email) return { ...user };
      }
      return null;
    },

    async findUserById(id) {
      const user = users.get(String(id));
      return user ? { ...user } : null;
    },

    async createUser({ email, name, passwordHash }) {
      const existing = await this.findUserByEmail(email);
      if (existing) throw conflict('An account with that email already exists.');
      const id = randomUUID();
      const user = { id, email, name, passwordHash, createdAt: new Date().toISOString() };
      users.set(id, user);
      documents.set(id, { store: emptyStore(), rev: 1, updatedAt: user.createdAt });
      touched();
      return publicUser(user);
    },

    async updateUser(id, patch) {
      const user = users.get(String(id));
      if (!user) throw notFound('Account not found.');
      const next = { ...user, ...patch, id: user.id };
      users.set(String(id), next);
      touched();
      return publicUser(next);
    },

    async getDocument(userId) {
      const key = String(userId);
      if (!documents.has(key)) {
        if (!users.has(key)) throw notFound('Account not found.');
        documents.set(key, { store: emptyStore(), rev: 1, updatedAt: new Date().toISOString() });
        touched();
      }
      return clone(documents.get(key));
    },

    async saveDocument(userId, store, expectedRev) {
      const key = String(userId);
      const current = await this.getDocument(key);
      if (expectedRev != null && Number(expectedRev) !== current.rev) {
        throw conflict('This budget was changed somewhere else. Reload to get the latest copy.', {
          serverRev: current.rev,
        });
      }
      const record = {
        store: normalizeStore(store),
        rev: current.rev + 1,
        updatedAt: new Date().toISOString(),
      };
      documents.set(key, clone(record));
      touched();
      return clone(record);
    },

    publicUser,
  };
}
