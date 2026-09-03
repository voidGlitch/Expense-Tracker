/**
 * Budget engine — SRS §3 (money model), §7.4 (daily allowance), §7.6 (month close).
 * Pure functions only.
 */
import {
  MONTH_STATUS,
  TRANSACTION_TYPE,
  categoryColor,
  isDiscretionaryCategory,
} from '../data/config.js';
import { committedBillsTotal, confirmedBillsTotal, pendingBills } from './bills.js';
import { dayOfMonth, daysInMonth, monthKeyOf, todayKey } from './dates.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

const expenses = (month) => (month.transactions || [])
  .filter((t) => t.type === TRANSACTION_TYPE.EXPENSE);

/**
 * One-off income for the month: the stored `extraIncome` field (SRS §6) plus any
 * income transactions logged during the month. Using one mechanism or the other
 * keeps this identical to the SRS formula.
 */
export function extraIncomeTotal(month) {
  const logged = (month.transactions || [])
    .filter((t) => t.type === TRANSACTION_TYPE.INCOME)
    .reduce((sum, t) => sum + num(t.amount), 0);
  return round2(num(month.extraIncome) + logged);
}

/** SRS §3.1 — Total Income = Monthly Income + one-off income. */
export function totalIncome(month) {
  return round2(num(month.income) + extraIncomeTotal(month));
}

/** SRS §7.4 — spending funded by the discretionary pool. */
export function discretionarySpent(month) {
  return round2(expenses(month)
    .filter((t) => isDiscretionaryCategory(t.category))
    .reduce((sum, t) => sum + num(t.amount), 0));
}

/** Every logged expense, discretionary or not — used to reconcile at month close. */
export function loggedExpensesTotal(month) {
  return round2(expenses(month).reduce((sum, t) => sum + num(t.amount), 0));
}

/** SRS §3.2 steps 3-5 — RD + loss recovery + savings top-up. */
export function plannedSavings(month) {
  return round2(num(month.rdInstallment) + num(month.recoveryInstallment) + num(month.savingsTarget));
}

/** SRS §3.2 — everything claimed before discretionary money exists. */
export function totalCommitments(month) {
  return round2(committedBillsTotal(month) + plannedSavings(month));
}

/** SRS §3.2 — Discretionary Pool. */
export function discretionaryPool(month) {
  return round2(totalIncome(month) - totalCommitments(month));
}

/**
 * SRS §7.4 — the headline number.
 *
 * `static`  = pool / days in month (what a flat month would allow)
 * `dynamic` = (pool - spent so far) / days left (self-correcting: overspend today
 *             and tomorrow's number drops on its own)
 *
 * Both SRS names (`static`/`dynamic`) and destructuring-safe aliases
 * (`staticAllowance`/`dynamicAllowance`) are returned — `static` is a reserved
 * word for a local binding in strict-mode modules.
 */
export function dailyAllowance(month, today = todayKey()) {
  const dayKey = typeof today === 'string' ? today : todayKey(today);
  const pool = discretionaryPool(month);
  const spent = discretionarySpent(month);
  const totalDays = daysInMonth(month.id);
  const isCurrentMonth = monthKeyOf(dayKey) === month.id;
  const currentDay = isCurrentMonth ? dayOfMonth(dayKey) : totalDays;
  const daysLeft = isCurrentMonth ? totalDays - currentDay + 1 : totalDays;
  const remaining = round2(pool - spent);

  const staticAllowance = round2(pool / totalDays);
  const dynamicAllowance = round2(remaining / Math.max(daysLeft, 1));

  return {
    static: staticAllowance,
    dynamic: dynamicAllowance,
    staticAllowance,
    dynamicAllowance,
    pool,
    discretionarySpent: spent,
    remaining,
    daysInMonth: totalDays,
    daysLeft: Math.max(daysLeft, 0),
    dayOfMonth: currentDay,
    isCurrentMonth,
    overspent: remaining < 0,
    spentRatio: pool > 0 ? clamp01(spent / pool) : (spent > 0 ? 1 : 0),
    monthProgress: clamp01(currentDay / totalDays),
  };
}

