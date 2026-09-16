/** Group management. Expenses/balances are deliberately added in later phases. */
import { Router } from 'express';
import { z } from 'zod';
import {
  addGroupMember,
  groupRole,
  isGroupMember,
  makeGroup,
  removeGroupMember,
  validateGroup,
} from '@expense/shared';
import { badRequest, forbidden, notFound } from '../util/http.js';

const groupInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional().default(''),
  icon: z.string().trim().max(8).nullable().optional(),
  currency: z.string().trim().optional().default('INR'),
  memberIds: z.array(z.string().trim().min(1)).max(50).optional().default([]),
  simplifyDebts: z.boolean().optional().default(true),
});
const groupPatch = groupInput.pick({ name: true, description: true, icon: true, currency: true, simplifyDebts: true }).partial();
const memberInput = z.object({ userId: z.string().trim().min(1) });

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
    user: await reqPublicUser(repo, member.userId),
  })));
  return { ...group, members };
}

async function reqPublicUser(repo, id) {
  const user = await repo.findUserById(id);
  return user ? repo.publicUser(user) : null;
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
      const existing = await Promise.all(ids.map((id) => req.repo.findUserById(id)));
      if (existing.some((user) => !user)) throw badRequest('One or more selected members no longer exist.');
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
      if (!(await req.repo.findUserById(parsed.data.userId))) throw notFound('That user no longer exists.');
      if (isGroupMember(group, parsed.data.userId)) throw badRequest('That person is already in the group.');
      res.status(201).json({ group: await withMembers(req.repo, await req.repo.updateGroup(group.id, addGroupMember(group, parsed.data.userId))) });
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
