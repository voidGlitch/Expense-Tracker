/** Shared ledger authorization and response helpers. */
import { contactIdFromParticipantId, groupRole, isContactParticipantId, isGroupMember } from '@expense/shared';
import { forbidden, notFound } from '../util/http.js';
import { requireFriendshipMember } from './friends.routes.js';

export async function ledgerContext(repo, contextType, contextId, userId) {
  if (contextType === 'friendship') {
    const friendship = await requireFriendshipMember(repo, contextId, userId);
    return { type: 'friendship', id: friendship.id, entity: friendship, memberIds: [friendship.userA, friendship.userB], isOwner: false };
  }
  if (contextType === 'group') {
    const group = await repo.findGroupById(contextId);
    if (!group) throw notFound('Group not found.');
    if (!isGroupMember(group, userId)) throw forbidden('You do not have access to this group.');
    return { type: 'group', id: group.id, entity: group, memberIds: group.members.map((member) => member.participantId || member.userId), isOwner: groupRole(group, userId) === 'owner' };
  }
  throw notFound('Expense ledger not found.');
}

export async function ledgerRows(repo, context) {
  const [expenses, settlements] = await Promise.all([
    repo.listExpenses({ contextType: context.type, contextId: context.id }),
    repo.listSettlements({ contextType: context.type, contextId: context.id }),
  ]);
  return { expenses, settlements };
}

export async function namedMembers(repo, memberIds) {
  return Promise.all(memberIds.map(async (id) => {
    if (isContactParticipantId(id)) {
      const contact = await repo.findContactById?.(contactIdFromParticipantId(id));
      if (contact) return { id, userId: null, contactId: contact.id, name: contact.name, email: contact.email || '', phone: contact.phone || '', isGuest: !contact.linkedUserId, linkedUserId: contact.linkedUserId || null };
    }
    const user = await repo.findUserById(id);
    return user ? repo.publicUser(user) : { id, name: 'Unknown member', email: '' };
  }));
}
