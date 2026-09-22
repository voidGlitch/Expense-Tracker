export function shouldShowSettleUp(options = []) {
  return (options || []).some((row) => Number(row.amount) > 0);
}

export function sharedExpenseEntries(shared, monthId) {
  return (shared?.transactions || [])
    .filter((txn) => txn.sourceType === 'shared_expense' && Number(txn.amountPaidByCurrentUser) > 0 && String(txn.date || '').startsWith(monthId || ''))
    .map((txn) => ({
      id: txn.id,
      date: txn.date,
      type: 'expense',
      // Spending shows the cash that left your account. If you did not pay,
      // fall back to your owed share so the entry still represents your debt.
      amount: txn.amountPaidByCurrentUser,
      category: txn.category || 'Shared',
      note: txn.description,
      shared: true,
      cashPaid: Number(txn.amountPaidByCurrentUser) > 0,
      sharedDetail: txn,
    }));
}

// Display-only cash movements: never add repayments to the persisted budget.
export function sharedRepaymentEntries(shared, monthId, userId) {
  const seen = new Set();
  return (shared?.transactions || []).filter((txn) => {
    if (!['settlement_received', 'settlement_sent'].includes(txn.sourceType) || !String(txn.date || '').startsWith(monthId || '') || !(Number(txn.amount) > 0)) return false;
    const key = txn.sourceType + ':' + (txn.sourceId || txn.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((txn) => {
    const received = txn.fromUserId && txn.toUserId ? txn.toUserId === userId : txn.sourceType === 'settlement_received';
    if (received) return {
      id: txn.id, date: txn.date, type: 'repayment', amount: txn.amount,
      category: 'Repayment', note: `Payment received for ${txn.description || 'shared expense'}`,
      credit: true, repayment: true, shared: true, sharedDetail: txn,
    };
    return {
      id: txn.id, date: txn.date, type: 'expense', amount: txn.amount,
      category: txn.category || 'Shared', note: txn.description || 'Shared expense settlement',
      credit: false, repayment: false, shared: true, settledPayment: true, sharedDetail: txn,
    };
  });
}
