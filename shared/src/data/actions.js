/**
 * Store-level actions: pure reducers over the whole document (SRS §6).
 *
 * Each function takes the store and returns a NEW store — the UI dispatches these
 * and persists the result through the storage interface. All budgeting maths is
 * delegated to `../engine`, keeping this layer about wiring only.
 */
import {
  addMonths,
  applyRecoveryInstallment,
  closeMonth as closeMonthCalc,
  compareMonthKeys,
  confirmBill,
  createRecoveryGoal,
  currentMonthKey,
  daysInMonth,
  generateBills,
  unconfirmBill,
} from '../engine/index.js';
import { MONTH_STATUS } from './config.js';
import {
  makeBillDefinition,
  makeMonth,
  makeTransaction,
  normalizeStore,
  validateBillDefinition,
  validateTransaction,
} from './schema.js';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const round2 = (value) => Math.round(num(value) * 100) / 100;

export function getMonth(store, monthId) {
  return (store.months || []).find((month) => month.id === monthId) || null;
}

export function monthsBefore(store, monthId) {
  return (store.months || []).filter((month) => compareMonthKeys(month.id, monthId) < 0);
}

export function latestMonth(store) {
  const months = [...(store.months || [])].sort((a, b) => compareMonthKeys(a.id, b.id));
  return months[months.length - 1] || null;
}

export function monthIds(store) {
  return [...(store.months || [])].map((m) => m.id).sort(compareMonthKeys).reverse();
}

function replaceMonth(store, month) {
  const months = (store.months || []).map((m) => (m.id === month.id ? month : m));
  return { ...store, months };
}

/** Re-run bill generation for a month — idempotent, safe on every app open (§7.2). */
export function refreshMonth(store, monthId) {
  const month = getMonth(store, monthId);
  if (!month) return store;
  const regenerated = generateBills(month, store.billDefinitions || [], monthsBefore(store, monthId));
  return regenerated === month ? store : replaceMonth(store, regenerated);
}

/**
 * Make sure a month exists and its bills are generated.
 * A new month inherits income and savings plans from the most recent month, and
 * its recovery installment from the active recovery goal (SRS §3.4).
 */
export function ensureMonth(store, monthId = currentMonthKey()) {
  const existing = getMonth(store, monthId);
  if (existing) {
    const next = refreshMonth(store, monthId);
    return { store: next, month: getMonth(next, monthId), created: false };
  }

  const previous = latestMonth(store);
  const recovery = store.savings?.recovery;
  const recoveryActive = recovery?.active !== false && num(recovery?.targetDeficit) > num(recovery?.recovered);

  const seeded = makeMonth(monthId, {
    income: previous ? previous.income : 0,
    extraIncome: 0,
    rdInstallment: num(store.savings?.rd?.installment) || (previous ? previous.rdInstallment : 0),
    recoveryInstallment: recoveryActive ? round2(recovery.monthlyInstallment) : 0,
    savingsTarget: previous ? previous.savingsTarget : 0,
  });

  const withMonth = {
    ...store,
    months: [...(store.months || []), seeded].sort((a, b) => compareMonthKeys(a.id, b.id)),
  };
  const next = refreshMonth(withMonth, monthId);
  return { store: next, month: getMonth(next, monthId), created: true };
}

export function updateMonthPlan(store, monthId, patch = {}) {
  const month = getMonth(store, monthId);
  if (!month) return store;
  const allowed = ['income', 'extraIncome', 'rdInstallment', 'recoveryInstallment', 'savingsTarget'];
  const updates = {};
  for (const key of allowed) {
    if (patch[key] !== undefined) updates[key] = round2(patch[key]);
  }
  return replaceMonth(store, { ...month, ...updates });
}

/** FR2 — create or edit a Bill Definition, then regenerate open months. */
export function upsertBillDefinition(store, partial) {
  const existingIds = (store.billDefinitions || []).map((d) => d.id);
  const isUpdate = partial.id && existingIds.includes(partial.id);
  const def = makeBillDefinition(partial, isUpdate ? [] : existingIds);
  const { ok, errors } = validateBillDefinition(def);
  if (!ok) {
    const error = new Error('Invalid bill definition');
    error.fieldErrors = errors;
    throw error;
  }

  const billDefinitions = isUpdate
    ? (store.billDefinitions || []).map((d) => (d.id === def.id ? def : d))
    : [...(store.billDefinitions || []), def];

  let next = { ...store, billDefinitions };
  for (const month of next.months || []) {
    if (month.status === MONTH_STATUS.OPEN) next = refreshMonth(next, month.id);
  }
  return { store: next, definition: def };
}

