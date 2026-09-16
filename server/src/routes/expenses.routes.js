/** Expense CRUD. All financial effects are derived from the stored ledger rows. */
import { Router } from 'express';
import { z } from 'zod';
import { makeExpense, validateExpense } from '@expense/shared';
import { badRequest, fieldErrorsFromZod, forbidden, notFound } from '../util/http.js';
import { ledgerContext } from './ledger.js';

const payloadSchema = z.object({
  description: z.string().trim().max(120), amount: z.coerce.number(), currency: z.string().trim().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid expense date.').optional(), category: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional(),
  paidBy: z.string().trim().min(1), participants: z.array(z.string().trim().min(1)).min(1)
    .refine((ids) => new Set(ids).size === ids.length, 'A participant can only be included once.'), splitMethod: z.enum(['equal', 'exact', 'percentage', 'shares']).optional(), splitDetails: z.record(z.string(), z.coerce.number().finite()).optional(),
  contextType: z.enum(['friendship', 'group']), contextId: z.string().trim().min(1),
});

export function expensesRoutes() {
  const router = Router();
  router.post('/', async (req, res, next) => {
    try {
      const parsed = payloadSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      const context = await ledgerContext(req.repo, parsed.data.contextType, parsed.data.contextId, req.user.id);
      const expense = makeExpense({ ...parsed.data, contextId: context.id, createdBy: req.user.id });
      const valid = validateExpense(expense, { memberIds: context.memberIds });
      if (!valid.ok) {
        const code = valid.errors.splits && expense.splitMethod === 'exact' ? 'SPLIT_TOTAL_MISMATCH'
          : valid.errors.splits && expense.splitMethod === 'percentage' ? 'PERCENTAGE_TOTAL_MISMATCH' : 'INVALID_EXPENSE';
        throw badRequest(valid.errors.splits || 'Please check the highlighted fields.', { code, fieldErrors: valid.errors });
      }
      res.status(201).json({ expense: await req.repo.createExpense(expense) });
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const expense = await req.repo.findExpenseById(req.params.id);
      if (!expense || expense.deletedAt) throw notFound('Expense not found.');
      await ledgerContext(req.repo, expense.contextType, expense.contextId, req.user.id);
      res.json({ expense });
    } catch (error) { next(error); }
  });
  router.patch('/:id', async (req, res, next) => {
    try {
      const current = await req.repo.findExpenseById(req.params.id);
      if (!current || current.deletedAt) throw notFound('Expense not found.');
      const context = await ledgerContext(req.repo, current.contextType, current.contextId, req.user.id);
      if (current.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the expense creator or group owner can edit this expense.');
      const parsed = payloadSchema.omit({ contextType: true, contextId: true }).partial().safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      // Stored splits are a derived snapshot. Never carry them into an edit or
      // a changed amount would keep the old allocation and double-count in UI.
      const { splits: _splits, ...currentFields } = current;
      const expense = makeExpense({ ...currentFields, ...parsed.data, contextType: current.contextType, contextId: current.contextId, createdBy: current.createdBy, updatedBy: req.user.id, updatedAt: new Date().toISOString() });
      const valid = validateExpense(expense, { memberIds: context.memberIds });
      if (!valid.ok) {
        const code = valid.errors.splits && expense.splitMethod === 'exact' ? 'SPLIT_TOTAL_MISMATCH'
          : valid.errors.splits && expense.splitMethod === 'percentage' ? 'PERCENTAGE_TOTAL_MISMATCH' : 'INVALID_EXPENSE';
        throw badRequest(valid.errors.splits || 'Please check the highlighted fields.', { code, fieldErrors: valid.errors });
      }
      res.json({ expense: await req.repo.updateExpense(current.id, expense) });
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const current = await req.repo.findExpenseById(req.params.id);
      if (!current || current.deletedAt) throw notFound('Expense not found.');
      const context = await ledgerContext(req.repo, current.contextType, current.contextId, req.user.id);
      if (current.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the expense creator or group owner can delete this expense.');
      await req.repo.deleteExpense(current.id, req.user.id);
      res.status(204).end();
    } catch (error) { next(error); }
  });
  return router;
}
