import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { participantShares, minor } from '@expense/shared';
import { Plus, Users, ReceiptText, LayoutDashboard, Activity, Settings, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../../state/AuthContext.jsx';
import { useStore } from '../../state/StoreContext.jsx';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/money.js';
import { Banner, Button, Spinner } from '../../components/ui.jsx';
import ExpenseDialog from './ExpenseDialog.jsx';
import PaymentDialog from './PaymentDialog.jsx';
import TransactionDetail from './TransactionDetail.jsx';
import { FriendDialog, GroupDialog } from './SocialDialogs.jsx';
import { readSharedOutbox, syncSharedOutbox, discardSharedOutbox } from '../../lib/sharedOutbox.js';
import './shared.css';

export function Avatar({ name = '?', group = false }) { return <span className={`shared-avatar ${group ? 'group' : ''}`} aria-hidden="true">{group ? <Users size={17} /> : name.split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase()}</span>; }
export function BalanceLabel({ amount, currency }) { return <span className={minor(amount) > 0 ? 'shared-positive' : minor(amount) < 0 ? 'shared-negative' : 'shared-neutral'}>{minor(amount) > 0 ? 'Owes you ' : minor(amount) < 0 ? 'You owe ' : 'Settled up'}{minor(amount) !== 0 && formatMoney(Math.abs(amount), currency)}</span>; }

export default function SharedWorkspace() {
  const { user: me } = useAuth(); const { sharedBudgetError } = useStore();
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [outbox, setOutbox] = useState(() => readSharedOutbox(me.id));
  const [selection, setSelection] = useState({ type: 'dashboard' }); const [dialog, setDialog] = useState(null);
  const [query, setQuery] = useState(''); const [currency, setCurrency] = useState('all'); const [showDeleted, setShowDeleted] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const attempt = ++generation.current;
    try {
      const result = await api.getSharedOverview();
      if (attempt !== generation.current) return;
      // Direct contexts are named for the other participant, while scope breakdowns
      // retain the explicit Direct expenses label.
      result.contexts = result.contexts.map((c) => ({ ...c, title: c.type === 'friendship' ? c.members.find((m) => m.id !== me.id)?.name || 'Direct expenses' : c.title }));
      setData(result); setError('');
      try { window.localStorage.setItem(`shared-overview:${me.id}`, JSON.stringify(result)); } catch { /* Cached views are optional. */ }
    } catch (cause) {
      if (attempt === generation.current) {
        setError(cause.message);
        try { const cached = JSON.parse(window.localStorage.getItem(`shared-overview:${me.id}`) || 'null'); if (cached?.contexts) setData(cached); } catch { /* No usable offline snapshot. */ }
      }
    }
    finally { if (attempt === generation.current) setLoading(false); }
  }, [me.id]);
  useEffect(() => { reload(); window.addEventListener('focus', reload); window.addEventListener('online', reload); return () => { generation.current++; window.removeEventListener('focus', reload); window.removeEventListener('online', reload); }; }, [reload]);
  useEffect(() => {
    const update = () => setOutbox(readSharedOutbox(me.id));
    const sync = () => syncSharedOutbox(me.id);
    sync(); window.addEventListener('shared-outbox-updated', update); window.addEventListener('online', sync); window.addEventListener('shared-ledger-updated', reload);
    return () => { window.removeEventListener('shared-outbox-updated', update); window.removeEventListener('online', sync); window.removeEventListener('shared-ledger-updated', reload); };
  }, [me.id, reload]);
  const done = () => { setDialog(null); window.dispatchEvent(new Event('shared-ledger-updated')); reload(); };
  const select = (type, id) => { setSelection({ type, id }); setQuery(''); setCurrency('all'); setShowDeleted(false); };
  const contexts = data?.contexts || [];
  const context = selection.type === 'group' ? contexts.find((c) => c.id === selection.id) : null;
  const friend = selection.type === 'friend' ? data?.friends.find((f) => f.id === selection.id) : null;
  const title = context?.title || friend?.user?.name || ({ dashboard: 'Shared Expenses', activity: 'Recent activity', friends: 'Friends', groups: 'Groups' }[selection.type]) || 'Shared Expenses';
  const selectedContexts = context ? [context] : friend ? contexts.filter((c) => c.memberIds.includes(friend.id)) : contexts;
  const events = useMemo(() => {
    const seen = new Set();
    return selectedContexts.flatMap((c) => [
      ...c.expenses.map((row) => ({ ...row, entryType: 'expense', contextTitle: c.title })),
      ...c.settlements.map((row) => ({ ...row, entryType: 'payment', contextTitle: c.title })),
    ]).filter((row) => {
      if (seen.has(row.batchId || row.id)) return false;
      seen.add(row.batchId || row.id);
      if (!showDeleted && row.deletedAt) return false;
      if (currency !== 'all' && row.currency !== currency) return false;
      if (friend && row.entryType === 'expense') {
        const ids = new Set([...(row.participants || []), ...(row.payers || []).map((p) => p.memberId), row.paidBy]);
        if (!ids.has(friend.id) || !ids.has(me.id)) return false;
      }
      if (friend && row.entryType === 'payment' && ![row.fromUserId, row.toUserId].includes(friend.id)) return false;
      return `${row.description || 'Payment'} ${row.category || ''} ${row.date} ${row.contextTitle} ${row.notes || row.note || ''}`.toLowerCase().includes(query.toLowerCase());
    }).sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
  }, [selectedContexts, friend, me.id, query, currency, showDeleted]);
  const activeContexts = contexts.filter((c) => !c.entity.archivedAt && !c.readOnly);
  const addContexts = context ? [context] : friend ? contexts.filter((c) => c.type === 'friendship' && c.memberIds.includes(friend.id)) : activeContexts;
  const canPay = friend ? friend.scopes.length > 0 : context ? Object.values(context.debts).flat().some((d) => d.from === me.id || d.to === me.id) : false;
  if (loading && !data) return <div className="grid h-64 place-items-center"><Spinner size={28} /></div>;
  if (!data) return <Banner variant="error">{error || 'Unable to load shared expenses.'}<Button onClick={reload}>Retry</Button></Banner>;
  const openExpense = () => setDialog({ type: 'expense', contexts: addContexts.length ? addContexts : activeContexts });
  return <div className="space-y-3 pb-10">
    {outbox.length > 0 && <Banner variant="warn"><p className="font-bold">{outbox.length} shared change(s) awaiting sync · balances show saved transactions</p>{outbox.map((row) => <div key={row.id} className="mt-2"><p>{row.operation} · {row.at.slice(0, 16).replace('T', ' ')}{row.status === 'review' ? ` · Review required: ${row.message}` : ' · Pending'}</p>{row.status === 'review' && <p>Review the current ledger, discard this queued change and enter the correction again.</p>}<Button variant="ghost" onClick={() => discardSharedOutbox(me.id, row.id)}>Discard queued change</Button></div>)}<Button onClick={() => syncSharedOutbox(me.id)}>Retry sync</Button></Banner>}
    {error && <Banner variant="error">Balances could not refresh: {error}<Button onClick={reload}>Retry</Button></Banner>}
    {sharedBudgetError && <Banner variant="warning">Personal budget shares could not refresh: {sharedBudgetError}</Banner>}
    <div className="shared-workspace">
      <aside className="shared-sidebar" aria-label="Shared expense navigation"><p className="px-2 pb-3 text-sm font-bold">Expense Manager</p><button onClick={() => select('dashboard')} aria-current={selection.type === 'dashboard'}><LayoutDashboard size={16} />Dashboard</button><button onClick={() => select('activity')} aria-current={selection.type === 'activity'}><Activity size={16} />Recent activity</button>
        <h3>Groups</h3><button onClick={() => setDialog({ type: 'new-group' })}><Plus size={14} />Add group</button>{contexts.filter((c) => c.type === 'group' && !c.entity.archivedAt).map((c) => <button key={c.id} onClick={() => select('group', c.id)} aria-current={selection.id === c.id}><Avatar group /><span className="truncate">{c.title}</span></button>)}<button onClick={() => select('groups')}>All groups & archives</button>
        <h3>Friends</h3><button onClick={() => setDialog({ type: 'friend' })}><Plus size={14} />Add friend</button>{data.friends.map((f) => <button key={f.id} onClick={() => select('friend', f.id)} aria-current={selection.id === f.id}><Avatar name={f.user?.name} /><span className="min-w-0"><span className="block truncate">{f.user?.name}</span>{Object.entries(f.byCurrency).filter(([, value]) => minor(value)).slice(0, 1).map(([c, amount]) => <small key={c}><BalanceLabel amount={amount} currency={c} /></small>)}</span></button>)}
      </aside>
      <main className="shared-main"><header className="shared-header"><div><h1>{title}</h1>{context && <p className="text-xs shared-neutral">{context.memberIds.length} members{context.entity.archivedAt ? ' · Archived' : ''}</p>}{friend?.user?.isGuest && <p className="text-xs shared-neutral">Guest · links when this email registers</p>}</div><div className="shared-toolbar">
        <Button icon={Plus} disabled={!activeContexts.length || Boolean(context?.entity.archivedAt || context?.readOnly)} onClick={openExpense}>Add expense</Button><Button variant="secondary" onClick={() => setDialog({ type: 'new-group' })}>Add group</Button><Button variant="secondary" onClick={() => setDialog({ type: 'friend' })}>Add friend</Button>
        {canPay && <Button variant="secondary" onClick={() => setDialog({ type: 'payment', friend, context })}>{friend && Object.values(friend.byCurrency).some((n) => n > 0) ? 'Record payment received' : 'Settle up'}</Button>}{context && !context.readOnly && <Button variant="ghost" icon={Settings} onClick={() => setDialog({ type: 'group-settings', context })}>Settings</Button>}
      </div></header>
      {selection.type === 'dashboard' && <><DashboardTotals balances={data.balances} /><RelationshipList friends={data.friends} open={(id) => select('friend', id)} /></>}
      {selection.type === 'friends' && <RelationshipList friends={data.friends} open={(id) => select('friend', id)} />}
      {selection.type === 'groups' && <div>{contexts.filter((c) => c.type === 'group').map((c) => <button className="shared-row" key={c.id} onClick={() => select('group', c.id)}><Avatar group /><span className="flex-1 font-semibold">{c.title}<small className="block">{c.memberIds.length} members{c.entity.archivedAt ? ' · Archived' : ''}</small></span><span>{c.entity.currency}</span></button>)}{!contexts.some((c) => c.type === 'group') && <p className="p-8 text-center shared-neutral">Create a group for your home, trip or team.</p>}</div>}
      {(context || friend || selection.type === 'activity') && <>
        {(friend || context) && <div className="shared-stats">{Object.entries(friend?.byCurrency || Object.fromEntries(Object.entries(context.balances).map(([c, values]) => [c, values[me.id] || 0]))).map(([c, amount]) => <div key={c}><span>{c} balance</span><strong><BalanceLabel amount={amount} currency={c} /></strong></div>)}{(friend ? Object.values(friend.byCurrency) : Object.values(context.balances)).length === 0 && <p className="shared-neutral">Settled up · no outstanding balance</p>}</div>}
        <div className="flex flex-wrap items-center gap-3 border-b p-3 text-xs"><input className="min-w-32 flex-1 rounded border p-2" aria-label="Search shared transactions" placeholder="Search description, category or date" value={query} onChange={(e) => setQuery(e.target.value)} /><select aria-label="Filter currency" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="all">All currencies</option>{[...new Set(selectedContexts.flatMap((c) => [...c.expenses, ...c.settlements].map((r) => r.currency)))].map((c) => <option key={c}>{c}</option>)}</select><label><input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} /> Show deleted</label><Button variant="ghost" onClick={reload}>Refresh</Button></div>
        <TransactionList events={events} contexts={contexts} me={me} open={(row) => setDialog({ type: 'detail', row })} />
      </>}
      </main>
      <aside className="shared-summary" aria-label="Balance breakdown"><h2>Balance breakdown</h2>{friend ? <>{friend.scopes.length ? friend.scopes.map((scope) => <div className="mb-4" key={`${scope.contextId}:${scope.currency}`}><p className="font-semibold">{scope.title}</p><BalanceLabel amount={scope.amount} currency={scope.currency} /></div>) : <p className="shared-neutral">You’re settled up.</p>}<p className="text-xs shared-neutral">Overall friend balances combine direct expenses and shared groups, separately for each currency.</p></> : context ? <>{Object.entries(context.balances).map(([c, balances]) => <section className="mb-5" key={c}><h3 className="mb-2 font-bold">{c} · Member balances</h3>{Object.entries(balances).map(([id, amount]) => <p className="mb-2" key={id}>{context.members.find((m) => m.id === id)?.name || 'Member'}<span className={`block ${amount > 0 ? 'shared-positive' : amount < 0 ? 'shared-negative' : 'shared-neutral'}`}>{amount > 0 ? 'Gets back' : amount < 0 ? 'Owes' : 'Settled up'} {amount ? formatMoney(Math.abs(amount), c) : ''}</span></p>)}<p className="border-t pt-2">Your spending share: <b>{formatMoney(context.totals[c]?.share || 0, c)}</b></p></section>)}<h3 className="font-bold">Who pays whom</h3>{Object.entries(context.debts).flatMap(([c, debts]) => debts.map((debt) => <p className="mt-3" key={`${c}:${debt.from}:${debt.to}`}>{context.members.find((m) => m.id === debt.from)?.name} → {context.members.find((m) => m.id === debt.to)?.name}<b className="block">{formatMoney(debt.amount, c)}</b></p>))}<p className="mt-3 text-xs shared-neutral">{context.entity.settings?.simplifyDebts !== false ? 'Simplified payments preserve each person’s net balance.' : 'Direct pairwise debts.'}</p></> : <><DashboardTotals balances={data.balances} /><p className="mt-4 shared-neutral">Your own share counts as spending. Lending and repayments are separate from personal consumption.</p></>}</aside>
      <nav className="shared-mobile-nav" aria-label="Shared mobile navigation"><button onClick={() => select('friends')}>Friends</button><button onClick={() => select('groups')}>Groups</button><button className="rounded-full bg-teal-600 px-4 text-white" aria-label="Add shared expense" disabled={!activeContexts.length} onClick={openExpense}><Plus size={20} /></button><button onClick={() => select('activity')}>Activity</button></nav>
    </div>
    {dialog?.type === 'expense' && <ExpenseDialog contexts={dialog.contexts} initial={dialog.initial} refundOf={dialog.refundOf} me={me} close={() => setDialog(null)} done={done} />}
    {dialog?.type === 'payment' && <PaymentDialog contexts={contexts} context={dialog.context} friend={dialog.friend} initial={dialog.initial} me={me} close={() => setDialog(null)} done={done} />}
    {dialog?.type === 'friend' && <FriendDialog context={dialog.context} close={() => setDialog(null)} done={done} />}
    {['new-group', 'group-settings'].includes(dialog?.type) && <GroupDialog context={dialog.context} friends={data.friends} me={me} close={() => setDialog(null)} done={done} addMember={() => setDialog({ type: 'friend', context: dialog.context })} />}
    {dialog?.type === 'detail' && <TransactionDetail row={dialog.row} context={contexts.find((c) => c.id === dialog.row.contextId)} contexts={contexts} me={me} close={() => setDialog(null)} done={done} edit={(row) => row.entryType === 'payment' ? setDialog({ type: 'payment', initial: row, context: contexts.find((c) => c.id === row.contextId) }) : setDialog({ type: 'expense', initial: row, contexts: contexts.filter((c) => c.id === row.contextId) })} refund={(row) => setDialog({ type: 'expense', refundOf: row, contexts: contexts.filter((c) => c.id === row.contextId) })} />}
  </div>;
}

