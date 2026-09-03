/** The budget document endpoints: read, save with an optimistic lock, import. */
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  addMonths, applySetup, currentMonthKey, emptyStore,
} from '@expense/shared';
import { makeApp, patchStore, signedInAgent } from './helpers.js';

const setupStore = (monthId = currentMonthKey()) => applySetup(emptyStore(), {
  monthId,
  income: 30000,
  savingsTarget: 3000,
  billDefinitions: [
    {
      name: 'Rent', category: 'Housing', amountType: 'fixed', amount: 18000,
      frequency: 'monthly', dueDay: 1, paymentMode: 'scheduled',
    },
    {
      name: 'Electricity', category: 'Utilities', amountType: 'variable', amount: null,
      frequency: 'monthly', dueDay: 10, paymentMode: 'postpaid',
    },
  ],
});

describe('GET /api/budget', () => {
  it('requires a session', async () => {
    const { app } = await makeApp();
    const response = await request(app).get('/api/budget');
    expect(response.status).toBe(401);
    expect(response.body.error.message).toMatch(/sign in/i);
  });

  it('starts a new account with an empty, current-schema document at rev 1', async () => {
    const { agent } = await signedInAgent();
    const response = await agent.get('/api/budget');

    expect(response.status).toBe(200);
    expect(response.body.rev).toBe(1);
    expect(response.body.store.schemaVersion).toBe(2);
    expect(response.body.store.months).toEqual([]);
    expect(response.body.store.settings.currency).toBe('INR');
    expect(response.body.store.settings.onboardingComplete).toBe(false);
  });

  it('does not invent a month before setup is finished', async () => {
    const { agent } = await signedInAgent();
    expect((await agent.get('/api/budget')).body.store.months).toHaveLength(0);
  });

  it('rolls the document forward to the current month once setup is done', async () => {
    const { agent } = await signedInAgent();
    const lastMonth = addMonths(currentMonthKey(), -1);
    const saved = await agent.put('/api/budget').send({ store: setupStore(lastMonth), rev: 1 });
    expect(saved.body.store.months.map((m) => m.id)).toEqual([lastMonth]);

    const response = await agent.get('/api/budget');
    const ids = response.body.store.months.map((m) => m.id);
    expect(ids).toContain(currentMonthKey());
    expect(response.body.rev).toBe(saved.body.rev + 1);

    // The new month carries the plan forward and re-generates the bills (SRS §7.2).
    const current = response.body.store.months.find((m) => m.id === currentMonthKey());
    expect(current.income).toBe(30000);
    expect(current.bills.map((b) => b.name).sort()).toEqual(['Electricity', 'Rent']);
    expect(current.bills.find((b) => b.name === 'Rent').status).toBe('confirmed');
    expect(current.bills.find((b) => b.name === 'Electricity').status).toBe('pending');
  });

  it('is stable once rolled forward — a second read does not bump the revision', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: setupStore(addMonths(currentMonthKey(), -1)), rev: 1 });
    const first = await agent.get('/api/budget');
    const second = await agent.get('/api/budget');
    expect(second.body.rev).toBe(first.body.rev);
  });

  it('keeps every account document private', async () => {
    const { app, agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });

    const other = request.agent(app);
    await other.post('/api/auth/register').send({ name: 'B', email: 'b@example.com', password: 'budget2026' });
    const theirs = await other.get('/api/budget');
    expect(theirs.body.store.months).toEqual([]);
    expect(theirs.body.rev).toBe(1);
  });
});

describe('PUT /api/budget', () => {
  it('saves the document and returns the new revision', async () => {
    const { agent } = await signedInAgent();
    const response = await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });

    expect(response.status).toBe(200);
    expect(response.body.rev).toBe(2);
    expect(response.body.store.billDefinitions).toHaveLength(2);
    expect(response.body.updatedAt).toBeTruthy();

    const reread = await agent.get('/api/budget');
    expect(reread.body.rev).toBe(2);
    expect(reread.body.store.months[0].income).toBe(30000);
  });

  it('rejects a stale revision with 409 and tells the client where the server is', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });

    const stale = await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.serverRev).toBe(2);
    expect(stale.body.error.message).toMatch(/changed somewhere else/i);
  });

  it('treats a missing revision as "overwrite deliberately"', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });
    const forced = await agent.put('/api/budget').send({ store: setupStore() });
    expect(forced.status).toBe(200);
    expect(forced.body.rev).toBe(3);
  });

  it('normalises what it is given instead of trusting the client', async () => {
    const { agent } = await signedInAgent();
    const response = await patchStore(agent, (store) => ({
      ...store,
      months: [
        { id: 'not-a-month', income: 1 },
        { id: '2026-09', income: '30000', transactions: [{ amount: '250.456', category: 'Daily' }] },
      ],
    }));

    expect(response.status).toBe(200);
    expect(response.body.store.months).toHaveLength(1);
    const month = response.body.store.months[0];
    expect(month.income).toBe(30000);
    expect(month.transactions[0].amount).toBe(250.46);
    expect(month.transactions[0].type).toBe('expense');
    expect(month.transactions[0].id).toMatch(/^txn_/);
  });

  it('refuses a payload that is not a store', async () => {
    const { agent } = await signedInAgent();
    const response = await agent.put('/api/budget').send({ store: 'everything', rev: 1 });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/budget/import', () => {
  it('restores a backup and upgrades an old schema on the way in', async () => {
    const { agent } = await signedInAgent();
    const v1Backup = {
      schemaVersion: 1,
      settings: { currency: 'INR', salaryDay: 1, onboardingComplete: true },
      billDefinitions: [{
        id: 'def_rent', name: 'Rent', category: 'Housing', amountType: 'fixed', amount: 18000,
        frequency: 'monthly', intervalMonths: 1, dueDay: 1, anchorMonth: '2026-04',
        endMonth: null, paymentMode: 'scheduled', active: true,
      }],
      months: [{
        id: '2026-04',
        income: 30000,
        bills: [{
          id: '2026-04_def_rent', defId: 'def_rent', name: 'Rent', category: 'Housing',
          amountType: 'fixed', paymentMode: 'scheduled', dueDate: '2026-04-01',
          status: 'confirmed', provisionalAmount: null, actualAmount: 18000,
        }],
        transactions: [{ id: 'txn_1', date: '2026-04-03', type: 'expense', category: 'Daily', amount: 240 }],
      }],
      savings: { general: { balance: 5000, entries: [{ date: '2026-04-30', amount: 5000, note: 'Sweep' }] } },
    };

    const response = await agent.post('/api/budget/import').send({ store: v1Backup });
    expect(response.status).toBe(200);
    expect(response.body.store.schemaVersion).toBe(2);
    expect(response.body.store.months[0].bills[0].estimateSource).toBe('legacy');
    expect(response.body.store.savings.general.balance).toBe(5000);
    expect(response.body.store.savings.general.entries[0].id).toBeTruthy();
  });

  it('accepts the file the export endpoint produces', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: setupStore(), rev: 1 });
    const backup = await agent.get('/api/export/json');

    const restored = await agent.post('/api/budget/import').send(JSON.parse(backup.text));
    expect(restored.status).toBe(200);
    expect(restored.body.store.billDefinitions).toHaveLength(2);
  });

  it('refuses something that is not a backup', async () => {
    const { agent } = await signedInAgent();
    expect((await agent.post('/api/budget/import').send({ store: [1, 2, 3] })).status).toBe(400);
    expect((await agent.post('/api/budget/import').send({ store: {} })).status).toBe(400);
  });
});
