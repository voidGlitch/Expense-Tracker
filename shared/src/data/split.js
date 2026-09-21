/**
 * Shared-expense domain entities — friendships, friend requests, groups and
 * group members.
 *
 * These are the *social* half of a Splitwise-style app: who is allowed to see
 * whose expenses. Unlike the per-user budget document in `schema.js`, they live
 * in server-owned collections, because both people in a friendship read the
 * same row.
 *
 * Pure factories and validators: no storage, no DOM, no network, so the API
 * writes and the client previews under identical rules.
 */
import { CURRENCIES, FRIEND_REQUEST_STATUS, GROUP_ROLE } from './config.js';
import { makeId } from './schema.js';

const text = (value, max) => String(value ?? '').trim().slice(0, max);

const nowIso = (value) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

/* ---------------------------------------------------------------------------
 * Friendships
 * ------------------------------------------------------------------------- */

/** A friendship is stored once, keyed by its two members in a stable order. */
export function friendPair(a, b) {
  return [String(a), String(b)].sort();
}

export function contactParticipantId(contactId) {
  return `contact:${String(contactId)}`;
}

export function isContactParticipantId(id) {
  return String(id || '').startsWith('contact:');
}

export function contactIdFromParticipantId(id) {
  return isContactParticipantId(id) ? String(id).slice('contact:'.length) : null;
}

export function friendshipIncludes(friendship, userId) {
  const key = String(userId);
  return friendship.userA === key || friendship.userB === key;
}

/** The other side of a friendship, or null when `userId` is not in it. */
export function friendshipOther(friendship, userId) {
  const key = String(userId);
  if (friendship.userA === key) return friendship.userB;
  if (friendship.userB === key) return friendship.userA;
  return null;
}

export function makeFriendship(userA, userB, partial = {}) {
  const [a, b] = friendPair(userA, userB);
  return {
    id: partial.id || makeId('frd'),
    userA: a,
    userB: b,
    createdAt: nowIso(partial.createdAt),
  };
}

/* ---------------------------------------------------------------------------
 * Friend requests
 * ------------------------------------------------------------------------- */

export function makeFriendRequest(partial = {}) {
  return {
    id: partial.id || makeId('frq'),
    fromUserId: String(partial.fromUserId || ''),
    toUserId: String(partial.toUserId || ''),
    status: partial.status || FRIEND_REQUEST_STATUS.PENDING,
    message: text(partial.message, 200),
    createdAt: nowIso(partial.createdAt),
    respondedAt: partial.respondedAt ? nowIso(partial.respondedAt) : null,
  };
}

export function validateFriendRequest(request) {
  const errors = {};
  if (!request.fromUserId) errors.fromUserId = 'A request needs a sender.';
  if (!request.toUserId) errors.toUserId = 'A request needs a recipient.';
  if (request.fromUserId && request.fromUserId === request.toUserId) {
    errors.toUserId = 'You cannot add yourself as a friend.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/* ---------------------------------------------------------------------------
 * Contacts
 * ------------------------------------------------------------------------- */

/**
 * A private contact can exist before that person creates an account. An email,
 * when provided, is the opt-in linking key used at registration; it is never
 * exposed by public user search.
 */
export function makeContact(partial = {}) {
  const email = text(partial.email, 254).toLowerCase();
  const id = partial.id || makeId('cnt');
  return {
    id,
    participantId: partial.participantId || contactParticipantId(id),
    ownerUserId: String(partial.ownerUserId || ''),
    name: text(partial.name, 80),
    email: email || null,
    phone: text(partial.phone, 32) || null,
    userId: null,
    linkedUserId: partial.linkedUserId ? String(partial.linkedUserId) : null,
    createdAt: nowIso(partial.createdAt),
    updatedAt: nowIso(partial.updatedAt || partial.createdAt),
  };
}

export function validateContact(contact) {
  const errors = {};
  if (!contact.ownerUserId) errors.ownerUserId = 'A contact needs an owner.';
  if (!contact.name) errors.name = 'Enter your friend’s name.';
  if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    errors.email = 'Enter a valid email address or leave it blank.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

/* ---------------------------------------------------------------------------
 * Groups
 * ------------------------------------------------------------------------- */

export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 240;

export function makeGroupMember(userId, role = GROUP_ROLE.MEMBER, partial = {}) {
  const participantId = partial.participantId || String(userId);
  return {
    userId: partial.userId === null ? null : String(userId),
    participantId,
    role: role === GROUP_ROLE.OWNER ? GROUP_ROLE.OWNER : GROUP_ROLE.MEMBER,
    joinedAt: nowIso(partial.joinedAt),
  };
}

export function makeGroup(partial = {}) {
  const createdBy = String(partial.createdBy || '');
  const members = (Array.isArray(partial.members) ? partial.members : [])
    .map((member) => (typeof member === 'string'
      ? makeGroupMember(member, member === createdBy ? GROUP_ROLE.OWNER : GROUP_ROLE.MEMBER)
      : makeGroupMember(member.userId ?? member.participantId, member.role, member)));

  return {
    id: partial.id || makeId('grp'),
    name: text(partial.name, GROUP_NAME_MAX),
    description: text(partial.description, GROUP_DESCRIPTION_MAX),
    icon: partial.icon ? String(partial.icon).slice(0, 8) : null,
    currency: CURRENCIES[partial.currency] ? partial.currency : 'INR',
    createdBy,
    createdAt: nowIso(partial.createdAt),
    members,
      settings: {
        simplifyDebts: partial.settings?.simplifyDebts !== false,
      },
      archivedAt: partial.archivedAt || null,
      formerMemberIds: partial.formerMemberIds || [],
  };
}

export function validateGroup(group) {
  const errors = {};
  if (!group.name) errors.name = 'Give the group a name.';
  if (!group.createdBy) errors.createdBy = 'A group needs an owner.';
  if (!CURRENCIES[group.currency]) errors.currency = 'Pick a supported currency.';
  const members = Array.isArray(group.members) ? group.members : [];
  if (members.length === 0) errors.members = 'Add at least one member.';
  else if (!members.some((m) => m.role === GROUP_ROLE.OWNER)) errors.members = 'The group needs an owner.';
  else if (new Set(members.map((m) => m.participantId || m.userId)).size !== members.length) {
    errors.members = 'That member is already in the group.';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function isGroupMember(group, userId) {
  const key = String(userId);
  return (group?.members || []).some((member) => String(member.userId ?? member.participantId) === key || String(member.participantId) === key);
}

export function groupRole(group, userId) {
  const key = String(userId);
  const member = (group?.members || []).find((m) => String(m.userId ?? m.participantId) === key || String(m.participantId) === key);
  return member ? member.role : null;
}

export function addGroupMember(group, userId, role = GROUP_ROLE.MEMBER) {
  if (isGroupMember(group, userId)) return group;
  return { ...group, members: [...group.members, makeGroupMember(userId, role)] };
}

export function removeGroupMember(group, userId) {
  const key = String(userId);
  return { ...group, members: group.members.filter((m) => String(m.userId ?? m.participantId) !== key && String(m.participantId) !== key) };
}
