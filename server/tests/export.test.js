/**
 * Export: the pure row builders first (that is where the logic is), then the
 * endpoints that stream them out as .xlsx / .json.
 */
import { describe, expect, it } from 'vitest';
import {
  addTransaction, applySetup, confirmBillInStore, emptyStore, ensureMonth, monthSummary,
} from '@expense/shared';
import {
  billSetupSheet, billsSheet, buildExportSheets, currencyFormat, exportFileName,
  resolveMonthIds, savingsSheet, summarySheet, transactionsSheet,
} from '../src/export/rows.js';
import { buildWorkbook } from '../src/export/workbook.js';
import { signedInAgent } from './helpers.js';

const MONTH = '2026-09';

function sampleStore() {
  let store = applySetup(emptyStore(), {
    monthId: MONTH,
    income: 30000,
    savingsTarget: 3000,
    rd: { installment: 5000, tenureMonths: 12, estAnnualRate: 6.5 },
    billDefinitions: [
      {
        name: 'Rent', category: 'Housing', amountType: 'fixed', amount: 18000,
        frequency: 'monthly', dueDay: 1, paymentMode: 'scheduled',
      },
      {
        name: 'Electricity', category: 'Utilities', amountType: 'variable', amount: null,
        frequency: 'monthly', dueDay: 10, paymentMode: 'postpaid', note: 'Meter reading',
      },
    ],
  });

  store = confirmBillInStore(store, MONTH, `${MONTH}_def_electricity`, 1480);
  store = addTransaction(store, MONTH, { date: `${MONTH}-02`, category: 'Groceries', amount: 620, note: 'Weekly veg' }).store;
  store = addTransaction(store, MONTH, { date: `${MONTH}-04`, category: 'Reimbursable', amount: 900, note: 'Team lunch' }).store;
  store = addTransaction(store, MONTH, {
    date: `${MONTH}-05`, category: 'Freelance', amount: 2500, type: 'income', note: 'Side project',
  }).store;
  return store;
}

