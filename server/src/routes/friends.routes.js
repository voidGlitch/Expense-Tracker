/** Friend requests and the resulting two-party financial relationship. */
import { Router } from 'express';
import { z } from 'zod';
import {
  FRIEND_REQUEST_STATUS,
  contactIdFromParticipantId,
  isContactParticipantId,
  friendshipIncludes,
  friendshipOther,
  validateFriendRequest,
  makeContact,
  validateContact,
} from '@expense/shared';
import { badRequest, forbidden, notFound } from '../util/http.js';

const requestSchema = z.object({
  userId: z.string().trim().min(1),
  message: z.string().trim().max(200).optional().default(''),
});
const contactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254).optional().default(''),
  phone: z.string().trim().max(32).optional().default(''),
});

async function publicUser(repo, id) {
  if (isContactParticipantId(id)) {
    const contact = await repo.findContactById?.(contactIdFromParticipantId(id));
    return contact ? {
      id: contact.participantId || id,
      userId: null,
      contactId: contact.id,
      email: contact.email || '',
      phone: contact.phone || '',
      name: contact.name,
      isGuest: !contact.linkedUserId,
      linkedUserId: contact.linkedUserId || null,
    } : null;
  }
  const user = await repo.findUserById(id);
  return user ? repo.publicUser(user) : null;
}

async function requireFriendshipMember(repo, friendshipId, userId) {
  const friendship = await repo.findFriendshipById(friendshipId);
  if (!friendship) throw notFound('Friendship not found.');
  if (!friendshipIncludes(friendship, userId)) throw forbidden('You do not have access to this friendship.');
  return friendship;
}

export function friendsRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const [friendships, requests, contacts] = await Promise.all([
        req.repo.listFriendships(req.user.id),
        req.repo.listFriendRequests(req.user.id),
        req.repo.listContacts(req.user.id),
      ]);
      const friends = await Promise.all(friendships.map(async (friendship) => ({
        ...friendship,
        user: await publicUser(req.repo, friendshipOther(friendship, req.user.id)),
      })));
      const incoming = await Promise.all(requests
        .filter((request) => request.status === FRIEND_REQUEST_STATUS.PENDING && request.toUserId === req.user.id)
        .map(async (request) => ({ ...request, fromUser: await publicUser(req.repo, request.fromUserId) })));
      const outgoing = await Promise.all(requests
        .filter((request) => request.status === FRIEND_REQUEST_STATUS.PENDING && request.fromUserId === req.user.id)
        .map(async (request) => ({ ...request, toUser: await publicUser(req.repo, request.toUserId) })));
      const friendshipContactIds = new Set(friends.map((friend) => friend.user?.contactId).filter(Boolean));
      res.json({ friends, incoming, outgoing, contacts: contacts.filter((contact) => !friendshipContactIds.has(contact.id)) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/contacts', async (req, res, next) => {
    try {
      const parsed = contactSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the contact details.');
      const contact = makeContact({ ...parsed.data, ownerUserId: req.user.id });
      const valid = validateContact(contact);
      if (!valid.ok) throw badRequest('Please check the contact details.', { fieldErrors: valid.errors });
      if (contact.email && contact.email === req.user.email.toLowerCase()) throw badRequest('You cannot add yourself as a contact.');
      const saved = await req.repo.createContact(contact);
      // If the person already registered but was not found by the user search,
      // link immediately instead of waiting for another registration.
      const registered = saved.email ? await req.repo.findUserByEmail(saved.email) : null;
      if (registered && registered.id !== req.user.id) await req.repo.claimContactsForUser(registered);
      const refreshed = await req.repo.findContactById?.(saved.id);
      res.status(201).json({ contact: refreshed || saved });
    } catch (error) { next(error); }
  });

  router.post('/request', async (req, res, next) => {
    try {
      const parsed = requestSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please choose a valid user.');
      const toUserId = parsed.data.userId;
      if (toUserId === req.user.id) throw badRequest('You cannot add yourself as a friend.');
      if (!(await req.repo.findUserById(toUserId))) throw notFound('That user no longer exists.');
      if (await req.repo.findFriendshipBetween(req.user.id, toUserId)) {
        throw badRequest('You are already friends with this person.');
      }
      if (await req.repo.findPendingRequest(req.user.id, toUserId)) {
        throw badRequest('You have already sent a friend request to this person.');
      }
      if (await req.repo.findPendingRequest(toUserId, req.user.id)) {
        throw badRequest('This person has already sent you a friend request. Accept it from your requests list.');
      }
      const candidate = {
        fromUserId: req.user.id,
        toUserId,
        message: parsed.data.message,
      };
      const valid = validateFriendRequest(candidate);
      if (!valid.ok) throw badRequest('Please check the friend request.', { fieldErrors: valid.errors });
      const request = await req.repo.createFriendRequest(candidate);
      res.status(201).json({ request });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/accept', async (req, res, next) => {
    try {
      const request = await req.repo.findFriendRequestById(req.params.id);
      if (!request) throw notFound('Friend request not found.');
      if (request.toUserId !== req.user.id) throw forbidden('Only the recipient can accept this request.');
      if (request.status !== FRIEND_REQUEST_STATUS.PENDING) throw badRequest('This friend request has already been handled.');
      const updated = await req.repo.updateFriendRequest(request.id, {
        status: FRIEND_REQUEST_STATUS.ACCEPTED,
        respondedAt: new Date().toISOString(),
      });
      const friendship = await req.repo.createFriendship(updated.fromUserId, updated.toUserId);
      res.json({ request: updated, friendship });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/reject', async (req, res, next) => {
    try {
      const request = await req.repo.findFriendRequestById(req.params.id);
      if (!request) throw notFound('Friend request not found.');
      if (request.toUserId !== req.user.id) throw forbidden('Only the recipient can reject this request.');
      if (request.status !== FRIEND_REQUEST_STATUS.PENDING) throw badRequest('This friend request has already been handled.');
      const updated = await req.repo.updateFriendRequest(request.id, {
        status: FRIEND_REQUEST_STATUS.REJECTED,
        respondedAt: new Date().toISOString(),
      });
      res.json({ request: updated });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      await requireFriendshipMember(req.repo, req.params.id, req.user.id);
      await req.repo.deleteFriendship(req.params.id);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export { requireFriendshipMember };
