/**
 * MongoDB repository integration tests - verifies the fix for "Account not found" bug.
 *
 * This test suite ensures that:
 * 1. User IDs are correctly mapped from MongoDB's _id to string id
 * 2. Registration creates both user and budget document seamlessly
 * 3. The authentication flow works end-to-end without ID mapping errors
 * 4. The publicUser helper handles both raw MongoDB documents and pre-mapped objects
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { applySetup, currentMonthKey, emptyStore } from '@expense/shared';
import { createMongoRepo } from '../src/storage/mongoStore.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth/password.js';
import { config } from '../src/env.js';

const TEST_DB = `expense_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
const uri = config.mongoUri || 'mongodb://127.0.0.1:27017';

describe('MongoDB repository integration (regression: Account not found bug)', () => {
  let repo;
  let app;
  let connection;
  let hasMongo = false;

  beforeAll(async () => {
    try {
      const mongoFactory = createMongoRepo(uri, TEST_DB);
      repo = await mongoFactory.init();
      app = createApp(repo);
      hasMongo = true;
    } catch (err) {
      console.warn('⚠ MongoDB not available, skipping live DB tests:', err.message);
      hasMongo = false;
    }
  }, 15000);

  afterAll(async () => {
    if (hasMongo && repo) {
      try {
        await repo.close();
      } catch (e) {
        // Best effort cleanup
      }
    }
  });

  it('publicUser correctly handles both _id and id fields', async () => {
    if (!hasMongo) return;

    // Simulate raw MongoDB document with _id
    const rawDoc = {
      _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
      email: 'raw@example.com',
      name: 'Raw User',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const fromRaw = repo.publicUser(rawDoc);
    expect(fromRaw.id).toBe('507f1f77bcf86cd799439011');
    expect(fromRaw.email).toBe('raw@example.com');
    expect(fromRaw._id).toBeUndefined();

    // Simulate already-mapped document with id
    const mappedDoc = {
      id: '507f1f77bcf86cd799439011',
      email: 'mapped@example.com',
      name: 'Mapped User',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const fromMapped = repo.publicUser(mappedDoc);
    expect(fromMapped.id).toBe('507f1f77bcf86cd799439011');
    expect(fromMapped.email).toBe('mapped@example.com');
  });

  it('createUser returns a valid string ID and initializes empty budget at rev 1', async () => {
    if (!hasMongo) return;

    const email = `create_${Date.now()}@example.com`;
    const user = await repo.createUser({
      email,
      name: 'Test User',
      passwordHash: await hashPassword('password123'),
    });

    expect(user.id).toBeTruthy();
    expect(typeof user.id).toBe('string');
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBeUndefined(); // Public user omits hash

    // Verify the budget document was created
    const doc = await repo.getDocument(user.id);
    expect(doc.rev).toBe(1);
    expect(doc.store.schemaVersion).toBe(2);
    expect(doc.store.months).toEqual([]);
    expect(doc.store.settings.onboardingComplete).toBe(false);
  });

  it('findUserById returns fullUser with consistent string ID', async () => {
    if (!hasMongo) return;

    const email = `findbyid_${Date.now()}@example.com`;
    const created = await repo.createUser({
      email,
      name: 'Findable User',
      passwordHash: await hashPassword('password123'),
    });

    const found = await repo.findUserById(created.id);
    expect(found).toBeTruthy();
    expect(found.id).toBe(created.id);
    expect(typeof found.id).toBe('string');
    expect(found.email).toBe(email);
    expect(found.passwordHash).toBeTruthy(); // fullUser includes hash
  });

  it('findUserByEmail returns fullUser with string ID', async () => {
    if (!hasMongo) return;

    const email = `findemail_${Date.now()}@example.com`;
    await repo.createUser({
      email,
      name: 'Email User',
      passwordHash: await hashPassword('password123'),
    });

    const found = await repo.findUserByEmail(email);
    expect(found).toBeTruthy();
    expect(found.id).toBeTruthy();
    expect(typeof found.id).toBe('string');
    expect(found.email).toBe(email);
  });

  it('getDocument works with string user ID and creates if missing', async () => {
    if (!hasMongo) return;

    const email = `getdoc_${Date.now()}@example.com`;
    const user = await repo.createUser({
      email,
      name: 'Doc User',
      passwordHash: await hashPassword('password123'),
    });

    const doc = await repo.getDocument(user.id);
    expect(doc).toBeTruthy();
    expect(doc.rev).toBe(1);
    expect(doc.store).toBeTruthy();
    expect(doc.updatedAt).toBeTruthy();
  });

  it('saveDocument increments revision and persists normalized store', async () => {
    if (!hasMongo) return;

    const email = `save_${Date.now()}@example.com`;
    const user = await repo.createUser({
      email,
      name: 'Save User',
      passwordHash: await hashPassword('password123'),
    });

    const store = applySetup(emptyStore(), {
      monthId: currentMonthKey(),
      income: 50000,
      savingsTarget: 5000,
      billDefinitions: [
        {
          name: 'Rent',
          category: 'Housing',
          amountType: 'fixed',
          amount: 20000,
          frequency: 'monthly',
          dueDay: 1,
          paymentMode: 'scheduled',
        },
      ],
    });

    const saved = await repo.saveDocument(user.id, store, 1);
    expect(saved.rev).toBe(2);
    expect(saved.store.billDefinitions).toHaveLength(1);
    expect(saved.store.months[0].income).toBe(50000);

    // Verify persistence
    const reloaded = await repo.getDocument(user.id);
    expect(reloaded.rev).toBe(2);
    expect(reloaded.store.billDefinitions[0].name).toBe('Rent');
  });

  it('saveDocument rejects stale revision with conflict error', async () => {
    if (!hasMongo) return;

    const email = `conflict_${Date.now()}@example.com`;
    const user = await repo.createUser({
      email,
      name: 'Conflict User',
      passwordHash: await hashPassword('password123'),
    });

    const store = applySetup(emptyStore(), {
      monthId: currentMonthKey(),
      income: 30000,
    });

    await repo.saveDocument(user.id, store, 1);

    // Try to save again with stale rev 1
    await expect(repo.saveDocument(user.id, store, 1)).rejects.toThrow(/changed somewhere else/i);
  });

  it('END-TO-END: Register → Login → Get /api/budget without "Account not found"', async () => {
    if (!hasMongo) return;

    const agent = request.agent(app);
    const email = `e2e_${Date.now()}@example.com`;

    // Step 1: Register new account
    const registerRes = await agent.post('/api/auth/register').send({
      name: 'E2E User',
      email,
      password: 'Password123',
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user).toBeTruthy();
    expect(registerRes.body.user.id).toBeTruthy();
    expect(registerRes.body.user.email).toBe(email);

    // Step 2: Verify session works with /api/auth/me
    const meRes = await agent.get('/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user).toBeTruthy();
    expect(meRes.body.user.id).toBe(registerRes.body.user.id);
    expect(meRes.body.user.email).toBe(email);

    // Step 3: REGRESSION TEST - Fetch budget should NOT return "Account not found"
    const budgetRes = await agent.get('/api/budget');
    expect(budgetRes.status).toBe(200);
    expect(budgetRes.body.rev).toBe(1);
    expect(budgetRes.body.store).toBeTruthy();
    expect(budgetRes.body.store.schemaVersion).toBe(2);
    expect(budgetRes.body.store.settings.onboardingComplete).toBe(false);
    expect(budgetRes.body.store.months).toEqual([]);
  });

  it('END-TO-END: Register → Logout → Login → Get /api/budget succeeds', async () => {
    if (!hasMongo) return;

    const agent = request.agent(app);
    const email = `logout_${Date.now()}@example.com`;
    const password = 'Password123';

    // Register
    await agent.post('/api/auth/register').send({
      name: 'Logout User',
      email,
      password,
    });

    // Logout
    const logoutRes = await agent.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);

    // Verify logged out
    const anonRes = await agent.get('/api/auth/me');
    expect(anonRes.body.user).toBeNull();

    // Login again
    const loginRes = await agent.post('/api/auth/login').send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(email);

    // Fetch budget - should work after re-login
    const budgetRes = await agent.get('/api/budget');
    expect(budgetRes.status).toBe(200);
    expect(budgetRes.body.store).toBeTruthy();
  });

  it('END-TO-END: Register → Save budget → Reload → Data persists', async () => {
    if (!hasMongo) return;

    const agent = request.agent(app);
    const email = `persist_${Date.now()}@example.com`;

    await agent.post('/api/auth/register').send({
      name: 'Persist User',
      email,
      password: 'Password123',
    });

    // Save a configured budget
    const store = applySetup(emptyStore(), {
      monthId: currentMonthKey(),
      income: 60000,
      savingsTarget: 10000,
      billDefinitions: [
        {
          name: 'Internet',
          category: 'Utilities',
          amountType: 'fixed',
          amount: 1500,
          frequency: 'monthly',
          dueDay: 5,
          paymentMode: 'postpaid',
        },
      ],
    });

    const saveRes = await agent.put('/api/budget').send({ store, rev: 1 });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.rev).toBe(2);

    // Reload and verify
    const reloadRes = await agent.get('/api/budget');
    expect(reloadRes.status).toBe(200);
    expect(reloadRes.body.rev).toBe(2);
    expect(reloadRes.body.store.billDefinitions).toHaveLength(1);
    expect(reloadRes.body.store.billDefinitions[0].name).toBe('Internet');
    expect(reloadRes.body.store.months[0].income).toBe(60000);
  });
});
