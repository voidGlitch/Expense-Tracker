import { describe, expect, it } from 'vitest';
import {
  categoryBreakdown, committedBillsTotal, confirmedBillsTotal, dailySpendSeries,
  discretionaryPool, discretionarySpent, extraIncomeTotal, generateBills,
  loggedExpensesTotal, monthSummary, overspendWarnings, plannedSavings,
  totalCommitments, totalIncome,
} from '../src/engine/index.js';
import { makeMonth } from '../src/data/schema.js';
import { electricityDef, furnitureDef, monthWithElectricity, rentDef, txn } from './fixtures.js';

const base = () => makeMonth('2026-09', {
  income: 60000,
  rdInstallment: 5000,
  recoveryInstallment: 5000,
  savingsTarget: 3000,
  bills: generateBills(makeMonth('2026-09'), [rentDef, furnitureDef, electricityDef],
    [monthWithElectricity('2026-08', 1500)]).bills,
  transactions: [
    txn({ date: '2026-09-02', category: 'Groceries', amount: 1200 }),
    txn({ date: '2026-09-03', category: 'Daily', amount: 300 }),
    txn({ date: '2026-09-05', category: 'Reimbursable', amount: 900 }),
    txn({ date: '2026-09-06', type: 'income', category: 'Freelance', amount: 2500 }),
  ],
});

describe('income', () => {
  it('adds the stored extra income and any logged income transactions', () => {
    const month = { ...base(), extraIncome: 500 };
    expect(extraIncomeTotal(month)).toBe(3000);
    expect(totalIncome(month)).toBe(63000);
  });

  it('matches the SRS formula exactly when no income transactions are logged', () => {
    const month = makeMonth('2026-09', { income: 60000, extraIncome: 1500 });
    expect(totalIncome(month)).toBe(month.income + month.extraIncome);
  });
});

describe('the §3.2 waterfall', () => {
  const month = base();

  it('commits actuals for confirmed bills and estimates for pending ones', () => {
    // rent 18000 + furniture 2400 confirmed, electricity provisional 1500
    expect(committedBillsTotal(month)).toBe(21900);
    expect(confirmedBillsTotal(month)).toBe(20400);
  });

  it('sums the savings layers', () => {
    expect(plannedSavings(month)).toBe(13000);
    expect(totalCommitments(month)).toBe(34900);
  });

  it('leaves the discretionary pool', () => {
    // (60000 + 2500 income txn) - 34900
    expect(discretionaryPool(month)).toBe(27600);
  });
});

describe('discretionary spending', () => {
  const month = base();

  it('counts discretionary categories only', () => {
    expect(discretionarySpent(month)).toBe(1500);
  });

  it('counts every expense when reconciling', () => {
    expect(loggedExpensesTotal(month)).toBe(2400);
  });

  it('never counts income transactions as spending', () => {
    const incomeOnly = makeMonth('2026-09', {
      income: 1000,
      transactions: [txn({ date: '2026-09-01', type: 'income', category: 'Bonus', amount: 5000 })],
    });
    expect(discretionarySpent(incomeOnly)).toBe(0);
  });

  it('treats an unknown category as discretionary so nothing escapes the budget', () => {
    const custom = makeMonth('2026-09', {
      income: 1000,
      transactions: [txn({ date: '2026-09-01', category: 'Pet food', amount: 250 })],
    });
    expect(discretionarySpent(custom)).toBe(250);
  });
});

describe('dashboard aggregates', () => {
  const month = base();

  it('summarises a month in one pass', () => {
    const summary = monthSummary(month, '2026-09-10');
    expect(summary).toMatchObject({
      monthId: '2026-09', status: 'open', income: 60000, totalIncome: 62500,
      committedBills: 21900, pendingBillsCount: 1, billsCount: 3, needsInputCount: 0,
      plannedSavings: 13000, transactionCount: 4,
    });
  });

  it('breaks spending down by category, largest first', () => {
    const rows = categoryBreakdown(month);
    expect(rows.map((r) => r.category)).toEqual(['Groceries', 'Reimbursable', 'Daily']);
    expect(rows[0]).toMatchObject({ amount: 1200, share: 50 });
    expect(rows.every((r) => typeof r.color === 'string')).toBe(true);
  });

  it('builds a cumulative daily series against the flat budget line', () => {
    const series = dailySpendSeries(month);
    expect(series).toHaveLength(30);
    expect(series[1]).toMatchObject({ day: 2, amount: 1200, cumulative: 1200 });
    expect(series[2].cumulative).toBe(1500);
    expect(series[29].cumulative).toBe(1500);
    expect(series[29].budgetLine).toBeCloseTo(discretionaryPool(month), 0);
  });
});

describe('overspend warnings (FR13)', () => {
  it('is quiet on a healthy month', () => {
    expect(overspendWarnings(base(), '2026-09-02')).toEqual([]);
  });

  it('flags commitments above income', () => {
    const broke = { ...base(), income: 10000 };
    expect(overspendWarnings(broke, '2026-09-02').map((w) => w.code))
      .toContain('commitments-exceed-income');
  });

  it('flags an exhausted pool', () => {
    const spent = makeMonth('2026-09', {
      income: 1000,
      transactions: [txn({ date: '2026-09-02', category: 'Misc', amount: 1500 })],
    });
    expect(overspendWarnings(spent, '2026-09-03').map((w) => w.code)).toContain('pool-exhausted');
  });

  it('flags a bill still waiting for an amount', () => {
    const pending = generateBills(makeMonth('2026-09', { income: 60000 }), [electricityDef], []);
    expect(overspendWarnings(pending, '2026-09-02').map((w) => w.code)).toContain('needs-input');
  });
});
