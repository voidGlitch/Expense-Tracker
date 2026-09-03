/**
 * SRS §13 — Acceptance Criteria / Test Scenarios.
 * One `describe` block per numbered scenario, in order.
 */
import { describe, expect, it } from 'vitest';
import {
  applyRecoveryInstallment,
  closeMonth,
  confirmBill,
  createRecoveryGoal,
  dailyAllowance,
  estimateDetail,
  estimateFor,
  generateBills,
  isBillDueInMonth,
  recoveryProgress,
} from '../src/engine/index.js';
import { makeMonth } from '../src/data/schema.js';
import {
  electricityDef, furnitureDef, monthWithElectricity, rentDef, txn, waterDef, wifiDef,
} from './fixtures.js';

describe('§13.1 quarterly due logic', () => {
  it('is due in the anchor month and every third month after it', () => {
    for (const month of ['2026-09', '2026-12', '2027-03', '2027-06']) {
      expect(isBillDueInMonth(wifiDef, month), month).toBe(true);
    }
  });

  it('is not due in the months in between', () => {
    for (const month of ['2026-10', '2026-11', '2027-01', '2027-02']) {
      expect(isBillDueInMonth(wifiDef, month), month).toBe(false);
    }
  });

  it('is never due before the anchor month', () => {
    expect(isBillDueInMonth(wifiDef, '2026-08')).toBe(false);
    expect(isBillDueInMonth(wifiDef, '2026-06')).toBe(false);
  });

  it('stops after endMonth', () => {
    const ending = { ...wifiDef, endMonth: '2026-12' };
    expect(isBillDueInMonth(ending, '2026-12')).toBe(true);
    expect(isBillDueInMonth(ending, '2027-03')).toBe(false);
  });

  it('quarterly bills are simply absent from a month, not zero-valued', () => {
    const october = generateBills(makeMonth('2026-10'), [wifiDef, waterDef, rentDef], []);
    expect(october.bills.map((b) => b.defId)).toEqual(['def_rent']);
  });
});

describe('§13.2 fixed + scheduled auto-confirms with zero user action', () => {
  it('creates a confirmed instance carrying the definition amount', () => {
    const month = generateBills(makeMonth('2026-09', { income: 60000 }), [rentDef, furnitureDef], []);
    const rent = month.bills.find((b) => b.defId === 'def_rent');

    expect(rent.status).toBe('confirmed');
    expect(rent.actualAmount).toBe(18000);
    expect(rent.provisionalAmount).toBeNull();
    expect(rent.needsInput).toBe(false);
    expect(rent.dueDate).toBe('2026-09-01');
  });

  it('does it for every month the definition covers', () => {
    for (const monthId of ['2026-09', '2026-10', '2027-02']) {
      const month = generateBills(makeMonth(monthId), [rentDef], []);
      expect(month.bills[0].status).toBe('confirmed');
      expect(month.bills[0].actualAmount).toBe(18000);
    }
  });

  it('clamps a late due day to the length of a short month', () => {
    const lateRent = { ...rentDef, dueDay: 31 };
    expect(generateBills(makeMonth('2027-02'), [lateRent], []).bills[0].dueDate).toBe('2027-02-28');
    expect(generateBills(makeMonth('2028-02'), [lateRent], []).bills[0].dueDate).toBe('2028-02-29');
    expect(generateBills(makeMonth('2026-11'), [lateRent], []).bills[0].dueDate).toBe('2026-11-30');
  });
});

describe('§13.3 postpaid bills stay pending until confirmed', () => {
  const month = generateBills(makeMonth('2026-09'), [electricityDef], []);

  it('creates a pending instance, not a confirmed one', () => {
    const bill = month.bills[0];
    expect(bill.status).toBe('pending');
    expect(bill.actualAmount).toBeNull();
  });

  it('confirmBill records the actual amount and flips the status', () => {
    const confirmed = confirmBill(month, '2026-09_def_electricity', 1620);
    const bill = confirmed.bills[0];
    expect(bill.status).toBe('confirmed');
    expect(bill.actualAmount).toBe(1620);
    expect(month.bills[0].status).toBe('pending'); // original untouched — pure function
  });

  it('rejects a nonsense amount', () => {
    expect(() => confirmBill(month, '2026-09_def_electricity', -5)).toThrow(RangeError);
    expect(() => confirmBill(month, '2026-09_def_electricity', 'abc')).toThrow(RangeError);
  });
});

