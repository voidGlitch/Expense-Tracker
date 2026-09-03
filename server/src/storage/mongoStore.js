/**
 * MongoDB repository (Mongoose). Enable it by putting MONGODB_URI in .env —
 * see README "Using MongoDB Atlas" for where to get a free connection string.
 *
 * Uses its own connection (not the mongoose global) so close() is well scoped.
 * Saves use a conditional findOneAndUpdate on `rev`, which makes the optimistic
 * concurrency check atomic at the database level rather than read-then-write.
 */
import mongoose from 'mongoose';
import { emptyStore, normalizeStore } from '@expense/shared/schema';
import { config } from '../env.js';
import { conflict, notFound } from '../util/http.js';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  passwordHash: { type: String, required: true },
  // Extended profile fields
  profileImage: { type: String, default: null }, // URL or base64
  bio: { type: String, default: '' },
  // Preferences
  preferences: {
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
    currency: { type: String, default: 'INR' },
    notifications: { type: Boolean, default: true },
  },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false });

const documentSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  store: { type: mongoose.Schema.Types.Mixed, required: true },
  rev: { type: Number, required: true, default: 1 },
  updatedAt: { type: String, default: () => new Date().toISOString() },
}, { versionKey: false, minimize: false });

export function createMongoRepo(uri = config.mongoUri, dbName = config.mongoDbName) {
  return {
    driver: 'mongo',

    async init() {
      const connection = await mongoose.createConnection(uri, {
        dbName,
        serverSelectionTimeoutMS: 8000,
      }).asPromise();

      const User = connection.model('User', userSchema);
      const Doc = connection.model('Document', documentSchema);
      await Promise.all([User.syncIndexes(), Doc.syncIndexes()]);

      const publicUser = (user) => {
        if (!user) return null;
        return {
          id: String(user.id || user._id),
          email: user.email,
          name: user.name,
          profileImage: user.profileImage || null,
          bio: user.bio || '',
          preferences: user.preferences || { theme: 'auto', currency: 'INR', notifications: true },
          createdAt: user.createdAt,
        };
      };

      const fullUser = (user) => (user ? { ...publicUser(user), passwordHash: user.passwordHash } : null);

      return {
        driver: 'mongo',
        publicUser,
        async close() { await connection.close(); },

        async countUsers() { return User.countDocuments(); },

        async findUserByEmail(email) {
          return fullUser(await User.findOne({ email }).lean());
        },

        async findUserById(id) {
          if (!mongoose.isValidObjectId(id)) return null;
          return fullUser(await User.findById(id).lean());
        },

        async createUser({ email, name, passwordHash }) {
          try {
            const user = await User.create({ email, name, passwordHash });
            await Doc.create({ userId: String(user._id), store: emptyStore(), rev: 1 });
            return publicUser(user.toObject());
          } catch (error) {
            if (error?.code === 11000) throw conflict('An account with that email already exists.');
            throw error;
          }
        },

        async updateUser(id, patch) {
          const updateData = { ...patch, updatedAt: new Date().toISOString() };
          const user = await User.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean();
          if (!user) throw notFound('Account not found.');
          return publicUser(user);
        },

        async getDocument(userId) {
          const existing = await Doc.findOne({ userId: String(userId) }).lean();
          if (existing) {
            return { store: existing.store, rev: existing.rev, updatedAt: existing.updatedAt };
          }
          if (!(await this.findUserById(userId))) throw notFound('Account not found.');
          const created = await Doc.create({ userId: String(userId), store: emptyStore(), rev: 1 });
          return { store: created.store, rev: created.rev, updatedAt: created.updatedAt };
        },

        async saveDocument(userId, store, expectedRev) {
          const key = String(userId);
          const normalized = normalizeStore(store);
          const updatedAt = new Date().toISOString();
          const filter = expectedRev == null ? { userId: key } : { userId: key, rev: Number(expectedRev) };
          const updated = await Doc.findOneAndUpdate(
            filter,
            { $set: { store: normalized, updatedAt }, $inc: { rev: 1 } },
            { new: true },
          ).lean();

          if (updated) {
            return { store: updated.store, rev: updated.rev, updatedAt: updated.updatedAt };
          }
          // Either the rev moved on (someone else saved) or there is no document yet.
          const current = await this.getDocument(key);
          throw conflict('This budget was changed somewhere else. Reload to get the latest copy.', {
            serverRev: current.rev,
          });
        },
      };
    },
  };
}
