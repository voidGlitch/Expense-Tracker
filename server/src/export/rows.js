/**
 * Export row builders.
 *
 * Pure functions returning `{ name, columns, rows }` sheet descriptors, so what
 * lands in the spreadsheet is unit-testable without touching exceljs. The
 * workbook writer is then a dumb renderer of these descriptors.
 *
 * Column types: text | money | number | date | monthKey | bool
 */
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  TRANSACTION_TYPE,
  billCommittedAmount,
  formatMonthLabel,
  isDiscretionaryCategory,
  isMonthKey,
  monthSummary,
  todayKey,
} from '@expense/shared';

const yesNo = (value) => (value ? 'Yes' : 'No');
const titleCase = (value) => String(value || '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/^./, (c) => c.toUpperCase());

/** The Excel number format for the store's currency, e.g. `"₹"#,##0.00`. */
export function currencyFormat(store) {
  const code = store?.settings?.currency || DEFAULT_CURRENCY;
  const symbol = CURRENCIES[code]?.symbol || '';
  return symbol ? `"${symbol}"#,##0.00` : '#,##0.00';
}

/**
 * Which months to export. Accepts 'all', a single "YYYY-MM", an array, or a
 * comma-separated string (what the dropdown sends). Unknown months are dropped,
 * and the result is always chronological.
 */
export function resolveMonthIds(store, selection = 'all') {
  const available = (store?.months || []).map((m) => m.id).sort();
  if (selection == null || selection === 'all' || selection === '') return available;
  const wanted = Array.isArray(selection)
    ? selection
    : String(selection).split(',').map((s) => s.trim());
  const set = new Set(wanted.filter(isMonthKey));
  return available.filter((id) => set.has(id));
}

const monthsOf = (store, monthIds) => {
  const wanted = new Set(monthIds);
  return (store?.months || []).filter((m) => wanted.has(m.id)).sort((a, b) => a.id.localeCompare(b.id));
};

/** One row per month: the whole waterfall from income down to what is left. */
export function summarySheet(store, monthIds, today = todayKey()) {
  const columns = [
    { key: 'month', header: 'Month', type: 'text', width: 18 },
    { key: 'monthId', header: 'Key', type: 'text', width: 10 },
    { key: 'status', header: 'Status', type: 'text', width: 10 },
    { key: 'income', header: 'Monthly income', type: 'money', width: 16 },
    { key: 'extraIncome', header: 'Extra income', type: 'money', width: 14 },
    { key: 'totalIncome', header: 'Total income', type: 'money', width: 14 },
    { key: 'billsConfirmed', header: 'Bills paid', type: 'money', width: 14 },
    { key: 'billsPending', header: 'Bills pending', type: 'money', width: 14 },
    { key: 'billsCommitted', header: 'Bills committed', type: 'money', width: 16 },
    { key: 'plannedSavings', header: 'Savings + RD', type: 'money', width: 14 },
    { key: 'commitments', header: 'Total commitments', type: 'money', width: 18 },
    { key: 'pool', header: 'Discretionary pool', type: 'money', width: 18 },
    { key: 'discretionarySpent', header: 'Discretionary spent', type: 'money', width: 18 },
    { key: 'loggedExpenses', header: 'All logged expenses', type: 'money', width: 18 },
    { key: 'remaining', header: 'Left in pool', type: 'money', width: 14 },
    { key: 'allowanceStatic', header: 'Daily allowance (flat)', type: 'money', width: 20 },
    { key: 'allowanceDynamic', header: 'Daily allowance (today)', type: 'money', width: 22 },
    { key: 'daysInMonth', header: 'Days', type: 'number', width: 8 },
    { key: 'billsCount', header: 'Bills', type: 'number', width: 8 },
    { key: 'pendingCount', header: 'Pending', type: 'number', width: 9 },
    { key: 'needsInput', header: 'Needs amount', type: 'number', width: 14 },
    { key: 'transactionCount', header: 'Entries', type: 'number', width: 9 },
    { key: 'closedResult', header: 'Closing result', type: 'money', width: 15 },
  ];

  const rows = monthsOf(store, monthIds).map((month) => {
    const s = monthSummary(month, today);
    return {
      month: formatMonthLabel(month.id),
      monthId: month.id,
      status: titleCase(month.status),
      income: s.income,
      extraIncome: s.extraIncome,
      totalIncome: s.totalIncome,
      billsConfirmed: s.confirmedBills,
      billsPending: s.pendingBillsTotal,
      billsCommitted: s.committedBills,
      plannedSavings: s.plannedSavings,
      commitments: s.commitments,
      pool: s.pool,
      discretionarySpent: s.discretionarySpent,
      loggedExpenses: s.loggedExpenses,
      remaining: s.remaining,
      allowanceStatic: s.staticAllowance,
      allowanceDynamic: s.dynamicAllowance,
      daysInMonth: s.daysInMonth,
      billsCount: s.billsCount,
      pendingCount: s.pendingBillsCount,
      needsInput: s.needsInputCount,
      transactionCount: s.transactionCount,
      closedResult: month.closing ? month.closing.result : null,
    };
  });

  return { name: 'Summary', columns, rows };
}

/** Every bill instance across the selected months, paid or still pending. */
export function billsSheet(store, monthIds) {
  const columns = [
    { key: 'month', header: 'Month', type: 'text', width: 18 },
    { key: 'name', header: 'Bill', type: 'text', width: 22 },
    { key: 'category', header: 'Category', type: 'text', width: 16 },
    { key: 'dueDate', header: 'Due', type: 'date', width: 12 },
    { key: 'status', header: 'Status', type: 'text', width: 11 },
    { key: 'amountType', header: 'Amount type', type: 'text', width: 13 },
    { key: 'paymentMode', header: 'Payment mode', type: 'text', width: 14 },
    { key: 'estimate', header: 'Estimate', type: 'money', width: 13 },
    { key: 'actual', header: 'Actual paid', type: 'money', width: 13 },
    { key: 'committed', header: 'Counted in budget', type: 'money', width: 18 },
    { key: 'estimateSource', header: 'Estimate from', type: 'text', width: 14 },
    { key: 'estimateSamples', header: 'Samples used', type: 'number', width: 13 },
    { key: 'needsInput', header: 'Needs amount', type: 'text', width: 13 },
  ];

  const rows = [];
  for (const month of monthsOf(store, monthIds)) {
    for (const bill of month.bills || []) {
      rows.push({
        month: formatMonthLabel(month.id),
        name: bill.name,
        category: bill.category,
        dueDate: bill.dueDate,
        status: titleCase(bill.status),
        amountType: titleCase(bill.amountType),
        paymentMode: titleCase(bill.paymentMode),
        estimate: bill.provisionalAmount ?? null,
        actual: bill.actualAmount ?? null,
        committed: billCommittedAmount(bill),
        estimateSource: titleCase(bill.estimateSource || ''),
        estimateSamples: bill.estimateSamples ?? 0,
        needsInput: yesNo(bill.needsInput),
      });
    }
  }
  return { name: 'Bills', columns, rows };
}

/** The expense history itself — one row per logged entry, newest month last. */
export function transactionsSheet(store, monthIds) {
  const columns = [
    { key: 'date', header: 'Date', type: 'date', width: 12 },
    { key: 'month', header: 'Month', type: 'text', width: 18 },
    { key: 'type', header: 'Type', type: 'text', width: 10 },
    { key: 'category', header: 'Category', type: 'text', width: 16 },
    { key: 'amount', header: 'Amount', type: 'money', width: 14 },
    { key: 'discretionary', header: 'From daily budget', type: 'text', width: 18 },
    { key: 'note', header: 'Note', type: 'text', width: 34 },
  ];

  const rows = [];
  for (const month of monthsOf(store, monthIds)) {
    const sorted = [...(month.transactions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const txn of sorted) {
      const isExpense = txn.type !== TRANSACTION_TYPE.INCOME;
      rows.push({
        date: txn.date,
        month: formatMonthLabel(month.id),
        type: isExpense ? 'Expense' : 'Income',
        category: txn.category,
        amount: txn.amount,
        discretionary: isExpense ? yesNo(isDiscretionaryCategory(txn.category)) : '—',
        note: txn.note || '',
      });
    }
  }
  return { name: 'Transactions', columns, rows };
}

/** General savings ledger with a running balance. */
export function savingsSheet(store) {
  const columns = [
    { key: 'date', header: 'Date', type: 'date', width: 12 },
    { key: 'note', header: 'What', type: 'text', width: 34 },
    { key: 'amount', header: 'Amount', type: 'money', width: 14 },
    { key: 'balance', header: 'Balance after', type: 'money', width: 15 },
  ];

  const entries = [...(store?.savings?.general?.entries || [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let balance = 0;
  const rows = entries.map((entry) => {
    balance = Math.round((balance + (Number(entry.amount) || 0)) * 100) / 100;
    return { date: entry.date, note: entry.note || 'Savings', amount: entry.amount, balance };
  });

  return { name: 'Savings', columns, rows };
}

/** The bill definitions themselves — the setup that drives every month. */
export function billSetupSheet(store) {
  const columns = [
    { key: 'name', header: 'Bill', type: 'text', width: 22 },
    { key: 'category', header: 'Category', type: 'text', width: 16 },
    { key: 'amountType', header: 'Amount type', type: 'text', width: 13 },
    { key: 'amount', header: 'Amount', type: 'money', width: 14 },
    { key: 'frequency', header: 'Frequency', type: 'text', width: 14 },
    { key: 'intervalMonths', header: 'Every N months', type: 'number', width: 15 },
    { key: 'dueDay', header: 'Due day', type: 'number', width: 10 },
    { key: 'anchorMonth', header: 'First month', type: 'text', width: 12 },
    { key: 'endMonth', header: 'Last month', type: 'text', width: 12 },
    { key: 'paymentMode', header: 'Payment mode', type: 'text', width: 14 },
    { key: 'active', header: 'Active', type: 'text', width: 9 },
    { key: 'note', header: 'Note', type: 'text', width: 30 },
  ];

  const rows = (store?.billDefinitions || []).map((def) => ({
    name: def.name,
    category: def.category,
    amountType: titleCase(def.amountType),
    amount: def.amount ?? null,
    frequency: titleCase(def.frequency),
    intervalMonths: def.intervalMonths,
    dueDay: def.dueDay,
    anchorMonth: def.anchorMonth,
    endMonth: def.endMonth || '—',
    paymentMode: titleCase(def.paymentMode),
    active: yesNo(def.active),
    note: def.note || '',
  }));

  return { name: 'Bill setup', columns, rows };
}

/** All sheets for a workbook, in tab order. */
export function buildExportSheets(store, { months = 'all', today = todayKey() } = {}) {
  const monthIds = resolveMonthIds(store, months);
  return [
    summarySheet(store, monthIds, today),
    billsSheet(store, monthIds),
    transactionsSheet(store, monthIds),
    savingsSheet(store),
    billSetupSheet(store),
  ];
}

/** Filename like `expenses-2026-09.xlsx`, or `expenses-2026-04-to-2026-09.xlsx`. */
export function exportFileName(monthIds, extension = 'xlsx') {
  if (!monthIds || monthIds.length === 0) return `expenses-empty.${extension}`;
  if (monthIds.length === 1) return `expenses-${monthIds[0]}.${extension}`;
  return `expenses-${monthIds[0]}-to-${monthIds[monthIds.length - 1]}.${extension}`;
}