function DashboardTotals({ balances }) { return <div className="shared-stats">{Object.entries(balances).length ? Object.entries(balances).map(([c, b]) => <div key={c} className="w-full"><p className="mb-3 font-semibold">{c}</p><div className="flex flex-wrap gap-5"><div>You owe<strong className="shared-negative">{formatMoney(b.youOwe, c)}</strong></div><div>You are owed<strong className="shared-positive">{formatMoney(b.youAreOwed, c)}</strong></div><div>Net balance<strong>{formatMoney(b.net, c)}</strong></div></div></div>) : <p className="shared-neutral">All settled up. Add an expense to start sharing.</p>}</div>; }
function RelationshipList({ friends, open }) { return friends.length ? <div>{friends.map((friend) => <button className="shared-row" key={friend.id} onClick={() => open(friend.id)}><Avatar name={friend.user?.name} /><div className="min-w-0 flex-1"><p className="font-semibold">{friend.user?.name}</p><small>{friend.user?.isGuest ? 'Guest participant' : 'Shared expenses across groups and direct ledger'}</small></div><div className="text-right text-xs">{Object.keys(friend.byCurrency).length ? Object.entries(friend.byCurrency).map(([c, amount]) => <p key={c}><BalanceLabel amount={amount} currency={c} /></p>) : <span className="shared-neutral">Settled up</span>}</div></button>)}</div> : <p className="p-8 text-center shared-neutral">Add a friend or create a group to start sharing expenses.</p>; }
export function TransactionList({ events, contexts, me, open }) {
  const name = (id) => id === me.id ? 'You' : contexts.flatMap((c) => c.members).find((m) => m.id === id)?.name || 'Member';
  if (!events.length) return <p className="p-10 text-center shared-neutral">No matching transactions.</p>;
  return <div>{events.map((row) => {
    const payment = row.entryType === 'payment'; const mine = payment ? null : participantShares(row).find((s) => s.memberId === me.id);
    return <button className={`shared-row ${row.deletedAt ? 'opacity-50' : ''}`} key={row.batchId || row.id} onClick={() => open(row)}><div className="text-center"><small className="block">{row.date?.slice(5, 7)}</small><span className="text-lg font-bold">{row.date?.slice(8, 10)}</span></div><span className="shared-avatar group">{payment ? row.toUserId === me.id ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} /> : <ReceiptText size={18} />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{payment ? `${name(row.cashFromUserId || row.fromUserId)} paid ${name(row.cashToUserId || row.toUserId)}` : row.description}</p><small className="block">{row.batchId ? 'Settle-all payment' : row.contextTitle} · {payment ? row.method : row.category}{row.deletedAt ? ' · Deleted' : ''}</small>{!payment && <small>{formatMoney(row.amount, row.currency)} total · you paid {formatMoney(mine?.paidShare || 0, row.currency)}</small>}</div><div className="shrink-0 text-right text-xs">{payment ? <><b>{formatMoney(row.cashAmount ?? row.amount, row.currency)}</b><small className="block">Repayment</small></> : <><span className={(mine?.netShare || 0) > 0 ? 'shared-positive' : (mine?.netShare || 0) < 0 ? 'shared-negative' : 'shared-neutral'}>{(mine?.netShare || 0) > 0 ? 'You lent' : (mine?.netShare || 0) < 0 ? 'You borrowed' : 'No debt'}<b className="block">{formatMoney(Math.abs(mine?.netShare || 0), row.currency)}</b></span><small>Your share {formatMoney(mine?.owedShare || 0, row.currency)}</small></>}</div></button>;
  })}</div>;
}


