/** Group management. Expenses/balances are deliberately added in later phases. */
import { Router } from 'express';
import { z } from 'zod';
import {
  addGroupMember,
  contactIdFromParticipantId,
  isContactParticipantId,
  groupRole,
  isGroupMember,
  makeContact,
  makeGroup,
  removeGroupMember,
  validateContact,
  validateGroup,
  netBalancesObject,
  pairwiseBalances,
  simplifyDebts,
  totalsPerCurrency,
} from '@expense/shared';
import { badRequest, forbidden, notFound } from '../util/http.js';
import { ledgerRows, namedMembers } from './ledger.js';

const groupInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional().default(''),
  icon: z.string().trim().max(8).nullable().optional(),
  currency: z.string().trim().optional().default('INR'),
  memberIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  simplifyDebts: z.boolean().optional().default(true),
});
const groupPatch = groupInput.pick({ name: true, description: true, icon: true, currency: true, simplifyDebts: true }).partial();
const memberInput = z.object({
  userId: z.string().trim().min(1).optional(),
  contactId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().max(254).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
}).refine((value) => value.userId || value.contactId || value.name, 'Choose or create a member.');

async function requireGroupMember(repo, id, userId) {
  const group = await repo.findGroupById(id);
  if (!group) throw notFound('Group not found.');
  if (!isGroupMember(group, userId)) throw forbidden('You do not have access to this group.');
  return group;
}

async function requireGroupOwner(repo, id, userId) {
  const group = await requireGroupMember(repo, id, userId);
  if (groupRole(group, userId) !== 'owner') throw forbidden('Only the group owner can change group settings or members.');
  return group;
}

async function withMembers(repo, group) {
  const members = await Promise.all((group.members || []).map(async (member) => ({
    ...member,
    user: await reqPublicUser(repo, member.participantId || member.userId),
  })));
  return { ...group, members };
}

async function reqPublicUser(repo, id) {
  if (isContactParticipantId(id)) {
    const contact = await repo.findContactById?.(contactIdFromParticipantId(id));
    if (contact) return { id, userId: null, contactId: contact.id, name: contact.name, email: contact.email || '', phone: contact.phone || '', isGuest: !contact.linkedUserId, linkedUserId: contact.linkedUserId || null };
  }
  const user = await repo.findUserById(id);
  return user ? repo.publicUser(user) : null;
}

async function resolveMemberId(repo, ownerUser, input) {
  if (input.userId) {
    if (await repo.findUserById(input.userId)) return input.userId;
    if (isContactParticipantId(input.userId) && await repo.findContactById?.(contactIdFromParticipantId(input.userId))) return input.userId;
    throw notFound('That member no longer exists.');
  }
  if (input.contactId) {
    const contact = await repo.findContactById?.(input.contactId);
    if (!contact || contact.ownerUserId !== ownerUser.id) throw notFound('That contact no longer exists.');
    return contact.linkedUserId || contact.participantId;
  }
  const contact = makeContact({ ownerUserId: ownerUser.id, name: input.name, email: input.email, phone: input.phone });
  const valid = validateContact(contact);
  if (!valid.ok) throw badRequest('Please check the member details.', { fieldErrors: valid.errors });
  if (contact.email && contact.email === ownerUser.email.toLowerCase()) throw badRequest('You cannot add yourself as a guest member.');
  const saved = await repo.createContact(contact);
  const registered = saved.email ? await repo.findUserByEmail(saved.email) : null;
  if (registered && registered.id !== ownerUser.id) {
    await repo.claimContactsForUser(registered);
    return registered.id;
  }
  return saved.participantId;
}

