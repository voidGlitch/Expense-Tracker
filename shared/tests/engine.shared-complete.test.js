import { describe, it, expect } from 'vitest';
import { makeExpense, validateExpense, participantShares, minor, computeSplits, netBalancesObject, pairwiseBalances, simplifyDebts, summaryFor, sharedBudgetEntries, withSharedBudget, monthSummary, recurringDates } from '../src/index.js';

const expense = (extra = {}) => makeExpense({ description: 'Hotel', amount: 3000, currency: 'INR', date: '2026-09-01', paidBy: 'a', participants: ['a', 'b', 'c'], contextType: 'group', contextId: 'g', ...extra });
describe('complete shared accounting', () => {
  it.each([
    [3000, [{ memberId: 'a', amount: 2000 }, { memberId: 'b', amount: 1000 }], 'equal', {}, { a: 1000, b: 0, c: -1000 }],
    [4000, [{ memberId: 'a', amount: 3000 }, { memberId: 'b', amount: 1000 }], 'exact', { a: 1000, b: 1500, c: 1500 }, { a: 2000, b: -500, c: -1500 }],
    [900, [{ memberId: 'a', amount: 300 }, { memberId: 'b', amount: 300 }, { memberId: 'c', amount: 300 }], 'equal', {}, { a: 0, b: 0, c: 0 }],
  ])('nets multiple payers for amount %s', (amount, payers, splitMethod, splitDetails, expected) => {
    const row = expense({ amount, payers, splitMethod, splitDetails });
    expect(validateExpense(row, { memberIds: ['a', 'b', 'c'] }).ok).toBe(true);
    expect(netBalancesObject([row])).toEqual(expected);
    expect(participantShares(row).reduce((sum, part) => sum + minor(part.netShare), 0)).toBe(0);
    expect(netBalancesObject([row], simplifyDebts(expected).map((p) => ({ fromUserId: p.from, toUserId: p.to, amount: p.amount, currency: 'INR' })))).toEqual({ a: 0, b: 0, c: 0 });
  });
  it('supports payer excluded from consumption, self-only and zero-share participants', () => {
    expect(netBalancesObject([expense({ amount: 1000, participants: ['b', 'c'] })])).toEqual({ a: 1000, b: -500, c: -500 });
    expect(pairwiseBalances([expense({ amount: 500, participants: ['a'] })])).toEqual([]);
    expect(netBalancesObject([expense({ amount: 1200, splitMethod: 'shares', splitDetails: { a: 2, b: 0, c: 1 } })])).toEqual({ a: 400, b: 0, c: -400 });
  });
  it('validates zero weights, negative weights, duplicate payers, incomplete paid totals and stranger payers', () => {
    for (const patch of [
      { splitMethod: 'shares', splitDetails: { a: 0, b: 0, c: 0 } },
      { splitMethod: 'percentage', splitDetails: { a: -10, b: 50, c: 60 } },
      { payers: [{ memberId: 'a', amount: 1500 }, { memberId: 'a', amount: 1500 }] },
      { payers: [{ memberId: 'a', amount: 20 }] },
      { payers: [{ memberId: 'x', amount: 3000 }] },
    ]) expect(validateExpense(expense(patch), { memberIds: ['a', 'b', 'c'] }).ok).toBe(false);
  });
  it('allocates adjustments and itemized extras without dropping cents', () => {
    expect(computeSplits(1000, 'adjustment', ['a', 'b'], { b: 200 })).toEqual([{ memberId: 'a', amount: 400 }, { memberId: 'b', amount: 600 }]);
    const row = expense({ amount: 121, participants: ['a', 'b'], splitMethod: 'itemized', splitDetails: { items: [{ name: 'meal', amount: 100, memberIds: ['a', 'b'] }, { name: 'drink', amount: 10, memberIds: ['a'] }], tax: 10, tip: 1 } });
    expect(row.splits).toEqual([{ memberId: 'a', amount: 66 }, { memberId: 'b', amount: 55 }]);
    expect(validateExpense(row).ok).toBe(true);
  });
  it('preserves exact invariants over many deterministic roundings', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const amount = (seed * 137 % 300000 + 1) / 100;
      const row = expense({ amount, splitMethod: 'shares', splitDetails: { a: seed % 9, b: seed % 7, c: 1 } });
      expect(row.splits.reduce((sum, part) => sum + minor(part.amount), 0)).toBe(minor(amount));
      expect(participantShares(row).reduce((sum, part) => sum + minor(part.netShare), 0)).toBe(0);
    }
  });
  it('leaves a one-paise debt actionable and reverses overpayments', () => {
    const row = expense({ amount: 100, participants: ['a', 'b'] });
    const settle = (amount) => [{ fromUserId: 'b', toUserId: 'a', amount, currency: 'INR' }];
    expect(pairwiseBalances([row], settle(49.99))).toEqual([{ from: 'b', to: 'a', amount: 0.01 }]);
    expect(pairwiseBalances([row], settle(60))).toEqual([{ from: 'a', to: 'b', amount: 10 }]);
    expect(pairwiseBalances([], settle(60))).toEqual([{ from: 'a', to: 'b', amount: 60 }]);
  });
  it('separates currencies instead of summing them', () => {
    const rows = [expense({ amount: 100, participants: ['a', 'b'] }), expense({ amount: 50, currency: 'USD', participants: ['a', 'b'] })];
    expect(() => netBalancesObject(rows)).toThrow(/currency/);
    const summary = summaryFor(rows, [], 'a');
    expect(summary.netBalance).toBeUndefined();
    expect(summary.perCurrency.INR.netBalance).toBe(50);
    expect(summary.perCurrency.USD.netBalance).toBe(25);
  });
  it('charges the payer cash and charges the other person only on settlement', () => {
    const dinner = expense({ amount: 1500, participants: ['a', 'b'], category: 'Entertainment' });
    const month = { id: '2026-09', income: 7000, bills: [], transactions: [{ type: 'expense', category: 'Groceries', amount: 1000 }] };
    const projected = () => withSharedBudget(month, sharedBudgetEntries([dinner, dinner], 'a', month.id, 'INR'));
    for (const settlements of [[], [{ fromUserId: 'b', toUserId: 'a', amount: 50, currency: 'INR' }], [{ fromUserId: 'b', toUserId: 'a', amount: 750, currency: 'INR' }]]) {
      expect(monthSummary(projected()).remaining).toBe(4500);
      expect(monthSummary(projected()).loggedExpenses).toBe(2500);
      expect(netBalancesObject([dinner], settlements).a).toBe(750 - (settlements[0]?.amount || 0));
    }
    const refund = expense({ amount: 500, kind: 'refund', refundOf: dinner.id, participants: ['a', 'b'] });
    expect(monthSummary(withSharedBudget(month, sharedBudgetEntries([dinner, refund], 'a', month.id, 'INR'))).remaining).toBe(5000);
  });
  it('does not charge a non-payer until they record a settlement', () => {
    const dinner = expense({ amount: 1500, paidBy: 'b', participants: ['a', 'b'], category: 'Entertainment' });
    const month = { id: '2026-09', income: 7000, bills: [], transactions: [{ type: 'expense', category: 'Groceries', amount: 1000 }] };
    expect(sharedBudgetEntries([dinner], 'a', month.id, 'INR')).toHaveLength(0);
    expect(sharedBudgetEntries([dinner], 'b', month.id, 'INR')[0].amount).toBe(1500);
  });
  it('anchors recurring month ends and leap years', () => {
    expect(recurringDates('2026-01-31', 'monthly', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(recurringDates('2024-02-29', 'yearly', '2028-03-01')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(recurringDates('2026-09-01', 'fortnightly', '2026-10-01', '2026-09-20')).toEqual(['2026-09-15']);
  });
});
