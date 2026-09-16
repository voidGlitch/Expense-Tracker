/** Record cash/bank/UPI payments; partial settlements are normal ledger rows. */
import { Router } from 'express';
import { z } from 'zod';
import { CURRENCIES, makeSettlement, pairwiseBalances, validateSettlement } from '@expense/shared';
import { badRequest, fieldErrorsFromZod, forbidden, notFound } from '../util/http.js';
import { ledgerContext, ledgerRows } from './ledger.js';

const isCalendarDay = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const schema = z.object({
  fromUserId: z.string().trim(),
  toUserId: z.string().trim(),
  amount: z.coerce.number(),
  currency: z.enum(Object.keys(CURRENCIES)).optional(),
  date: z.string().refine(isCalendarDay, 'Enter a valid payment date.').optional(),
  method: z.string().optional(),
  note: z.string().trim().max(200).optional(),
  contextType: z.enum(['friendship', 'group']),
  contextId: z.string().trim().min(1),
});
export function settlementsRoutes() {
  const router = Router();
  router.post('/', async (req, res, next) => {
    try {
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      const context = await ledgerContext(req.repo, parsed.data.contextType, parsed.data.contextId, req.user.id);
      if (parsed.data.fromUserId !== req.user.id) throw forbidden('You can only record a payment you made.');
      const { expenses, settlements } = await ledgerRows(req.repo, context);
      const matchingExpenses = expenses.filter((row) => row.currency === (parsed.data.currency || 'INR'));
      const matchingSettlements = settlements.filter((row) => row.currency === (parsed.data.currency || 'INR'));
      const outstanding = pairwiseBalances(matchingExpenses, matchingSettlements).find((row) => row.from === parsed.data.fromUserId && row.to === parsed.data.toUserId)?.amount || 0;
      const settlement = makeSettlement({ ...parsed.data, contextId: context.id, createdBy: req.user.id });
      const valid = validateSettlement(settlement, { memberIds: context.memberIds, maxAmount: outstanding });
      if (!valid.ok) throw badRequest('Please check the highlighted fields.', { fieldErrors: valid.errors });
      res.status(201).json({ settlement: await req.repo.createSettlement(settlement) });
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const settlement = await req.repo.findSettlementById(req.params.id);
      if (!settlement || settlement.deletedAt) throw notFound('Settlement not found.');
      const context = await ledgerContext(req.repo, settlement.contextType, settlement.contextId, req.user.id);
      if (settlement.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the payment creator or group owner can delete this settlement.');
      await req.repo.deleteSettlement(settlement.id, req.user.id); res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}
