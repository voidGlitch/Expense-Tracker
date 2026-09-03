import { describe, expect, it } from 'vitest';
import {
  addSavingsEntry, applyRecoveryInstallment, createRecoveryGoal, generalSavingsBalance,
  rdMaturityValue, rdProjection, recoveryProgress, savingsOverview,
} from '../src/engine/savings.js';
import { defaultSavings } from '../src/data/schema.js';

describe('RD projection (FR10)', () => {
  const rd = { installment: 5000, tenureMonths: 12, startMonth: '2026-09', paidCount: 1, estAnnualRate: 6.5 };

  it('tracks installments, accumulation and maturity date', () => {
    const p = rdProjection(rd);
    expect(p).toMatchObject({
      installment: 5000, tenureMonths: 12, paidCount: 1, accumulated: 5000,
      monthsRemaining: 11, maturityMonth: '2027-08', maturityDate: '2027-08-31', complete: false,
    });
    expect(p.progress).toBeCloseTo(1 / 12, 5);
  });

  it('estimates maturity above the plain contribution', () => {
    const p = rdProjection(rd);
    expect(p.totalContribution).toBe(60000);
    expect(p.estMaturityValue).toBeGreaterThan(60000);
    expect(p.estInterest).toBeCloseTo(p.estMaturityValue - 60000, 2);
  });

  it('degrades to plain arithmetic at a zero rate', () => {
    expect(rdMaturityValue(5000, 12, 0)).toBe(60000);
    expect(rdMaturityValue(5000, 0, 6.5)).toBe(0);
  });

  it('marks a finished RD complete and clamps paidCount to the tenure', () => {
    const done = rdProjection({ ...rd, paidCount: 20 });
    expect(done).toMatchObject({ paidCount: 12, monthsRemaining: 0, complete: true, active: false });
  });

  it('handles an unconfigured RD without throwing', () => {
    expect(rdProjection(null).active).toBe(false);
    expect(rdProjection({ installment: 0 }).active).toBe(false);
  });
});

describe('recovery bucket (SRS §3.4)', () => {
  it('rounds an awkward split to paise', () => {
    const goal = createRecoveryGoal(10000, 3);
    expect(goal.monthlyInstallment).toBe(3333.33);
  });

  it('reports an inactive goal cleanly', () => {
    expect(recoveryProgress(null).active).toBe(false);
    expect(recoveryProgress({ targetDeficit: 0 }).complete).toBe(false);
  });

  it('accepts an explicit credit that differs from the installment', () => {
    const goal = applyRecoveryInstallment(createRecoveryGoal(15000, 3), 12000);
    expect(goal.recovered).toBe(12000);
    expect(recoveryProgress(goal).monthsLeft).toBe(1);
  });

  it('takes a negative deficit as an absolute shortfall', () => {
    expect(createRecoveryGoal(-3000, 3).targetDeficit).toBe(3000);
  });
});

describe('general savings', () => {
  it('derives the balance from entries so it cannot drift', () => {
    let bucket = { balance: 0, entries: [] };
    bucket = addSavingsEntry(bucket, { amount: 2000, note: 'spare cash', date: '2026-09-05' });
    bucket = addSavingsEntry(bucket, { amount: 1500, date: '2026-09-20' });
    bucket = addSavingsEntry(bucket, { amount: -500, note: 'emergency', date: '2026-09-25' });

    expect(bucket.entries).toHaveLength(3);
    expect(bucket.balance).toBe(3000);
    expect(generalSavingsBalance(bucket)).toBe(3000);
  });

  it('rejects a zero or non-numeric entry', () => {
    expect(() => addSavingsEntry({ entries: [] }, { amount: 0 })).toThrow(RangeError);
    expect(() => addSavingsEntry({ entries: [] }, { amount: 'lots' })).toThrow(RangeError);
  });
});

describe('combined overview (FR11)', () => {
  it('adds the three buckets up', () => {
    const savings = {
      ...defaultSavings(),
      rd: { installment: 5000, tenureMonths: 12, startMonth: '2026-09', paidCount: 2, estAnnualRate: 6.5 },
      general: { balance: 4000, entries: [{ date: '2026-09-01', amount: 4000, note: '' }] },
      recovery: createRecoveryGoal(15000, 3),
    };
    const overview = savingsOverview(applyRecoveryToSavings(savings));
    expect(overview.rd.accumulated).toBe(10000);
    expect(overview.general.balance).toBe(4000);
    expect(overview.recovery.recovered).toBe(5000);
    expect(overview.totalSaved).toBe(19000);
  });
});

function applyRecoveryToSavings(savings) {
  return { ...savings, recovery: applyRecoveryInstallment(savings.recovery) };
}
