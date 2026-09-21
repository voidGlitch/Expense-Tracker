/**
 * Expense and settlement entities — the money half of a shared-expense app.
 *
 * An expense always answers: what was bought, what did it cost, who paid, who
 * took part, and how much does each participant owe. `splits` is the derived
 * answer to the last question and is stored alongside the expense so a balance
 * can be rebuilt from immutable rows rather than cached totals.
 *
 * Pure factories and validators: no storage, no DOM, no network.
 */
import { CURRENCIES, SPLIT_METHOD } from './config.js';
import { makeId } from './schema.js';

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const round2 = (value) => Math.round(num(value) * 100) / 100;
const toMinor = (value) => Math.round(num(value) * 100);
const fromMinor = (value) => value / 100;
const text = (value, max) => String(value ?? '').trim().slice(0, max);

const nowIso = (value) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

/** `YYYY-MM-DD` for the day the expense belongs to. */
const dayKey = (value) => {
  const iso = nowIso(value);
  return iso.slice(0, 10);
};

export const EXPENSE_DESCRIPTION_MAX = 120;
export const EXPENSE_NOTES_MAX = 500;

/** The four simple methods; `adjustment` and `itemized` resolve to these. */
export const SIMPLE_SPLIT_METHODS = [
  SPLIT_METHOD.EQUAL,
  SPLIT_METHOD.EXACT,
  SPLIT_METHOD.PERCENTAGE,
  SPLIT_METHOD.SHARES,
  'adjustment',
  'itemized',
];

/* ---------------------------------------------------------------------------
 * Splits
 * ------------------------------------------------------------------------- */

/**
 * Distribute `amount` across `memberIds` for `method`, returning rows that sum
 * EXACTLY to the amount.
 *
 * Equal splits hand the leftover paise to the first participants one at a time,
 * so 100 / 3 is 33.34 + 33.33 + 33.33 and never 99.99.
 */
export function computeSplits(amount, method, memberIds, details = {}) {
  const total = round2(amount);
  const ids = [...new Set((memberIds || []).map(String))];
  if (ids.length === 0 || total <= 0) return [];

  // Adjustments are taken off first; the remainder is shared equally.
  if (method === 'adjustment') {
    const adjusted = ids.reduce((sum, id) => sum + toMinor(details[id]), 0);
    const base = allocateBy(ids, fromMinor(toMinor(total) - adjusted), ids.map(() => 1));
    return base.map((row) => ({ ...row, amount: fromMinor(toMinor(row.amount) + toMinor(details[row.memberId])) }));
  }
  if (method === 'itemized') {
    const amounts = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const item of details.items || []) {
      const selected = [...new Set(item.memberIds || [])].filter((id) => ids.includes(id));
      for (const part of allocateBy(selected, num(item.amount), selected.map(() => 1))) amounts[part.memberId] += toMinor(part.amount);
    }
    // Tax and tip follow each person's item subtotal, with deterministic rounding.
    const extras = num(details.tax) + num(details.tip);
    const weights = ids.map((id) => amounts[id]);
    if (extras) for (const part of allocateBy(ids, extras, weights)) amounts[part.memberId] += toMinor(part.amount);
    return ids.map((memberId) => ({ memberId, amount: fromMinor(amounts[memberId]) }));
  }

  if (method === SPLIT_METHOD.EXACT) {
    return ids.map((memberId) => ({ memberId, amount: fromMinor(toMinor(details[memberId] || 0)) }));
  }

  if (method === SPLIT_METHOD.PERCENTAGE) {
    // Percentages deliberately use 100 as their denominator. They must not be
    // silently normalised: 60% + 20% is an invalid split, not a 75/25 split.
    return allocateBy(ids, total, ids.map((id) => Math.max(0, num(details[id], 0))), 100);
  }

  if (method === SPLIT_METHOD.SHARES) {
    // A share of 0 is meaningful (that person is in the group but not paying),
    // so an explicit 0 is respected; a missing value defaults to 1.
    const weights = ids.map((id) => {
      const raw = details[id];
      if (raw === undefined || raw === null || raw === '') return 1;
      return Math.max(0, num(raw, 1));
    });
    const sum = weights.reduce((acc, weight) => acc + weight, 0);
    if (sum <= 0) return ids.map((memberId) => ({ memberId, amount: 0 }));
    return allocateBy(ids, total, weights);
  }

  // Equal (also the fallback for an unknown method).
  return allocateBy(ids, total, ids.map(() => 1));
}

/** Largest-remainder allocation in rupees, so the parts always sum to `total`. */
function allocateBy(ids, total, weights, denominator = null) {
  if (!ids.length) return [];
  const sum = denominator ?? weights.reduce((acc, weight) => acc + weight, 0);
  if (sum <= 0) {
    return allocateBy(ids, total, ids.map(() => 1));
  }

  const scale = 100;
  const targetMinor = Math.round(total * scale);
  const exact = weights.map((weight) => (targetMinor * weight) / sum);
  // An invalid percentage input (for example 60% + 20%) must remain visibly
  // incomplete for validation. Do not sneak the missing amount back in by
  // allocating a remainder across the entered percentages.
  if (denominator != null && weights.reduce((acc, weight) => acc + weight, 0) !== denominator) {
    return ids.map((memberId, index) => ({ memberId, amount: fromMinor(Math.round(exact[index])) }));
  }
  const parts = exact.map((value) => Math.floor(value));
  let remainder = targetMinor - parts.reduce((acc, value) => acc + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < order.length && remainder > 0; i += 1) {
    parts[order[i].index] += 1;
    remainder -= 1;
  }

  return ids.map((memberId, index) => ({ memberId, amount: fromMinor(parts[index]) }));
}

