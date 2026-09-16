import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const password = 'ledgerpass1';
async function account(app, name, email) { const agent = request.agent(app); const result = await agent.post('/api/auth/register').send({ name, email, password }); return { agent, user: result.body.user }; }
async function setup(app) { const a = await account(app, 'Rahul', 'rahul@test.com'); const b = await account(app, 'Amit', 'amit@test.com'); const ask = await a.agent.post('/api/friends/request').send({ userId: b.user.id }); const accepted = await b.agent.post(`/api/friends/${ask.body.request.id}/accept`).send({}); return { a, b, friendship: accepted.body.friendship }; }
describe('ledger API', () => {
  it('implements the 1,000 → 400 → 600 partial-settlement example without double counting', async () => {
    const { app } = await makeApp(); const { a, b, friendship } = await setup(app);
    const expense = await a.agent.post('/api/expenses').send({ description: 'Dinner', amount: 2000, paidBy: a.user.id, participants: [a.user.id, b.user.id], splitMethod: 'equal', contextType: 'friendship', contextId: friendship.id });
    expect(expense.status).toBe(201);
    const initial = await b.agent.get(`/api/friendships/${friendship.id}/balance`);
    expect(initial.body.balances.INR).toMatchObject({ direction: 'youOwe', amount: 1000 });
    const partial = await b.agent.post('/api/settlements').send({ fromUserId: b.user.id, toUserId: a.user.id, amount: 400, method: 'upi', contextType: 'friendship', contextId: friendship.id, date: '2026-09-17' });
    expect(partial.status).toBe(201);
    expect((await b.agent.get(`/api/friendships/${friendship.id}/balance`)).body.balances.INR.amount).toBe(600);
    const aManager = await a.agent.get('/api/shared/summary');
    expect(aManager.body.totals.INR).toMatchObject({ personalExpense: 1000, receivable: 600, settlementReceived: 400 });
    expect(aManager.body.transactions.some((row) => row.sourceType === 'settlement_received' && row.amount === 400)).toBe(true);
    const complete = await b.agent.post('/api/settlements').send({ fromUserId: b.user.id, toUserId: a.user.id, amount: 600, method: 'upi', contextType: 'friendship', contextId: friendship.id, date: '2026-09-17' });
    expect(complete.status).toBe(201);
    expect((await b.agent.get(`/api/friendships/${friendship.id}/balance`)).body.balances.INR).toMatchObject({ direction: 'settled', amount: 0 });
  });
  it('returns field-specific settlement validation errors for invalid, self, and overpayment cases', async () => {
    const { app } = await makeApp(); const { a, b, friendship } = await setup(app);
    await a.agent.post('/api/expenses').send({ description: 'Dinner', amount: 2000, paidBy: a.user.id, participants: [a.user.id, b.user.id], contextType: 'friendship', contextId: friendship.id });
    const invalidDate = await b.agent.post('/api/settlements').send({ fromUserId: b.user.id, toUserId: a.user.id, amount: 100, currency: 'INR', date: 'not-a-date', method: 'upi', contextType: 'friendship', contextId: friendship.id });
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.error.fieldErrors).toMatchObject({ date: expect.any(String) });
    const invalidPayment = await b.agent.post('/api/settlements').send({ fromUserId: b.user.id, toUserId: b.user.id, amount: 0, currency: 'INR', date: '2026-09-17', method: 'upi', contextType: 'friendship', contextId: friendship.id });
    expect(invalidPayment.status).toBe(400);
    expect(invalidPayment.body.error.fieldErrors).toMatchObject({ toUserId: expect.any(String), amount: expect.any(String) });
    const overpayment = await b.agent.post('/api/settlements').send({ fromUserId: b.user.id, toUserId: a.user.id, amount: 1001, currency: 'INR', date: '2026-09-17', method: 'upi', contextType: 'friendship', contextId: friendship.id });
    expect(overpayment.status).toBe(400);
    expect(overpayment.body.error.fieldErrors.amount).toMatch(/more than/i);
  });
  it('blocks outsiders and unauthorised expense changes', async () => {
    const { app } = await makeApp(); const { a, b, friendship } = await setup(app); const outsider = await account(app, 'Priya', 'priya@test.com');
    const expense = await a.agent.post('/api/expenses').send({ description: 'Cab', amount: 100, paidBy: a.user.id, participants: [a.user.id, b.user.id], contextType: 'friendship', contextId: friendship.id });
    expect((await outsider.agent.get(`/api/friendships/${friendship.id}/expenses`)).status).toBe(403);
    expect((await b.agent.delete(`/api/expenses/${expense.body.expense.id}`)).status).toBe(403);
  });
  it('projects personal share, receivable and edits into Expense Manager without duplicate entries', async () => {
    const { app } = await makeApp(); const { a, b, friendship } = await setup(app);
    const created = await a.agent.post('/api/expenses').send({
      description: 'Dinner', category: 'Food', amount: 2000, paidBy: a.user.id,
      participants: [a.user.id, b.user.id], splitMethod: 'equal', contextType: 'friendship', contextId: friendship.id,
    });
    expect(created.status).toBe(201);
    let summary = await a.agent.get('/api/shared/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.totals.INR).toMatchObject({ personalExpense: 1000, cashPaid: 2000, receivable: 1000, payable: 0 });
    expect(summary.body.transactions).toHaveLength(1);
    expect(summary.body.transactions[0]).toMatchObject({ sourceType: 'shared_expense', sourceId: created.body.expense.id, personalShare: 1000 });

    const edited = await a.agent.patch(`/api/expenses/${created.body.expense.id}`).send({ amount: 3000, splitMethod: 'equal', participants: [a.user.id, b.user.id], paidBy: a.user.id });
    expect(edited.status).toBe(200);
    summary = await a.agent.get('/api/shared/summary');
    expect(summary.body.totals.INR).toMatchObject({ personalExpense: 1500, cashPaid: 3000, receivable: 1500 });
    expect(summary.body.transactions).toHaveLength(1);

    expect((await a.agent.delete(`/api/expenses/${created.body.expense.id}`)).status).toBe(204);
    summary = await a.agent.get('/api/shared/summary');
    expect(summary.body.transactions).toHaveLength(0);
    expect(summary.body.totals.INR).toBeUndefined();
  });
  it('rejects invalid exact and percentage splits on the backend', async () => {
    const { app } = await makeApp(); const { a, b, friendship } = await setup(app);
    const base = { description: 'Dinner', amount: 2000, paidBy: a.user.id, participants: [a.user.id, b.user.id], contextType: 'friendship', contextId: friendship.id };
    const exact = await a.agent.post('/api/expenses').send({ ...base, splitMethod: 'exact', splitDetails: { [a.user.id]: 1500, [b.user.id]: 1000 } });
    expect(exact.status).toBe(400);
    expect(exact.body.error).toMatchObject({ code: 'SPLIT_TOTAL_MISMATCH', fieldErrors: { splits: 'Split amounts must equal the expense total.' } });
    const percentage = await a.agent.post('/api/expenses').send({ ...base, splitMethod: 'percentage', splitDetails: { [a.user.id]: 60, [b.user.id]: 20 } });
    expect(percentage.status).toBe(400);
    expect(percentage.body.error).toMatchObject({ code: 'PERCENTAGE_TOTAL_MISMATCH', fieldErrors: { splits: 'Percentages must total 100%.' } });
  });
});
