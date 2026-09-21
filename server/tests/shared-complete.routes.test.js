import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { addTransaction, applySetup } from '@expense/shared';
import { makeApp, patchStore } from './helpers.js';
import { createApp } from '../src/app.js';
import { createMongoRepo } from '../src/storage/mongoStore.js';
import { config } from '../src/env.js';

async function fixture(provided) {
  const { app, repo } = provided || await makeApp();
  const register = async (name) => { const agent = request.agent(app); const result = await agent.post('/api/auth/register').send({ name, email: `${name}@shared-test.example`, password: 'testpassword1' }); expect(result.status).toBe(201); return { agent, id: result.body.user.id }; };
  const a = await register('Alice'); const b = await register('Bob'); const c = await register('Cora');
  const friend = await a.agent.post('/api/friends/contacts').send({ name: 'Bob', email: 'bob@shared-test.example' });
  const friendship = friend.body.friendship;
  const group = async (name, members = [b.id]) => { const response = await a.agent.post('/api/groups').send({ name, memberIds: members }); expect(response.status).toBe(201); return response.body.group; };
  const expense = (fields = {}, agent = a.agent) => agent.post('/api/expenses').send({ description: 'Dinner', amount: 1500, currency: 'INR', date: '2026-09-01', category: 'Entertainment', paidBy: a.id, participants: [a.id, b.id], contextType: 'friendship', contextId: friendship.id, ...fields });
  const payment = (fields = {}, agent = a.agent) => agent.post('/api/settlements').send({ fromUserId: b.id, toUserId: a.id, amount: 50, currency: 'INR', date: '2026-09-02', contextType: 'friendship', contextId: friendship.id, ...fields });
  return { app, repo, a, b, c, friendship, group, expense, payment };
}

