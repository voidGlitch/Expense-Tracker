/** Friendship resource. Financial child resources are added in later phases. */
import { Router } from 'express';
import { balanceWith, friendshipOther, pairwiseBalances, summaryFor, totalsWith } from '@expense/shared';
import { requireFriendshipMember } from './friends.routes.js';
import { ledgerRows, namedMembers } from './ledger.js';
import { userLedgers, friendPosition } from './readModels.js';

export function friendshipsRoutes() {
  const router = Router();
  router.get('/:id', async (req, res, next) => {
    try {
      const friendship = await requireFriendshipMember(req.repo, req.params.id, req.user.id);
      const other = await req.repo.findUserById(friendshipOther(friendship, req.user.id));
      res.json({ friendship, user: req.repo.publicUser(other) });
    } catch (error) {
      next(error);
    }
  });
  router.get('/:id/expenses', async (req, res, next) => {
    try {
      const friendship = await requireFriendshipMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'friendship', id: friendship.id });
      res.json({ ...rows, members: await namedMembers(req.repo, [friendship.userA, friendship.userB]) });
    } catch (error) { next(error); }
  });
  router.get('/:id/balance', async (req, res, next) => {
    try {
      const friendship = await requireFriendshipMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'friendship', id: friendship.id });
      const otherId = friendshipOther(friendship, req.user.id);
      const currencies = [...new Set([...rows.expenses, ...rows.settlements].map((row) => row.currency || 'INR'))];
      const balances = Object.fromEntries(currencies.map((currency) => [currency, balanceWith(rows.expenses.filter((row) => row.currency === currency), rows.settlements.filter((row) => row.currency === currency), req.user.id, otherId)]));
      const overall = friendPosition(await userLedgers(req.repo, req.user.id), req.user.id, otherId);
      const overallBalances = Object.fromEntries(Object.entries(overall.byCurrency).map(([currency, amount]) => [currency, { direction: amount > 0 ? 'owesYou' : amount < 0 ? 'youOwe' : 'settled', amount: Math.abs(amount), to: otherId }]));
      // Preserve explicit zero currencies from the direct ledger after settlement.
      res.json({ balances: { ...balances, ...overallBalances }, directBalances: balances, scopes: overall.scopes, revision: overall.revision, summary: summaryFor(rows.expenses, rows.settlements, req.user.id) });
    } catch (error) { next(error); }
  });
  router.get('/:id/totals', async (req, res, next) => {
    try {
      const friendship = await requireFriendshipMember(req.repo, req.params.id, req.user.id);
      const rows = await ledgerRows(req.repo, { type: 'friendship', id: friendship.id });
      res.json({ totals: totalsWith(rows.expenses, rows.settlements, req.user.id, friendshipOther(friendship, req.user.id)) });
    } catch (error) { next(error); }
  });
  return router;
}
