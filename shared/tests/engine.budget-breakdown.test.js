import { describe, expect, it } from 'vitest';
import { budgetBreakdown, monthSummary } from '../src/index.js';

describe('budget breakdown', () => {
  it('reconciles commitments, income and category detail with the budget engine', () => {
    const month = { id: '2026-09', income: 75298, extraIncome: 100, rdInstallment: 2000, recoveryInstallment: 1000, savingsTarget: 2000,
      bills: [
        { name: 'Confirmed', status: 'confirmed', actualAmount: 25000, provisionalAmount: 30000 },
        { name: 'Pending', status: 'pending', provisionalAmount: 32300 },
      ], transactions: [
        { type: 'expense', category: 'Eating out', amount: 6023.48 },
        { type: 'expense', category: 'Misc', amount: 74 },
        { type: 'expense', category: 'Shopping', amount: 2182.21 },
        { type: 'expense', category: 'Transport', amount: 4935 },
        { type: 'expense', category: 'Reimbursable', amount: 400 },
        { type: 'income', category: 'Bonus', amount: 200 },
      ] };
    const detail = budgetBreakdown(month);
    const summary = monthSummary(month);
    const sum = rows => Math.round(rows.reduce((total, row) => total + row.amount, 0) * 100) / 100;
    expect(sum(detail.commitments)).toBe(62300);
    expect(sum(detail.commitments)).toBe(summary.commitments);
    expect(sum(detail.pool)).toBe(13298);
    expect(sum(detail.pool)).toBe(summary.pool);
    expect(sum(detail.spending)).toBe(13214.69);
    expect(sum(detail.spending)).toBe(summary.discretionarySpent);
    expect(detail.spending.some(row => row.label === 'Reimbursable' || row.label === 'Bonus')).toBe(false);
    expect(summary.remaining).toBe(83.31);
  });

  it('handles empty months and zero savings without fabricated expenses', () => {
    const detail = budgetBreakdown({ id: '2026-09' });
    expect(detail.spending).toEqual([]);
    expect(detail.commitments.every(row => row.amount === 0)).toBe(true);
    expect(detail.pool.every(row => row.amount === 0)).toBe(true);
  });
});
