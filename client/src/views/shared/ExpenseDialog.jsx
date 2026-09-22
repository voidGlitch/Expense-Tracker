import { useMemo, useState } from 'react';
import { CURRENCIES, EXPENSE_CATEGORIES, makeExpense, validateExpense, participantShares } from '@expense/shared';
import { Modal } from '../../components/Modal.jsx';
import { Button, Banner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { saveShared } from '../../lib/sharedOutbox.js';
import { formatMoney } from '../../lib/money.js';

export const Field = ({ label, children }) => <label className="shared-field"><span>{label}</span>{children}</label>;
export const today = () => new Date().toISOString().slice(0, 10);

export default function ExpenseDialog({ contexts, initial, refundOf, me, close, done }) {
  const first = contexts.find((c) => c.id === initial?.contextId) || contexts[0];
  const [contextId, setContextId] = useState(first?.id || '');
  const context = contexts.find((c) => c.id === contextId);
  const members = context?.members || [];
  const [description, setDescription] = useState(initial?.description || (refundOf ? `Refund: ${refundOf.description}` : ''));
  const [amount, setAmount] = useState(initial?.amount || '');
  const [currency, setCurrency] = useState(initial?.currency || refundOf?.currency || context?.entity?.currency || 'INR');
  const [date, setDate] = useState(initial?.date || today());
  const [category, setCategory] = useState(initial?.category || refundOf?.category || 'Food');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [participants, setParticipants] = useState(initial?.participants || members.map((m) => m.id));
  const [method, setMethod] = useState(initial?.splitMethod || 'equal');
  const [details, setDetails] = useState(initial?.splitDetails || {});
  const [payer, setPayer] = useState(initial?.paidBy || me.id);
  const [multiple, setMultiple] = useState((initial?.payers?.length || 0) > 1);
  const [paid, setPaid] = useState(Object.fromEntries((initial?.payers || []).map((p) => [p.memberId, p.amount])));
  const [receipt, setReceipt] = useState(initial?.receipt || null);
  const [frequency, setFrequency] = useState(initial?.recurrence?.active ? initial.recurrence.frequency : '');
  const [endDate, setEndDate] = useState(initial?.recurrence?.endDate || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const payload = useMemo(() => ({ description, amount: Number(amount), currency, date, category, notes,
    paidBy: payer, payers: multiple ? members.map((m) => ({ memberId: m.id, amount: Number(paid[m.id] || 0) })) : [{ memberId: payer, amount: Number(amount) }],
    participants, splitMethod: method, splitDetails: method === 'itemized' ? { items: details.items || [], tax: Number(details.tax || 0), tip: Number(details.tip || 0) } : Object.fromEntries(participants.map((id) => [id, Number(details[id] ?? (method === 'shares' ? 1 : 0))])),
    contextType: context?.type, contextId, kind: initial?.kind || (refundOf ? 'refund' : 'expense'), refundOf: initial?.refundOf || refundOf?.id || undefined,
    receipt, recurrence: frequency ? { frequency, active: true, ...(endDate ? { endDate } : {}) } : null,
  }), [description, amount, currency, date, category, notes, payer, multiple, members, paid, participants, method, details, context, contextId, initial, refundOf, receipt, frequency, endDate]);
  const preview = makeExpense(payload);
  const validation = validateExpense(preview, { memberIds: members.map((m) => m.id) });
  const shares = participantShares(preview);
  const switchContext = (id) => { const selected = contexts.find((c) => c.id === id); setContextId(id); setParticipants(selected.members.map((m) => m.id)); setPayer(me.id); setPaid({}); setDetails({}); setCurrency(selected.entity?.currency || 'INR'); };
  const save = async (event) => {
    event.preventDefault(); if (!validation.ok || busy) return;
    setBusy(true); setError('');
    try {
      if (initial) await saveShared(me.id, 'updateExpense', [initial.id, { ...payload, expectedRevision: initial.revision || 1 }]);
      else await saveShared(me.id, 'createExpense', [{ ...payload, idempotencyKey: key }]);
      done();
    } catch (cause) { setError([cause.message, ...Object.values(cause.fieldErrors || {})].join(' ')); }
    finally { setBusy(false); }
  };
  const upload = async (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1000000) { setError('Choose a PNG, JPEG or WebP receipt under 1 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => setReceipt({ name: file.name, data: reader.result }); reader.readAsDataURL(file);
  };
  return <Modal open onClose={close} title={initial ? 'Edit expense' : refundOf ? 'Record refund' : 'Add expense'} size="lg" subtitle="Your budget counts your own share. Payments are tracked separately." footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button type="submit" form="shared-expense" disabled={!validation.ok || !date} busy={busy}>Save expense</Button></>}>
    <form id="shared-expense" onSubmit={save} className="shared-form">
      <Field label="Friend or group"><select value={contextId} disabled={Boolean(initial || refundOf)} onChange={(e) => switchContext(e.target.value)}>{contexts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
      <Field label="Description"><input data-autofocus required maxLength={120} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Dinner, hotel, groceries…" /></Field>
      <div className="form-grid"><Field label="Amount"><input type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Currency"><select disabled={Boolean(refundOf)} value={currency} onChange={(e) => setCurrency(e.target.value)}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</select></Field></div>
      <div className="form-grid"><Field label="Date"><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field><Field label="Category"><select value={category} onChange={(e) => setCategory(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field></div>
      <label><input type="checkbox" checked={multiple} onChange={(e) => { setMultiple(e.target.checked); setPaid({ [payer]: amount }); }} />Multiple payers</label>
      {!multiple && <Field label={refundOf ? 'Who received the refund?' : 'Who paid?'}><select value={payer} onChange={(e) => setPayer(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.id === me.id ? 'You' : m.name}</option>)}</select></Field>}
      <Field label="Split method"><select value={method} onChange={(e) => { setMethod(e.target.value); setDetails({}); }}>{['equal', 'exact', 'percentage', 'shares', 'adjustment', 'itemized'].map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</select></Field>
      {method === 'adjustment' && <p className="text-xs text-slate-500">Reserve each adjustment first, then split the remainder equally. A +200 adjustment on a 1,000 bill gives shares of 400 and 600.</p>}
      <div className="shared-split-scroll" role="region" aria-label="Participant split breakdown" tabIndex={0}><table><thead><tr><th>Included</th>{multiple && <th>Paid</th>}{!['equal', 'itemized'].includes(method) && <th>{method === 'percentage' ? 'Percent' : method === 'shares' ? 'Weight' : 'Amount'}</th>}<th>Owed share</th><th>Net</th></tr></thead><tbody>{members.map((m) => {
        const share = shares.find((s) => s.memberId === m.id); const included = participants.includes(m.id);
        return <tr key={m.id}><td><label><input type="checkbox" checked={included} onChange={(e) => setParticipants(e.target.checked ? [...participants, m.id] : participants.filter((id) => id !== m.id))} />{m.id === me.id ? 'You' : m.name}</label></td>
          {multiple && <td><input aria-label={`Paid by ${m.name}`} type="number" min="0" step="0.01" value={paid[m.id] || ''} onChange={(e) => setPaid({ ...paid, [m.id]: e.target.value })} /></td>}
          {!['equal', 'itemized'].includes(method) && <td><input aria-label={`${method} for ${m.name}`} disabled={!included} type="number" step="0.01" min={method === 'adjustment' ? undefined : '0'} value={details[m.id] ?? (method === 'shares' ? 1 : '')} onChange={(e) => setDetails({ ...details, [m.id]: e.target.value })} /></td>}
          <td>{formatMoney(share?.owedShare || 0, currency)}</td><td className={(share?.netShare || 0) < 0 ? 'shared-negative' : 'shared-positive'}>{formatMoney(share?.netShare || 0, currency)}</td></tr>;
      })}</tbody></table></div>
      {method === 'itemized' && <ItemEditor details={details} setDetails={setDetails} members={members.filter((m) => participants.includes(m.id))} />}
      <div aria-live="polite" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900">Your budget contribution: <b>{formatMoney(shares.find((s) => s.memberId === me.id)?.owedShare || 0, currency)}</b>. Positive net means owed to that person; negative means they owe.</div>
      {Number(amount) > 0 && Object.entries(validation.errors).filter(([field]) => field !== 'description').map(([field, message]) => <p role="status" className="text-xs text-orange-700" key={field}>{message}</p>)}
      <Field label="Notes"><textarea maxLength={500} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {!refundOf && <div className="form-grid"><Field label="Repeat"><select value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="">Does not repeat</option>{['weekly', 'fortnightly', 'monthly', 'yearly'].map((f) => <option key={f}>{f}</option>)}</select></Field>{frequency && <Field label="Repeat until (optional)"><input type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></Field>}</div>}
      <Field label="Receipt image (optional, under 1 MB)"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files[0])} /></Field>
      {receipt && <div><img src={receipt.data} alt="Attached receipt" className="max-h-48 rounded" /><button type="button" onClick={() => setReceipt(null)}>Remove receipt</button></div>}
      {error && <Banner variant="error">{error}</Banner>}
    </form>
  </Modal>;
}

function ItemEditor({ details, setDetails, members }) {
  const items = details.items || [];
  const update = (index, patch) => setDetails({ ...details, items: items.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <fieldset className="space-y-3"><legend className="font-bold">Items · tax and tip follow item subtotals</legend>{items.map((item, i) => <div key={i} className="rounded border p-2"><div className="form-grid"><Field label={`Item ${i + 1}`}><input value={item.name} onChange={(e) => update(i, { name: e.target.value })} /></Field><Field label={`Item ${i + 1} amount`}><input type="number" step="0.01" min="0.01" value={item.amount} onChange={(e) => update(i, { amount: Number(e.target.value) })} /></Field></div>{members.map((m) => <label key={m.id} className="mr-3"><input type="checkbox" checked={item.memberIds.includes(m.id)} onChange={(e) => update(i, { memberIds: e.target.checked ? [...item.memberIds, m.id] : item.memberIds.filter((id) => id !== m.id) })} />{m.name}</label>)}<button type="button" className="text-orange-700" onClick={() => setDetails({ ...details, items: items.filter((_, n) => n !== i) })}>Remove item</button></div>)}<Button variant="secondary" onClick={() => setDetails({ ...details, items: [...items, { name: '', amount: '', memberIds: members.map((m) => m.id) }] })}>Add item</Button><div className="form-grid">{['tax', 'tip'].map((key) => <Field key={key} label={key === 'tax' ? 'Tax' : 'Tip'}><input type="number" min="0" step="0.01" value={details[key] || ''} onChange={(e) => setDetails({ ...details, [key]: Number(e.target.value) })} /></Field>)}</div></fieldset>;
}
