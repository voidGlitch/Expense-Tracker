import { useState } from 'react';
import { participantShares } from '@expense/shared';
import { Modal } from '../../components/Modal.jsx';
import { Button, Banner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatMoney } from '../../lib/money.js';
import { Field } from './ExpenseDialog.jsx';

export default function TransactionDetail({ row, context, contexts, me, close, done, edit, refund }) {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const [comment, setComment] = useState('');
  const payment = row.entryType === 'payment';
  const members = contexts.flatMap((c) => c.members);
  const name = (id) => members.find((m) => m.id === id)?.name || 'Former member';
  const permitted = !context?.readOnly && (payment ? row.fromUserId === me.id || row.toUserId === me.id : row.createdBy === me.id || context?.entity?.createdBy === me.id);
  const run = async (action) => { setBusy(true); setError(''); try { await action(); done(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  const legs = row.batchId ? contexts.flatMap((c) => c.settlements.filter((s) => s.batchId === row.batchId).map((s) => ({ ...s, title: c.title }))) : [];
  return <Modal open onClose={close} title={payment ? 'Payment details' : row.description} size="lg" footer={permitted && <div className="flex flex-wrap gap-2">
    {!row.deletedAt && !row.batchId && <Button variant="secondary" onClick={() => edit(row)}>Edit</Button>}
    {!row.deletedAt && !payment && row.kind !== 'refund' && <Button variant="secondary" onClick={() => refund(row)}>Record refund</Button>}
    {!row.deletedAt && <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete {payment ? 'payment' : 'expense'}</Button>}
    {row.deletedAt && !payment && <Button busy={busy} onClick={() => run(() => api.restoreExpense(row.id, { expectedRevision: row.revision || 1 }))}>Restore expense</Button>}
  </div>}>
    <div className="shared-form"><p className="text-2xl font-bold">{formatMoney(row.cashAmount ?? row.amount, row.currency)}</p><p>{context?.title || 'Shared ledger'} · {row.date} · {payment ? row.method : row.category}{row.deletedAt ? ' · Deleted' : ''}</p>
      {payment ? <><p><b>{name(row.fromUserId)}</b> paid <b>{name(row.toUserId)}</b>.</p><p>This repayment does not change anyone’s personal spending or income.</p>{legs.length > 0 && <div><h3 className="font-bold">Scope allocations</h3>{legs.map((leg) => <p key={leg.id}>{leg.title}: {name(leg.fromUserId)} → {name(leg.toUserId)} {formatMoney(leg.amount, row.currency)}</p>)}<p className="text-xs">Deleting this batch restores all listed balances together.</p></div>}</> : <table><thead><tr><th>Participant</th><th>Paid share</th><th>Owed share</th><th>Net</th></tr></thead><tbody>{participantShares(row).map((share) => <tr key={share.memberId}><td>{name(share.memberId)}</td><td>{formatMoney(share.paidShare, row.currency)}</td><td>{formatMoney(share.owedShare, row.currency)}</td><td>{formatMoney(share.netShare, row.currency)}</td></tr>)}</tbody></table>}
      {(row.notes || row.note) && <p className="whitespace-pre-wrap">{row.notes || row.note}</p>}{row.receipt && <figure><img alt={row.receipt.name || 'Expense receipt'} src={row.receipt.data} className="max-h-96 rounded object-contain" /><figcaption>{row.receipt.name}</figcaption></figure>}
      {row.recurrence && <div><p>Repeats {row.recurrence.frequency}{row.recurrence.endDate ? ` until ${row.recurrence.endDate}` : ''}. Past occurrences remain independent.</p>{permitted && row.recurrence.active && <Button variant="secondary" busy={busy} onClick={() => run(() => api.generateOccurrences(row.id))}>Generate due expenses</Button>}</div>}
      {confirmDelete && <div className="rounded border border-orange-300 p-3"><p>{payment ? 'Remove this payment and restore the outstanding balance?' : 'Delete this expense and recalculate all shares? Existing payments remain and may create a reverse balance.'}</p><div className="mt-2 flex gap-2"><Button variant="danger" busy={busy} onClick={() => run(() => payment ? api.deleteSettlement(row.batchId || row.id, { expectedRevision: row.revision || 1 }) : api.deleteExpense(row.id, { expectedRevision: row.revision || 1 }))}>Confirm delete</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep it</Button></div></div>}
      {!payment && <section><h3 className="mb-2 font-bold">Comments</h3>{(row.comments || []).map((c) => <p key={c.id} className="mb-2 rounded border p-2"><b>{name(c.userId)}</b> <small>{c.at.slice(0, 10)}</small><span className="block whitespace-pre-wrap">{c.text}</span></p>)}{!row.deletedAt && <><Field label="Add a comment"><textarea maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} /></Field><Button className="mt-2" variant="secondary" busy={busy} disabled={!comment.trim()} onClick={() => run(() => api.commentOnExpense(row.id, { text: comment, idempotencyKey: crypto.randomUUID() }))}>Post comment</Button></>}</section>}
      <section><h3 className="font-bold">Activity</h3>{(row.activity || [{ action: 'created', userId: row.createdBy, at: row.createdAt }]).map((event, i) => <p key={i} className="py-1 text-xs text-slate-500">{name(event.userId)} · {event.action} · {event.at?.replace('T', ' ').slice(0, 19)}</p>)}</section>{error && <Banner variant="error">{error}</Banner>}
    </div>
  </Modal>;
}
