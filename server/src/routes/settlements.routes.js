import { Router } from 'express';
import { z } from 'zod';
import { CURRENCIES, makeSettlement, pairwiseBalances, netBalancesObject, simplifyDebts, validateSettlement, minor, major } from '@expense/shared';
import { badRequest, fieldErrorsFromZod, forbidden, notFound } from '../util/http.js';
import { ledgerContext, ledgerRows } from './ledger.js';
import { userLedgers, friendPosition } from './readModels.js';
import { checkRevision, creationIdentity, checkReplay, ledgerRevision } from './ledgerMutation.js';

const schema = z.object({
  fromUserId: z.string().trim().min(1), toUserId: z.string().trim().min(1),
  amount: z.coerce.number().finite().positive().max(1e10).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.0001, 'Use at most two decimal places.'),
  currency: z.enum(Object.keys(CURRENCIES)).default('INR'),
  date: z.string().refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Enter a valid payment date.').optional(),
  method: z.enum(['cash', 'bank', 'upi', 'other']).default('cash'), note: z.string().trim().max(200).optional(),
  contextType: z.enum(['friendship', 'group']), contextId: z.string().trim().min(1),
  confirmUnusualPayment: z.boolean().optional(),
}).refine((row) => row.fromUserId !== row.toUserId, { path: ['toUserId'], message: 'You cannot settle up with yourself.' });
const stamp = (action, userId) => ({ action, userId, at: new Date().toISOString() });
function involved(row, userId) {
  if (row.fromUserId !== userId && row.toUserId !== userId) throw forbidden('Only the sender or recipient can record or change this payment.');
}
async function validatePayment(req, data, excludingId) {
  const context = await ledgerContext(req.repo, data.contextType, data.contextId, req.user.id);
  involved(data, req.user.id);
  const rows = await ledgerRows(req.repo, context);
  if (!excludingId) checkRevision(req.body.expectedLedgerRevision, ledgerRevision(rows));
  const expenses = rows.expenses.filter((row) => row.currency === data.currency);
  const settlements = rows.settlements.filter((row) => row.currency === data.currency && row.id !== excludingId);
  const graph = context.type === 'group' && context.entity.settings?.simplifyDebts !== false ? simplifyDebts(netBalancesObject(expenses, settlements)) : pairwiseBalances(expenses, settlements);
  const outstanding = graph.find((row) => row.from === data.fromUserId && row.to === data.toUserId)?.amount || 0;
  const valid = validateSettlement(data, { memberIds: context.memberIds, maxAmount: data.confirmUnusualPayment ? null : outstanding });
  if (!valid.ok) throw badRequest(data.amount > outstanding ? 'This payment exceeds the amount due or goes in the opposite direction. Confirm that the entered payment actually happened; it may create a reverse balance.' : 'Please check the highlighted fields.', { fieldErrors: valid.errors, requiresConfirmation: data.amount > outstanding });
  return context;
}

