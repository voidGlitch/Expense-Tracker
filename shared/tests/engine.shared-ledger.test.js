import { describe, expect, it } from 'vitest';
import { balanceWith, balancesAreConsistent, computeSplits, makeExpense, netBalancesObject, pairwiseBalances, simplifyDebts, validateExpense } from '../src/index.js';

const ids = ['rahul', 'amit', 'priya', 'shreshthav'];

describe('shared ledger money engine', () => {
  it('splits equal amounts to the paise without losing a remainder', () => {
    expect(computeSplits(100, 'equal', ['a', 'b', 'c']).map((row) => row.amount)).toEqual([33.34, 33.33, 33.33]);
  });
  it('supports exact, percentage, and shares allocations', () => {
    expect(computeSplits(2000, 'exact', ids, { rahul: 800, amit: 500, priya: 400, shreshthav: 300 }).map((row) => row.amount)).toEqual([800, 500, 400, 300]);
    expect(computeSplits(2000, 'percentage', ids, { rahul: 40, amit: 30, priya: 20, shreshthav: 10 }).map((row) => row.amount)).toEqual([800, 600, 400, 200]);
    expect(computeSplits(2000, 'shares', ['rahul', 'amit', 'priya'], { rahul: 2, amit: 1, priya: 1 }).map((row) => row.amount)).toEqual([1000, 500, 500]);
  });
  it('does not normalize invalid percentages or allow invalid exact totals', () => {
    const people = ['miku', 'me'];
    const percentage = makeExpense({ description: 'Dinner', amount: 2000, paidBy: 'miku', participants: people, splitMethod: 'percentage', splitDetails: { miku: 60, me: 20 }, contextId: 'pair' });
    expect(percentage.splits).toEqual([{ memberId: 'miku', amount: 1200 }, { memberId: 'me', amount: 400 }]);
    expect(validateExpense(percentage, { memberIds: people }).errors.splits).toBe('Percentages must total 100%.');
    const exact = makeExpense({ description: 'Dinner', amount: 2000, paidBy: 'miku', participants: people, splitMethod: 'exact', splitDetails: { miku: 1500, me: 1000 }, contextId: 'pair' });
    expect(validateExpense(exact, { memberIds: people }).errors.splits).toBe('Split amounts must equal the expense total.');
  });
  it('implements the Goa Trip example and nets both expenses', () => {
    const hotel = makeExpense({ description: 'Hotel', amount: 8000, paidBy: 'rahul', participants: ids, contextId: 'goa', contextType: 'group' });
    const dinner = makeExpense({ description: 'Dinner', amount: 4000, paidBy: 'shreshthav', participants: ids, contextId: 'goa', contextType: 'group' });
    const balances = netBalancesObject([hotel, dinner], []);
    expect(balances).toEqual({ rahul: 5000, amit: -3000, priya: -3000, shreshthav: 1000 });
    expect(balancesAreConsistent([hotel, dinner], [])).toBe(true);
    expect(simplifyDebts(balances).map(({ from, to, amount }) => ({ from, to, amount }))).toEqual([
      { from: 'amit', to: 'rahul', amount: 3000 },
      { from: 'priya', to: 'rahul', amount: 2000 },
      { from: 'priya', to: 'shreshthav', amount: 1000 },
    ]);
  });
  it('nets opposing personal debts and partial settlements', () => {
    const a = makeExpense({ description: 'Dinner', amount: 1000, paidBy: 'rahul', participants: ['rahul', 'amit'], contextId: 'pair' });
    const b = makeExpense({ description: 'Fuel', amount: 600, paidBy: 'amit', participants: ['rahul', 'amit'], contextId: 'pair' });
    const before = pairwiseBalances([a, b], []);
    expect(before).toEqual([{ from: 'amit', to: 'rahul', amount: 200 }]);
    const settlement = { fromUserId: 'amit', toUserId: 'rahul', amount: 125 };
    expect(balanceWith([a, b], [settlement], 'rahul', 'amit')).toMatchObject({ direction: 'owesYou', amount: 75 });
  });
  it('keeps currencies separate in balance calculations', () => {
    const inr = makeExpense({ description: 'Lunch', amount: 1000, currency: 'INR', paidBy: 'a', participants: ['a', 'b'], contextId: 'pair' });
    const usd = makeExpense({ description: 'Tickets', amount: 20, currency: 'USD', paidBy: 'a', participants: ['a', 'b'], contextId: 'pair' });
    expect(balanceWith([inr], [], 'a', 'b').amount).toBe(500);
    expect(balanceWith([usd], [], 'a', 'b').amount).toBe(10);
  });
  it('models the dinner receivable/payable examples without treating settlements as new spending', () => {
    const diners = ['shreshthav', 'rahul', 'aman', 'priya'];
    const dinner = makeExpense({ description: 'Dinner', amount: 4000, paidBy: 'shreshthav', participants: diners, contextId: 'trip', contextType: 'group' });
    // Shreshthav's own consumption is 1,000; the other 3,000 remains receivable.
    expect(dinner.splits).toEqual(diners.map((memberId) => ({ memberId, amount: 1000 })));
    expect(netBalancesObject([dinner], [])).toEqual({ shreshthav: 3000, rahul: -1000, aman: -1000, priya: -1000 });

    // Rahul paying Shreshthav is a settlement: it clears the payable/receivable,
    // never creates a second expense or changes anyone's consumed dinner share.
    const repayment = { fromUserId: 'rahul', toUserId: 'shreshthav', amount: 1000, currency: 'INR' };
    expect(netBalancesObject([dinner], [repayment])).toEqual({ shreshthav: 2000, rahul: 0, aman: -1000, priya: -1000 });
    expect(balanceWith([dinner], [repayment], 'shreshthav', 'rahul')).toMatchObject({ direction: 'settled', amount: 0 });
  });
});
