import { describe, expect, it } from 'vitest';
import {
  addTransaction, applySetup, applySuggestion, closeMonthInStore, confirmBillInStore,
  deleteBillDefinition, deleteTransaction, ensureMonth, getMonth, monthIds,
  refreshMonth, setBillDefinitionActive, unconfirmBillInStore, updateMonthPlan,
  upsertBillDefinition,
} from '../src/data/actions.js';
import { emptyStore, normalizeStore } from '../src/data/schema.js';
import { dailyAllowance, monthSummary } from '../src/engine/index.js';
import { electricityDef, rentDef, wifiDef } from './fixtures.js';

const seeded = () => {
  let store = emptyStore();
  for (const def of [rentDef, electricityDef, wifiDef]) {
    store = upsertBillDefinition(store, def).store;
  }
  return store;
};

describe('ensureMonth', () => {
  it('creates the month and generates its bills', () => {
    const { store, month, created } = ensureMonth(seeded(), '2026-09');
    expect(created).toBe(true);
    expect(month.bills.map((b) => b.defId).sort()).toEqual(['def_electricity', 'def_rent', 'def_wifi']);
    expect(getMonth(store, '2026-09')).toBe(month);
  });

  it('is idempotent — a second call adds nothing', () => {
    const first = ensureMonth(seeded(), '2026-09');
    const second = ensureMonth(first.store, '2026-09');
    expect(second.created).toBe(false);
    expect(second.store).toBe(first.store);
    expect(second.month.bills).toHaveLength(3);
  });

  it('inherits income and savings plans from the previous month', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = updateMonthPlan(store, '2026-09', { income: 60000, savingsTarget: 3000 });
    const october = ensureMonth(store, '2026-10').month;
    expect(october).toMatchObject({ income: 60000, savingsTarget: 3000, status: 'open' });
  });

  it('omits quarterly bills from a non-due month', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = ensureMonth(store, '2026-10').store;
    expect(getMonth(store, '2026-10').bills.map((b) => b.defId).sort())
      .toEqual(['def_electricity', 'def_rent']);
  });

  it('picks up the recovery installment from an active goal', () => {
    let store = seeded();
    store = applySuggestion(store, { type: 'recovery', amount: 15000, months: 3 }, null);
    expect(ensureMonth(store, '2026-09').month.recoveryInstallment).toBe(5000);
  });
});

describe('bill definitions (FR2)', () => {
  it('assigns readable ids and avoids collisions', () => {
    let store = emptyStore();
    store = upsertBillDefinition(store, { name: 'Rent', amountType: 'fixed', amount: 1000, anchorMonth: '2026-09' }).store;
    const second = upsertBillDefinition(store, { name: 'Rent', amountType: 'fixed', amount: 2000, anchorMonth: '2026-09' });
    expect(store.billDefinitions[0].id).toBe('def_rent');
    expect(second.definition.id).toBe('def_rent_2');
  });

  it('rejects a fixed bill with no amount', () => {
    expect(() => upsertBillDefinition(emptyStore(), { name: 'Gym', amountType: 'fixed', anchorMonth: '2026-09' }))
      .toThrowError(/Invalid bill definition/);
  });

  it('editing an amount flows into open months but leaves closed ones alone', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = updateMonthPlan(store, '2026-09', { income: 60000 });
    const closed = closeMonthInStore(store, '2026-09');
    store = upsertBillDefinition(closed.store, { ...rentDef, amount: 19500 }).store;

    expect(getMonth(store, '2026-09').bills.find((b) => b.defId === 'def_rent').actualAmount).toBe(18000);
    // A regenerated instance is never overwritten, so the new amount shows from the next new month.
    const november = ensureMonth(store, '2026-11').month;
    expect(november.bills.find((b) => b.defId === 'def_rent').actualAmount).toBe(19500);
  });

  it('deactivating removes only pending instances from open months', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = setBillDefinitionActive(store, 'def_electricity', false);
    expect(getMonth(store, '2026-09').bills.map((b) => b.defId)).not.toContain('def_electricity');
    expect(getMonth(store, '2026-09').bills.map((b) => b.defId)).toContain('def_rent');

    store = setBillDefinitionActive(store, 'def_electricity', true);
    expect(getMonth(store, '2026-09').bills.map((b) => b.defId)).toContain('def_electricity');
  });

  it('deleting drops the definition and its open instances', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = deleteBillDefinition(store, 'def_wifi');
    expect(store.billDefinitions.map((d) => d.id)).not.toContain('def_wifi');
    expect(getMonth(store, '2026-09').bills.map((b) => b.defId)).not.toContain('def_wifi');
  });
});

