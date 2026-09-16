/**
 * MongoDB repository (Mongoose).
 *
 * Uses a cached connection so Vercel serverless invocations can reuse the
 * MongoDB connection when the function instance stays warm.
 */
import mongoose from 'mongoose';
import { emptyStore, normalizeStore } from '@expense/shared/schema';
import { contactParticipantId, friendPair } from '@expense/shared/split';
import { config } from '../env.js';
import { conflict, notFound } from '../util/http.js';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },

  profileImage: { type: String, default: null },
  bio: { type: String, default: '' },

  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'auto',
    },
    currency: { type: String, default: 'INR' },
    notifications: { type: Boolean, default: true },
  },

  createdAt: {
    type: String,
    default: () => new Date().toISOString(),
  },

  updatedAt: {
    type: String,
    default: () => new Date().toISOString(),
  },
}, {
  versionKey: false,
});

const documentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  store: { type: mongoose.Schema.Types.Mixed, required: true },
  rev: { type: Number, required: true, default: 1 },
  updatedAt: {
    type: String,
    default: () => new Date().toISOString(),
  },
}, {
  versionKey: false,
});

/* --- Shared-expense collections (SRS §27) ---------------------------------
 * Cross-user by nature: both sides of a friendship read the same row, so these
 * cannot live inside a single user's document.
 */

const friendshipSchema = new mongoose.Schema({
  _id: { type: String },
  userA: { type: String, required: true, index: true },
  userB: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });

// One friendship per pair, regardless of who asked.
friendshipSchema.index({ userA: 1, userB: 1 }, { unique: true });

const friendRequestSchema = new mongoose.Schema({
  _id: { type: String },
  fromUserId: { type: String, required: true, index: true },
  toUserId: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'cancelled'],
    default: 'pending',
  },
  message: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  respondedAt: { type: String, default: null },
}, { versionKey: false });

const groupSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  icon: { type: String, default: null },
  currency: { type: String, default: 'INR' },
  createdBy: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  members: {
    type: [{
      _id: false,
      userId: { type: String, default: null },
      participantId: { type: String, required: true },
      role: { type: String, enum: ['owner', 'member'], default: 'member' },
      joinedAt: { type: String, default: () => new Date().toISOString() },
    }],
    default: [],
  },
  settings: {
    simplifyDebts: { type: Boolean, default: true },
  },
}, { versionKey: false });

groupSchema.index({ 'members.userId': 1 });
groupSchema.index({ 'members.participantId': 1 });

/** Private contacts stay owned by one user until their email signs up. */
const contactSchema = new mongoose.Schema({
  _id: { type: String },
  participantId: { type: String, index: true },
  ownerUserId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  email: { type: String, default: null, index: true },
  phone: { type: String, default: null },
  userId: { type: String, default: null },
  linkedUserId: { type: String, default: null, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });
contactSchema.index({ ownerUserId: 1, email: 1 });

/**
 * Shared expenses and settlements. Stored as documents rather than embedded in
 * a group or friendship so a ledger can grow without bound and be queried by
 * date and context.
 */
const expenseSchema = new mongoose.Schema({
  _id: { type: String },
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: String, required: true, index: true },
  category: { type: String, default: 'Other' },
  notes: { type: String, default: '' },
  paidBy: { type: String, required: true },
  participants: { type: [String], default: [] },
  splitMethod: { type: String, default: 'equal' },
  splitDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  splits: {
    type: [{ _id: false, memberId: String, amount: Number }],
    default: [],
  },
  contextType: { type: String, enum: ['friendship', 'group'], required: true },
  contextId: { type: String, required: true },
  createdBy: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedBy: { type: String, default: null },
  updatedAt: { type: String, default: null },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null },
}, { versionKey: false });

// The ledger query is always "this container's expenses, newest first".
expenseSchema.index({ contextType: 1, contextId: 1, date: -1 });

const settlementSchema = new mongoose.Schema({
  _id: { type: String },
  fromUserId: { type: String, required: true },
  toUserId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  date: { type: String, required: true, index: true },
  method: { type: String, enum: ['cash', 'bank', 'upi', 'other'], default: 'cash' },
  note: { type: String, default: '' },
  contextType: { type: String, enum: ['friendship', 'group'], required: true },
  contextId: { type: String, required: true },
  createdBy: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  deletedAt: { type: String, default: null },
  deletedBy: { type: String, default: null },
}, { versionKey: false });

settlementSchema.index({ contextType: 1, contextId: 1, date: -1 });