export function settlementsRoutes() {
  const router = Router();
  router.post('/', async (req, res, next) => {
    try {
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      // Authorize even a replay before returning any stored financial data.
      await ledgerContext(req.repo, parsed.data.contextType, parsed.data.contextId, req.user.id);
      involved(parsed.data, req.user.id);
      const identity = creationIdentity(req, 'set', parsed.data);
      const replay = await req.repo.findSettlementById(identity.id);
      if (checkReplay(replay, identity)) return res.json({ settlement: replay });
      await validatePayment(req, parsed.data);
      const row = { ...makeSettlement({ ...parsed.data, ...identity, createdBy: req.user.id }), ...identity, activity: [stamp('created', req.user.id)] };
      res.status(201).json({ settlement: await req.repo.createSettlement(row) });
    } catch (error) { next(error); }
  });

  // Signed scope legs clear opposite group/direct balances with one cash payment.
  // One document makes creation/deletion atomic even on standalone MongoDB.
  router.post('/settle-all', async (req, res, next) => {
    try {
      const data = req.body || {};
      if (!Number.isFinite(Number(data.amount)) || Number(data.amount) < 0 || Number(data.amount) > 1e10 || Math.abs(Number(data.amount) * 100 - minor(data.amount)) > 0.0001) throw badRequest('Enter a valid cash amount with at most two decimal places.');
      if (!Object.hasOwn(CURRENCIES, data.currency)) throw badRequest('Choose a supported currency.');
      const contexts = await userLedgers(req.repo, req.user.id);
      const position = friendPosition(contexts, req.user.id, String(data.friendId));
      if (!contexts.some((c) => c.memberIds.includes(data.friendId))) throw forbidden('That person is not in your shared ledgers.');
      const identity = creationIdentity(req, 'batch', { friendId: data.friendId, currency: data.currency, amount: data.amount, date: data.date, method: data.method });
      const replay = await req.repo.findSettlementById(identity.id);
      if (checkReplay(replay, identity)) return res.json({ settlement: replay });
      checkRevision(data.expectedRevision, position.revision);
      const scopes = position.scopes.filter((scope) => scope.currency === data.currency);
      const net = position.byCurrency[data.currency] || 0;
      if (!scopes.length) throw badRequest('There are no balances to settle in this currency.');
      if (minor(data.amount) !== Math.abs(minor(net))) throw badRequest('The cash payment must match the current net balance. Refresh and review the scope breakdown.');
      if (!net && !data.confirmOffset) throw badRequest('Confirm clearing these offsetting balances without a cash payment.');
      const fromUserId = net > 0 ? data.friendId : req.user.id;
      const toUserId = net > 0 ? req.user.id : data.friendId;
      const allocations = scopes.map((scope) => ({ contextType: scope.contextType, contextId: scope.contextId, fromUserId: scope.amount > 0 ? data.friendId : req.user.id, toUserId: scope.amount > 0 ? req.user.id : data.friendId, amount: Math.abs(scope.amount) }));
      const context = scopes[0];
      // Validate date and metadata even for a zero-cash offset batch.
      const parsed = schema.safeParse({ ...data, fromUserId, toUserId, amount: Math.abs(net) || 0.01, contextType: context.contextType, contextId: context.contextId });
      if (!parsed.success) throw badRequest('Check the payment date and method.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      const row = { ...makeSettlement({ ...parsed.data, amount: Math.abs(net), ...identity, allocations, createdBy: req.user.id }), ...identity, activity: [stamp('settle-all', req.user.id)] };
      res.status(201).json({ settlement: await req.repo.createSettlement(row) });
    } catch (error) { next(error); }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const current = await req.repo.findSettlementById(req.params.id);
      if (!current || current.deletedAt) throw notFound('Settlement not found.');
      await ledgerContext(req.repo, current.contextType, current.contextId, req.user.id); involved(current, req.user.id);
      checkRevision(req.body.expectedRevision, current.revision || 1);
      if (current.allocations?.length) throw badRequest('Undo this settle-all batch and record a new one to change its allocations.');
      const parsed = schema.safeParse({ ...current, ...req.body, contextType: current.contextType, contextId: current.contextId });
      if (!parsed.success) throw badRequest('Check the payment details.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      await validatePayment(req, parsed.data, current.id);
      res.json({ settlement: await req.repo.updateSettlement(current.id, { ...makeSettlement({ ...current, ...parsed.data }), revision: (current.revision || 1) + 1, updatedAt: new Date().toISOString(), activity: [...(current.activity || []), stamp('edited', req.user.id)] }) });
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const row = await req.repo.findSettlementById(req.params.id);
      if (!row) throw notFound('Settlement not found.');
      await ledgerContext(req.repo, row.contextType, row.contextId, req.user.id); involved(row, req.user.id);
      checkRevision(req.body?.expectedRevision, row.revision || 1);
      if (!row.deletedAt) await req.repo.updateSettlement(row.id, { deletedAt: new Date().toISOString(), deletedBy: req.user.id, revision: (row.revision || 1) + 1, activity: [...(row.activity || []), stamp('deleted', req.user.id)] });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}
