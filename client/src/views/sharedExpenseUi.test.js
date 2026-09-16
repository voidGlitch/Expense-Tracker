import { describe, expect, it } from 'vitest';
import { sharedExpenseEntries, shouldShowSettleUp } from './sharedExpenseUi.js';

describe('shared expense UI rules', () => {
  it('hides Settle Up for empty or zero debts and shows it only for current-user payable rows', () => {
    expect(shouldShowSettleUp([])).toBe(false);
    expect(shouldShowSettleUp([{ to: 'miku', amount: 0 }])).toBe(false);
    expect(shouldShowSettleUp([{ to: 'miku', amount: 700 }])).toBe(true);
  });

  it('turns shared personal shares into normal Expense Manager entries for the selected month', () => {
    const entries = sharedExpenseEntries({
      transactions: [
        { id: 'shared-expense:1:me', sourceType: 'shared_expense', date: '2026-09-17', personalShare: 750, category: 'Entertainment', description: 'Movie', contextTitle: 'Miku' },
        { id: 'settlement-sent:1:me', sourceType: 'settlement_sent', date: '2026-09-17', amount: 50, description: 'Settlement sent' },
        { id: 'shared-expense:2:me', sourceType: 'shared_expense', date: '2026-08-10', personalShare: 100, category: 'Food', description: 'Dinner' },
      ],
    }, '2026-09');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'expense',
      amount: 750,
      category: 'Entertainment',
      note: 'Movie',
      shared: true,
    });
  });
});
