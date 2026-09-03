/**
 * Bill engine — SRS §7.1 (due logic), §7.2 (generation), §7.3 (estimates),
 * §7.5 (confirmation).
 *
 * Every function here is pure: no DOM, no storage, no mutation of arguments.
 * `month` objects are returned as new values so React state updates stay safe.
 */
import {
  AMOUNT_TYPE,
  BILL_STATUS,
  ESTIMATE_WINDOW,
  FREQUENCY,
  PAYMENT_MODE,
} from '../data/config.js';
import { addMonths, compareMonthKeys, dueDateISO, monthsBetween } from './dates.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * SRS §7.1 — is a definition due in `targetMonth`?
 * Schedule only: `active` is deliberately not considered here (see §7.2).
 */
export function isBillDueInMonth(def, targetMonth) {
  if (!def || !def.anchorMonth) return false;
  const diff = monthsBetween(def.anchorMonth, targetMonth);
  if (diff < 0) return false;
  if (def.endMonth != null && compareMonthKeys(targetMonth, def.endMonth) > 0) return false;

  switch (def.frequency) {
    case FREQUENCY.MONTHLY:
      return true;
    case FREQUENCY.QUARTERLY:
      return diff % 3 === 0;
    case FREQUENCY.CUSTOM: {
      const interval = Math.max(1, Math.trunc(Number(def.intervalMonths) || 1));
      return diff % interval === 0;
    }
    case FREQUENCY.ONE_TIME:
      return diff === 0;
    default:
      return false;
  }
}

/** Deterministic instance id, e.g. "2026-09_def_electricity" (SRS §6). */
export function billInstanceId(monthId, defId) {
  return `${monthId}_${defId}`;
}

/**
 * Confirmed actual amounts for a definition, newest month first, looking only at
 * months strictly before `monthId`.
 */
export function confirmedHistory(defId, monthId, months = [], limit = ESTIMATE_WINDOW) {
  return months
    .filter((m) => m && m.id && compareMonthKeys(m.id, monthId) < 0)
    .slice()
    .sort((a, b) => compareMonthKeys(b.id, a.id))
    .flatMap((m) => (m.bills || []).filter((b) => b.defId === defId
      && b.status === BILL_STATUS.CONFIRMED
      && Number.isFinite(Number(b.actualAmount))))
    .map((b) => Number(b.actualAmount))
    .slice(0, limit);
}

/**
 * SRS §7.3 with provenance attached, so the UI can flag "needs input" and show
 * how many past bills the estimate is based on.
 */
export function estimateDetail(def, monthId, previousMonths = []) {
  if (def.amountType === AMOUNT_TYPE.FIXED) {
    const fixed = Number(def.amount);
    return Number.isFinite(fixed) && fixed > 0
      ? { amount: round2(fixed), needsInput: false, sampleCount: 0, source: 'definition' }
      : { amount: 0, needsInput: true, sampleCount: 0, source: 'none' };
  }

  const history = confirmedHistory(def.id, monthId, previousMonths, ESTIMATE_WINDOW);
  if (history.length > 0) {
    const average = history.reduce((sum, n) => sum + n, 0) / history.length;
    return { amount: round2(average), needsInput: false, sampleCount: history.length, source: 'average' };
  }

  const fallback = Number(def.amount);
  return Number.isFinite(fallback) && fallback > 0
    ? { amount: round2(fallback), needsInput: true, sampleCount: 0, source: 'fallback' }
    : { amount: 0, needsInput: true, sampleCount: 0, source: 'none' };
}

/** SRS §7.3 — the provisional amount for a definition in a month. */
export function estimateFor(def, monthId, previousMonths = []) {
  return estimateDetail(def, monthId, previousMonths).amount;
}

/** SRS §7.2 — realise one definition as a BillInstance for one month. */
export function newBillInstance(def, monthId, previousMonths = []) {
  const estimate = estimateDetail(def, monthId, previousMonths);
  const autoConfirm = def.paymentMode === PAYMENT_MODE.SCHEDULED
    && def.amountType === AMOUNT_TYPE.FIXED
    && !estimate.needsInput;

  return {
    id: billInstanceId(monthId, def.id),
    defId: def.id,
    name: def.name,
    category: def.category,
    amountType: def.amountType,
    paymentMode: def.paymentMode,
    dueDate: dueDateISO(monthId, def.dueDay),
    status: autoConfirm ? BILL_STATUS.CONFIRMED : BILL_STATUS.PENDING,
    provisionalAmount: autoConfirm ? null : estimate.amount,
    actualAmount: autoConfirm ? estimate.amount : null,
    needsInput: autoConfirm ? false : estimate.needsInput,
    estimateSource: estimate.source,
    estimateSamples: estimate.sampleCount,
  };
}

