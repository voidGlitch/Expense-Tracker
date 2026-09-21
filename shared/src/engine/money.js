/** Ledger arithmetic is in integer minor units. Supported currencies use cents/paise. */
export const minor = (value) => Math.round((Number(value) || 0) * 100);
export const major = (value) => value / 100;
export const moneySum = (values) => major(values.reduce((sum, value) => sum + minor(value), 0));

/** Legacy single-payer rows remain readable without rewriting history. */
export function expensePayers(expense) {
  return expense.payers?.length ? expense.payers : [{ memberId: expense.paidBy, amount: expense.amount }];
}

export function participantShares(expense) {
  const rows = new Map();
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { memberId: id, paidMinor: 0, owedMinor: 0 });
    return rows.get(id);
  };
  for (const payer of expensePayers(expense)) row(payer.memberId).paidMinor += minor(payer.amount);
  for (const split of expense.splits || []) row(split.memberId).owedMinor += minor(split.amount);
  const sign = expense.kind === 'refund' ? -1 : 1;
  return [...rows.values()].map(({ memberId, paidMinor, owedMinor }) => ({
    memberId, paidShare: major(paidMinor * sign), owedShare: major(owedMinor * sign), netShare: major((paidMinor - owedMinor) * sign),
  }));
}
