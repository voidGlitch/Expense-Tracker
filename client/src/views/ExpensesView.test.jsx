import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { monthSummary } from '@expense/shared';
import ExpensesView from './ExpensesView.jsx';
import SharedExpensesView from './SharedExpensesView.jsx';

const mocks = vi.hoisted(() => ({ store: null, getSharedSummary: vi.fn(), getFriends: vi.fn(), getGroups: vi.fn(), getSharedOverview: vi.fn() }));
vi.mock('../state/StoreContext.jsx', () => ({ useStore: () => mocks.store }));
vi.mock('../state/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'me', name: 'Me' } }) }));
vi.mock('../lib/api.js', () => ({ api: mocks }));

const row = { id: 's1', sourceType: 'shared_expense', date: '2026-09-17', personalShare: 250, amountPaidByCurrentUser: 500, currency: 'INR', category: 'Food', description: 'Dinner split' };
function response(transactions = [row]) {
  return { transactions, totals: {}, monthly: { monthId: '2026-09', currentSpending: 500, remaining: 500, byCurrency: { INR: { currentCashImpact: 500 } } } };
}
function setMonth(id = '2026-09', transactions = []) {
  const month = { id, status: 'open', income: 1000, transactions, bills: [] };
  mocks.store = { month, activeMonthId: id, summary: monthSummary(month), currency: 'INR', money: n => `money:${n}`, apply: vi.fn() };
}
beforeEach(() => {
  vi.resetAllMocks();
  setMonth();
  mocks.getSharedSummary.mockResolvedValue(response());
  mocks.getFriends.mockResolvedValue({ friends: [], contacts: [] });
  mocks.getGroups.mockResolvedValue({ groups: [] });
  mocks.getSharedOverview.mockResolvedValue({ friends: [], contexts: [], balances: {} });
  window.localStorage.clear();
});
afterEach(cleanup);

describe('Spending regressions', () => {
  it('matches the September Excel remaining balance despite shared cash movements', async () => {
    const transactions = [
      ['Eating out', 6023.48], ['Misc', 74], ['Shopping', 2182.21], ['Transport', 4935],
    ].map(([category, amount], i) => ({ id: `p${i}`, date: '2026-09-17', type: 'expense', category, amount }));
    setMonth('2026-09', transactions);
    mocks.store.month.income = 75298;
    mocks.store.month.savingsTarget = 5000;
    mocks.store.month.bills = [25000, 25000, 300, 7000].map((actualAmount, i) => ({ id: `b${i}`, name: `Bill ${i + 1}`, status: 'confirmed', actualAmount }));
    mocks.store.summary = monthSummary(mocks.store.month);
    const shared = response();
    shared.monthly.currentSpending = 23227.19;
    shared.monthly.remaining = -10229.19;
    shared.monthly.byCurrency.INR.currentCashImpact = 10012.5;
    mocks.getSharedSummary.mockResolvedValue(shared);
    render(<ExpensesView />);
    await screen.findByText('Shared expense');
    expect(screen.getByText('All Logged').nextElementSibling.textContent).toBe('money:13214.69');
    expect(screen.getByText('Remaining').nextElementSibling.textContent).toBe('money:-216.69');
    const commitments = screen.getByText('Total commitments').closest('details');
    fireEvent.click(commitments.querySelector('summary'));
    expect(commitments.open).toBe(true);
    expect(commitments.textContent).toContain('money:62300');
    expect(commitments.textContent).toContain('Savings target');
    expect(screen.getByText('Discretionary pool').closest('details').textContent).toContain('money:12998');
    expect(screen.getByText('Discretionary spent').closest('details').textContent).toContain('money:6023.48');
    mocks.getSharedSummary.mockResolvedValue({ ...shared, transactions: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText('Shared expense')).toBeNull());
    expect(screen.getByText('Remaining').nextElementSibling.textContent).toBe('money:-216.69');
  });

  it('renders a split as an expense and supports search and type filters', async () => {
    render(<ExpensesView />);
    await screen.findByText('Shared expense');
    expect(screen.queryByRole('button', { name: 'Edit Dinner split' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search entries'), { target: { value: 'missing' } });
    expect(screen.getByText('No entries found')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search entries'), { target: { value: 'dinner' } });
    expect(screen.getAllByText('Dinner split')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'income' } });
    expect(screen.getByText('No entries found')).toBeTruthy();
  });

  it('updates totals immediately after personal additions, edits and deletions', async () => {
    const view = render(<ExpensesView />);
    await screen.findByText('Shared expense');
    for (const amount of [100, 200, 0]) {
      setMonth('2026-09', amount ? [{ id: 'p1', type: 'expense', date: '2026-09-17', category: 'Groceries', note: 'Receipt expense', amount }] : []);
      view.rerender(<ExpensesView />);
      expect(screen.getByText('All Logged').nextElementSibling.textContent).toBe(`money:${amount}`);
      expect(screen.getByText('Remaining').nextElementSibling.textContent).toBe(`money:${1000 - amount}`);
    }
  });

  it('refreshes splits on ledger changes and removes deleted entries', async () => {
    render(<ExpensesView />);
    await screen.findByText('Shared expense');
    mocks.getSharedSummary.mockResolvedValue(response([]));
    act(() => window.dispatchEvent(new Event('shared-ledger-updated')));
    await waitFor(() => expect(screen.queryByText('Dinner split')).toBeNull());
  });

  it('ignores an old month response arriving after the new month', async () => {
    let resolveOld;
    mocks.getSharedSummary.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<ExpensesView />);
    setMonth('2026-08');
    mocks.getSharedSummary.mockResolvedValue({ transactions: [], totals: {}, monthly: null });
    view.rerender(<ExpensesView />);
    await screen.findByText('No shared expenses affect your Expense Manager yet.');
    await act(async () => resolveOld(response()));
    expect(screen.queryByText('Dinner split')).toBeNull();
    expect(screen.getByText('All Logged').nextElementSibling.textContent).toBe('money:0');
  });

  it('shows API errors while keeping personal spending usable', async () => {
    mocks.getSharedSummary.mockRejectedValue(new Error('Network unavailable'));
    render(<ExpensesView />);
    await screen.findByText(/Unable to load shared expenses: Network unavailable/);
    fireEvent.click(screen.getByRole('button', { name: 'Add Expense' }));
    expect(await screen.findByRole('dialog', { name: 'Record Transaction' })).toBeTruthy();
  });

  it('handles missing legacy dates without crashing the spending list', async () => {
    setMonth('2026-09', [{ id: 'p1', type: 'expense', amount: 10, category: 'Groceries', note: 'Legacy entry' }]);
    render(<ExpensesView />);
    await screen.findByText('Shared expense');
    expect(screen.getByText('Legacy entry')).toBeTruthy();
  });

  it('keeps foreign currency cash impact out of the budget total', async () => {
    const result = response([{ ...row, currency: 'USD' }]);
    result.monthly.byCurrency = { USD: { currentCashImpact: 500 } };
    mocks.getSharedSummary.mockResolvedValue(result);
    render(<ExpensesView />);
    await screen.findByText('Shared expense');
    expect(screen.getByText('All Logged').nextElementSibling.textContent).toBe('money:0');
  });
});

it('keeps Add friend beside expense and group actions on both tabs and opens the form', async () => {
  render(<SharedExpensesView />);
  await screen.findByRole('heading', { name: 'Shared Expenses' });
  const friend = screen.getAllByRole('button', { name: 'Add friend' }).find((button) => button.closest('.shared-toolbar'));
  expect(friend.parentElement).toBe(screen.getByRole('button', { name: 'Add expense' }).parentElement);
  expect(friend.parentElement).toBe(screen.getAllByRole('button', { name: 'Add group' }).find((button) => button.closest('.shared-toolbar')).parentElement);
  fireEvent.click(screen.getByRole('button', { name: 'Groups', exact: true }));
  fireEvent.click(friend);
  expect(await screen.findByRole('dialog', { name: 'Add friend' })).toBeTruthy();
});


it('shows a 10,000 repayment as a credit without increasing income or changing remaining', async () => {
  const payment = { id: 'repayment-1', sourceId: 'payment-1', sourceType: 'settlement_received', date: '2026-09-17', amount: 10000, currency: 'INR', description: 'Settlement received' };
  mocks.getSharedSummary.mockResolvedValue(response([payment]));
  render(<ExpensesView />);
  await screen.findByText('Repayment received');
  const entry = screen.getByText('Repayment received').closest('.spending-entry');
  expect(entry.textContent).toContain('+₹10,000');
  expect(entry.textContent).toContain('Credit · repayment');
  expect(screen.getByText('All Logged').nextElementSibling.textContent).toBe('money:0');
  expect(screen.getByText('Remaining').nextElementSibling.textContent).toBe('money:1000');
  expect(screen.queryByRole('button', { name: 'Edit Repayment received' })).toBeNull();
  fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'income' } });
  expect(screen.queryByText('Repayment received')).toBeNull();
  fireEvent.change(screen.getByLabelText('Filter by type'), { target: { value: 'repayment' } });
  expect(screen.getByText('Repayment received')).toBeTruthy();
  mocks.getSharedSummary.mockResolvedValue(response([]));
  act(() => window.dispatchEvent(new Event('shared-ledger-updated')));
  await waitFor(() => expect(screen.queryByText('Repayment received')).toBeNull());
});
