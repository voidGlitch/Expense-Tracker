import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { makeExpense } from '@expense/shared';
import SharedWorkspace from './SharedWorkspace.jsx';
import PaymentDialog from './PaymentDialog.jsx';
import ExpenseDialog from './ExpenseDialog.jsx';
import { readSharedOutbox, saveShared, syncSharedOutbox } from '../../lib/sharedOutbox.js';

const mocks = vi.hoisted(() => ({ getSharedOverview: vi.fn(), createSettlement: vi.fn(), settleAll: vi.fn(), updateSettlement: vi.fn(), createExpense: vi.fn(), updateExpense: vi.fn(), createContact: vi.fn(), searchUsers: vi.fn() }));
vi.mock('../../lib/api.js', () => ({ api: mocks }));
vi.mock('../../state/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'a', name: 'Alice' } }) }));
vi.mock('../../state/StoreContext.jsx', () => ({ useStore: () => ({}) }));
const me = { id: 'a', name: 'Alice' }; const bob = { id: 'b', name: 'Bob' };
function context(amount = 750, currency = 'INR') {
  const expense = makeExpense({ id: 'e', description: 'Dinner', amount: 1500, paidBy: 'a', participants: ['a', 'b'], contextType: 'friendship', contextId: 'f', createdBy: 'a', category: 'Entertainment' });
  return { type: 'friendship', id: 'f', title: 'Bob', entity: {}, memberIds: ['a', 'b'], members: [me, bob], revision: 'revision', expenses: [expense], settlements: [], balances: { [currency]: { a: amount, b: -amount } }, debts: { [currency]: amount ? [{ from: amount > 0 ? 'b' : 'a', to: amount > 0 ? 'a' : 'b', amount: Math.abs(amount) }] : [] }, totals: { [currency]: { paid: 1500, share: 750, total: 1500, count: 1 } } };
}
function friend(amount = 750, currency = 'INR') { return { id: 'b', user: bob, byCurrency: { [currency]: amount }, scopes: amount ? [{ contextType: 'friendship', contextId: 'f', title: 'Direct expenses', currency, amount }] : [], revision: 'friend-revision' }; }
beforeEach(() => { vi.resetAllMocks(); window.localStorage.clear(); mocks.createSettlement.mockResolvedValue({ settlement: {} }); mocks.createExpense.mockResolvedValue({ expense: {} }); mocks.settleAll.mockResolvedValue({ settlement: {} }); mocks.searchUsers.mockResolvedValue({ users: [] }); });
afterEach(cleanup);
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Record payment', exact: true }));

describe('shared payment UI', () => {
  it.each([750, -750, 0.01, -0.01])('records the correct direction for signed balance %s', async (amount) => {
    render(<PaymentDialog context={context(amount)} contexts={[context(amount)]} me={me} close={vi.fn()} done={vi.fn()} />);
    expect(screen.getByLabelText('Paid by').value).toBe(amount > 0 ? 'b' : 'a');
    expect(screen.getByLabelText('Paid to').value).toBe(amount > 0 ? 'a' : 'b');
    clickSave();
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalled());
    expect(mocks.createSettlement.mock.calls[0][0]).toMatchObject({ fromUserId: amount > 0 ? 'b' : 'a', toUserId: amount > 0 ? 'a' : 'b', amount: Math.abs(amount), expectedLedgerRevision: 'revision' });
  });
  it('lets a creditor record a partial payment from the friend view', async () => {
    render(<PaymentDialog friend={friend()} contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '50' } }); clickSave();
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ fromUserId: 'b', toUserId: 'a', amount: 50 })));
  });
  it.each(['overpayment', 'reverse direction', 'wrong currency'])('requires confirmation for %s', async (kind) => {
    render(<PaymentDialog context={context()} contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    if (kind === 'overpayment') fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '800' } });
    if (kind === 'reverse direction') { fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'a' } }); fireEvent.change(screen.getByLabelText('Paid to'), { target: { value: 'b' } }); }
    if (kind === 'wrong currency') { fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } }); fireEvent.change(screen.getByLabelText('Paid to'), { target: { value: 'b' } }); fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: '10' } }); }
    expect(screen.getByRole('button', { name: 'Record payment', exact: true }).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('I confirm this payment and direction are correct')); clickSave();
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledWith(expect.objectContaining({ confirmUnusualPayment: true })));
  });
  it('shows signed settle-all scope allocations and sends one net cash payment', async () => {
    const person = { ...friend(-200), scopes: [{ contextId: 'g1', title: 'Apartment', currency: 'INR', amount: -500 }, { contextId: 'g2', title: 'Goa', currency: 'INR', amount: 200 }, { contextId: 'f', title: 'Direct expenses', currency: 'INR', amount: 100 }] };
    render(<PaymentDialog friend={person} contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    expect(screen.getByText('Apartment')).toBeTruthy(); expect(screen.getByText('Goa')).toBeTruthy();
    clickSave(); await waitFor(() => expect(mocks.settleAll).toHaveBeenCalledWith(expect.objectContaining({ amount: 200, friendId: 'b', expectedRevision: 'friend-revision' })));
  });
  it('keeps a failed or stale form open with actionable error text', async () => {
    mocks.createSettlement.mockRejectedValue(new Error('This ledger changed. Refresh and review.'));
    const done = vi.fn(); render(<PaymentDialog context={context()} contexts={[context()]} me={me} close={vi.fn()} done={done} />); clickSave();
    await screen.findByText(/This ledger changed/); expect(done).not.toHaveBeenCalled();
  });
  it.each(['0', '-1'])('disables invalid amount %s', (amount) => {
    render(<PaymentDialog context={context()} contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount paid'), { target: { value: amount } }); expect(screen.getByRole('button', { name: 'Record payment', exact: true }).disabled).toBe(true);
  });
});

