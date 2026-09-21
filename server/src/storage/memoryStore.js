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
import {
  contactParticipantId,
  isContactParticipantId,
  makeContact,
  makeFriendship,
  makeFriendRequest,
  friendPair,
} from '@expense/shared/split';
import { conflict, notFound } from '../util/http.js';
import { inSettlementScope } from './settlementAllocations.js';
import { linkExpenseParticipant, linkSettlementParticipant } from './linkParticipant.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Every collection the repository owns, so a fresh snapshot has all of them. */
const emptyCollections = () => ({
  users: {},
  documents: {},
  friendships: {},
  friendRequests: {},
  groups: {},
  contacts: {},
  expenses: {},
  settlements: {},
});

export function createMemoryRepo(seed = {}) {
  const users = new Map(Object.entries(seed.users || {}));
  const documents = new Map(Object.entries(seed.documents || {}));
  const friendships = new Map(Object.entries(seed.friendships || {}));
  const friendRequests = new Map(Object.entries(seed.friendRequests || {}));
  const groups = new Map(Object.entries(seed.groups || {}));
  const contacts = new Map(Object.entries(seed.contacts || {}));
  const expenses = new Map(Object.entries(seed.expenses || {}));
  const settlements = new Map(Object.entries(seed.settlements || {}));
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
    expenses: Object.fromEntries(expenses),
    settlements: Object.fromEntries(settlements),
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

    async findContactById(id) {
      const key = String(id).replace(/^contact:/, '');
      const found = contacts.get(key);
      return found ? clone(found) : null;
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
      // Keep lookup and insertion synchronous so simultaneous additions cannot
      // create two rows for the same pair in the memory/file repositories.
      const [userA, userB] = friendPair(a, b);
      const existing = [...friendships.values()].find((row) => row.userA === userA && row.userB === userB);
      if (existing) return clone(existing);
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
      await this.createFriendship(contact.ownerUserId, contact.participantId);
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
        const guestId = current.participantId || contactParticipantId(id);
        const next = { ...current, linkedUserId: user.id, updatedAt: new Date().toISOString() };
        contacts.set(id, clone(next));
        linked.push(clone(next));
        for (const [friendshipId, friendship] of friendships) {
          if (friendship.userA !== guestId && friendship.userB !== guestId) continue;
          const mapped = {
            ...friendship,
            userA: friendship.userA === guestId ? user.id : friendship.userA,
            userB: friendship.userB === guestId ? user.id : friendship.userB,
          };
          if (mapped.userA === mapped.userB) {
            friendships.delete(friendshipId);
            continue;
          }
          const [userA, userB] = friendPair(mapped.userA, mapped.userB);
          const existing = await this.findFriendshipBetween(userA, userB);
          if (existing && existing.id !== friendshipId) {
            for (const collection of [expenses, settlements]) {
              for (const [rowId, row] of collection) {
                if (row.allocations?.some((part) => part.contextType === 'friendship' && part.contextId === friendshipId)) {
                  row.allocations = row.allocations.map((part) => part.contextType === 'friendship' && part.contextId === friendshipId ? { ...part, contextId: existing.id } : part);
                }
                if (row.contextType === 'friendship' && row.contextId === friendshipId) {
                  collection.set(rowId, { ...row, contextId: existing.id });
                }
              }
            }
            friendships.delete(friendshipId);
          } else {
            friendships.set(friendshipId, { ...mapped, userA, userB });
          }
        }
        for (const [groupId, group] of groups) {
          const seen = new Set();
          const members = [];
          for (const member of group.members || []) {
            const participantId = (member.participantId || member.userId) === guestId ? user.id : (member.participantId || member.userId);
            const userId = (member.userId || member.participantId) === guestId ? user.id : member.userId;
            if (seen.has(participantId)) continue;
            seen.add(participantId);
            members.push({ ...member, participantId, userId });
          }
          groups.set(groupId, { ...group, members });
        }
        const rewriteDetails = (details = {}) => {
          if (!details || typeof details !== 'object') return {};
          const nextDetails = {};
          for (const [key, value] of Object.entries(details)) nextDetails[key === guestId ? user.id : key] = value;
          return nextDetails;
        };
        for (const [expenseId, expense] of expenses) {
          if (![expense.paidBy, ...(expense.participants || []), ...(expense.payers || []).map((p) => p.memberId)].includes(guestId)) continue;
          const participants = [...new Set((expense.participants || []).map((participant) => participant === guestId ? user.id : participant))];
          const splits = (expense.splits || []).map((split) => ({ ...split, memberId: split.memberId === guestId ? user.id : split.memberId }));
          expenses.set(expenseId, linkExpenseParticipant(expense, guestId, user.id));
        }
        for (const [settlementId, settlement] of settlements) {
          if ([settlement.fromUserId, settlement.toUserId, ...(settlement.allocations || []).flatMap((part) => [part.fromUserId, part.toUserId])].includes(guestId)) settlements.set(settlementId, linkSettlementParticipant(settlement, guestId, user.id));
        }
        await this.createFriendship(current.ownerUserId, user.id);
      }
      if (linked.length) touched();
      return linked;
    },

    /* --- Expenses ------------------------------------------------------ */

    /**
     * Live expenses in one container (a friendship or a group), newest first.
     * `contextType`/`contextId` is what keeps the two kinds of ledger apart.
     */
    async listExpenses({ contextType, contextId, includeDeleted = false } = {}) {
      const type = String(contextType || '');
      const id = String(contextId || '');
      return [...expenses.values()]
        .filter((row) => row.contextType === type && row.contextId === id)
        .filter((row) => includeDeleted || !row.deletedAt)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))
          || String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },

    async findExpenseById(id) {
      const found = expenses.get(String(id));
      return found ? clone(found) : null;
    },

    async createExpense(expense) {
      const record = clone(expense);
      expenses.set(record.id, record);
      touched();
      return clone(record);
    },

    async updateExpense(id, patch) {
      const key = String(id);
      const current = expenses.get(key);
      if (!current) throw notFound('That expense no longer exists.');
      const next = { ...current, ...clone(patch), id: current.id };
      expenses.set(key, next);
      touched();
      return clone(next);
    },

    /**
     * Soft delete by default: a financial record that once moved a balance is
     * kept, stamped, and excluded from every calculation from then on (§17).
     */
    async deleteExpense(id, deletedBy = null) {
      const key = String(id);
      const current = expenses.get(key);
      if (!current) return false;
      const next = { ...current, deletedAt: new Date().toISOString(), deletedBy: deletedBy ? String(deletedBy) : null };
      expenses.set(key, next);
      touched();
      return true;
    },

    async listExpensesForContexts({ contextType, contextIds = [], includeDeleted = false } = {}) {
      const type = String(contextType || '');
      const allowed = new Set(contextIds.map(String));
      return [...expenses.values()]
        .filter((row) => row.contextType === type && allowed.has(row.contextId))
        .filter((row) => includeDeleted || !row.deletedAt)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .map(clone);
    },

    /* --- Settlements --------------------------------------------------- */

    async listSettlements({ contextType, contextId, includeDeleted = false } = {}) {
      const type = String(contextType || '');
      const id = String(contextId || '');
      return [...settlements.values()]
        .flatMap((row) => inSettlementScope(row, type, id))
        .filter((row) => includeDeleted || !row.deletedAt)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))
          || String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },

    async findSettlementById(id) {
      const found = settlements.get(String(id));
      return found ? clone(found) : null;
    },

    async createSettlement(settlement) {
      const record = clone(settlement);
      settlements.set(record.id, record);
      touched();
      return clone(record);
    },

    async updateSettlement(id, patch) {
      const current = settlements.get(String(id));
      if (!current) throw notFound('Settlement not found.');
      const next = { ...current, ...clone(patch), id: current.id };
      settlements.set(current.id, next); touched(); return clone(next);
    },

    async deleteSettlement(id, deletedBy = null) {
      const key = String(id);
      const current = settlements.get(key);
      if (!current) return false;
      const next = { ...current, deletedAt: new Date().toISOString(), deletedBy: deletedBy ? String(deletedBy) : null };
      settlements.set(key, next);
      touched();
      return clone(next);
    },

    /** Every expense and settlement a user can see, for the dashboard summary. */
    async listAllForUser(contextType, contextIds = []) {
      const type = String(contextType || '');
      const allowed = new Set(contextIds.map(String));
      const pick = (map) => [...map.values()]
        .filter((row) => row.contextType === type && allowed.has(row.contextId) && !row.deletedAt)
        .map(clone);
      return { expenses: pick(expenses), settlements: pick(settlements) };
    },

    /* --- Groups -------------------------------------------------------- */

    async listGroups(userId) {
      const key = String(userId);
      return [...groups.values()]
        .filter((g) => (g.members || []).some((m) => String(m.userId ?? m.participantId) === key || String(m.participantId) === key))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .map(clone);
    },
    async listFormerGroups(userId) {
      return [...groups.values()].filter((g) => (g.formerMemberIds || []).includes(String(userId))).map(clone);
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