describe('shared expense acceptance and security', () => {
  it('preserves the 7000 → 1750 → 5250 budget through creditor-recorded partial and full repayment', async () => {
    const f = await fixture();
    await patchStore(f.a.agent, (store) => addTransaction(applySetup(store, { monthId: '2026-09', income: 7000, billDefinitions: [] }), '2026-09', { amount: 1000, category: 'Groceries', date: '2026-09-01' }).store);
    expect((await f.expense()).status).toBe(201);
    for (const amount of [0, 50, 700]) {
      if (amount) expect((await f.payment({ amount })).status).toBe(201);
      const summary = await f.a.agent.get('/api/shared/summary?monthId=2026-09');
      expect(summary.status).toBe(200);
      expect(summary.body.monthly).toMatchObject({ currentSpending: 1750, remaining: 5250 });
      expect(summary.body.totals.INR.personalExpense).toBe(750);
    }
    expect((await f.b.agent.get(`/api/friendships/${f.friendship.id}/balance`)).body.balances.INR.amount).toBe(0);
    expect((await f.a.agent.get('/api/budget')).body.store.months[0].transactions).toHaveLength(1);
  });

  it('records multi-payer unequal expenses, comments and receipts while blocking outsiders', async () => {
    const f = await fixture(); const g = await f.group('Hotel', [f.b.id, f.c.id]);
    const row = await f.expense({ amount: 4000, contextType: 'group', contextId: g.id, payers: [{ memberId: f.a.id, amount: 3000 }, { memberId: f.b.id, amount: 1000 }], participants: [f.a.id, f.b.id, f.c.id], splitMethod: 'exact', splitDetails: { [f.a.id]: 1000, [f.b.id]: 1500, [f.c.id]: 1500 }, receipt: { name: 'receipt.png', data: 'data:image/png;base64,aGVsbG8=' } });
    expect(row.status).toBe(201);
    const balances = (await f.a.agent.get(`/api/groups/${g.id}/balances`)).body.balances.INR;
    expect(balances).toEqual({ [f.a.id]: 2000, [f.b.id]: -500, [f.c.id]: -1500 });
    const comment = await f.b.agent.post(`/api/expenses/${row.body.expense.id}/comments`).send({ text: 'Thanks!', idempotencyKey: 'comment-1' });
    expect(comment.status).toBe(200);
    expect((await f.b.agent.post(`/api/expenses/${row.body.expense.id}/comments`).send({ text: 'Thanks!', idempotencyKey: 'comment-1' })).body.expense.comments).toHaveLength(1);
    expect((await f.c.agent.post('/api/settlements').send({ contextType: 'group', contextId: g.id, fromUserId: f.b.id, toUserId: f.a.id, amount: 50 })).status).toBe(403);
    expect((await request(f.app).get('/api/shared/overview')).status).toBe(401);
    expect((await f.c.agent.get(`/api/friendships/${f.friendship.id}/expenses`)).status).toBe(403);
  });

  it('makes repeated and concurrent submissions idempotent, and rejects changed replay content', async () => {
    const f = await fixture();
    const [one, two] = await Promise.all([f.expense({ idempotencyKey: 'dinner' }), f.expense({ idempotencyKey: 'dinner' })]);
    expect([one.status, two.status].sort()).toEqual([200, 201]);
    expect(one.body.expense.id).toBe(two.body.expense.id);
    expect((await f.expense({ amount: 2000, idempotencyKey: 'dinner' })).status).toBe(409);
    const [p1, p2] = await Promise.all([f.payment({ idempotencyKey: 'payment' }), f.payment({ idempotencyKey: 'payment' })]);
    expect([p1.status, p2.status].sort()).toEqual([200, 201]);
    expect((await f.a.agent.get(`/api/friendships/${f.friendship.id}/expenses`)).body.settlements).toHaveLength(1);
  });

  it('rejects stale edits and simultaneous settlements against the same revision', async () => {
    const f = await fixture(); const created = (await f.expense()).body.expense;
    const view = (await f.a.agent.get('/api/shared/overview')).body.contexts.find((c) => c.id === f.friendship.id);
    const [one, two] = await Promise.all([f.payment({ amount: 100, expectedLedgerRevision: view.revision }), f.payment({ amount: 100, expectedLedgerRevision: view.revision })]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    expect((await f.a.agent.patch(`/api/expenses/${created.id}`).send({ description: 'Updated', expectedRevision: 1 })).status).toBe(200);
    expect((await f.a.agent.patch(`/api/expenses/${created.id}`).send({ amount: 1800, expectedRevision: 1 })).status).toBe(409);
  });

  it('requires confirmation for overpayment, wrong direction and different currency; edits and deletes payments independently', async () => {
    const f = await fixture(); const e = (await f.expense()).body.expense;
    expect((await f.payment({ amount: 800 })).status).toBe(400);
    const over = await f.payment({ amount: 800, confirmUnusualPayment: true }); expect(over.status).toBe(201);
    expect((await f.a.agent.get(`/api/friendships/${f.friendship.id}/balance`)).body.balances.INR).toMatchObject({ direction: 'youOwe', amount: 50 });
    expect((await f.a.agent.patch(`/api/settlements/${over.body.settlement.id}`).send({ amount: 750, expectedRevision: 1 })).status).toBe(200);
    expect((await f.payment({ amount: 10, currency: 'USD' })).status).toBe(400);
    expect((await f.payment({ amount: 10, currency: 'USD', confirmUnusualPayment: true })).status).toBe(201);
    expect((await f.a.agent.delete(`/api/expenses/${e.id}`).send({ expectedRevision: 1 })).status).toBe(204);
    const rows = (await f.a.agent.get(`/api/friendships/${f.friendship.id}/expenses`)).body;
    expect(rows.expenses).toHaveLength(0); expect(rows.settlements).toHaveLength(2);
    expect((await f.a.agent.post(`/api/expenses/${e.id}/restore`).send({ expectedRevision: 2 })).status).toBe(200);
    expect((await f.b.agent.delete(`/api/settlements/${over.body.settlement.id}`).send({ expectedRevision: 2 })).status).toBe(204);
  });

  it('settles all signed group/direct scopes atomically and restores them by deleting the batch', async () => {
    const f = await fixture(); const apartment = await f.group('Apartment'); const goa = await f.group('Goa');
    await f.expense({ amount: 1000, paidBy: f.b.id, contextType: 'group', contextId: apartment.id });
    await f.expense({ amount: 400, contextType: 'group', contextId: goa.id });
    await f.expense({ amount: 200 });
    const before = (await f.a.agent.get('/api/shared/overview')).body.friends.find((friend) => friend.id === f.b.id);
    expect(before.byCurrency.INR).toBe(-200); expect(before.scopes).toHaveLength(3);
    const payload = { friendId: f.b.id, currency: 'INR', amount: 200, expectedRevision: before.revision, idempotencyKey: 'all' };
    const batch = await f.a.agent.post('/api/settlements/settle-all').send(payload);
    expect(batch.status).toBe(201); expect(batch.body.settlement.allocations).toHaveLength(3);
    expect((await f.a.agent.post('/api/settlements/settle-all').send(payload)).body.settlement.id).toBe(batch.body.settlement.id);
    const after = (await f.a.agent.get('/api/shared/overview')).body.friends.find((friend) => friend.id === f.b.id);
    expect(after.scopes).toHaveLength(0);
    const cash = (await f.a.agent.get('/api/shared/summary')).body.totals.INR;
    expect(cash.settlementSent).toBe(200); expect(cash.settlementReceived).toBe(0);
    expect((await f.a.agent.delete(`/api/settlements/${batch.body.settlement.id}`)).status).toBe(204);
    const restored = (await f.a.agent.get('/api/shared/overview')).body.friends.find((friend) => friend.id === f.b.id);
    expect(restored.byCurrency.INR).toBe(-200); expect(restored.scopes).toHaveLength(3);
  });

  it('clears zero-cash offset scopes only after confirmation and never mixes currencies', async () => {
    const f = await fixture(); const g = await f.group('Offset');
    await f.expense({ amount: 1000, paidBy: f.b.id, contextType: 'group', contextId: g.id }); await f.expense({ amount: 1000 }); await f.expense({ amount: 100, currency: 'USD' });
    const payload = { friendId: f.b.id, currency: 'INR', amount: 0 };
    expect((await f.a.agent.post('/api/settlements/settle-all').send(payload)).status).toBe(400);
    expect((await f.a.agent.post('/api/settlements/settle-all').send({ ...payload, confirmOffset: true })).status).toBe(201);
    const after = (await f.a.agent.get('/api/shared/overview')).body.friends.find((friend) => friend.id === f.b.id);
    expect(after.scopes).toHaveLength(1); expect(after.byCurrency.USD).toBe(50);
  });

  it('uses the simplified graph for three-person repayments', async () => {
    const f = await fixture(); const g = await f.group('Chain', [f.b.id, f.c.id]);
    await f.expense({ amount: 300, paidBy: f.b.id, participants: [f.a.id], contextType: 'group', contextId: g.id });
    await f.expense({ amount: 300, paidBy: f.c.id, participants: [f.b.id], contextType: 'group', contextId: g.id });
    const plan = (await f.a.agent.get(`/api/groups/${g.id}/balances`)).body.debts.INR;
    expect(plan).toEqual([{ from: f.a.id, to: f.c.id, amount: 300 }]);
    expect((await f.payment({ contextType: 'group', contextId: g.id, fromUserId: f.a.id, toUserId: f.c.id, amount: 300 })).status).toBe(201);
    expect((await f.a.agent.get(`/api/groups/${g.id}/balances`)).body.debts.INR).toHaveLength(0);
  });

  it('blocks member removal with debt and archives groups without erasing history', async () => {
    const f = await fixture(); const g = await f.group('Home');
    await f.expense({ contextType: 'group', contextId: g.id });
    expect((await f.a.agent.delete(`/api/groups/${g.id}/members/${f.b.id}`)).status).toBe(400);
    await f.payment({ contextType: 'group', contextId: g.id, amount: 750 });
    expect((await f.b.agent.delete(`/api/groups/${g.id}/members/${f.b.id}`)).status).toBe(200);
    expect((await f.a.agent.patch(`/api/groups/${g.id}`).send({ archived: true })).status).toBe(200);
    expect((await f.expense({ contextType: 'group', contextId: g.id, participants: [f.a.id] })).status).toBe(400);
    expect((await f.a.agent.get(`/api/groups/${g.id}/expenses`)).body.expenses).toHaveLength(1);
  });

  it('validates refunds, restores safely, materializes recurrence idempotently and exports CSV', async () => {
    const f = await fixture(); const original = (await f.expense({ date: '2026-01-31', recurrence: { frequency: 'monthly', endDate: '2026-04-30', active: true } })).body.expense;
    const refund = await f.expense({ kind: 'refund', refundOf: original.id, amount: 500 }); expect(refund.status).toBe(201);
    expect((await f.expense({ kind: 'refund', refundOf: original.id, amount: 1200 })).status).toBe(400);
    expect((await f.a.agent.delete(`/api/expenses/${original.id}`)).status).toBe(400);
    const occurrences = await f.a.agent.post(`/api/expenses/${original.id}/occurrences`).send({});
    expect(occurrences.status).toBe(200); expect(occurrences.body.expenses.map((r) => r.date)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect((await f.a.agent.post(`/api/expenses/${original.id}/occurrences`).send({})).body.expenses).toHaveLength(0);
    const exported = await f.a.agent.get(`/api/shared/export?contextType=friendship&contextId=${f.friendship.id}`);
    expect(exported.status).toBe(200); expect(exported.text).toContain('Your owed share'); expect(exported.text).toContain('refund');
  });

  it('rejects malformed money, unknown currencies, impossible dates and itemized mismatches', async () => {
    const f = await fixture();
    for (const patch of [{ amount: 1.001 }, { currency: 'XXX' }, { date: '2026-02-30' }, { splitMethod: 'itemized', splitDetails: { items: [{ name: 'Tea', amount: 10, memberIds: [f.a.id] }], tax: 0, tip: 0 } }]) expect((await f.expense(patch)).status).toBe(400);
  });
});

describe.skipIf(!config.mongoUri)('MongoDB shared accounting persistence', () => {
  it('persists multi-payer rows and an atomic settle-all batch across repository instances', async () => {
    const dbName = `shared_acceptance_${Date.now()}`;
    const repo = await createMongoRepo(config.mongoUri, dbName).init();
    try {
      const f = await fixture({ app: createApp(repo), repo }); const g = await f.group('Trip');
      const e = await f.expense({ contextType: 'group', contextId: g.id, payers: [{ memberId: f.a.id, amount: 1000 }, { memberId: f.b.id, amount: 500 }], idempotencyKey: 'mongo-expense' });
      expect(e.status).toBe(201); expect((await repo.findExpenseById(e.body.expense.id)).payers).toHaveLength(2);
      const batch = await f.a.agent.post('/api/settlements/settle-all').send({ friendId: f.b.id, currency: 'INR', amount: 250, idempotencyKey: 'mongo-batch' });
      expect(batch.status).toBe(201);
      const second = await createMongoRepo(config.mongoUri, dbName).init();
      expect((await second.listSettlements({ contextType: 'group', contextId: g.id }))[0]).toMatchObject({ batchId: batch.body.settlement.id, amount: 250 });
      expect((await f.a.agent.delete(`/api/settlements/${batch.body.settlement.id}`)).status).toBe(204);
      expect(await second.listSettlements({ contextType: 'group', contextId: g.id })).toHaveLength(0);
      await second.close();
    } finally { await repo.close(); }
  }, 60000);
});