describe('shared workspace navigation and expense preview', () => {
  it.each([0, 0.01, 750, -750])('shows settlement actions only when signed balance %s needs payment', async (amount) => {
    mocks.getSharedOverview.mockResolvedValue({ contexts: [context(amount)], friends: [friend(amount)], balances: {} });
    render(<SharedWorkspace />); await screen.findByRole('heading', { name: 'Shared Expenses' });
    fireEvent.click(screen.getAllByRole('button').find((button) => button.classList.contains('shared-row') && button.textContent.includes('Bob')));
    expect(Boolean(screen.queryByRole('button', { name: /Settle up|Record payment received/ }))).toBe(amount !== 0);
  });
  it('keeps zero-debt expenses visible and opens their details', async () => {
    mocks.getSharedOverview.mockResolvedValue({ contexts: [context(0)], friends: [friend(0)], balances: {} });
    render(<SharedWorkspace />); await screen.findByRole('heading', { name: 'Shared Expenses' });
    fireEvent.click(screen.getByRole('button', { name: /Recent activity/ })); fireEvent.click(screen.getByRole('button', { name: /Dinner/ }));
    expect(await screen.findByRole('dialog', { name: 'Dinner' })).toBeTruthy();
  });
  it('shows a deterministic live split and blocks a mismatched multiple-payer total', async () => {
    render(<ExpenseDialog contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Cab' } }); fireEvent.change(screen.getByLabelText('Amount', { exact: true }), { target: { value: '100' } });
    expect(screen.getByRole('button', { name: 'Save expense' }).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Multiple payers')); fireEvent.change(screen.getByLabelText('Paid by Alice'), { target: { value: '70' } });
    expect(screen.getByRole('button', { name: 'Save expense' }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Paid by Bob'), { target: { value: '30' } });
    expect(screen.getByRole('button', { name: 'Save expense' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' })); await waitFor(() => expect(mocks.createExpense).toHaveBeenCalledWith(expect.objectContaining({ payers: [{ memberId: 'a', amount: 70 }, { memberId: 'b', amount: 30 }] })));
  });
  it('traps keyboard focus in the dialog', async () => {
    render(<PaymentDialog context={context()} contexts={[context()]} me={me} close={vi.fn()} done={vi.fn()} />);
    const dialog = await screen.findByRole('dialog'); const buttons = within(dialog).getAllByRole('button'); const last = buttons.at(-1); last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('shared offline queue', () => {
  it('retains one queued submission across reloads and retries with the same idempotency key', async () => {
    const offline = Object.assign(new Error('Offline'), { offline: true }); mocks.createExpense.mockRejectedValue(offline);
    const args = [{ amount: 100, idempotencyKey: 'stable' }];
    await saveShared('a', 'createExpense', args); await saveShared('a', 'createExpense', args);
    expect(readSharedOutbox('a')).toHaveLength(1); expect(readSharedOutbox('b')).toHaveLength(0);
    mocks.createExpense.mockResolvedValue({ expense: { id: 'saved' } }); await syncSharedOutbox('a'); expect(readSharedOutbox('a')).toHaveLength(0);
    expect(mocks.createExpense).toHaveBeenLastCalledWith(args[0]);
  });
  it('halts stale edits for review instead of overwriting server data', async () => {
    mocks.updateExpense.mockRejectedValue(Object.assign(new Error('Offline'), { offline: true })); await saveShared('a', 'updateExpense', ['e', { expectedRevision: 1 }]);
    mocks.updateExpense.mockRejectedValue(Object.assign(new Error('Refresh to get revision 2'), { status: 409 })); await syncSharedOutbox('a');
    expect(readSharedOutbox('a')[0]).toMatchObject({ status: 'review', message: 'Refresh to get revision 2' });
  });
});

