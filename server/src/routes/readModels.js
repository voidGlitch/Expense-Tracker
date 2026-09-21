import { minor, major, netBalancesObject, pairwiseBalances, simplifyDebts, totalsPerCurrency, friendshipOther } from '@expense/shared';
import { ledgerRows, namedMembers } from './ledger.js';
import { ledgerRevision, fingerprint } from './ledgerMutation.js';

export async function userLedgers(repo, userId, { includeDeleted = false } = {}) {
  const [friendships, activeGroups, formerGroups] = await Promise.all([repo.listFriendships(userId), repo.listGroups(userId), repo.listFormerGroups?.(userId) || []]);
  const groups = [...activeGroups, ...formerGroups.filter((g) => !activeGroups.some((active) => active.id === g.id))];
  const contexts = [
    ...friendships.map((friendship) => ({ type: 'friendship', id: friendship.id, title: 'Direct expenses', otherId: friendshipOther(friendship, userId), memberIds: [friendship.userA, friendship.userB], entity: friendship })),
    ...groups.map((group) => ({ type: 'group', id: group.id, title: group.name, memberIds: group.members.map((m) => m.participantId || m.userId), entity: group, readOnly: !activeGroups.some((g) => g.id === group.id), simplify: group.settings?.simplifyDebts !== false })),
  ];
  return Promise.all(contexts.map(async (context) => {
    const rows = await ledgerRows(repo, context, { includeDeleted });
    if (context.readOnly) {
      rows.expenses = rows.expenses.filter((r) => r.paidBy === userId || r.payers?.some((p) => p.memberId === userId) || r.participants?.includes(userId));
      rows.settlements = rows.settlements.filter((r) => r.fromUserId === userId || r.toUserId === userId);
    }
    const currencies = [...new Set([...rows.expenses, ...rows.settlements].filter((r) => !r.deletedAt).map((row) => row.currency || 'INR'))];
    const balances = {}; const debts = {};
    for (const currency of currencies) {
      const expenses = rows.expenses.filter((row) => row.currency === currency);
      const settlements = rows.settlements.filter((row) => row.currency === currency);
      balances[currency] = netBalancesObject(expenses, settlements);
      debts[currency] = context.type === 'group' && context.entity.settings?.simplifyDebts !== false ? simplifyDebts(balances[currency]) : pairwiseBalances(expenses, settlements);
    }
    const historicalIds = rows.expenses.flatMap((row) => [...(row.payers || []).map((p) => p.memberId), row.paidBy, ...(row.participants || [])]);
    return { ...context, ...rows, balances, debts, revision: ledgerRevision(rows), members: await namedMembers(repo, [...new Set([...context.memberIds, ...historicalIds].filter(Boolean))]), totals: totalsPerCurrency(rows.expenses, userId) };
  }));
}

/** Signed amounts: positive means current user should receive in this scope. */
export function friendPosition(contexts, me, other) {
  const scopes = [];
  for (const context of contexts) {
    if (!context.memberIds.includes(other) || !context.memberIds.includes(me)) continue;
    for (const [currency, debts] of Object.entries(context.debts)) {
      const amountMinor = debts.reduce((sum, row) => sum + (row.from === other && row.to === me ? minor(row.amount) : row.from === me && row.to === other ? -minor(row.amount) : 0), 0);
      if (amountMinor) scopes.push({ contextType: context.type, contextId: context.id, title: context.title, currency, amount: major(amountMinor) });
    }
  }
  const byCurrency = {};
  for (const scope of scopes) byCurrency[scope.currency] = major(minor(byCurrency[scope.currency]) + minor(scope.amount));
  return { scopes, byCurrency, revision: fingerprint(contexts.filter((c) => c.memberIds.includes(other) && c.memberIds.includes(me)).map((c) => [c.id, c.revision, c.entity.settings?.simplifyDebts]).sort((a, b) => a[0].localeCompare(b[0]))) };
}

export function overview(contexts, me) {
  const otherIds = [...new Set(contexts.flatMap((c) => c.memberIds))].filter((id) => id !== me);
  const friends = otherIds.map((id) => ({ id, user: contexts.flatMap((c) => c.members).find((m) => m.id === id), ...friendPosition(contexts, me, id) }));
  const balances = {};
  for (const friend of friends) for (const [currency, amount] of Object.entries(friend.byCurrency)) {
    const row = balances[currency] ||= { youOwe: 0, youAreOwed: 0, net: 0 };
    if (amount > 0) row.youAreOwed = major(minor(row.youAreOwed) + minor(amount));
    else row.youOwe = major(minor(row.youOwe) - minor(amount));
    row.net = major(minor(row.youAreOwed) - minor(row.youOwe));
  }
  return { contexts, friends, balances };
}