describe('resolveMonthIds', () => {
  const store = { months: [{ id: '2026-07' }, { id: '2026-09' }, { id: '2026-08' }] };

  it('returns every month, chronologically, for "all"', () => {
    expect(resolveMonthIds(store, 'all')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(resolveMonthIds(store)).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('accepts one month, an array, or the comma list the dropdown sends', () => {
    expect(resolveMonthIds(store, '2026-08')).toEqual(['2026-08']);
    expect(resolveMonthIds(store, ['2026-09', '2026-07'])).toEqual(['2026-07', '2026-09']);
    expect(resolveMonthIds(store, '2026-09, 2026-07')).toEqual(['2026-07', '2026-09']);
  });

  it('drops months that are not in the store or not month keys at all', () => {
    expect(resolveMonthIds(store, '2025-01')).toEqual([]);
    expect(resolveMonthIds(store, 'september')).toEqual([]);
    expect(resolveMonthIds({ months: [] }, 'all')).toEqual([]);
  });
});

describe('summarySheet', () => {
  const store = sampleStore();
  const [row] = summarySheet(store, [MONTH], `${MONTH}-05`).rows;

  it('reports the SRS §3.2 waterfall for the month', () => {
    const expected = monthSummary(store.months[0], `${MONTH}-05`);
    expect(row.monthId).toBe(MONTH);
    expect(row.month).toBe('September 2026');
    expect(row.income).toBe(30000);
    expect(row.extraIncome).toBe(2500);
    expect(row.totalIncome).toBe(32500);
    expect(row.billsConfirmed).toBe(19480);        // rent 18000 + electricity 1480
    expect(row.plannedSavings).toBe(8000);         // RD 5000 + target 3000
    expect(row.commitments).toBe(27480);
    expect(row.pool).toBe(expected.pool);
    expect(row.remaining).toBe(expected.remaining);
  });

  it('separates discretionary spend from everything logged', () => {
    expect(row.discretionarySpent).toBe(620);      // Reimbursable is not discretionary
    expect(row.loggedExpenses).toBe(1520);         // 620 + 900
  });

  it('counts the month, and leaves the closing result blank while it is open', () => {
    expect(row.status).toBe('Open');
    expect(row.daysInMonth).toBe(30);
    expect(row.billsCount).toBe(2);
    expect(row.pendingCount).toBe(0);
    expect(row.transactionCount).toBe(3);
    expect(row.closedResult).toBeNull();
  });
});

describe('billsSheet', () => {
  const { columns, rows } = billsSheet(sampleStore(), [MONTH]);

  it('lists every bill instance with its estimate and what was actually paid', () => {
    expect(rows).toHaveLength(2);
    const rent = rows.find((r) => r.name === 'Rent');
    expect(rent).toMatchObject({
      category: 'Housing', dueDate: '2026-09-01', status: 'Confirmed',
      amountType: 'Fixed', paymentMode: 'Scheduled', actual: 18000, committed: 18000,
      estimate: null, needsInput: 'No',
    });

    const power = rows.find((r) => r.name === 'Electricity');
    expect(power).toMatchObject({ status: 'Confirmed', actual: 1480, committed: 1480, paymentMode: 'Postpaid' });
  });

  it('exports money columns as numbers so the spreadsheet can sum them', () => {
    expect(columns.find((c) => c.key === 'actual').type).toBe('money');
    expect(typeof rows[0].committed).toBe('number');
  });
});

describe('transactionsSheet', () => {
  const { rows } = transactionsSheet(sampleStore(), [MONTH]);

  it('is the expense history, oldest first, income included', () => {
    expect(rows.map((r) => r.date)).toEqual([`${MONTH}-02`, `${MONTH}-04`, `${MONTH}-05`]);
    expect(rows[0]).toMatchObject({
      category: 'Groceries', amount: 620, type: 'Expense', discretionary: 'Yes', note: 'Weekly veg',
    });
    expect(rows[1]).toMatchObject({ category: 'Reimbursable', discretionary: 'No' });
    expect(rows[2]).toMatchObject({ type: 'Income', amount: 2500, discretionary: '—' });
  });
});

describe('savingsSheet and billSetupSheet', () => {
  it('keeps a running balance down the savings ledger', () => {
    const store = emptyStore();
    store.savings.general.entries = [
      { id: 'a', date: '2026-07-31', amount: 2000, note: 'Sweep' },
      { id: 'b', date: '2026-08-31', amount: 1500, note: 'Sweep' },
      { id: 'c', date: '2026-09-02', amount: -500, note: 'Withdrawal' },
    ];
    expect(savingsSheet(store).rows.map((r) => r.balance)).toEqual([2000, 3500, 3000]);
  });

  it('writes out the definitions that drive every month', () => {
    const { rows } = billSetupSheet(sampleStore());
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.name === 'Electricity')).toMatchObject({
      amountType: 'Variable', frequency: 'Monthly', dueDay: 10,
      paymentMode: 'Postpaid', active: 'Yes', endMonth: '—', note: 'Meter reading',
    });
  });
});

describe('workbook', () => {
  it('formats money in the currency the user chose', () => {
    expect(currencyFormat(emptyStore())).toBe('"₹"#,##0.00');
    const usd = { settings: { currency: 'USD' } };
    expect(currencyFormat(usd)).toBe('"$"#,##0.00');
  });

  it('names the file after the months it contains', () => {
    expect(exportFileName(['2026-09'])).toBe('expenses-2026-09.xlsx');
    expect(exportFileName(['2026-04', '2026-09'])).toBe('expenses-2026-04-to-2026-09.xlsx');
    expect(exportFileName([], 'json')).toBe('expenses-empty.json');
  });

  it('builds five sheets in a fixed tab order', () => {
    expect(buildExportSheets(sampleStore(), { months: 'all' }).map((s) => s.name))
      .toEqual(['Summary', 'Bills', 'Transactions', 'Savings', 'Bill setup']);
  });

  it('writes a real .xlsx buffer', async () => {
    const { buffer, fileName } = await buildWorkbook(sampleStore(), { months: 'all', today: `${MONTH}-05` });
    expect(buffer.length).toBeGreaterThan(4000);
    expect(buffer.subarray(0, 2).toString('latin1')).toBe('PK'); // zip magic — .xlsx is a zip
    expect(fileName).toBe('expenses-2026-09.xlsx');
  });

  it('still produces a workbook for an untouched account', async () => {
    const { buffer, fileName } = await buildWorkbook(emptyStore(), { months: 'all' });
    expect(buffer.length).toBeGreaterThan(2000);
    expect(fileName).toBe('expenses-empty.xlsx');
  });
});

describe('export endpoints', () => {
  it('GET /api/export/months feeds the history dropdown, newest first', async () => {
    const { agent } = await signedInAgent();
    const store = ensureMonth(sampleStore(), '2026-10').store;
    await agent.put('/api/budget').send({ store, rev: 1 });

    const response = await agent.get('/api/export/months');
    expect(response.status).toBe(200);
    expect(response.body.months.map((m) => m.id)).toEqual(['2026-10', '2026-09']);
    const september = response.body.months.find((m) => m.id === MONTH);
    expect(september).toMatchObject({ label: 'September 2026', transactions: 3, bills: 2, status: 'open' });
  });

  it('GET /api/export/xlsx downloads a spreadsheet with the right headers', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: sampleStore(), rev: 1 });

    const response = await agent.get('/api/export/xlsx').responseType('blob');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/spreadsheetml\.sheet/);
    expect(response.headers['content-disposition']).toContain('expenses-2026-09.xlsx');
    expect(response.body.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('GET /api/export/xlsx?months= exports just the months asked for', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: sampleStore(), rev: 1 });

    const ok = await agent.get(`/api/export/xlsx?months=${MONTH}`).responseType('blob');
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain(`expenses-${MONTH}.xlsx`);

    const empty = await agent.get('/api/export/xlsx?months=2020-01');
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toMatch(/nothing to export/i);
  });

  it('GET /api/export/json is a restorable backup, and needs a session', async () => {
    const { agent } = await signedInAgent();
    await agent.put('/api/budget').send({ store: sampleStore(), rev: 1 });

    const response = await agent.get('/api/export/json');
    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('.json');
    const payload = JSON.parse(response.text);
    expect(payload.store.schemaVersion).toBe(2);
    expect(payload.rev).toBe(2);

    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/export/json')).status).toBe(401);
  });
});