describe('§13.4 provisional estimate from a rolling average', () => {
  const history = [
    monthWithElectricity('2026-06', 1400),
    monthWithElectricity('2026-07', 1500),
    monthWithElectricity('2026-08', 1450),
  ];

  it('averages the last three confirmed amounts', () => {
    expect(estimateFor(electricityDef, '2026-09', history)).toBe(1450);
  });

  it('only looks at months before the target month', () => {
    const withFuture = [...history, monthWithElectricity('2026-10', 9999)];
    expect(estimateFor(electricityDef, '2026-09', withFuture)).toBe(1450);
  });

  it('keeps only the three most recent months', () => {
    const older = [monthWithElectricity('2026-01', 100), ...history];
    expect(estimateFor(electricityDef, '2026-09', older)).toBe(1450);
  });

  it('ignores months where the bill is still pending', () => {
    const pending = generateBills(makeMonth('2026-08'), [electricityDef], []);
    expect(estimateFor(electricityDef, '2026-09', [pending])).toBe(0);
  });

  it('flags "needs input" on the first ever month', () => {
    const detail = estimateDetail(electricityDef, '2026-09', []);
    expect(detail).toMatchObject({ amount: 0, needsInput: true, sampleCount: 0, source: 'none' });

    const generated = generateBills(makeMonth('2026-09'), [electricityDef], []);
    expect(generated.bills[0].needsInput).toBe(true);
  });

  it('pre-fills the generated instance with the average once history exists', () => {
    const month = generateBills(makeMonth('2026-09'), [electricityDef], history);
    expect(month.bills[0]).toMatchObject({
      status: 'pending', provisionalAmount: 1450, needsInput: false, estimateSource: 'average', estimateSamples: 3,
    });
  });
});

describe('§13.5 dynamic daily allowance', () => {
  // September 2026 has 30 days. Income 9,000 with no bills or savings => pool 9,000.
  const month = makeMonth('2026-09', {
    income: 9000,
    transactions: [txn({ date: '2026-09-02', category: 'Groceries', amount: 600 }),
      txn({ date: '2026-09-03', category: 'Daily', amount: 400 })],
  });

  it('matches the worked example: (9000-1000)/(30-3+1) = 285.71', () => {
    const result = dailyAllowance(month, '2026-09-03');
    expect(result.pool).toBe(9000);
    expect(result.discretionarySpent).toBe(1000);
    expect(result.daysInMonth).toBe(30);
    expect(result.daysLeft).toBe(28);
    expect(result.dynamic).toBeCloseTo(285.71, 2);
  });

  it('static allowance ignores what has been spent', () => {
    expect(dailyAllowance(month, '2026-09-03').static).toBe(300);
    expect(dailyAllowance(month, '2026-09-28').static).toBe(300);
  });

  it('overspending today lowers tomorrow\'s number on its own', () => {
    const withSplurge = { ...month, transactions: [...month.transactions, txn({ date: '2026-09-03', category: 'Misc', amount: 2000 })] };
    const before = dailyAllowance(month, '2026-09-04').dynamic;
    const after = dailyAllowance(withSplurge, '2026-09-04').dynamic;
    expect(after).toBeLessThan(before);
  });

  it('underspending raises it', () => {
    const frugal = { ...month, transactions: [] };
    expect(dailyAllowance(frugal, '2026-09-03').dynamic).toBeGreaterThan(dailyAllowance(month, '2026-09-03').dynamic);
  });

  it('uses the full month when looking at a month that is not the current one', () => {
    expect(dailyAllowance(month, '2026-11-15').daysLeft).toBe(30);
  });

  it('subtracts bills and savings before the pool exists (§3.2 waterfall)', () => {
    const committed = makeMonth('2026-09', {
      income: 60000, rdInstallment: 5000, recoveryInstallment: 5000, savingsTarget: 3000,
      bills: generateBills(makeMonth('2026-09'), [rentDef, furnitureDef], []).bills,
    });
    // 60000 - (18000 + 2400) - 13000 = 26600
    expect(dailyAllowance(committed, '2026-09-01').pool).toBe(26600);
  });
});