export function groupsRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const groups = await req.repo.listGroups(req.user.id);
      res.json({ groups: await Promise.all(groups.map((group) => withMembers(req.repo, group))) });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = groupInput.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.');
      const ids = [...new Set([req.user.id, ...parsed.data.memberIds])];
      const existing = await Promise.all(ids.map((id) => isContactParticipantId(id) ? req.repo.findContactById?.(contactIdFromParticipantId(id)) : req.repo.findUserById(id)));
      if (existing.some((row) => !row)) throw badRequest('One or more selected members no longer exist.');
      const group = makeGroup({
        ...parsed.data,
        createdBy: req.user.id,
        members: ids,
        settings: { simplifyDebts: parsed.data.simplifyDebts },
      });
      const valid = validateGroup(group);
      if (!valid.ok) throw badRequest('Please check the highlighted fields.', { fieldErrors: valid.errors });
      res.status(201).json({ group: await withMembers(req.repo, await req.repo.createGroup(group)) });
    } catch (error) { next(error); }
  });

  router.get('/:id', async (req, res, next) => {
    try { res.json({ group: await withMembers(req.repo, await requireGroupMember(req.repo, req.params.id, req.user.id)) }); }
    catch (error) { next(error); }
  });

  router.get('/:id/expenses', async (req, res, next) => {
    try {
      const group = await requireGroupMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'group', id: group.id });
      res.json({ ...rows, members: await namedMembers(req.repo, group.members.map((member) => member.participantId || member.userId)) });
    } catch (error) { next(error); }
  });

  router.get('/:id/balances', async (req, res, next) => {
    try {
      const group = await requireGroupMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'group', id: group.id });
      const currencies = [...new Set([...rows.expenses, ...rows.settlements].map((row) => row.currency || group.currency))];
      const balances = Object.fromEntries(currencies.map((currency) => [currency, netBalancesObject(rows.expenses.filter((row) => row.currency === currency), rows.settlements.filter((row) => row.currency === currency))]));
      const debts = Object.fromEntries(currencies.map((currency) => [currency, pairwiseBalances(rows.expenses.filter((row) => row.currency === currency), rows.settlements.filter((row) => row.currency === currency))]));
      res.json({ balances, debts, members: await namedMembers(req.repo, group.members.map((member) => member.participantId || member.userId)) });
    } catch (error) { next(error); }
  });

  router.get('/:id/totals', async (req, res, next) => {
    try {
      const group = await requireGroupMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'group', id: group.id });
      res.json({ totals: totalsPerCurrency(rows.expenses, req.user.id), expenseCount: rows.expenses.length, settlementCount: rows.settlements.length });
    } catch (error) { next(error); }
  });

  router.get('/:id/settlement-plan', async (req, res, next) => {
    try {
      const group = await requireGroupMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'group', id: group.id });
      const currencies = [...new Set([...rows.expenses, ...rows.settlements].map((row) => row.currency || group.currency))];
      const plan = Object.fromEntries(currencies.map((currency) => [currency, simplifyDebts(netBalancesObject(rows.expenses.filter((row) => row.currency === currency), rows.settlements.filter((row) => row.currency === currency)))]));
      res.json({ plan, simplifyDebts: group.settings?.simplifyDebts !== false });
    } catch (error) { next(error); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const current = await requireGroupOwner(req.repo, req.params.id, req.user.id);
      const parsed = groupPatch.safeParse(req.body ?? {});
      if (!parsed.success || Object.keys(parsed.data).length === 0) throw badRequest('Please provide valid group changes.');
      const candidate = makeGroup({
        ...current,
        ...parsed.data,
        settings: { ...current.settings, ...(parsed.data.simplifyDebts === undefined ? {} : { simplifyDebts: parsed.data.simplifyDebts }) },
      });
      const valid = validateGroup(candidate);
      if (!valid.ok) throw badRequest('Please check the highlighted fields.', { fieldErrors: valid.errors });
      res.json({ group: await withMembers(req.repo, await req.repo.updateGroup(current.id, candidate)) });
    } catch (error) { next(error); }
  });

  router.delete('/:id', async (req, res, next) => {
    try { await requireGroupOwner(req.repo, req.params.id, req.user.id); await req.repo.deleteGroup(req.params.id); res.status(204).end(); }
    catch (error) { next(error); }
  });

  router.post('/:id/members', async (req, res, next) => {
    try {
      const group = await requireGroupOwner(req.repo, req.params.id, req.user.id);
      const parsed = memberInput.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please choose a valid user.');
      const memberId = await resolveMemberId(req.repo, req.user, parsed.data);
      if (isGroupMember(group, memberId)) throw badRequest('That person is already in the group.');
      res.status(201).json({ group: await withMembers(req.repo, await req.repo.updateGroup(group.id, addGroupMember(group, memberId))) });
    } catch (error) { next(error); }
  });

  router.delete('/:id/members/:userId', async (req, res, next) => {
    try {
      const group = await requireGroupOwner(req.repo, req.params.id, req.user.id);
      if (req.params.userId === req.user.id) throw badRequest('The owner cannot leave a group. Delete the group instead.');
      if (!isGroupMember(group, req.params.userId)) throw notFound('That person is not in this group.');
      res.json({ group: await withMembers(req.repo, await req.repo.updateGroup(group.id, removeGroupMember(group, req.params.userId))) });
    } catch (error) { next(error); }
  });

  return router;
}

export { requireGroupMember, requireGroupOwner };
