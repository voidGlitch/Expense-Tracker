import { useEffect, useState } from 'react';
import { CURRENCIES } from '@expense/shared';
import { api } from '../../lib/api.js';
import { Modal } from '../../components/Modal.jsx';
import { Banner, Button } from '../../components/ui.jsx';
import { Field } from './ExpenseDialog.jsx';

export function FriendDialog({ context, close, done }) {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [results, setResults] = useState([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(async () => { if (email.length < 2) return setResults([]); try { const result = await api.searchUsers(email); if (!ignore) setResults(result.users || []); } catch { if (!ignore) setResults([]); } }, 250);
    return () => { ignore = true; clearTimeout(timer); };
  }, [email]);
  const save = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { if (context) await api.addGroupMember(context.id, { name, email, phone }); else await api.createContact({ name, email, phone }); done(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <Modal open onClose={close} title={context ? 'Add group member' : 'Add friend'} subtitle="An existing email uses their registered account. A guest links automatically when that email registers." footer={<Button type="submit" form="shared-friend" busy={busy} disabled={!name.trim()}>Add {context ? 'member' : 'friend'}</Button>}><form id="shared-friend" className="shared-form" onSubmit={save}>
    <Field label="Search or enter email"><input data-autofocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" /></Field>
    {results.map((person) => <button key={person.id} type="button" className="rounded border p-2 text-left" onClick={() => { setName(person.name); setEmail(person.email); setResults([]); }}>{person.name} · {person.email}<small className="block">Registered account</small></button>)}
    <Field label="Name"><input required value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field><Field label="Phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
    {!email && <p className="text-xs text-slate-500">Without an email this guest cannot be automatically linked to an account.</p>}{error && <Banner variant="error">{error}</Banner>}
  </form></Modal>;
}

export function GroupDialog({ context, friends = [], me, close, done, addMember }) {
  const group = context?.entity;
  const [name, setName] = useState(group?.name || ''); const [currency, setCurrency] = useState(group?.currency || 'INR');
  const [simplify, setSimplify] = useState(group?.settings?.simplifyDebts !== false); const [selected, setSelected] = useState([]);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const owner = !group || group.createdBy === me.id;
  const run = async (action) => { setBusy(true); setError(''); try { await action(); done(); } catch (cause) { setError(cause.message); } finally { setBusy(false); } };
  return <Modal open onClose={close} title={group ? 'Group settings' : 'Add group'} footer={owner && <Button type="submit" form="shared-group" busy={busy} disabled={!name.trim()}>Save group</Button>}><form id="shared-group" className="shared-form" onSubmit={(e) => { e.preventDefault(); run(() => group ? api.updateGroup(group.id, { name, currency, simplifyDebts: simplify }) : api.createGroup({ name, currency, simplifyDebts: simplify, memberIds: selected })); }}>
    <Field label="Group name"><input data-autofocus required maxLength={60} disabled={!owner} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="Default currency"><select disabled={!owner} value={currency} onChange={(e) => setCurrency(e.target.value)}>{Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}</select></Field><p className="text-xs text-slate-500">Changing the default only affects new expenses. Existing currencies stay separate.</p>
    <label><input type="checkbox" disabled={!owner} checked={simplify} onChange={(e) => setSimplify(e.target.checked)} />Simplify debts while preserving everyone’s net balance</label>
    {!group && <fieldset><legend className="mb-2 font-bold">Members</legend>{friends.map((friend) => <label className="block py-1" key={friend.id}><input type="checkbox" checked={selected.includes(friend.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, friend.id] : selected.filter((id) => id !== friend.id))} />{friend.user?.name}</label>)}</fieldset>}
    {group && <><div><h3 className="font-bold">Members</h3>{context.members.filter((m) => context.memberIds.includes(m.id)).map((m) => <div className="flex justify-between py-2" key={m.id}><span>{m.name}{m.id === group.createdBy ? ' · owner' : ''}</span>{m.id !== group.createdBy && (owner || m.id === me.id) && <button type="button" disabled={busy} className="text-orange-700" onClick={() => run(() => api.removeGroupMember(group.id, m.id))}>{m.id === me.id ? 'Leave group' : 'Remove'}</button>}</div>)}{owner && <Button variant="secondary" onClick={addMember}>Add member</Button>}</div><p className="text-xs text-slate-500">A member must settle balances in every currency before leaving. Expense history is retained.</p><Button variant="secondary" onClick={() => api.downloadSharedCsv('group', group.id).catch((e) => setError(e.message))}>Export CSV</Button>{owner && <Button variant="secondary" busy={busy} onClick={() => run(() => api.updateGroup(group.id, { archived: !group.archivedAt }))}>{group.archivedAt ? 'Unarchive group' : 'Archive group'}</Button>}</>}
    {error && <Banner variant="error">{error}</Banner>}
  </form></Modal>;
}
