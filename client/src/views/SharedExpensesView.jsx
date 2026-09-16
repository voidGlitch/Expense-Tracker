import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BedDouble, CarFront, CheckCircle2, CircleEllipsis, CirclePlus, Coffee, GraduationCap, HandCoins, HeartPulse, House, PartyPopper, Plane, Plug, Plus, Receipt, ReceiptText, ShoppingBag, ShoppingBasket, Ticket, UtensilsCrossed, Users } from 'lucide-react';
import { CURRENCIES, EXPENSE_CATEGORIES, SETTLEMENT_METHODS } from '@expense/shared';
import { api } from '../lib/api.js';
import { useAuth } from '../state/AuthContext.jsx';
import { Banner, Button, Card, EmptyState, Select, Spinner, TextInput } from '../components/ui.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { formatMoney } from '../lib/money.js';
import { shouldShowSettleUp } from './sharedExpenseUi.js';

const today = () => new Date().toISOString().slice(0, 10);
const avatar = (name = '?') => name.split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase();
function Avatar({ user }) { return <span className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-700">{avatar(user?.name)}</span>; }

const CATEGORY_VISUALS = {
  Food: { Icon: UtensilsCrossed, className: 'bg-orange-50 text-orange-700 dark:bg-orange-950/35 dark:text-orange-300' },
  Groceries: { Icon: ShoppingBasket, className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/35 dark:text-blue-300' },
  Rent: { Icon: House, className: 'bg-violet-50 text-violet-700 dark:bg-violet-950/35 dark:text-violet-300' },
  Utilities: { Icon: Plug, className: 'bg-teal-50 text-teal-700 dark:bg-teal-950/35 dark:text-teal-300' },
  Travel: { Icon: Plane, className: 'bg-sky-50 text-sky-700 dark:bg-sky-950/35 dark:text-sky-300' },
  Transport: { Icon: CarFront, className: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/35 dark:text-indigo-300' },
  Hotel: { Icon: BedDouble, className: 'bg-pink-50 text-pink-700 dark:bg-pink-950/35 dark:text-pink-300' },
  Entertainment: { Icon: Ticket, className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300' },
  Shopping: { Icon: ShoppingBag, className: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/35 dark:text-fuchsia-300' },
  Healthcare: { Icon: HeartPulse, className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/35 dark:text-rose-300' },
  Education: { Icon: GraduationCap, className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/35 dark:text-cyan-300' },
  Cafe: { Icon: Coffee, className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/35 dark:text-amber-300' },
  Outing: { Icon: PartyPopper, className: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950/35 dark:text-fuchsia-300' },
  Bills: { Icon: Receipt, className: 'bg-lime-50 text-lime-700 dark:bg-lime-950/35 dark:text-lime-300' },
  Other: { Icon: CircleEllipsis, className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};

function inferredCategory(expense) {
  if (expense?.category && expense.category !== 'Other') return expense.category;
  const words = String(expense?.description || '').toLowerCase();
  if (/dinner|lunch|breakfast|pizza|burger|cafe|restaurant|food/.test(words)) return 'Food';
  if (/taxi|uber|ola|fuel|train|bus|metro|transport/.test(words)) return 'Transport';
  if (/hotel|stay|resort/.test(words)) return 'Hotel';
  if (/rent/.test(words)) return 'Rent';
  if (/grocery|groceries|supermarket/.test(words)) return 'Groceries';
  return expense?.category || 'Other';
}

function ExpenseIcon({ expense }) { const meta = CATEGORY_VISUALS[inferredCategory(expense)] || CATEGORY_VISUALS.Other; const Icon = meta.Icon; return <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${meta.className}`} title={inferredCategory(expense)}><Icon size={20} aria-hidden="true" /></span>; }

export default function SharedExpensesView() {
  const { user } = useAuth();
  const [data, setData] = useState({ friends: [], groups: [], incoming: [], contacts: [] });
  const [tab, setTab] = useState('friends'); const [selected, setSelected] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false); const [newGroup, setNewGroup] = useState(false); const [addFriend, setAddFriend] = useState(false);
  const reload = useCallback(async () => { setLoading(true); try { const [friends, groups] = await Promise.all([api.getFriends(), api.getGroups()]); setData({ ...friends, groups: groups.groups }); setError(''); } catch (cause) { setError(cause.message); } finally { setLoading(false); } }, []);
  useEffect(() => { reload(); }, [reload]);
  if (selected) return <LedgerView context={selected} me={user} back={() => { setSelected(null); reload(); }} />;
  const canAddExpense = data.friends.length + data.groups.length > 0;
  return <div className="mx-auto max-w-3xl space-y-5 pb-16">
    <section className="rounded-[2rem] bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-700 p-5 text-white shadow-lg shadow-teal-700/25 sm:p-7"><p className="text-sm font-medium text-teal-50">Shared expenses</p><div className="mt-1 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{user?.name?.split(' ')[0] || 'Your'} balances</h1><p className="mt-1 text-sm font-medium text-teal-50">Add an expense, track debts, and settle fairly.</p></div><div className="flex w-full gap-2 sm:w-auto"><Button className="flex-1 !bg-white !text-teal-800 shadow-sm hover:!bg-teal-50 sm:flex-none" icon={Plus} disabled={!canAddExpense} title={canAddExpense ? undefined : 'Create a group or add a friend first'} onClick={() => setAdding(true)}>Add expense</Button><Button className="flex-1 !border !border-white/60 !bg-teal-950/30 !text-white hover:!bg-white/15 sm:flex-none" icon={CirclePlus} onClick={() => setNewGroup(true)}>Group</Button></div></div></section>
    {error && <Banner variant="error">{error}</Banner>}
    <div className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">{['friends', 'groups'].map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-xl py-2.5 text-sm font-bold capitalize ${tab === item ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800' : 'text-slate-500'}`}>{item}</button>)}</div>
    <div className="flex justify-end">{tab === 'friends' && <Button icon={Plus} onClick={() => setAddFriend(true)}>Add Friend</Button>}</div>
    {loading ? <div className="grid h-48 place-items-center"><Spinner size={28}/></div> : tab === 'friends' ? <FriendList friends={data.friends} contacts={data.contacts} open={(friend) => setSelected({ type: 'friendship', id: friend.id, title: friend.user.name, members: [user, friend.user], currency: 'INR' })} /> : <GroupList groups={data.groups} me={user} open={(group) => setSelected({ type: 'group', id: group.id, title: group.name, members: group.members.map((member) => member.user).filter(Boolean), currency: group.currency })} />}
    <ExpenseModal open={adding} close={() => setAdding(false)} contexts={[...data.friends.map((friend) => ({ type: 'friendship', id: friend.id, title: friend.user.name, members: [user, friend.user], currency: 'INR' })), ...data.groups.map((group) => ({ type: 'group', id: group.id, title: group.name, members: group.members.map((member) => member.user).filter(Boolean), currency: group.currency }))]} done={() => { setAdding(false); window.dispatchEvent(new Event('shared-ledger-updated')); reload(); }}/>
    <GroupModal open={newGroup} close={() => setNewGroup(false)} friends={data.friends} done={() => { setNewGroup(false); reload(); }}/>
    <FriendModal open={addFriend} close={() => setAddFriend(false)} done={() => { setAddFriend(false); reload(); }}/>
  </div>;
}

function FriendList({ friends, contacts, open }) { if (!friends.length && !contacts.length) return <EmptyState icon={Users} title="No friends yet" description="Add a friend or contact to begin splitting expenses." />; return <Card className="divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">{friends.map((friend) => <button key={friend.id} type="button" onClick={() => open(friend)} className="flex w-full items-center gap-3 p-4 text-left hover:bg-teal-50/60"><Avatar user={friend.user}/><div className="min-w-0 flex-1"><p className="font-bold text-slate-900 dark:text-slate-100">{friend.user.name}</p><p className="text-xs text-slate-500">Open shared ledger</p></div><span className="text-xs font-bold text-teal-700">View</span></button>)}{contacts.map((contact) => <div key={contact.id} className="flex items-center gap-3 p-4"><Avatar user={contact}/><div className="min-w-0 flex-1"><p className="font-bold">{contact.name}</p><p className="text-xs text-amber-700">Not registered — ledger links when they join.</p></div></div>)}</Card>; }
function GroupList({ groups, open }) { if (!groups.length) return <EmptyState icon={Users} title="No groups yet" description="Create one for a trip, home, or team." />; return <div className="grid gap-3 sm:grid-cols-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => open(group)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-teal-300 hover:bg-teal-50/40 dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-teal-50 text-xl">{group.icon || '✦'}</span><div><p className="font-bold">{group.name}</p><p className="text-xs text-slate-500">{group.members.length} members · {group.currency}</p></div></div><p className="mt-4 text-xs font-medium text-teal-700">View balances and expenses →</p></button>)}</div>; }

function LedgerView({ context, me, back }) {
  const [ledger, setLedger] = useState(null); const [balance, setBalance] = useState(null); const [totals, setTotals] = useState(null); const [plan, setPlan] = useState(null); const [error, setError] = useState(''); const [expense, setExpense] = useState(false); const [editing, setEditing] = useState(null); const [settle, setSettle] = useState(false); const [addingMember, setAddingMember] = useState(false); const [deleting, setDeleting] = useState(null); const [tab, setTab] = useState('activity');
  const load = useCallback(async () => { try { const prefix = context.type === 'group'; const [rows, bal, total, debtPlan] = await Promise.all([prefix ? api.getGroupLedger(context.id) : api.getFriendshipLedger(context.id), prefix ? api.getGroupBalances(context.id) : api.getFriendshipBalance(context.id), prefix ? api.getGroupTotals(context.id) : api.getFriendshipTotals(context.id), prefix ? api.getSettlementPlan(context.id) : Promise.resolve(null)]); setLedger(rows); setBalance(bal); setTotals(total); setPlan(debtPlan); setError(''); } catch (cause) { setError(cause.message); } }, [context]);
  useEffect(() => { load(); }, [load]);
  const members = ledger?.members || context.members;
  const currency = context.currency || 'INR';
  const settleOptions = useMemo(() => {
    if (context.type === 'friendship') {
      const row = balance?.balances?.[currency];
      return row?.direction === 'youOwe' && row.amount > 0 ? [{ to: row.to, amount: row.amount }] : [];
    }
    return (balance?.debts?.[currency] || []).filter((row) => row.from === me.id && row.amount > 0);
  }, [balance, context.type, currency, me.id]);
  const headline = useMemo(() => { if (context.type === 'friendship') { const row = balance?.balances?.[currency]; if (!row || row.direction === 'settled') return 'You’re all settled up'; return row.direction === 'owesYou' ? `${context.title} owes you ${formatMoney(row.amount, currency)}` : `You owe ${context.title} ${formatMoney(row.amount, currency)}`; } const mine = balance?.balances?.[currency]?.[me.id] || 0; return mine > 0.005 ? `You are owed ${formatMoney(mine, currency)}` : mine < -0.005 ? `You owe ${formatMoney(Math.abs(mine), currency)}` : 'You’re all settled up'; }, [balance, context, currency, me]);
  if (!ledger) return <div className="grid min-h-64 place-items-center"><Spinner size={28}/></div>;
  return <div className="mx-auto max-w-3xl space-y-4 pb-16"><button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700"><ArrowLeft size={16}/>All shared expenses</button><section className="rounded-3xl bg-slate-900 p-5 text-white sm:p-7"><p className="text-sm text-white/65">{context.type === 'group' ? `${members.length} members` : 'Friendship'}</p><h1 className="mt-1 text-2xl font-bold">{context.title}</h1><p className="mt-4 text-lg font-semibold text-teal-300">{headline}</p><div className="mt-5 flex flex-wrap gap-2"><Button className="bg-teal-500 text-white hover:bg-teal-400" icon={ReceiptText} onClick={() => setExpense(true)}>Add expense</Button>{context.type === 'group' && <Button className="bg-white/10 text-white hover:bg-white/20" icon={Plus} onClick={() => setAddingMember(true)}>Add member</Button>}{shouldShowSettleUp(settleOptions) && <Button className="bg-white/10 text-white hover:bg-white/20" icon={HandCoins} onClick={() => setSettle(true)}>Settle up</Button>}</div></section>{error && <Banner variant="error">{error}</Banner>}
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-900">{['activity','balances','totals'].map((value) => <button key={value} type="button" onClick={() => setTab(value)} className={`min-w-24 flex-1 rounded-lg px-3 py-2 text-sm font-bold capitalize ${tab === value ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-800' : 'text-slate-500'}`}>{value}</button>)}</div>
    {tab === 'activity' && <Activity rows={ledger} members={members} me={me} currency={currency} remove={(row) => setDeleting(row)} edit={(row) => setEditing(row)} />}{tab === 'balances' && <Balances context={context} balance={balance} plan={plan} members={members} currency={currency}/>} {tab === 'totals' && <Totals totals={totals} currency={currency}/>}
    <ExpenseModal open={expense || Boolean(editing)} initial={editing} close={() => { setExpense(false); setEditing(null); }} contexts={[{ ...context, members, currency }]} done={() => { setExpense(false); setEditing(null); window.dispatchEvent(new Event('shared-ledger-updated')); load(); }}/><SettleModal open={settle} close={() => setSettle(false)} context={{...context,members,currency}} me={me} options={settleOptions} done={() => { setSettle(false); window.dispatchEvent(new Event('shared-ledger-updated')); load(); }}/><MemberModal open={addingMember} close={() => setAddingMember(false)} context={context} done={() => { setAddingMember(false); load(); }}/><ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} onConfirm={async () => { await api.deleteExpense(deleting.id); setDeleting(null); window.dispatchEvent(new Event('shared-ledger-updated')); load(); }} title="Delete expense?">Delete “{deleting?.description}” and recalculate the balance?</ConfirmDialog>
  </div>;
}

function Activity({ rows, members, me, currency, remove, edit }) { const name = (id) => members.find((member) => member?.id === id)?.name || 'Unknown'; const myShare = (row) => row.splits?.find((split) => split.memberId === me.id)?.amount || 0; const events = [...rows.expenses.map((expense) => ({ ...expense, kind:'expense'})), ...rows.settlements.map((settlement) => ({...settlement,kind:'settlement'}))].sort((a,b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`)); if (!events.length) return <EmptyState icon={ReceiptText} title="No expenses yet" description="Add the first expense to start the ledger."/>; return <Card className="divide-y divide-slate-100 overflow-hidden p-0 dark:divide-slate-800">{events.map((row) => <div key={row.id} className="flex gap-3 p-4"><div>{row.kind === 'expense' ? <ExpenseIcon expense={row}/> : <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300"><CheckCircle2 size={20} aria-hidden="true"/></span>}</div><div className="min-w-0 flex-1"><p className="truncate font-bold text-slate-900 dark:text-slate-100">{row.kind === 'expense' ? row.description : `${name(row.fromUserId)} settled up`}</p><p className="mt-0.5 text-xs text-slate-500">{row.kind === 'expense' ? `${inferredCategory(row)} · ${name(row.paidBy)} paid · ${row.date}` : `${row.method} · ${row.date}`}</p>{row.kind === 'expense' && <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">Your share: {formatMoney(myShare(row), row.currency || currency)}</p>}</div><div className="shrink-0 text-right"><p className="font-bold text-slate-900 dark:text-slate-100">{formatMoney(row.amount, row.currency || currency)}</p>{row.kind === 'expense' && row.createdBy === me.id && <div className="mt-1 flex justify-end gap-2"><button type="button" className="text-xs font-bold text-teal-700" onClick={() => edit(row)}>Edit</button><button type="button" className="text-xs font-bold text-rose-600" onClick={() => remove(row)}>Delete</button></div>}</div></div>)}</Card>; }
function Balances({ context, balance, plan, members, currency }) { const name = (id) => members.find((member) => member?.id === id)?.name || 'Unknown'; if (context.type === 'friendship') { const item = balance?.balances?.[currency]; const message = !item || item.direction === 'settled' ? 'You’re all settled up' : item.direction === 'owesYou' ? `${context.title} owes you ${formatMoney(item.amount, currency)}` : `You owe ${context.title} ${formatMoney(item.amount, currency)}`; return <Card className="p-5"><p className="text-sm text-slate-500">Current balance</p><p className="mt-2 text-xl font-bold">{message}</p></Card>; } const debts = balance?.debts?.[currency] || []; const simplified = plan?.plan?.[currency] || []; return <div className="space-y-4"><Card className="p-5"><h2 className="font-bold">Who owes whom</h2>{debts.length ? debts.map((row) => <p key={`${row.from}${row.to}`} className="mt-3 text-sm">{name(row.from)} owes <b>{name(row.to)}</b> <span className="font-bold text-rose-600">{formatMoney(row.amount,currency)}</span></p>) : <p className="mt-2 text-sm text-teal-700">Everyone is settled up.</p>}</Card><Card className="p-5"><h2 className="font-bold">Simplified settlement plan</h2>{simplified.length ? simplified.map((row) => <p key={`${row.from}${row.to}`} className="mt-3 text-sm">{name(row.from)} pays <b>{name(row.to)}</b> <span className="font-bold text-teal-700">{formatMoney(row.amount,currency)}</span></p>) : <p className="mt-2 text-sm text-slate-500">No payments needed.</p>}</Card></div>; }
function Totals({ totals, currency }) { const root = totals?.totals || {}; const values = root.byCurrency?.[currency] || root[currency] || root.byCurrency?.INR || root.INR || {}; const spending = values.total ?? ((values.yourShare || 0) + (values.theirShare || 0)); const count = values.count ?? root.expenseCount ?? totals?.expenseCount ?? 0; return <Card className="grid grid-cols-2 gap-4 p-5">{[['You paid',values.youPaid ?? values.paid],['Your share',values.yourShare ?? values.share],['Total spending',spending],['Expenses',count]].map(([label,value]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{typeof value === 'number' && label !== 'Expenses' ? formatMoney(value,currency) : value || 0}</p></div>)}</Card>; }

function ExpenseModal({ open, close, contexts, done, initial = null }) {
  const [contextKey, setContextKey] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Other');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [method, setMethod] = useState('equal');
  const [selected, setSelected] = useState([]);
  const [details, setDetails] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const context = contexts.find((item) => `${item.type}:${item.id}` === contextKey) || contexts[0] || null;

  useEffect(() => {
    if (!open) return;
    const existingContext = initial && `${initial.contextType}:${initial.contextId}`;
    const selectedContext = contexts.find((item) => `${item.type}:${item.id}` === existingContext) || contexts[0] || null;
    if (!selectedContext) return;
    setContextKey(`${selectedContext.type}:${selectedContext.id}`);
    setDescription(initial?.description || '');
    setCategory(initial?.category || 'Other');
    setAmount(initial ? String(initial.amount) : '');
    setDate(initial?.date || today());
    setNotes(initial?.notes || '');
    setPaidBy(initial?.paidBy || selectedContext.members?.[0]?.id || '');
    setMethod(initial?.splitMethod || 'equal');
    setSelected(initial?.participants || selectedContext.members?.map((member) => member.id) || []);
    setDetails(initial?.splitDetails || {});
    setError(''); setFieldErrors({});
  }, [open, initial, contexts]);

  const toggle = (id) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const parsedAmount = Number(amount);
  const amountMinor = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : 0;
  const selectedDetails = selected.map((id) => Number(details[id]) || 0);
  const exactMinor = selectedDetails.reduce((sum, value) => sum + Math.round(value * 100), 0);
  const percentHundredths = selectedDetails.reduce((sum, value) => sum + Math.round(value * 100), 0);
  const shares = selectedDetails.reduce((sum, value) => sum + Math.max(0, value), 0);
  const splitValid = method === 'equal' ? selected.length > 0
    : method === 'exact' ? exactMinor === amountMinor
      : method === 'percentage' ? percentHundredths === 10000
        : shares > 0;
  const canSave = Boolean(context && description.trim() && amountMinor > 0 && paidBy && selected.length && splitValid);
  const splitSummary = method === 'exact'
    ? { ok: splitValid, text: `Split total: ${formatMoney(exactMinor / 100, context?.currency || 'INR')} / ${formatMoney(amountMinor / 100, context?.currency || 'INR')}`, detail: exactMinor === amountMinor ? '' : `${formatMoney(Math.abs(amountMinor - exactMinor) / 100, context?.currency || 'INR')} ${exactMinor > amountMinor ? 'over' : 'remaining'}` }
    : method === 'percentage'
      ? { ok: splitValid, text: `Percentage: ${(percentHundredths / 100).toFixed(2).replace(/\.00$/, '')}% / 100%`, detail: percentHundredths === 10000 ? '' : `${Math.abs(10000 - percentHundredths) / 100}% ${percentHundredths > 10000 ? 'over' : 'remaining'}` }
      : null;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave || !context) return;
    setBusy(true); setError(''); setFieldErrors({});
    const payload = { description, category, amount: parsedAmount, currency: context.currency || 'INR', date, notes, paidBy, participants: selected, splitMethod: method, splitDetails: details, contextType: context.type, contextId: context.id };
    try {
      if (initial) await api.updateExpense(initial.id, payload);
      else await api.createExpense(payload);
      done();
    } catch (cause) {
      setFieldErrors(cause.fieldErrors || {});
      setError(cause.message);
    } finally { setBusy(false); }
  };

  return <Modal open={open} onClose={close} title={initial ? 'Edit expense' : 'Add expense'} subtitle={context ? 'Record who paid and exactly how to split it.' : 'Create a group or add a friend before recording a shared expense.'} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="expense-form" type="submit" busy={busy} disabled={!canSave} className="!bg-teal-600 !text-white hover:!bg-teal-500">{initial ? 'Save changes' : 'Save expense'}</Button></>}>
    <form id="expense-form" onSubmit={submit} className="space-y-4">
      {!context ? <EmptyState icon={Users} title="Choose people first" description="A shared expense always belongs to a friendship or group." /> : <>
        <div><label className="mb-1.5 block text-sm font-bold">Friend or group</label><Select value={contextKey} disabled={Boolean(initial)} onChange={(event) => { const next = contexts.find((item) => `${item.type}:${item.id}` === event.target.value); setContextKey(event.target.value); setPaidBy(next?.members?.[0]?.id || ''); setSelected(next?.members?.map((member) => member.id) || []); setDetails({}); }}>{contexts.map((item) => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>{item.type === 'group' ? 'Group: ' : 'Friend: '}{item.title}</option>)}</Select></div>
        <div><label className="mb-1.5 block text-sm font-bold">Description</label><TextInput data-autofocus placeholder="Dinner" value={description} error={fieldErrors.description} onChange={(event) => setDescription(event.target.value)}/></div>
        <div><label className="mb-1.5 block text-sm font-bold">Category</label><Select value={category} onChange={(event) => setCategory(event.target.value)}>{EXPENSE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-sm font-bold">Total amount</label><TextInput inputMode="decimal" placeholder="0.00" value={amount} error={fieldErrors.amount} onChange={(event) => setAmount(event.target.value)}/></div><div><label className="mb-1.5 block text-sm font-bold">Split method</label><Select value={method} onChange={(event) => { setMethod(event.target.value); setDetails({}); }}><option value="equal">Equal</option><option value="exact">Exact amounts</option><option value="percentage">Percentage</option><option value="shares">Shares</option></Select></div></div>
        <div><label className="mb-1.5 block text-sm font-bold">Who paid?</label><Select value={paidBy} error={fieldErrors.paidBy} onChange={(event) => setPaidBy(event.target.value)}>{context.members?.map((member) => <option key={member.id} value={member.id}>{member.name} paid</option>)}</Select></div>
        <div><p className="mb-2 text-sm font-bold">Split between</p>{context.members?.map((member) => <label key={member.id} className="mb-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"><input type="checkbox" checked={selected.includes(member.id)} onChange={() => toggle(member.id)}/><span className="min-w-0 flex-1 font-medium">{member.name}</span>{method !== 'equal' && selected.includes(member.id) && <TextInput className="w-28 py-1 text-right" inputMode="decimal" placeholder={method === 'percentage' ? '0%' : method === 'shares' ? '1 share' : '0.00'} value={details[member.id] ?? ''} onChange={(event) => setDetails({ ...details, [member.id]: event.target.value })}/>}</label>)}</div>
        {splitSummary && <p className={`rounded-xl px-3 py-2 text-sm font-medium ${splitSummary.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'}`}>{splitSummary.ok ? '✓ ' : ''}{splitSummary.text}{splitSummary.detail && <span className="ml-1">· {splitSummary.detail}</span>}</p>}
        <div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-sm font-bold">Date</label><TextInput type="date" value={date} error={fieldErrors.date} onChange={(event) => setDate(event.target.value)}/></div><div><label className="mb-1.5 block text-sm font-bold">Notes</label><TextInput placeholder="Optional" value={notes} onChange={(event) => setNotes(event.target.value)}/></div></div>
        {(fieldErrors.splits || error) && <Banner variant="error">{fieldErrors.splits || error}</Banner>}
      </>}
    </form>
  </Modal>;
}
function SettleModal({ open, close, context, me, options = [], done }) {
  const [amount, setAmount] = useState(''); const [to, setTo] = useState(''); const [method, setMethod] = useState('upi'); const [date, setDate] = useState(today()); const [fieldErrors, setFieldErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const currency = context.currency || 'INR';
  const selectedDebt = options.find((row) => row.to === to) || options[0] || null;
  const parsedAmount = Number(amount);
  const canSave = Boolean(to && parsedAmount > 0 && selectedDebt && parsedAmount <= selectedDebt.amount + 0.005);
  useEffect(() => { if (open) { setFieldErrors({}); setError(''); setAmount(options[0]?.amount ? String(options[0].amount) : ''); setDate(today()); setTo(options[0]?.to || ''); } }, [open, options]);
  const submit = async (event) => { event.preventDefault(); if (!canSave) return; setBusy(true); setError(''); setFieldErrors({}); try { await api.createSettlement({ fromUserId: me.id, toUserId: to, amount: Number(amount), currency, date, method, contextType: context.type, contextId: context.id }); done(); } catch (cause) { const errors = cause.fieldErrors || {}; setFieldErrors(errors); if (!Object.keys(errors).length) setError(cause.message); } finally { setBusy(false); } };
  const people = context.members.filter(Boolean).filter((member) => options.some((row) => row.to === member.id));
  return <Modal open={open} onClose={close} title="Settle up" subtitle={selectedDebt ? `You owe ${formatMoney(selectedDebt.amount, currency)}. Partial payments remain in history.` : 'No payment is due.'} footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="settle-form" type="submit" busy={busy} disabled={!canSave} className="!bg-teal-600 !text-white hover:!bg-teal-500">Record payment</Button></>}><form id="settle-form" onSubmit={submit} className="space-y-4"><div><label className="mb-1.5 block text-sm font-bold">Who received the payment?</label><Select value={to} error={fieldErrors.toUserId} onChange={(event) => setTo(event.target.value)}><option value="">Choose recipient</option>{people.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select>{fieldErrors.toUserId && <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.toUserId}</p>}</div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-sm font-bold">Amount</label><TextInput inputMode="decimal" error={fieldErrors.amount} placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)}/>{selectedDebt && parsedAmount > selectedDebt.amount + 0.005 && <p className="mt-1 text-xs font-medium text-rose-600">Settlement cannot exceed {formatMoney(selectedDebt.amount, currency)}.</p>}{fieldErrors.amount && <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.amount}</p>}</div><div><label className="mb-1.5 block text-sm font-bold">Payment date</label><TextInput type="date" error={fieldErrors.date} value={date} onChange={(event) => setDate(event.target.value)}/>{fieldErrors.date && <p className="mt-1 text-xs font-medium text-rose-600">{fieldErrors.date}</p>}</div></div><div className="grid grid-cols-2 gap-3"><div><label className="mb-1.5 block text-sm font-bold">Currency</label><TextInput value={currency} disabled aria-label="Settlement currency"/></div><div><label className="mb-1.5 block text-sm font-bold">Payment method</label><Select value={method} onChange={(event) => setMethod(event.target.value)}>{SETTLEMENT_METHODS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></div></div>{fieldErrors.fromUserId && <Banner variant="error">{fieldErrors.fromUserId}</Banner>}{error && <Banner variant="error">{error}</Banner>}</form></Modal>;
}
function FriendModal({ open, close, done }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(''); setEmail(''); setPhone(''); setError(''); } }, [open]);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await api.createContact({ name, email, phone }); done(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <Modal open={open} onClose={close} title="Add friend" subtitle="They can be a registered user or a guest participant." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="friend-form" type="submit" busy={busy} disabled={!name.trim()} className="!bg-teal-600 !text-white hover:!bg-teal-500">Add Friend</Button></>}><form id="friend-form" onSubmit={submit} className="space-y-3"><div><label className="mb-1.5 block text-sm font-bold">Name *</label><TextInput data-autofocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Miku"/></div><div><label className="mb-1.5 block text-sm font-bold">Email optional</label><TextInput value={email} onChange={(event) => setEmail(event.target.value)} placeholder="miku@example.com"/></div><div><label className="mb-1.5 block text-sm font-bold">Phone optional</label><TextInput value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91..."/></div>{error&&<Banner variant="error">{error}</Banner>}</form></Modal>;
}

function MemberModal({ open, close, context, done }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(''); setEmail(''); setPhone(''); setError(''); } }, [open]);
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await api.addGroupMember(context.id, { name, email, phone }); done(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <Modal open={open} onClose={close} title="Add member" subtitle="Create a guest now; if their email registers later, this member links automatically." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button form="member-form" type="submit" busy={busy} disabled={!name.trim()} className="!bg-teal-600 !text-white hover:!bg-teal-500">Add member</Button></>}><form id="member-form" onSubmit={submit} className="space-y-3"><div><label className="mb-1.5 block text-sm font-bold">Name *</label><TextInput data-autofocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Rahul"/></div><div><label className="mb-1.5 block text-sm font-bold">Email optional</label><TextInput value={email} onChange={(event) => setEmail(event.target.value)} placeholder="rahul@example.com"/></div><div><label className="mb-1.5 block text-sm font-bold">Phone optional</label><TextInput value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91..."/></div>{error&&<Banner variant="error">{error}</Banner>}</form></Modal>;
}

function GroupModal({open,close,done}){const[name,setName]=useState('');const[busy,setBusy]=useState(false);const[error,setError]=useState('');const submit=async(e)=>{e.preventDefault();setBusy(true);try{await api.createGroup({name,memberIds:[]});done()}catch(cause){setError(cause.message)}finally{setBusy(false)}};return <Modal open={open} onClose={close} title="New group" footer={<Button form="group-form" type="submit" busy={busy} className="bg-teal-600 hover:bg-teal-500">Create</Button>}><form id="group-form" onSubmit={submit} className="space-y-3"><TextInput data-autofocus value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Goa Trip"/>{error&&<Banner variant="error">{error}</Banner>}</form></Modal>}