describe('transactions (FR8)', () => {
  it('lands in the month its date belongs to, creating that month if needed', () => {
    const store = ensureMonth(seeded(), '2026-09').store;
    const { store: next } = addTransaction(store, '2026-09', { date: '2026-10-02', category: 'Groceries', amount: 400 });
    expect(getMonth(next, '2026-10').transactions).toHaveLength(1);
    expect(getMonth(next, '2026-09').transactions).toHaveLength(0);
    expect(monthIds(next)).toEqual(['2026-10', '2026-09']);
  });

  it('rejects a zero amount and deletes cleanly', () => {
    const store = ensureMonth(seeded(), '2026-09').store;
    expect(() => addTransaction(store, '2026-09', { date: '2026-09-02', category: 'Daily', amount: 0 }))
      .toThrowError(/Invalid transaction/);

    const added = addTransaction(store, '2026-09', { date: '2026-09-02', category: 'Daily', amount: 250 });
    const removed = deleteTransaction(added.store, '2026-09', added.transaction.id);
    expect(getMonth(removed, '2026-09').transactions).toHaveLength(0);
  });

  it('lowers the daily allowance as spending is logged', () => {
    let store = updateMonthPlan(ensureMonth(seeded(), '2026-09').store, '2026-09', { income: 60000 });
    const before = dailyAllowance(getMonth(store, '2026-09'), '2026-09-05').dynamic;
    store = addTransaction(store, '2026-09', { date: '2026-09-05', category: 'Groceries', amount: 5000 }).store;
    expect(dailyAllowance(getMonth(store, '2026-09'), '2026-09-05').dynamic).toBeLessThan(before);
  });
});

describe('confirming bills (FR5)', () => {
  it('records the actual and can be undone back to the estimate', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = confirmBillInStore(store, '2026-09', '2026-09_def_electricity', 1620);
    expect(monthSummary(getMonth(store, '2026-09'), '2026-09-12').pendingBillsCount).toBe(0);

    store = ensureMonth(store, '2026-10').store;
    store = unconfirmBillInStore(store, '2026-09', '2026-09_def_electricity');
    const bill = getMonth(store, '2026-09').bills.find((b) => b.defId === 'def_electricity');
    expect(bill).toMatchObject({ status: 'pending', actualAmount: null });
  });

  it('feeds the next month\'s estimate once confirmed', () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = confirmBillInStore(store, '2026-09', '2026-09_def_electricity', 1600);
    store = ensureMonth(store, '2026-10').store;
    const october = getMonth(store, '2026-10').bills.find((b) => b.defId === 'def_electricity');
    expect(october).toMatchObject({ provisionalAmount: 1600, needsInput: false, estimateSource: 'average' });
  });
});

describe('month close and rollover (FR14 / §7.6)', () => {
  const opened = () => {
    let store = ensureMonth(seeded(), '2026-09').store;
    store = updateMonthPlan(store, '2026-09', { income: 60000, rdInstallment: 5000, savingsTarget: 3000 });
    store = confirmBillInStore(store, '2026-09', '2026-09_def_electricity', 1500);
    return store;
  };

  it('closes the month, credits the buckets and opens the next one', () => {
    const { store, nextMonthId, result } = closeMonthInStore(opened(), '2026-09');
    expect(nextMonthId).toBe('2026-10');
    expect(getMonth(store, '2026-09').status).toBe('closed');
    expect(getMonth(store, '2026-10').status).toBe('open');
    expect(store.savings.rd.paidCount).toBe(1);
    expect(store.savings.general.balance).toBe(3000);
    expect(result).toBe(60000 - (18000 + 1800 + 1500) - 8000);
  });

  it('refuses to double-close', () => {
    const first = closeMonthInStore(opened(), '2026-09');
    const second = closeMonthInStore(first.store, '2026-09');
    expect(second.alreadyClosed).toBe(true);
    expect(second.store).toBe(first.store);
  });

  it('turns a deficit into next month\'s recovery plan', () => {
    let store = updateMonthPlan(opened(), '2026-09', { income: 20000 });
    const closed = closeMonthInStore(store, '2026-09', { recoveryMonths: 3 });
    expect(closed.suggestion.type).toBe('recovery');

    store = applySuggestion(closed.store, closed.suggestion, closed.nextMonthId);
    expect(store.savings.recovery.targetDeficit).toBe(closed.suggestion.amount);
    expect(getMonth(store, '2026-10').recoveryInstallment).toBe(store.savings.recovery.monthlyInstallment);
  });

  it('sweeps a surplus into general savings', () => {
    const store = updateMonthPlan(opened(), '2026-09', { income: 100000 });
    const closed = closeMonthInStore(store, '2026-09');
    expect(closed.suggestion.type).toBe('savings');
    const swept = applySuggestion(closed.store, closed.suggestion, closed.nextMonthId);
    expect(swept.savings.general.balance).toBe(3000 + closed.suggestion.amount);
  });
});