describe('§13.6 loss recovery', () => {
  it('splits a deficit into equal monthly installments', () => {
    const goal = createRecoveryGoal(15000, 3);
    expect(goal.monthlyInstallment).toBe(5000);
    expect(goal.recovered).toBe(0);
    expect(goal.active).toBe(true);
  });

  it('auto-completes once the target is met', () => {
    let goal = createRecoveryGoal(15000, 3);
    for (let i = 0; i < 3; i += 1) goal = applyRecoveryInstallment(goal);

    expect(goal.recovered).toBe(15000);
    expect(goal.active).toBe(false);
    expect(recoveryProgress(goal)).toMatchObject({ percent: 100, complete: true, remaining: 0 });
  });

  it('never over-credits past the target', () => {
    let goal = createRecoveryGoal(15000, 3);
    for (let i = 0; i < 10; i += 1) goal = applyRecoveryInstallment(goal);
    expect(goal.recovered).toBe(15000);
  });

  it('reports progress mid-way', () => {
    const goal = applyRecoveryInstallment(createRecoveryGoal(15000, 3));
    expect(recoveryProgress(goal)).toMatchObject({
      recovered: 5000, remaining: 10000, percent: 33.33, complete: false, monthsLeft: 2,
    });
  });
});

describe('§13.7 month close with a deficit', () => {
  const month = makeMonth('2026-09', {
    income: 60000,
    rdInstallment: 5000,
    bills: confirmBill(generateBills(makeMonth('2026-09'), [rentDef, furnitureDef, electricityDef], []),
      '2026-09_def_electricity', 34600).bills,
    transactions: [txn({ date: '2026-09-14', category: 'Groceries', amount: 3000 })],
  });

  it('income 60,000 against 63,000 out leaves -3,000', () => {
    const outcome = closeMonth(month);
    expect(outcome.actualExpenses).toBe(58000); // 18000 + 2400 + 34600 + 3000
    expect(outcome.actualSavings).toBe(5000);
    expect(outcome.result).toBe(-3000);
    expect(outcome.month.status).toBe('closed');
  });

  it('offers a recovery goal for the shortfall', () => {
    const { suggestion } = closeMonth(month, { recoveryMonths: 3 });
    expect(suggestion).toMatchObject({ type: 'recovery', amount: 3000, months: 3 });
    expect(createRecoveryGoal(suggestion.amount, suggestion.months).monthlyInstallment).toBe(1000);
  });

  it('offers a savings sweep when the month ends in surplus', () => {
    const surplus = { ...month, income: 70000 };
    expect(closeMonth(surplus).suggestion).toMatchObject({ type: 'savings', amount: 7000 });
  });

  it('excludes still-pending bills from actual expenses', () => {
    const withPending = generateBills(makeMonth('2026-09', { income: 60000 }), [rentDef, electricityDef], []);
    expect(closeMonth(withPending).actualExpenses).toBe(18000);
  });
});

describe('§13.8 generation is idempotent', () => {
  const defs = [rentDef, furnitureDef, wifiDef, waterDef, electricityDef];

  it('running it twice yields no duplicates', () => {
    const once = generateBills(makeMonth('2026-09'), defs, []);
    const twice = generateBills(once, defs, []);

    expect(once.bills).toHaveLength(5);
    expect(twice.bills).toHaveLength(5);
    expect(new Set(twice.bills.map((b) => b.defId)).size).toBe(5);
  });

  it('the second run is a no-op that returns the same object', () => {
    const once = generateBills(makeMonth('2026-09'), defs, []);
    expect(generateBills(once, defs, [])).toBe(once);
  });

  it('never overwrites an amount the user already entered', () => {
    const once = generateBills(makeMonth('2026-09'), defs, []);
    const confirmed = confirmBill(once, '2026-09_def_electricity', 1780);
    const regenerated = generateBills(confirmed, defs, []);

    const bill = regenerated.bills.find((b) => b.defId === 'def_electricity');
    expect(bill.actualAmount).toBe(1780);
    expect(bill.status).toBe('confirmed');
  });

  it('adds only the newly-due definition when one is introduced later', () => {
    const september = generateBills(makeMonth('2026-09'), [rentDef], []);
    const withElectricity = generateBills(september, [rentDef, electricityDef], []);
    expect(withElectricity.bills).toHaveLength(2);
    expect(generateBills(withElectricity, [rentDef, electricityDef], [])).toBe(withElectricity);
  });

  it('skips inactive definitions', () => {
    const paused = { ...wifiDef, active: false };
    const month = generateBills(makeMonth('2026-09'), [rentDef, paused], []);
    expect(month.bills.map((b) => b.defId)).toEqual(['def_rent']);
  });
});

