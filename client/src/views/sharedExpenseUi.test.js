import { describe, expect, it } from 'vitest';
import { sharedExpenseEntries, sharedRepaymentEntries, shouldShowSettleUp } from './sharedExpenseUi.js';

describe('shared expense UI rules', () => {
  it('hides Settle Up for empty or zero debts and shows it only for current-user payable rows', () => {
    expect(shouldShowSettleUp([])).toBe(false);
    expect(shouldShowSettleUp([{ to: 'miku', amount: 0 }])).toBe(false);
    expect(shouldShowSettleUp([{ to: 'miku', amount: 700 }])).toBe(true);
  });

  it('does not show a non-payer shared expense until they settle it', () => {
    const entries = sharedExpenseEntries({
      transactions: [
        { id: 'shared-expense:1:me', sourceType: 'shared_expense', date: '2026-09-17', personalShare: 750, category: 'Entertainment', description: 'Movie', contextTitle: 'Miku' },
        { id: 'settlement-sent:1:me', sourceType: 'settlement_sent', date: '2026-09-17', amount: 50, description: 'Settlement sent' },
        { id: 'shared-expense:2:me', sourceType: 'shared_expense', date: '2026-08-10', personalShare: 100, category: 'Food', description: 'Dinner' },
      ],
    }, '2026-09');

    expect(entries).toHaveLength(0);
  });

  it('shows the full cash paid when the user fronts a shared expense', () => {
    const [entry] = sharedExpenseEntries({ transactions: [{ id: 'fronted', sourceType: 'shared_expense', date: '2026-09-17', personalShare: 250, amountPaidByCurrentUser: 500, category: 'Food', description: 'Party' }] }, '2026-09');
    expect(entry).toMatchObject({ amount: 500, cashPaid: true });
  });
});

it('shows partial repayments with correct signs, filters months and avoids duplicate batch credits', () => {
  const received = { id: 'r1', sourceId: 'batch1', sourceType: 'settlement_received', fromUserId: 'friend', toUserId: 'me', date: '2026-09-17', amount: 50, description: 'Party' };
  const entries = sharedRepaymentEntries({ transactions: [received, { ...received, id: 'r2' }, { ...received, id: 'sent', sourceId: 'sent', sourceType: 'settlement_sent', fromUserId: 'me', toUserId: 'friend', amount: 700, description: 'Plan B', category: 'Food' }, { ...received, id: 'old', date: '2026-08-17' }, { ...received, id: 'zero', amount: 0 }] }, '2026-09', 'me');
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ type: 'repayment', credit: true, amount: 50 });
  expect(entries[1]).toMatchObject({ type: 'expense', credit: false, amount: 700, note: 'Plan B', category: 'Food' });
});