/** Everything the dashboard needs in one pass (FR12). */
export function monthSummary(month, today = todayKey()) {
  const allowance = dailyAllowance(month, today);
  const pending = pendingBills(month);
  const pendingTotal = round2(pending.reduce((sum, b) => sum + num(b.provisionalAmount), 0));

  return {
    ...allowance,
    monthId: month.id,
    status: month.status,
    income: round2(num(month.income)),
    extraIncome: extraIncomeTotal(month),
    totalIncome: totalIncome(month),
    committedBills: committedBillsTotal(month),
    confirmedBills: confirmedBillsTotal(month),
    pendingBillsTotal: pendingTotal,
    pendingBillsCount: pending.length,
    needsInputCount: pending.filter((b) => b.needsInput).length,
    billsCount: (month.bills || []).length,
    plannedSavings: plannedSavings(month),
    commitments: totalCommitments(month),
    loggedExpenses: loggedExpensesTotal(month),
    transactionCount: (month.transactions || []).length,
  };
}

/** Discretionary spend grouped by category — feeds the pie chart (FR12). */
export function categoryBreakdown(month) {
  const totals = new Map();
  for (const t of expenses(month)) {
    const key = t.category || 'Misc';
    totals.set(key, round2((totals.get(key) || 0) + num(t.amount)));
  }
  const grandTotal = round2([...totals.values()].reduce((sum, n) => sum + n, 0));
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount], index) => ({
      category,
      amount,
      share: grandTotal > 0 ? round2((amount / grandTotal) * 100) : 0,
      color: categoryColor(category, index),
    }));
}

/** Cumulative discretionary spend per day, against the flat allowance line. */
export function dailySpendSeries(month) {
  const total = daysInMonth(month.id);
  const perDay = new Array(total).fill(0);
  for (const t of expenses(month)) {
    if (!isDiscretionaryCategory(t.category)) continue;
    const day = Number(String(t.date).slice(8, 10));
    if (day >= 1 && day <= total) perDay[day - 1] += num(t.amount);
  }
  let running = 0;
  const flat = discretionaryPool(month) / total;
  return perDay.map((amount, index) => {
    running = round2(running + amount);
    return { day: index + 1, amount: round2(amount), cumulative: running, budgetLine: round2(flat * (index + 1)) };
  });
}

/**
 * SRS §7.6 — reconcile and close a month.
 *
 * `actualExpenses` counts confirmed bills only (a bill still pending was never
 * paid) plus every logged expense transaction, so no spend silently escapes the
 * reconciliation. Returns a suggestion object; acting on it is the caller's call.
 */
export function closeMonth(month, options = {}) {
  const recoveryMonths = Math.max(1, Math.trunc(num(options.recoveryMonths) || 3));
  const income = totalIncome(month);
  const actualExpenses = round2(confirmedBillsTotal(month) + loggedExpensesTotal(month));
  const actualSavings = plannedSavings(month);
  const result = round2(income - (actualExpenses + actualSavings));

  let suggestion = { type: 'none', amount: 0 };
  if (result < 0) {
    suggestion = { type: 'recovery', amount: round2(Math.abs(result)), months: recoveryMonths };
  } else if (result > 0) {
    suggestion = { type: 'savings', amount: result };
  }

  const closed = {
    ...month,
    status: MONTH_STATUS.CLOSED,
    closedAt: options.closedAt || todayKey(),
    closing: { income, actualExpenses, actualSavings, result },
  };

  return { month: closed, income, actualExpenses, actualSavings, result, suggestion };
}

/** FR13 — overspend warnings shown on the dashboard. */
export function overspendWarnings(month, today = todayKey()) {
  const allowance = dailyAllowance(month, today);
  const warnings = [];

  if (allowance.pool < 0) {
    warnings.push({
      level: 'danger',
      code: 'commitments-exceed-income',
      message: 'Your bills and savings add up to more than your income this month.',
    });
  }
  if (allowance.remaining < 0) {
    warnings.push({
      level: 'danger',
      code: 'pool-exhausted',
      message: 'The discretionary pool is spent. Anything more comes out of savings.',
    });
  } else if (allowance.pool > 0 && allowance.dynamic < allowance.static * 0.6) {
    warnings.push({
      level: 'warn',
      code: 'behind-pace',
      message: 'Spending is ahead of pace — the safe daily number has dropped sharply.',
    });
  }
  if (pendingBills(month).some((bill) => bill.needsInput)) {
    warnings.push({ level: 'info', code: 'needs-input', message: 'Some bills still need an amount.' });
  }
  return warnings;
}