/**
 * SRS §7.2 — generate a month's bills from the active definitions.
 *
 * Idempotent (§13.8): a definition that already has an instance in this month is
 * skipped, so re-running on every app open never duplicates or overwrites data.
 * When nothing is added the original `month` object is returned unchanged.
 */
export function generateBills(month, definitions = [], previousMonths = []) {
  const seen = new Set((month.bills || []).map((bill) => bill.defId));
  const added = [];

  for (const def of definitions) {
    if (!def || def.active === false) continue;
    if (!isBillDueInMonth(def, month.id)) continue;
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    added.push(newBillInstance(def, month.id, previousMonths));
  }

  if (added.length === 0) return month;

  const bills = [...(month.bills || []), ...added].sort((a, b) => (
    String(a.dueDate).localeCompare(String(b.dueDate))
    || String(a.name).localeCompare(String(b.name))
  ));
  return { ...month, bills };
}

/** SRS §7.5 — confirm a pending bill by recording the real amount. */
export function confirmBill(month, instanceId, actual) {
  const amount = round2(actual);
  if (!Number.isFinite(Number(actual)) || amount < 0) {
    throw new RangeError(`Bill amount must be a number >= 0, received ${JSON.stringify(actual)}`);
  }

  let found = false;
  const bills = (month.bills || []).map((bill) => {
    if (bill.id !== instanceId) return bill;
    found = true;
    return { ...bill, actualAmount: amount, status: BILL_STATUS.CONFIRMED, needsInput: false };
  });

  if (!found) throw new Error(`No bill instance "${instanceId}" in month ${month.id}`);
  return { ...month, bills };
}

/** Undo a confirmation, restoring the provisional estimate. */
export function unconfirmBill(month, instanceId, definitions = [], previousMonths = []) {
  const bills = (month.bills || []).map((bill) => {
    if (bill.id !== instanceId) return bill;
    const def = definitions.find((d) => d.id === bill.defId);
    const estimate = def
      ? estimateDetail(def, month.id, previousMonths)
      : { amount: bill.provisionalAmount ?? 0, needsInput: true, sampleCount: 0, source: 'none' };
    return {
      ...bill,
      status: BILL_STATUS.PENDING,
      actualAmount: null,
      provisionalAmount: estimate.amount,
      needsInput: estimate.needsInput,
      estimateSource: estimate.source,
      estimateSamples: estimate.sampleCount,
    };
  });
  return { ...month, bills };
}

/** What the budget commits for a bill: the actual when known, else the estimate. */
export function billCommittedAmount(bill) {
  if (!bill) return 0;
  return bill.status === BILL_STATUS.CONFIRMED
    ? round2(bill.actualAmount)
    : round2(bill.provisionalAmount);
}

/** Total the budget must set aside for bills this month (SRS §7.4, step 1+2). */
export function committedBillsTotal(month) {
  return round2((month.bills || []).reduce((sum, bill) => sum + billCommittedAmount(bill), 0));
}

/** Only money actually confirmed as paid — used by month close (SRS §7.6). */
export function confirmedBillsTotal(month) {
  return round2((month.bills || [])
    .filter((bill) => bill.status === BILL_STATUS.CONFIRMED)
    .reduce((sum, bill) => sum + round2(bill.actualAmount), 0));
}

export function pendingBills(month) {
  return (month.bills || []).filter((bill) => bill.status === BILL_STATUS.PENDING);
}

export function confirmedBills(month) {
  return (month.bills || []).filter((bill) => bill.status === BILL_STATUS.CONFIRMED);
}

/** Next `count` months in which a definition falls due — powers the Bills preview. */
export function upcomingDueMonths(def, fromMonth, count = 4, horizon = 36) {
  const found = [];
  for (let offset = 0; offset < horizon && found.length < count; offset += 1) {
    const month = addMonths(fromMonth, offset);
    if (isBillDueInMonth(def, month)) found.push(month);
  }
  return found;
}

