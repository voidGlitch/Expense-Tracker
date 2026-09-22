import { useState } from 'react';
import { CURRENCIES, minor } from '@expense/shared';
import { Modal } from '../../components/Modal.jsx';
import { Button, Banner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { saveShared } from '../../lib/sharedOutbox.js';
import { formatMoney } from '../../lib/money.js';
import { Field, today } from './ExpenseDialog.jsx';

export default function PaymentDialog({ context, friend, contexts, me, initial, close, done }) {
  const [scopeId, setScopeId] = useState(initial?.contextId || (friend ? friend.scopes.length === 1 ? friend.scopes[0].contextId : 'all' : context.id));
  const [currency, setCurrency] = useState(initial?.currency || Object.keys(friend?.byCurrency || context?.debts || {})[0] || 'INR');
  const selectedContext = contexts.find((c) => c.id === scopeId);
  const people = selectedContext?.members || [me, friend?.user].filter(Boolean);
  const isAll = scopeId === 'all';
  const options = (selectedContext?.debts?.[currency] || []).filter((row) => row.from === me.id || row.to === me.id);
  const first = options[0];
  const total = friend?.byCurrency?.[currency] || 0;
  const [from, setFrom] = useState(initial?.fromUserId || (friend ? total > 0 ? friend.id : me.id : first?.from || me.id));
  const [to, setTo] = useState(initial?.toUserId || (friend ? total > 0 ? me.id : friend.id : first?.to || ''));
  const [amount, setAmount] = useState(initial?.amount ?? (friend ? Math.abs(total) : first?.amount || ''));
  const [date, setDate] = useState(initial?.date || today());
  const [method, setMethod] = useState(initial?.method || 'cash');
  const [note, setNote] = useState(initial?.note || '');
  const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  // An edit is validated against the graph before that payment was applied.
  const directDebt = options.find((row) => row.from === from && row.to === to)?.amount || 0;
  const reverseDebt = options.find((row) => row.from === to && row.to === from)?.amount || 0;
  const prior = initial && initial.currency === currency ? (initial.fromUserId === from && initial.toUserId === to ? initial.amount : initial.fromUserId === to && initial.toUserId === from ? -initial.amount : 0) : 0;
  const outstanding = directDebt - reverseDebt + prior;
  const unusual = !isAll && (minor(amount) > minor(outstanding) || outstanding <= 0);
  const name = (id) => people.find((p) => p.id === id)?.name || contexts.flatMap((c) => c.members).find((p) => p.id === id)?.name || 'Member';
  const chooseScope = (id, nextCurrency = currency) => {
    setScopeId(id); setCurrency(nextCurrency); setConfirmed(false);
    if (id === 'all') { const net = friend.byCurrency[nextCurrency] || 0; setFrom(net > 0 ? friend.id : me.id); setTo(net > 0 ? me.id : friend.id); setAmount(Math.abs(net)); }
    else { const choice = contexts.find((c) => c.id === id)?.debts?.[nextCurrency]?.find((r) => r.from === me.id || r.to === me.id); setFrom(choice?.from || me.id); setTo(choice?.to || friend?.id || ''); setAmount(choice?.amount || ''); }
  };
  const save = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      // Refresh the ledger immediately before writing. The dialog can stay
      // open while another device records a payment, so its original revision
      // is not safe to submit.
      const fresh = await Promise.resolve(typeof api.getSharedOverview === 'function' ? api.getSharedOverview() : null).catch(() => null);
      const freshFriend = fresh?.friends?.find((row) => row.id === friend?.id);
      const freshContext = fresh?.contexts?.find((row) => row.id === selectedContext?.id);
      if (isAll) await saveShared(me.id, 'settleAll', [{ friendId: friend.id, currency, amount: Number(amount), date, method, note, expectedRevision: freshFriend?.revision ?? friend.revision, confirmOffset: confirmed, idempotencyKey: key }]);
      else {
        const payload = { fromUserId: from, toUserId: to, amount: Number(amount), currency, date, method, note, contextType: selectedContext.type, contextId: selectedContext.id, confirmUnusualPayment: confirmed, idempotencyKey: key };
        if (initial) await saveShared(me.id, 'updateSettlement', [initial.id, { ...payload, expectedRevision: initial.revision || 1 }]);
        else await saveShared(me.id, 'createSettlement', [{ ...payload, expectedLedgerRevision: freshContext?.revision ?? selectedContext.revision }]);
      }
      done();
    } catch (cause) { setError([cause.message, ...Object.values(cause.fieldErrors || {})].join(' ')); }
    finally { setBusy(false); }
  };
  const scopes = friend?.scopes?.filter((s) => s.currency === currency) || [];
  const canSave = isAll ? scopes.length > 0 && (minor(total) !== 0 || confirmed) : from && to && from !== to && Number(amount) > 0 && (!unusual || confirmed);
  return <Modal open onClose={close} title={initial ? 'Edit payment' : 'Record payment'} subtitle="Record money that actually changed hands. Sent payments become spending; received payments appear as credits." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="shared-payment" busy={busy} disabled={!canSave}>Record payment</Button></>}>
    <form id="shared-payment" className="shared-form" onSubmit={save}>
      <Field label="Payment scope"><select disabled={Boolean(initial)} value={scopeId} onChange={(e) => chooseScope(e.target.value)}>{friend && <option value="all">Settle all with {friend.user.name}</option>}{contexts.filter((c) => !friend || c.memberIds.includes(friend.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      <Field label="Currency"><select value={currency} onChange={(e) => chooseScope(scopeId, e.target.value)}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</select></Field>
      {isAll ? <><p className="font-bold">{total > 0 ? `${friend.user.name} pays you` : total < 0 ? `You pay ${friend.user.name}` : 'No cash changes hands'}: {formatMoney(Math.abs(total), currency)}</p><div className="rounded-lg border p-3"><p className="mb-2 font-semibold">Balances cleared by this payment</p>{scopes.map((scope) => <p key={scope.contextId} className="flex justify-between gap-2 py-1"><span>{scope.title}</span><span>{scope.amount > 0 ? 'Owes you' : 'You owe'} {formatMoney(Math.abs(scope.amount), currency)}</span></p>)}</div><p className="text-xs text-slate-500">Opposite balances offset. Cash paid is {formatMoney(Math.abs(total), currency)}; each listed ledger is cleared atomically. Other currencies remain separate.</p>{!total && <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Clear these offsetting balances without cash</label>}</> : <>
        {options.length > 1 && <Field label="Suggested payment"><select value={`${from}|${to}`} onChange={(e) => { const [a, b] = e.target.value.split('|'); const row = options.find((r) => r.from === a && r.to === b); setFrom(a); setTo(b); setAmount(row?.amount || ''); setConfirmed(false); }}><option value="">Choose a balance</option>{options.map((row) => <option key={`${row.from}|${row.to}`} value={`${row.from}|${row.to}`}>{name(row.from)} → {name(row.to)} · {formatMoney(row.amount, currency)}</option>)}</select></Field>}
        <div className="form-grid"><Field label="Paid by"><select value={from} onChange={(e) => { setFrom(e.target.value); setConfirmed(false); }}>{people.map((p) => <option key={p.id} value={p.id}>{p.id === me.id ? 'You' : p.name}</option>)}</select></Field><Field label="Paid to"><select value={to} onChange={(e) => { setTo(e.target.value); setConfirmed(false); }}><option value="">Choose recipient</option>{people.map((p) => <option key={p.id} value={p.id}>{p.id === me.id ? 'You' : p.name}</option>)}</select></Field></div>
        <p>{outstanding > 0 ? `${name(from)} owes ${name(to)} ${formatMoney(outstanding, currency)}` : `No payment is due in this direction in ${currency}.`}</p>
        <Field label="Amount paid"><input data-autofocus type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setConfirmed(false); }} /></Field>
        {unusual && <div className="rounded border border-orange-300 bg-orange-50 p-3 text-orange-900"><p>This payment exceeds the debt or goes in the opposite direction. It can create or increase a reverse balance. A different currency does not settle the original currency.</p><label className="mt-2 block"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm this payment and direction are correct</label></div>}
      </>}
      <div className="form-grid"><Field label="Payment date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Payment method"><select value={method} onChange={(e) => setMethod(e.target.value)}>{['cash', 'bank', 'upi', 'other'].map((m) => <option key={m}>{m}</option>)}</select></Field></div>
      <Field label="Payment note"><textarea maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></Field>{error && <Banner variant="error">{error}</Banner>}
    </form>
  </Modal>;
}