// Cache connections/models across warm serverless invocations.
const connectionCache = new Map();

async function getConnection(uri, dbName) {
  const key = `${uri}|${dbName}`;

  let cached = connectionCache.get(key);

  if (!cached) {
    const connection = mongoose.createConnection(uri, {
      dbName,
      serverSelectionTimeoutMS: 8000,
    });

    cached = {
      connection,
      promise: connection.asPromise(),
    };

    connectionCache.set(key, cached);
  }

  return cached.promise;
}

export function createMongoRepo(
  uri = config.mongoUri,
  dbName = config.mongoDbName,
) {
  return {
    driver: 'mongo',

    async init() {
      const connection = await getConnection(uri, dbName);

      const User = connection.models.User
        || connection.model('User', userSchema);

      const Doc = connection.models.Document
        || connection.model('Document', documentSchema);

      const Friendship = connection.models.Friendship
        || connection.model('Friendship', friendshipSchema);

      const FriendRequest = connection.models.FriendRequest
        || connection.model('FriendRequest', friendRequestSchema);

      const Group = connection.models.Group
        || connection.model('Group', groupSchema);

      const Expense = connection.models.Expense
        || connection.model('Expense', expenseSchema);

      const Settlement = connection.models.Settlement
        || connection.model('Settlement', settlementSchema);

      const Contact = connection.models.Contact
        || connection.model('Contact', contactSchema);

      /** Mongoose `_id` -> `id`, so both drivers return the same shape. */
      const withId = (row) => {
        if (!row) return null;
        const { _id, __v, ...rest } = row;
        return { id: String(_id), ...rest };
      };

      // Don't run syncIndexes on every serverless invocation.
      // MongoDB Atlas will already have the indexes after the first setup.
      const publicUser = (user) => {
        if (!user) return null;

        return {
          id: String(user.id || user._id),
          email: user.email,
          name: user.name,
          profileImage: user.profileImage || null,
          bio: user.bio || '',
          preferences: user.preferences || {
            theme: 'auto',
            currency: 'INR',
            notifications: true,
          },
          createdAt: user.createdAt,
        };
      };

      const fullUser = (user) => (
        user
          ? {
              ...publicUser(user),
              passwordHash: user.passwordHash,
            }
          : null
      );

      return {
        driver: 'mongo',

        publicUser,

        // Do not close the cached connection after every request.
        async close() {
          // Intentionally left open for Vercel connection reuse.
        },

        async countUsers() {
          return User.countDocuments();
        },

        async findUserByEmail(email) {
          return fullUser(
            await User.findOne({ email }).lean(),
          );
        },

        async findUserById(id) {
          if (!mongoose.isValidObjectId(id)) return null;

          return fullUser(
            await User.findById(id).lean(),
          );
        },

        async findContactById(id) {
          const key = String(id).replace(/^contact:/, '');
          return withId(await Contact.findById(key).lean());
        },

        async createUser({ email, name, passwordHash }) {
          try {
            const user = await User.create({
              email,
              name,
              passwordHash,
            });

            await Doc.create({
              userId: String(user._id),
              store: emptyStore(),
              rev: 1,
            });

            return publicUser(user.toObject());
          } catch (error) {
            if (error?.code === 11000) {
              throw conflict(
                'An account with that email already exists.',
              );
            }

            throw error;
          }
        },

        async updateUser(id, patch) {
          const updateData = {
            ...patch,
            updatedAt: new Date().toISOString(),
          };

          const user = await User.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true },
          ).lean();

          if (!user) {
            throw notFound('Account not found.');
          }

          return publicUser(user);
        },

        async getDocument(userId) {
          const existing = await Doc.findOne({
            userId: String(userId),
          }).lean();

          if (existing) {
            return {
              store: existing.store,
              rev: existing.rev,
              updatedAt: existing.updatedAt,
            };
          }

          if (!(await this.findUserById(userId))) {
            throw notFound('Account not found.');
          }

          const created = await Doc.create({
            userId: String(userId),
            store: emptyStore(),
            rev: 1,
          });

          return {
            store: created.store,
            rev: created.rev,
            updatedAt: created.updatedAt,
          };
        },

        /* --- Users: search -------------------------------------------- */

        async listUsers({ excludeId = null, query = '', limit = 20 } = {}) {
          const filter = {};
          if (excludeId != null) filter._id = { $ne: String(excludeId) };
          const needle = String(query || '').trim();
          if (needle) {
            // Escape so a name like "a.b" is a literal, not a wildcard regex.
            const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const rx = new RegExp(safe, 'i');
            filter.$or = [{ name: rx }, { email: rx }];
          }
          const rows = await User.find(filter).limit(Math.min(Number(limit) || 20, 50)).lean();
          return rows.map((row) => publicUser(row));
        },

        /* --- Friendships ---------------------------------------------- */

        async listFriendships(userId) {
          const key = String(userId);
          const rows = await Friendship.find({ $or: [{ userA: key }, { userB: key }] }).lean();
          return rows.map(withId);
        },

        async findFriendshipById(id) {
          return withId(await Friendship.findById(String(id)).lean());
        },

        async findFriendshipBetween(a, b) {
          const [userA, userB] = friendPair(a, b);
          return withId(await Friendship.findOne({ userA, userB }).lean());
        },

        async createFriendship(a, b) {
          const existing = await this.findFriendshipBetween(a, b);
          if (existing) return existing;
          const [userA, userB] = friendPair(a, b);
          const id = new mongoose.Types.ObjectId().toString();
          try {
            const created = await Friendship.create({
              _id: id, userA, userB, createdAt: new Date().toISOString(),
            });
            return withId(created.toObject());
          } catch (error) {
            // Lost a race with the other side of the same friendship — fine.
            if (error?.code === 11000) return this.findFriendshipBetween(a, b);
            throw error;
          }
        },

        async deleteFriendship(id) {
          const result = await Friendship.deleteOne({ _id: String(id) });
          return result.deletedCount > 0;
        },

        /* --- Friend requests ------------------------------------------ */

        async findFriendRequestById(id) {
          return withId(await FriendRequest.findById(String(id)).lean());
        },

        async findPendingRequest(fromUserId, toUserId) {
          return withId(await FriendRequest.findOne({
            fromUserId: String(fromUserId),
            toUserId: String(toUserId),
            status: 'pending',
          }).lean());
        },

        async listFriendRequests(userId) {
          const key = String(userId);
          const rows = await FriendRequest.find({ $or: [{ fromUserId: key }, { toUserId: key }] })
            .sort({ createdAt: -1 })
            .lean();
          return rows.map(withId);
        },

        async createFriendRequest(partial) {
          const id = partial.id || new mongoose.Types.ObjectId().toString();
          const created = await FriendRequest.create({
            _id: id,
            fromUserId: String(partial.fromUserId),
            toUserId: String(partial.toUserId),
            status: partial.status || 'pending',
            message: partial.message || '',
            createdAt: partial.createdAt || new Date().toISOString(),
            respondedAt: partial.respondedAt || null,
          });
          return withId(created.toObject());
        },

        async updateFriendRequest(id, patch) {
          const updated = await FriendRequest.findByIdAndUpdate(
            String(id),
            { $set: { ...patch, id: undefined } },
            { new: true },
          ).lean();
          if (!updated) throw notFound('That friend request no longer exists.');
          return withId(updated);
        },

        /* --- Private, not-yet-registered contacts -------------------- */

        async listContacts(ownerUserId) {
          const rows = await Contact.find({ ownerUserId: String(ownerUserId) })
            .sort({ name: 1 })
            .lean();
          return rows.map(withId);
        },

        async createContact(partial) {
          const id = partial.id || new mongoose.Types.ObjectId().toString();
          const created = await Contact.create({
            _id: id,
            participantId: partial.participantId || contactParticipantId(id),
            ownerUserId: String(partial.ownerUserId),
            name: partial.name,
            email: partial.email || null,
            phone: partial.phone || null,
            userId: null,
            linkedUserId: partial.linkedUserId || null,
            createdAt: partial.createdAt || new Date().toISOString(),
            updatedAt: partial.updatedAt || new Date().toISOString(),
          });
          const contact = withId(created.toObject());
          await this.createFriendship(contact.ownerUserId, contact.participantId);
          return contact;
        },

        async claimContactsForUser(user) {
          const email = String(user?.email || '').toLowerCase();
          if (!email) return [];
          const matches = await Contact.find({
            email,
            ownerUserId: { $ne: String(user.id) },
            $or: [{ linkedUserId: null }, { linkedUserId: { $exists: false } }],
          }).lean();
          if (!matches.length) return [];
          const now = new Date().toISOString();
          await Contact.updateMany({ _id: { $in: matches.map((contact) => contact._id) } }, {
            $set: { linkedUserId: String(user.id), userId: String(user.id), updatedAt: now },
          });
          for (const contact of matches) {
            const guestId = contact.participantId || contactParticipantId(contact._id);
            const userId = String(user.id);
            const ownerId = String(contact.ownerUserId);
            await Friendship.updateMany({ userA: guestId }, { $set: { userA: userId } });
            await Friendship.updateMany({ userB: guestId }, { $set: { userB: userId } });
            const rows = await Friendship.find({ $or: [{ userA: userId }, { userB: userId }] }).lean();
            for (const row of rows) {
              const [userA, userB] = friendPair(row.userA, row.userB);
              if (row.userA !== userA || row.userB !== userB) await Friendship.findByIdAndUpdate(row._id, { $set: { userA, userB } });
            }
            await Group.updateMany(
              { 'members.participantId': guestId },
              { $set: { 'members.$[m].userId': userId, 'members.$[m].participantId': userId } },
              { arrayFilters: [{ 'm.participantId': guestId }] },
            );
            const groupsWithUser = await Group.find({ $or: [{ 'members.userId': userId }, { 'members.participantId': userId }] }).lean();
            for (const group of groupsWithUser) {
              const seen = new Set();
              const members = [];
              for (const member of group.members || []) {
                const participantId = String(member.participantId || member.userId);
                if (seen.has(participantId)) continue;
                seen.add(participantId);
                members.push({ ...member, userId: member.userId ?? participantId, participantId });
              }
              if (members.length !== (group.members || []).length) await Group.findByIdAndUpdate(group._id, { $set: { members } });
            }
            const expenseRows = await Expense.find({ $or: [{ paidBy: guestId }, { participants: guestId }, { 'splits.memberId': guestId }] }).lean();
            for (const expense of expenseRows) {
              const splitDetails = {};
              for (const [key, value] of Object.entries(expense.splitDetails || {})) splitDetails[key === guestId ? userId : key] = value;
              await Expense.findByIdAndUpdate(expense._id, {
                $set: {
                  paidBy: expense.paidBy === guestId ? userId : expense.paidBy,
                  participants: [...new Set((expense.participants || []).map((id) => id === guestId ? userId : id))],
                  splitDetails,
                  splits: (expense.splits || []).map((split) => ({ memberId: split.memberId === guestId ? userId : split.memberId, amount: split.amount })),
                },
              });
            }
            await Settlement.updateMany({ fromUserId: guestId }, { $set: { fromUserId: userId } });
            await Settlement.updateMany({ toUserId: guestId }, { $set: { toUserId: userId } });
            await this.createFriendship(ownerId, userId);
          }
          return matches.map((contact) => withId({ ...contact, linkedUserId: String(user.id), userId: String(user.id), updatedAt: now }));
        },

        /* --- Groups ---------------------------------------------------- */

        async listGroups(userId) {
          const rows = await Group.find({ $or: [{ 'members.userId': String(userId) }, { 'members.participantId': String(userId) }] })
            .sort({ createdAt: -1 })
            .lean();
          return rows.map(withId);
        },

        async findGroupById(id) {
          return withId(await Group.findById(String(id)).lean());
        },

        async createGroup(group) {
          const id = group.id || new mongoose.Types.ObjectId().toString();
          const created = await Group.create({
            _id: id,
            name: group.name,
            description: group.description || '',
            icon: group.icon ?? null,
            currency: group.currency || 'INR',
            createdBy: String(group.createdBy),
            createdAt: group.createdAt || new Date().toISOString(),
            members: (group.members || []).map((m) => ({
              userId: m.userId == null ? null : String(m.userId),
              participantId: String(m.participantId || m.userId),
              role: m.role === 'owner' ? 'owner' : 'member',
              joinedAt: m.joinedAt || new Date().toISOString(),
            })),
            settings: { simplifyDebts: group.settings?.simplifyDebts !== false },
          });
          return withId(created.toObject());
        },

        async updateGroup(id, patch) {
          const { id: _ignored, _id, ...rest } = patch || {};
          const updated = await Group.findByIdAndUpdate(
            String(id),
            { $set: rest },
            { new: true },
          ).lean();
          if (!updated) throw notFound('That group no longer exists.');
          return withId(updated);
        },

        async deleteGroup(id) {
          const result = await Group.deleteOne({ _id: String(id) });
          return result.deletedCount > 0;
        },

        /* --- Expenses -------------------------------------------------- */

        async listExpenses({ contextType, contextId, includeDeleted = false } = {}) {
          const filter = { contextType: String(contextType || ''), contextId: String(contextId || '') };
          if (!includeDeleted) filter.deletedAt = null;
          const rows = await Expense.find(filter).sort({ date: -1, createdAt: -1 }).lean();
          return rows.map(withId);
        },

        async findExpenseById(id) {
          return withId(await Expense.findById(String(id)).lean());
        },

        async createExpense(expense) {
          const created = await Expense.create({
            _id: expense.id,
            description: expense.description,
            amount: expense.amount,
            currency: expense.currency,
            date: expense.date,
            category: expense.category,
            notes: expense.notes,
            paidBy: expense.paidBy,
            participants: expense.participants,
            splitMethod: expense.splitMethod,
            splitDetails: expense.splitDetails,
            splits: expense.splits,
            contextType: expense.contextType,
            contextId: expense.contextId,
            createdBy: expense.createdBy,
            createdAt: expense.createdAt,
            updatedBy: expense.updatedBy,
            updatedAt: expense.updatedAt,
          });
          return withId(created.toObject());
        },

        async updateExpense(id, patch) {
          const { id: _ignored, _id, ...rest } = patch || {};
          const updated = await Expense.findByIdAndUpdate(
            String(id),
            { $set: rest },
            { returnDocument: 'after' },
          ).lean();
          if (!updated) throw notFound('That expense no longer exists.');
          return withId(updated);
        },

        async deleteExpense(id, deletedBy = null) {
          const updated = await Expense.findByIdAndUpdate(
            String(id),
            { $set: { deletedAt: new Date().toISOString(), deletedBy: deletedBy ? String(deletedBy) : null } },
            { returnDocument: 'after' },
          ).lean();
          return Boolean(updated);
        },

        async listExpensesForContexts({ contextType, contextIds = [], includeDeleted = false } = {}) {
          const filter = {
            contextType: String(contextType || ''),
            contextId: { $in: contextIds.map(String) },
          };
          if (!includeDeleted) filter.deletedAt = null;
          const rows = await Expense.find(filter).sort({ date: -1 }).lean();
          return rows.map(withId);
        },

        /* --- Settlements ----------------------------------------------- */

        async listSettlements({ contextType, contextId, includeDeleted = false } = {}) {
          const filter = { contextType: String(contextType || ''), contextId: String(contextId || '') };
          if (!includeDeleted) filter.deletedAt = null;
          const rows = await Settlement.find(filter).sort({ date: -1, createdAt: -1 }).lean();
          return rows.map(withId);
        },

        async findSettlementById(id) {
          return withId(await Settlement.findById(String(id)).lean());
        },

        async createSettlement(settlement) {
          const created = await Settlement.create({
            _id: settlement.id,
            fromUserId: settlement.fromUserId,
            toUserId: settlement.toUserId,
            amount: settlement.amount,
            currency: settlement.currency,
            date: settlement.date,
            method: settlement.method,
            note: settlement.note,
            contextType: settlement.contextType,
            contextId: settlement.contextId,
            createdBy: settlement.createdBy,
            createdAt: settlement.createdAt,
          });
          return withId(created.toObject());
        },

        async deleteSettlement(id, deletedBy = null) {
          const updated = await Settlement.findByIdAndUpdate(
            String(id),
            { $set: { deletedAt: new Date().toISOString(), deletedBy: deletedBy ? String(deletedBy) : null } },
            { returnDocument: 'after' },
          ).lean();
          return updated ? withId(updated) : false;
        },

        async listAllForUser(contextType, contextIds = []) {
          const base = { contextType: String(contextType || ''), contextId: { $in: contextIds.map(String) }, deletedAt: null };
          const [expenseRows, settlementRows] = await Promise.all([
            Expense.find(base).lean(),
            Settlement.find(base).lean(),
          ]);
          return {
            expenses: expenseRows.map(withId),
            settlements: settlementRows.map(withId),
          };
        },

        async saveDocument(userId, store, expectedRev) {
          const key = String(userId);
          const normalized = normalizeStore(store);
          const updatedAt = new Date().toISOString();

          const filter = expectedRev == null
            ? { userId: key }
            : {
                userId: key,
                rev: Number(expectedRev),
              };

          const updated = await Doc.findOneAndUpdate(
            filter,
            {
              $set: {
                store: normalized,
                updatedAt,
              },
              $inc: {
                rev: 1,
              },
            },
            { new: true },
          ).lean();

          if (updated) {
            return {
              store: updated.store,
              rev: updated.rev,
              updatedAt: updated.updatedAt,
            };
          }

          const current = await this.getDocument(key);

          throw conflict(
            'This budget was changed somewhere else. Reload to get the latest copy.',
            {
              serverRev: current.rev,
            },
          );
        },
      };
    },
  };
}
