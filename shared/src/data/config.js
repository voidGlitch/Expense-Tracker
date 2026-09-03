/**
 * Single source of configuration (SRS §11 — "config over hardcoding").
 *
 * Nothing about a specific bill (rent, electricity, Wi-Fi...) lives in code.
 * Bills are pure data: a BillDefinition built from the three axes in SRS §5.
 * Adding a new kind of bill therefore never requires a code change.
 */

export const SCHEMA_VERSION = 2;

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'د.إ', locale: 'en-AE' },
};

export const DEFAULT_CURRENCY = 'INR';

/** SRS §5 axis 1 — amount type. */
export const AMOUNT_TYPE = { FIXED: 'fixed', VARIABLE: 'variable' };

/** SRS §5 axis 2 — frequency. */
export const FREQUENCY = {
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  CUSTOM: 'custom',
  ONE_TIME: 'oneTime',
};

/** SRS §5 axis 3 — payment mode. */
export const PAYMENT_MODE = { SCHEDULED: 'scheduled', POSTPAID: 'postpaid' };

export const BILL_STATUS = { PENDING: 'pending', CONFIRMED: 'confirmed' };

export const MONTH_STATUS = { OPEN: 'open', CLOSED: 'closed' };

export const TRANSACTION_TYPE = { EXPENSE: 'expense', INCOME: 'income' };

export const FREQUENCY_OPTIONS = [
  { id: FREQUENCY.MONTHLY, label: 'Every month', intervalMonths: 1, hint: 'Rent, furniture, electricity' },
  { id: FREQUENCY.QUARTERLY, label: 'Every 3 months', intervalMonths: 3, hint: 'Wi-Fi, water purifier' },
  { id: FREQUENCY.CUSTOM, label: 'Every N months', intervalMonths: 6, hint: 'Insurance, AMC' },
  { id: FREQUENCY.ONE_TIME, label: 'One time only', intervalMonths: 1, hint: 'A single upcoming payment' },
];

export const AMOUNT_TYPE_OPTIONS = [
  { id: AMOUNT_TYPE.FIXED, label: 'Fixed', hint: 'Same amount every time' },
  { id: AMOUNT_TYPE.VARIABLE, label: 'Variable', hint: 'Changes each cycle' },
];

export const PAYMENT_MODE_OPTIONS = [
  { id: PAYMENT_MODE.SCHEDULED, label: 'Scheduled', hint: 'Added automatically, amount already known' },
  { id: PAYMENT_MODE.POSTPAID, label: 'Postpaid', hint: 'Wait for the bill, then enter the amount' },
];

/** Categories offered for BillDefinitions. Free text is also accepted. */
export const BILL_CATEGORIES = [
  'Housing', 'Utilities', 'Furniture', 'Internet & Phone', 'Insurance',
  'Subscriptions', 'Loan / EMI', 'Education', 'Health', 'Transport', 'Other',
];

/**
 * Categories for plain transactions (SRS §5 — "not Bill Definitions").
 * `discretionary: true` means the spend is funded by the discretionary pool and
 * therefore reduces the daily allowance (SRS §7.4).
 */
export const TRANSACTION_CATEGORIES = [
  { id: 'Groceries', label: 'Groceries', discretionary: true, color: '#2563eb' },
  { id: 'Daily', label: 'Daily', discretionary: true, color: '#0d9488' },
  { id: 'Eating out', label: 'Eating out', discretionary: true, color: '#c2410c' },
  { id: 'Transport', label: 'Transport', discretionary: true, color: '#7c3aed' },
  { id: 'Shopping', label: 'Shopping', discretionary: true, color: '#be185d' },
  { id: 'Health', label: 'Health', discretionary: true, color: '#0369a1' },
  { id: 'Entertainment', label: 'Entertainment', discretionary: true, color: '#a16207' },
  { id: 'Misc', label: 'Misc', discretionary: true, color: '#4b5563' },
  { id: 'Reimbursable', label: 'Reimbursable', discretionary: false, color: '#65a30d' },
];

export const INCOME_CATEGORIES = ['Salary', 'Bonus', 'Freelance', 'Refund', 'Gift', 'Other'];

/** SRS §7.4 counts {Groceries, Daily, Misc}; every default category is included. */
export const DISCRETIONARY_CATEGORIES = TRANSACTION_CATEGORIES
  .filter((c) => c.discretionary)
  .map((c) => c.id);

const DISCRETIONARY_SET = new Set(DISCRETIONARY_CATEGORIES);
const NON_DISCRETIONARY_SET = new Set(
  TRANSACTION_CATEGORIES.filter((c) => !c.discretionary).map((c) => c.id),
);

/** Unknown/user-added categories default to discretionary so nothing escapes the budget. */
export function isDiscretionaryCategory(category) {
  if (DISCRETIONARY_SET.has(category)) return true;
  if (NON_DISCRETIONARY_SET.has(category)) return false;
  return true;
}

export function categoryColor(category, index = 0) {
  const known = TRANSACTION_CATEGORIES.find((c) => c.id === category);
  if (known) return known.color;
  const fallback = ['#2563eb', '#0d9488', '#c2410c', '#7c3aed', '#be185d', '#0369a1', '#a16207', '#4b5563'];
  return fallback[index % fallback.length];
}

/** How many past confirmed amounts feed the rolling average (SRS §7.3). */
export const ESTIMATE_WINDOW = 3;

/** Warn when the day's spending exceeds the allowance by this factor (FR13). */
export const OVERSPEND_WARN_RATIO = 1.0;
