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

// Display-only cash movements: never add repayments to the persisted budget.
export function sharedRepaymentEntries(shared, monthId) {
  const seen = new Set();
  return (shared?.transactions || []).filter((txn) => {
    if (!['settlement_received', 'settlement_sent'].includes(txn.sourceType) || !String(txn.date || '').startsWith(monthId || '') || !(Number(txn.amount) > 0)) return false;
    const key = txn.sourceType + ':' + (txn.sourceId || txn.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((txn) => ({
    id: txn.id, date: txn.date, type: 'repayment', amount: txn.amount,
    category: 'Repayment', note: txn.sourceType === 'settlement_received' ? 'Repayment received' : 'Repayment sent',
    credit: txn.sourceType === 'settlement_received', repayment: true, shared: true, sharedDetail: txn,
  }));
}