/** FR2 — stop a bill without losing its history. */
export function setBillDefinitionActive(store, defId, active) {
  const billDefinitions = (store.billDefinitions || [])
    .map((d) => (d.id === defId ? { ...d, active: Boolean(active) } : d));
  let next = { ...store, billDefinitions };
  if (!active) {
    // Drop still-pending instances of a deactivated bill from open months.
    next = {
      ...next,
      months: (next.months || []).map((month) => (month.status === MONTH_STATUS.OPEN
        ? { ...month, bills: month.bills.filter((b) => !(b.defId === defId && b.status === 'pending')) }
        : month)),
    };
  } else {
    for (const month of next.months || []) {
      if (month.status === MONTH_STATUS.OPEN) next = refreshMonth(next, month.id);
    }
  }
  return next;
}

export function deleteBillDefinition(store, defId) {
  return {
    ...store,
    billDefinitions: (store.billDefinitions || []).filter((d) => d.id !== defId),
    months: (store.months || []).map((month) => (month.status === MONTH_STATUS.OPEN
      ? { ...month, bills: month.bills.filter((b) => b.defId !== defId) }
      : month)),
  };
}

/** FR8 — log a discretionary spend or a one-off income. */
export function addTransaction(store, monthId, partial) {
  const txn = makeTransaction(partial);
  const { ok, errors } = validateTransaction(txn);
  if (!ok) {
    const error = new Error('Invalid transaction');
    error.fieldErrors = errors;
    throw error;
  }
  const target = txn.date.slice(0, 7);
  const ensured = ensureMonth(store, target === monthId ? monthId : target);
  const month = ensured.month;
  const transactions = [...month.transactions, txn]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { store: replaceMonth(ensured.store, { ...month, transactions }), transaction: txn };
}

export function updateTransaction(store, monthId, txnId, patch) {
  const month = getMonth(store, monthId);
  if (!month) return store;
  const transactions = month.transactions.map((t) => (t.id === txnId ? makeTransaction({ ...t, ...patch, id: t.id }) : t));
  return replaceMonth(store, { ...month, transactions });
}

export function deleteTransaction(store, monthId, txnId) {
  const month = getMonth(store, monthId);
  if (!month) return store;
  return replaceMonth(store, { ...month, transactions: month.transactions.filter((t) => t.id !== txnId) });
}

/** FR5 / §7.5 — record the real amount on a pending bill. */
export function confirmBillInStore(store, monthId, instanceId, actual) {
  const month = getMonth(store, monthId);
  if (!month) throw new Error(`Unknown month ${monthId}`);
  return replaceMonth(store, confirmBill(month, instanceId, actual));
}

export function unconfirmBillInStore(store, monthId, instanceId) {
  const month = getMonth(store, monthId);
  if (!month) throw new Error(`Unknown month ${monthId}`);
  return replaceMonth(store, unconfirmBill(month, instanceId, store.billDefinitions || [], monthsBefore(store, monthId)));
}

export function updateSavings(store, patch = {}) {
  return {
    ...store,
    savings: {
      ...store.savings,
      rd: { ...store.savings.rd, ...(patch.rd || {}) },
      general: { ...store.savings.general, ...(patch.general || {}) },
      recovery: { ...store.savings.recovery, ...(patch.recovery || {}) },
    },
  };
}

/**
 * FR14 / §7.6 — close a month: reconcile, credit the savings buckets for the
 * installments that were planned, then open the next month with its bills ready.
 */
