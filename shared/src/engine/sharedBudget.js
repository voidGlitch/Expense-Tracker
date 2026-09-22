import { participantShares } from './money.js';
import { expenseSplits } from './balances.js';

/** Read projection only. Never save these rows into a personal budget document. */
export function sharedBudgetEntries(expenses, userId, monthId, currency) {
  const seen = new Set();
  return expenses.flatMap((expense) => {
    if (expense.deletedAt || seen.has(expense.id) || expense.currency !== currency || !expense.date?.startsWith(monthId)) return [];
    seen.add(expense.id);
    const mine = participantShares({ ...expense, splits: expenseSplits(expense) }).find((row) => row.memberId === userId);
    const paid = mine?.paidShare || 0;
    if (!paid) return [];
    return [{ id: `shared:${expense.id}:${userId}`, sourceId: expense.id, sourceType: 'shared_expense', shared: true, date: expense.date, type: 'expense', amount: paid, category: `${expense.description || expense.category || 'Shared expense'} (shared expense)`, note: expense.description, currency: expense.currency }];
  });
}
export function withSharedBudget(month, entries = []) {
  return month ? { ...month, sharedTransactions: entries } : null;
}