/** Sum of split amounts, rounded to paise. */
export function splitsTotal(splits) {
  return fromMinor((splits || []).reduce((acc, split) => acc + toMinor(split.amount), 0));
}

/* ---------------------------------------------------------------------------
 * Expense
 * ------------------------------------------------------------------------- */

/**
 * Build an expense. `splits` may be supplied directly (already computed) or is
 * derived from `splitMethod` + `splitDetails`.
 */
export function makeExpense(partial = {}) {
  const amount = round2(partial.amount);
  const method = SIMPLE_SPLIT_METHODS.includes(partial.splitMethod)
    ? partial.splitMethod
    : SPLIT_METHOD.EQUAL;

  const participants = [...new Set((partial.participants || []).map(String))];
  const splits = Array.isArray(partial.splits) && partial.splits.length > 0
    ? partial.splits.map((split) => ({ memberId: String(split.memberId), amount: round2(split.amount) }))
    : computeSplits(amount, method, participants, partial.splitDetails || {});

  return {
    id: partial.id || makeId('exp'),
    description: text(partial.description, EXPENSE_DESCRIPTION_MAX),
    amount,
    currency: CURRENCIES[partial.currency] ? partial.currency : 'INR',
    date: dayKey(partial.date),
    category: text(partial.category || 'Other', 40) || 'Other',
    notes: text(partial.notes, EXPENSE_NOTES_MAX),
    paidBy: String(partial.paidBy || partial.payers?.[0]?.memberId || ''),
    payers: partial.payers?.length ? partial.payers.map((row) => ({ memberId: String(row.memberId), amount: round2(row.amount) })) : [{ memberId: String(partial.paidBy || ''), amount }],
    kind: partial.kind === 'refund' ? 'refund' : 'expense',
    refundOf: partial.refundOf || null,
    revision: partial.revision || 1,
    idempotencyKey: partial.idempotencyKey || null,
    comments: partial.comments || [],
    activity: partial.activity || [],
    receipt: partial.receipt || null,
    recurrence: partial.recurrence || null,
    recurringSourceId: partial.recurringSourceId || null,
    participants: splits.map((split) => split.memberId),
    splitMethod: method,
    splitDetails: partial.splitDetails || {},
    splits,
    // Which social container this belongs to. A friendship expense is visible
    // to exactly those two people; a group expense to every member.
    contextType: partial.contextType === 'group' ? 'group' : 'friendship',
    contextId: String(partial.contextId || ''),
    createdBy: String(partial.createdBy || ''),
    createdAt: nowIso(partial.createdAt),
    updatedBy: partial.updatedBy ? String(partial.updatedBy) : null,
    updatedAt: partial.updatedAt ? nowIso(partial.updatedAt) : null,
    deletedAt: partial.deletedAt ? nowIso(partial.deletedAt) : null,
    deletedBy: partial.deletedBy ? String(partial.deletedBy) : null,
  };
}

/**
 * Validate an expense against the rules in §34. Returns field-keyed messages so
 * the form can show each error next to the input that caused it.
 */
