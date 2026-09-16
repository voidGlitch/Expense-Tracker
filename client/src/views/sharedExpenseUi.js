export function shouldShowSettleUp(options = []) {
  return (options || []).some((row) => Number(row.amount) > 0);
}

export function sharedExpenseEntries(shared, monthId) {
  return (shared?.transactions || [])
    .filter((txn) => txn.sourceType === 'shared_expense' && String(txn.date || '').startsWith(monthId || ''))
    .map((txn) => ({
      id: txn.id,
      date: txn.date,
      type: 'expense',
      amount: txn.personalShare,
      category: txn.category || 'Shared',
      note: txn.description,
      shared: true,
      sharedDetail: txn,
    }));
}
