/**
 * Savings engine — SRS §3.4 (loss recovery), §3.5 (buckets), FR10/FR11.
 * Pure functions only. RD figures are estimates, not investment advice (SRS §2.4).
 */
import { addMonths, daysInMonth, todayKey } from './dates.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Future value of a recurring deposit, monthly compounding, deposit at the start
 * of each month (annuity-due):  FV = P x ((1+i)^n - 1)/i x (1+i)
 */
export function rdMaturityValue(installment, tenureMonths, annualRatePercent) {
  const p = num(installment);
  const n = Math.max(0, Math.trunc(num(tenureMonths)));
  const i = num(annualRatePercent) / 1200;
  if (n === 0) return 0;
  if (i === 0) return round2(p * n);
  return round2(p * (((1 + i) ** n - 1) / i) * (1 + i));
}

/** FR10 — installment, tenure, paid count, accumulated, estimated maturity. */
export function rdProjection(rd) {
  if (!rd || !rd.startMonth || num(rd.installment) <= 0) {
    return { active: false, installment: 0, tenureMonths: 0, paidCount: 0, accumulated: 0, progress: 0 };
  }
  const installment = round2(rd.installment);
  const tenureMonths = Math.max(1, Math.trunc(num(rd.tenureMonths)));
  const paidCount = Math.min(Math.max(0, Math.trunc(num(rd.paidCount))), tenureMonths);
  const maturityMonth = addMonths(rd.startMonth, tenureMonths - 1);
  const totalContribution = round2(installment * tenureMonths);
  const estMaturityValue = rdMaturityValue(installment, tenureMonths, rd.estAnnualRate);

  return {
    active: paidCount < tenureMonths,
    installment,
    tenureMonths,
    paidCount,
    startMonth: rd.startMonth,
    maturityMonth,
    maturityDate: `${maturityMonth}-${String(daysInMonth(maturityMonth)).padStart(2, '0')}`,
    monthsRemaining: tenureMonths - paidCount,
    accumulated: round2(installment * paidCount),
    totalContribution,
    estMaturityValue,
    estInterest: round2(estMaturityValue - totalContribution),
    estAnnualRate: num(rd.estAnnualRate),
    progress: clamp01(paidCount / tenureMonths),
    complete: paidCount >= tenureMonths,
  };
}

/** SRS §3.4 — turn a deficit into a monthly repayment plan. */
export function createRecoveryGoal(targetDeficit, months = 3, options = {}) {
  const target = round2(Math.abs(num(targetDeficit)));
  const span = Math.max(1, Math.trunc(num(months) || 3));
  return {
    targetDeficit: target,
    months: span,
    monthlyInstallment: round2(target / span),
    recovered: round2(num(options.recovered)),
    startMonth: options.startMonth || null,
    note: options.note || '',
    active: target > 0,
  };
}

/** SRS §3.4 — progress bar data; auto-completes when the target is met. */
export function recoveryProgress(goal) {
  if (!goal || num(goal.targetDeficit) <= 0) {
    return { active: false, target: 0, recovered: 0, remaining: 0, percent: 0, complete: false, monthlyInstallment: 0, monthsLeft: 0 };
  }
  const target = round2(goal.targetDeficit);
  const recovered = Math.min(round2(num(goal.recovered)), target);
  const remaining = round2(target - recovered);
  const monthlyInstallment = round2(num(goal.monthlyInstallment) || target / Math.max(1, num(goal.months)));
  return {
    active: goal.active !== false && remaining > 0,
    target,
    recovered,
    remaining,
    percent: round2(clamp01(recovered / target) * 100),
    complete: remaining <= 0,
    monthlyInstallment,
    monthsLeft: monthlyInstallment > 0 ? Math.ceil(remaining / monthlyInstallment) : 0,
  };
}

/** Credit one installment to the recovery bucket (SRS §3.4, test §13.6). */
export function applyRecoveryInstallment(goal, amount) {
  if (!goal || num(goal.targetDeficit) <= 0) return goal;
  const target = round2(goal.targetDeficit);
  const credit = amount === undefined ? num(goal.monthlyInstallment) : num(amount);
  const recovered = Math.min(round2(num(goal.recovered) + credit), target);
  return { ...goal, recovered, active: recovered < target };
}

/** Balance is derived from entries so it can never drift out of sync. */
export function generalSavingsBalance(general) {
  return round2((general?.entries || []).reduce((sum, entry) => sum + num(entry.amount), 0));
}

/** Positive amount = deposit, negative = withdrawal. Returns a new bucket. */
export function addSavingsEntry(general, { amount, note = '', date = todayKey() } = {}) {
  const value = round2(amount);
  if (!Number.isFinite(value) || value === 0) {
    throw new RangeError(`Savings entry amount must be a non-zero number, received ${JSON.stringify(amount)}`);
  }
  const entries = [...(general?.entries || []), { id: `sav_${Date.now().toString(36)}`, date, amount: value, note }];
  const next = { ...general, entries };
  return { ...next, balance: generalSavingsBalance(next) };
}

/** FR11 — combined view of all three buckets (SRS §3.5). */
export function savingsOverview(savings) {
  const rd = rdProjection(savings?.rd);
  const recovery = recoveryProgress(savings?.recovery);
  const generalBalance = generalSavingsBalance(savings?.general);
  return {
    rd,
    recovery,
    general: { balance: generalBalance, entryCount: (savings?.general?.entries || []).length },
    totalSaved: round2(rd.accumulated + generalBalance + recovery.recovered),
  };
}