export function validateExpense(expense, { memberIds = null } = {}) {
  const errors = {};

  if (!expense.description) errors.description = 'What was this for?';
  if (!(num(expense.amount) > 0)) errors.amount = 'Enter an amount above zero.';
  if (!expense.date) errors.date = 'Pick a date.';
  if (!expense.contextId) errors.contextId = 'This expense is not attached to a friendship or group.';
  if (!expense.paidBy) errors.paidBy = 'Choose who paid.';
  if (expense.splits.length === 0) errors.participants = 'Add at least one person to split with.';

  const detailValues = expense.participants.map((id) => num(expense.splitDetails?.[id], 0));
  const payers = expense.payers || [{ memberId: expense.paidBy, amount: expense.amount }];
  if (payers.some((row) => !row.memberId || !Number.isFinite(Number(row.amount)) || row.amount < 0) || splitsTotal(payers) !== expense.amount) errors.payers = 'Payments must be nonnegative and add up to the expense total.';
  if (new Set(payers.map((row) => row.memberId)).size !== payers.length) errors.payers = 'Include each payer only once.';
  if (new Set(expense.splits.map((row) => row.memberId)).size !== expense.splits.length) errors.splits = 'Include each participant only once.';
  if (!Number.isSafeInteger(toMinor(expense.amount))) errors.amount = 'Amount is too large.';
  if (['exact', 'percentage', 'shares'].includes(expense.splitMethod) && detailValues.some((value) => value < 0)) errors.splits = 'Shares cannot be negative.';
  if (expense.splitMethod === 'itemized') {
    const details = expense.splitDetails;
    if (!(details.items?.length) || details.items.some((item) => !(item.amount > 0) || !item.memberIds?.length || item.memberIds.some((id) => !expense.participants.includes(id))) || num(details.tax) < 0 || num(details.tip) < 0) errors.splits = 'Assign each positive item to participants; tax and tip cannot be negative.';
    if (toMinor((details.items || []).reduce((sum, item) => sum + num(item.amount), 0)) + toMinor(details.tax) + toMinor(details.tip) !== toMinor(expense.amount)) errors.splits = 'Items, tax and tip must equal the expense total.';
  }
  if (expense.splitMethod === SPLIT_METHOD.EXACT) {
    const exactMinor = detailValues.reduce((sum, value) => sum + toMinor(value), 0);
    if (exactMinor !== toMinor(expense.amount)) {
      errors.splits = 'Split amounts must equal the expense total.';
    }
  }
  if (expense.splitMethod === SPLIT_METHOD.PERCENTAGE) {
    const percentHundredths = detailValues.reduce((sum, value) => sum + Math.round(value * 100), 0);
    if (percentHundredths !== 10000) {
      errors.splits = 'Percentages must total 100%.';
    }
  }

  // Everyone named must actually be allowed to see this expense.
  if (memberIds) {
    const allowed = new Set(memberIds.map(String));
    const strangers = [...new Set([
      expense.paidBy,
      ...payers.map((row) => row.memberId),
      ...expense.splits.map((split) => split.memberId),
    ])].filter((id) => id && !allowed.has(id));
    if (strangers.length > 0) {
      errors.participants = 'Everyone on this expense must be part of the friendship or group.';
    }

    if (expense.paidBy && !allowed.has(expense.paidBy)) {
      errors.paidBy = 'The payer must be part of this friendship or group.';
    }
  }

  // The whole amount must be accounted for, to the paise.
  if (expense.splits.length > 0 && num(expense.amount) > 0) {
    const total = splitsTotal(expense.splits);
    if (!errors.splits && toMinor(total) !== toMinor(expense.amount)) {
      errors.splits = `The shares add up to ${total.toFixed(2)} but the expense is ${expense.amount.toFixed(2)}.`;
    }
  }

  const negatives = expense.splits.filter((split) => num(split.amount) < 0);
  if (negatives.length > 0) errors.splits = 'A share cannot be negative.';

  return { ok: Object.keys(errors).length === 0, errors };
}

/* ---------------------------------------------------------------------------
 * Settlement
 * ------------------------------------------------------------------------- */

/**
 * A settlement is a real payment from one person to another that reduces debt.
 * Partial payments are simply settlements for less than the outstanding amount.
 */
export function makeSettlement(partial = {}) {
  return {
    id: partial.id || makeId('set'),
    fromUserId: String(partial.fromUserId || ''),
    toUserId: String(partial.toUserId || ''),
    amount: round2(partial.amount),
    currency: CURRENCIES[partial.currency] ? partial.currency : 'INR',
    date: dayKey(partial.date),
    method: ['cash', 'bank', 'upi', 'other'].includes(partial.method) ? partial.method : 'cash',
    note: text(partial.note, 200),
    contextType: partial.contextType === 'group' ? 'group' : 'friendship',
    contextId: String(partial.contextId || ''),
    createdBy: String(partial.createdBy || ''),
    createdAt: nowIso(partial.createdAt),
    revision: partial.revision || 1,
    idempotencyKey: partial.idempotencyKey || null,
    allocations: partial.allocations || [],
    activity: partial.activity || [],
    updatedAt: partial.updatedAt || null,
    deletedAt: partial.deletedAt ? nowIso(partial.deletedAt) : null,
    deletedBy: partial.deletedBy ? String(partial.deletedBy) : null,
  };
}

export function validateSettlement(settlement, { memberIds = null, maxAmount = null } = {}) {
  const errors = {};
  if (!settlement.fromUserId) errors.fromUserId = 'Choose who paid.';
  if (!settlement.toUserId) errors.toUserId = 'Choose who was paid.';
  if (settlement.fromUserId && settlement.fromUserId === settlement.toUserId) {
    errors.toUserId = 'You cannot settle up with yourself.';
  }
  if (!(num(settlement.amount) > 0)) errors.amount = 'Enter an amount above zero.';
  if (!settlement.contextId) errors.contextId = 'This settlement is not attached to a friendship or group.';

  if (memberIds) {
    const allowed = new Set(memberIds.map(String));
    if (!allowed.has(settlement.fromUserId)) errors.fromUserId = 'That person is not part of this friendship or group.';
    if (!allowed.has(settlement.toUserId)) errors.toUserId = 'That person is not part of this friendship or group.';
  }

  // Overpaying is allowed only up to the outstanding debt, so a typo cannot
  // silently flip who owes whom.
  if (maxAmount != null && num(settlement.amount) > num(maxAmount) + 0.005) {
    errors.amount = `That is more than the ${num(maxAmount).toFixed(2)} outstanding.`;
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
