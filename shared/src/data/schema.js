/**
 * Schema: defaults, factories, normalisation and migrations (SRS §6, §11).
 * The stored document is plain JSON so it works unchanged in localStorage, a JSON
 * file on the server, or a MongoDB document.
 */
import {
  AMOUNT_TYPE,
  BILL_STATUS,
  DEFAULT_CURRENCY,
  FREQUENCY,
  MONTH_STATUS,
  PAYMENT_MODE,
  SCHEMA_VERSION,
  TRANSACTION_TYPE,
} from './config.js';
import { currentMonthKey, isMonthKey, todayKey } from '../engine/dates.js';

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const round2 = (value) => Math.round(num(value) * 100) / 100;

let idCounter = 0;
export function makeId(prefix = 'id') {
  idCounter += 1;
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${stamp}${idCounter.toString(36)}${rand}`;
}

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'bill';
}

/** Stable, readable definition ids like "def_rent", unique within the store. */
export function billDefinitionId(name, existingIds = []) {
  const base = `def_${slugify(name).replace(/-/g, '_')}`;
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function defaultSettings() {
  return { currency: DEFAULT_CURRENCY, salaryDay: 1, onboardingComplete: false, theme: 'system' };
}

export function defaultSavings() {
  return {
    rd: { installment: 0, tenureMonths: 12, startMonth: null, paidCount: 0, estAnnualRate: 6.5 },
    general: { balance: 0, entries: [] },
    recovery: { targetDeficit: 0, months: 3, monthlyInstallment: 0, recovered: 0, active: false, startMonth: null, note: '' },
  };
}

export function emptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    billDefinitions: [],
    months: [],
    savings: defaultSavings(),
  };
}

/** SRS §6 BillDefinition, with sane defaults for anything omitted. */
export function makeBillDefinition(partial = {}, existingIds = []) {
  const frequency = Object.values(FREQUENCY).includes(partial.frequency)
    ? partial.frequency
    : FREQUENCY.MONTHLY;
  const amountType = partial.amountType === AMOUNT_TYPE.VARIABLE
    ? AMOUNT_TYPE.VARIABLE
    : AMOUNT_TYPE.FIXED;
  const intervalMonths = frequency === FREQUENCY.QUARTERLY
    ? 3
    : Math.max(1, Math.trunc(num(partial.intervalMonths, 1)));

  return {
    id: partial.id || billDefinitionId(partial.name, existingIds),
    name: String(partial.name || 'Untitled bill').trim().slice(0, 60),
    category: String(partial.category || 'Other').trim().slice(0, 40),
    amountType,
    amount: amountType === AMOUNT_TYPE.FIXED
      ? round2(partial.amount)
      : (partial.amount == null ? null : round2(partial.amount)),
    frequency,
    intervalMonths,
    dueDay: Math.min(Math.max(Math.trunc(num(partial.dueDay, 1)), 1), 31),
    anchorMonth: isMonthKey(partial.anchorMonth) ? partial.anchorMonth : currentMonthKey(),
    endMonth: isMonthKey(partial.endMonth) ? partial.endMonth : null,
    paymentMode: partial.paymentMode === PAYMENT_MODE.POSTPAID
      ? PAYMENT_MODE.POSTPAID
      : PAYMENT_MODE.SCHEDULED,
    active: partial.active !== false,
    note: String(partial.note || '').slice(0, 200),
  };
}

/** SRS §6 MonthRecord. */
export function makeMonth(id, partial = {}) {
  return {
    id,
    income: round2(partial.income),
    extraIncome: round2(partial.extraIncome),
    status: partial.status === MONTH_STATUS.CLOSED ? MONTH_STATUS.CLOSED : MONTH_STATUS.OPEN,
    rdInstallment: round2(partial.rdInstallment),
    recoveryInstallment: round2(partial.recoveryInstallment),
    savingsTarget: round2(partial.savingsTarget),
    bills: Array.isArray(partial.bills) ? partial.bills : [],
    transactions: Array.isArray(partial.transactions) ? partial.transactions : [],
    closedAt: partial.closedAt || null,
    closing: partial.closing || null,
  };
}

/** SRS §6 Transaction. */
export function makeTransaction(partial = {}) {
  const type = partial.type === TRANSACTION_TYPE.INCOME
    ? TRANSACTION_TYPE.INCOME
    : TRANSACTION_TYPE.EXPENSE;
  return {
    id: partial.id || makeId('txn'),
    date: partial.date || todayKey(),
    type,
    category: String(partial.category || (type === TRANSACTION_TYPE.INCOME ? 'Other' : 'Misc')).slice(0, 40),
    amount: round2(partial.amount),
    note: String(partial.note || '').slice(0, 140),
  };
}

/** Validation shared by the wizard, the Bills screen and the API (FR2). */
export function validateBillDefinition(def) {
  const errors = {};
  if (!def.name || !String(def.name).trim()) errors.name = 'Give the bill a name.';
  if (def.amountType === AMOUNT_TYPE.FIXED && !(num(def.amount) > 0)) {
    errors.amount = 'A fixed bill needs an amount above zero.';
  }
  if (def.amountType === AMOUNT_TYPE.VARIABLE && def.amount != null && num(def.amount) < 0) {
    errors.amount = 'The starting estimate cannot be negative.';
  }
  if (!Object.values(FREQUENCY).includes(def.frequency)) errors.frequency = 'Pick how often it is due.';
  if (def.frequency === FREQUENCY.CUSTOM && !(num(def.intervalMonths) >= 1)) {
    errors.intervalMonths = 'Repeat every 1 month or more.';
  }
  const dueDay = num(def.dueDay);
  if (!(dueDay >= 1 && dueDay <= 31)) errors.dueDay = 'Due day must be between 1 and 31.';
  if (!isMonthKey(def.anchorMonth)) errors.anchorMonth = 'Pick the first month this bill applies to.';
  if (def.endMonth != null && isMonthKey(def.endMonth) && def.endMonth < def.anchorMonth) {
    errors.endMonth = 'The end month cannot be before the first month.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function validateTransaction(txn) {
  const errors = {};
  if (!(num(txn.amount) > 0)) errors.amount = 'Enter an amount above zero.';
  if (!txn.date) errors.date = 'Pick a date.';
  if (!txn.category) errors.category = 'Pick a category.';
  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Migrations, keyed by the version they upgrade FROM (SRS §11 "versioned schema").
 * v1 = the original SRS §6 shape; v2 adds estimate provenance on bill instances
 * and closing figures on months.
 */
const MIGRATIONS = {
  1: (store) => ({
    ...store,
    months: (store.months || []).map((month) => ({
      ...month,
      closedAt: month.closedAt ?? null,
      closing: month.closing ?? null,
      bills: (month.bills || []).map((bill) => ({
        ...bill,
        needsInput: bill.needsInput ?? (bill.status === BILL_STATUS.PENDING && bill.provisionalAmount == null),
        estimateSource: bill.estimateSource ?? 'legacy',
        estimateSamples: bill.estimateSamples ?? 0,
      })),
    })),
    savings: {
      ...defaultSavings(),
      ...(store.savings || {}),
      general: {
        balance: num(store.savings?.general?.balance),
        entries: (store.savings?.general?.entries || []).map((entry) => ({ id: entry.id || makeId('sav'), ...entry })),
      },
    },
  }),
};

/** Upgrade a stored document to the current schema version. */
export function migrate(raw) {
  let store = { ...(raw || {}) };
  const from = Math.max(1, Math.trunc(num(store.schemaVersion, 1)));
  let version = from;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (step) store = step(store);
    version += 1;
  }
  store.schemaVersion = SCHEMA_VERSION;
  return { store, migrated: from !== SCHEMA_VERSION, from, to: SCHEMA_VERSION };
}

/** Coerce any loaded/imported document into a shape the engine can trust. */
export function normalizeStore(raw) {
  const { store } = migrate(raw);
  const base = emptyStore();
  const ids = [];
  const billDefinitions = (Array.isArray(store.billDefinitions) ? store.billDefinitions : [])
    .map((def) => {
      const made = makeBillDefinition(def, ids);
      ids.push(made.id);
      return made;
    });

  const months = (Array.isArray(store.months) ? store.months : [])
    .filter((month) => isMonthKey(month?.id))
    .map((month) => makeMonth(month.id, {
      ...month,
      transactions: (month.transactions || []).map(makeTransaction),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...base.settings, ...(store.settings || {}) },
    billDefinitions,
    months,
    savings: {
      rd: { ...base.savings.rd, ...(store.savings?.rd || {}) },
      general: {
        entries: (store.savings?.general?.entries || []).map((entry) => ({
          id: entry.id || makeId('sav'),
          date: entry.date || todayKey(),
          amount: round2(entry.amount),
          note: String(entry.note || '').slice(0, 140),
        })),
        balance: round2((store.savings?.general?.entries || []).reduce((sum, e) => sum + num(e.amount), 0)),
      },
      recovery: { ...base.savings.recovery, ...(store.savings?.recovery || {}) },
    },
  };
}