describe('setup wizard (FR1)', () => {
  it('applies income, bills, RD and a recovery goal in one step', () => {
    const store = applySetup(emptyStore(), {
      monthId: '2026-09',
      income: 60000,
      savingsTarget: 3000,
      settings: { currency: 'INR', salaryDay: 1 },
      billDefinitions: [
        { name: 'Rent', category: 'Housing', amountType: 'fixed', amount: 18000, frequency: 'monthly', dueDay: 1, paymentMode: 'scheduled' },
        { name: 'Electricity', category: 'Utilities', amountType: 'variable', frequency: 'monthly', dueDay: 10, paymentMode: 'postpaid' },
        { name: 'Wi-Fi', category: 'Utilities', amountType: 'fixed', amount: 1800, frequency: 'quarterly', dueDay: 3, paymentMode: 'scheduled' },
      ],
      rd: { installment: 5000, tenureMonths: 12, estAnnualRate: 6.5 },
      recovery: { targetDeficit: 15000, months: 3 },
    });

    expect(store.settings.onboardingComplete).toBe(true);
    expect(store.billDefinitions.map((d) => d.id)).toEqual(['def_rent', 'def_electricity', 'def_wi_fi']);
    expect(store.savings.rd).toMatchObject({ installment: 5000, startMonth: '2026-09' });
    expect(store.savings.recovery.monthlyInstallment).toBe(5000);

    const month = getMonth(store, '2026-09');
    expect(month).toMatchObject({ income: 60000, rdInstallment: 5000, recoveryInstallment: 5000, savingsTarget: 3000 });
    expect(month.bills).toHaveLength(3);
    // 60000 - (18000 + 1800 + 0 electricity estimate) - 13000
    expect(monthSummary(month, '2026-09-01').pool).toBe(27200);
  });
});

describe('normalisation and migration (SRS §11)', () => {
  it('repairs a partial document without throwing', () => {
    const store = normalizeStore({ billDefinitions: [{ name: 'Gym' }], months: [{ id: 'bogus' }, { id: '2026-09' }] });
    expect(store.schemaVersion).toBe(2);
    expect(store.months.map((m) => m.id)).toEqual(['2026-09']);
    expect(store.billDefinitions[0]).toMatchObject({ id: 'def_gym', amountType: 'fixed', frequency: 'monthly' });
    expect(store.savings.general.balance).toBe(0);
  });

  it('upgrades a v1 document', () => {
    const legacy = {
      schemaVersion: 1,
      settings: { currency: 'INR', salaryDay: 1, onboardingComplete: true },
      billDefinitions: [rentDef],
      months: [{
        id: '2026-08', income: 50000, status: 'open', bills: [{
          id: '2026-08_def_rent', defId: 'def_rent', name: 'Rent', status: 'confirmed', actualAmount: 18000,
        }], transactions: [],
      }],
      savings: { general: { balance: 999, entries: [{ date: '2026-08-01', amount: 1000 }] } },
    };
    const store = normalizeStore(legacy);
    expect(store.schemaVersion).toBe(2);
    expect(store.months[0].bills[0].estimateSource).toBe('legacy');
    expect(store.savings.general.balance).toBe(1000); // recomputed from entries
    expect(store.savings.general.entries[0].id).toMatch(/^sav_/);
  });

  it('refreshMonth on an unknown month is a no-op', () => {
    const store = seeded();
    expect(refreshMonth(store, '2030-01')).toBe(store);
  });
});

