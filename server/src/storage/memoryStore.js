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
 *
 * Shared-expense collections (SRS §27) — these are cross-user, so they are NOT
 * stored inside any one user's document:
 *   listUsers({ excludeId, query, limit })
 *   listFriendships(userId), findFriendshipById(id), findFriendshipBetween(a, b)
 *   createFriendship(a, b), deleteFriendship(id)
 *   findFriendRequestById(id), findPendingRequest(from, to), listFriendRequests(userId)
 *   createFriendRequest({...}), updateFriendRequest(id, patch)
 *   listGroups(userId), findGroupById(id), createGroup(group), updateGroup(id, patch), deleteGroup(id)
 */
import { randomUUID } from 'node:crypto';
import { emptyStore, normalizeStore } from '@expense/shared/schema';
import { makeContact, makeFriendship, makeFriendRequest, friendPair } from '@expense/shared/split';
import { conflict, notFound } from '../util/http.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Every collection the repository owns, so a fresh snapshot has all of them. */
const emptyCollections = () => ({
  users: {},
  documents: {},
  friendships: {},
  friendRequests: {},
  groups: {},
  contacts: {},
});

export function createMemoryRepo(seed = {}) {
  const users = new Map(Object.entries(seed.users || {}));
  const documents = new Map(Object.entries(seed.documents || {}));
  const friendships = new Map(Object.entries(seed.friendships || {}));
  const friendRequests = new Map(Object.entries(seed.friendRequests || {}));
  const groups = new Map(Object.entries(seed.groups || {}));
  const contacts = new Map(Object.entries(seed.contacts || {}));
  let onChange = null;

  const publicUser = (user) => (user
    ? { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt }
    : null);

  const touched = () => { if (onChange) onChange(snapshot()); };

  const snapshot = () => ({
    ...emptyCollections(),
    users: Object.fromEntries(users),
    documents: Object.fromEntries(documents),
    friendships: Object.fromEntries(friendships),
    friendRequests: Object.fromEntries(friendRequests),
    groups: Object.fromEntries(groups),
    contacts: Object.fromEntries(contacts),
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

    /* --- Users: search ------------------------------------------------ */

    /** Case-insensitive name/email search, never returning the caller. */
    async listUsers({ excludeId = null, query = '', limit = 20 } = {}) {
      const needle = String(query || '').trim().toLowerCase();
      const exclude = excludeId == null ? null : String(excludeId);
      const out = [];
      for (const user of users.values()) {
        if (exclude && user.id === exclude) continue;
        if (needle) {
          const haystack = `${user.name} ${user.email}`.toLowerCase();
          if (!haystack.includes(needle)) continue;
        }
        out.push(publicUser(user));
        if (out.length >= limit) break;
      }
      return out;
    },

    /* --- Friendships -------------------------------------------------- */

    async listFriendships(userId) {
      const key = String(userId);
      return [...friendships.values()]
        .filter((f) => f.userA === key || f.userB === key)
        .map(clone);
    },

    async findFriendshipById(id) {
      const found = friendships.get(String(id));
      return found ? clone(found) : null;
    },

    async findFriendshipBetween(a, b) {
      const [x, y] = friendPair(a, b);
      for (const f of friendships.values()) {
        if (f.userA === x && f.userB === y) return clone(f);
      }
      return null;
    },

    async createFriendship(a, b) {
      const existing = await this.findFriendshipBetween(a, b);
      if (existing) return existing;
      const friendship = makeFriendship(a, b);
      friendships.set(friendship.id, clone(friendship));
      touched();
      return clone(friendship);
    },

    async deleteFriendship(id) {
      const removed = friendships.delete(String(id));
      if (removed) touched();
      return removed;
    },

    /* --- Friend requests ---------------------------------------------- */

    async findFriendRequestById(id) {
      const found = friendRequests.get(String(id));
      return found ? clone(found) : null;
    },

    async findPendingRequest(fromUserId, toUserId) {
      const from = String(fromUserId);
      const to = String(toUserId);
      for (const request of friendRequests.values()) {
        if (request.fromUserId === from && request.toUserId === to && request.status === 'pending') {
          return clone(request);
        }
      }
      return null;
    },

    async listFriendRequests(userId) {
      const key = String(userId);
      return [...friendRequests.values()]
        .filter((r) => r.fromUserId === key || r.toUserId === key)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },

    async createFriendRequest(partial) {
      const request = makeFriendRequest(partial);
      friendRequests.set(request.id, clone(request));
      touched();
      return clone(request);
    },

    async updateFriendRequest(id, patch) {
      const key = String(id);
      const current = friendRequests.get(key);
      if (!current) throw notFound('That friend request no longer exists.');
      const next = makeFriendRequest({ ...current, ...patch, id: current.id });
      friendRequests.set(key, clone(next));
      touched();
      return clone(next);
    },

    /* --- Private, not-yet-registered contacts ----------------------- */

    async listContacts(ownerUserId) {
      const owner = String(ownerUserId);
      return [...contacts.values()]
        .filter((contact) => contact.ownerUserId === owner)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(clone);
    },

    async createContact(partial) {
      const contact = makeContact(partial);
      contacts.set(contact.id, clone(contact));
      touched();
      return clone(contact);
    },

    /** Link matching private contacts and create the actual friendship once a user signs up. */
    async claimContactsForUser(user) {
      const email = String(user?.email || '').toLowerCase();
      if (!email) return [];
      const linked = [];
      for (const [id, current] of contacts) {
        if (current.email !== email || current.ownerUserId === user.id || current.linkedUserId) continue;
        const next = { ...current, linkedUserId: user.id, updatedAt: new Date().toISOString() };
        contacts.set(id, clone(next));
        linked.push(clone(next));
        await this.createFriendship(current.ownerUserId, user.id);
      }
      if (linked.length) touched();
      return linked;
    },

    /* --- Groups -------------------------------------------------------- */

    async listGroups(userId) {
      const key = String(userId);
      return [...groups.values()]
        .filter((g) => (g.members || []).some((m) => String(m.userId) === key))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },

    async findGroupById(id) {
      const found = groups.get(String(id));
      return found ? clone(found) : null;
    },

    async createGroup(group) {
      const record = clone(group);
      groups.set(record.id, record);
      touched();
      return clone(record);
    },

    async updateGroup(id, patch) {
      const key = String(id);
      const current = groups.get(key);
      if (!current) throw notFound('That group no longer exists.');
      const next = { ...current, ...clone(patch), id: current.id };
      groups.set(key, next);
      touched();
      return clone(next);
    },

    async deleteGroup(id) {
      const removed = groups.delete(String(id));
      if (removed) touched();
      return removed;
    },

    publicUser,
  };
}

export { emptyCollections };