export function closeMonthInStore(store, monthId, options = {}) {
  const month = getMonth(store, monthId);
  if (!month) throw new Error(`Unknown month ${monthId}`);
  if (month.status === MONTH_STATUS.CLOSED) {
    return { store, result: month.closing?.result ?? 0, suggestion: { type: 'none', amount: 0 }, alreadyClosed: true };
  }

  const outcome = closeMonthCalc(month, options);
  let next = replaceMonth(store, outcome.month);
  const savings = next.savings;

  const rd = num(month.rdInstallment) > 0
    ? { ...savings.rd, paidCount: Math.min(num(savings.rd.paidCount) + 1, Math.max(1, num(savings.rd.tenureMonths))) }
    : savings.rd;

  const recovery = num(month.recoveryInstallment) > 0
    ? applyRecoveryInstallment(savings.recovery, month.recoveryInstallment)
    : savings.recovery;

  const general = num(month.savingsTarget) > 0
    ? {
      entries: [...savings.general.entries, {
        id: `sav_${monthId}_target`,
        date: `${monthId}-${String(daysInMonth(monthId)).padStart(2, '0')}`,
        amount: round2(month.savingsTarget),
        note: `Monthly savings target (${monthId})`,
      }],
      balance: round2(num(savings.general.balance) + num(month.savingsTarget)),
    }
    : savings.general;

  next = { ...next, savings: { rd, general, recovery } };

  const nextMonthId = addMonths(monthId, 1);
  const opened = ensureMonth(next, nextMonthId);
  return { store: opened.store, result: outcome.result, outcome, suggestion: outcome.suggestion, nextMonthId };
}

/**
 * §7.6 — act on the offer made at month close.
 * `recovery` creates next month's repayment plan; `savings` sweeps the surplus.
 */
export function applySuggestion(store, suggestion, targetMonthId) {
  if (!suggestion || suggestion.type === 'none' || num(suggestion.amount) <= 0) return store;

  if (suggestion.type === 'recovery') {
    const goal = createRecoveryGoal(suggestion.amount, suggestion.months || 3, { startMonth: targetMonthId });
    let next = { ...store, savings: { ...store.savings, recovery: goal } };
    if (targetMonthId && getMonth(next, targetMonthId)) {
      next = updateMonthPlan(next, targetMonthId, { recoveryInstallment: goal.monthlyInstallment });
    }
    return next;
  }

  if (suggestion.type === 'savings') {
    const entries = [...store.savings.general.entries, {
      id: `sav_sweep_${targetMonthId || currentMonthKey()}`,
      date: `${targetMonthId || currentMonthKey()}-01`,
      amount: round2(suggestion.amount),
      note: 'Surplus swept from previous month',
    }];
    return {
      ...store,
      savings: {
        ...store.savings,
        general: { entries, balance: round2(entries.reduce((sum, e) => sum + num(e.amount), 0)) },
      },
    };
  }
  return store;
}

export function updateSettings(store, patch = {}) {
  return { ...store, settings: { ...store.settings, ...patch } };
}

/** FR1 — apply everything gathered by the setup wizard in one atomic step. */
export function applySetup(store, setup) {
  const monthId = setup.monthId || currentMonthKey();
  let next = normalizeStore({ ...store, settings: { ...store.settings, ...(setup.settings || {}) } });

  for (const def of setup.billDefinitions || []) {
    next = upsertBillDefinition(next, { ...def, anchorMonth: def.anchorMonth || monthId }).store;
  }

  next = {
    ...next,
    savings: {
      ...next.savings,
      rd: { ...next.savings.rd, ...(setup.rd || {}), startMonth: setup.rd?.startMonth || monthId },
      recovery: setup.recovery && num(setup.recovery.targetDeficit) > 0
        ? createRecoveryGoal(setup.recovery.targetDeficit, setup.recovery.months, { startMonth: monthId })
        : next.savings.recovery,
    },
  };

  const ensured = ensureMonth(next, monthId);
  next = updateMonthPlan(ensured.store, monthId, {
    income: setup.income,
    extraIncome: setup.extraIncome || 0,
    rdInstallment: setup.rd?.installment || 0,
    savingsTarget: setup.savingsTarget || 0,
    recoveryInstallment: next.savings.recovery?.active ? next.savings.recovery.monthlyInstallment : 0,
  });

  next = updateSettings(next, { onboardingComplete: true });
  return refreshMonth(next, monthId);
}

