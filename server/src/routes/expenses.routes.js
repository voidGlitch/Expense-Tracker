/** Expense CRUD. All financial effects are derived from the stored ledger rows. */
import { Router } from 'express';
import { z } from 'zod';
import { CURRENCIES, makeExpense, validateExpense, minor, recurringDates } from '@expense/shared';
import { badRequest, fieldErrorsFromZod, forbidden, notFound } from '../util/http.js';
import { ledgerContext } from './ledger.js';
import { checkRevision, creationIdentity, checkReplay, fingerprint } from './ledgerMutation.js';

const calendarDay = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 'Enter a valid date.');
const money = z.coerce.number().finite().min(0).max(1e10).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, 'Use at most two decimal places.');

const payloadSchema = z.object({
  description: z.string().trim().max(120), amount: money, currency: z.enum(Object.keys(CURRENCIES)).optional(),
  date: calendarDay.optional(), category: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional(),
  paidBy: z.string().trim().min(1).optional(), payers: z.array(z.object({ memberId: z.string().min(1), amount: money })).min(1).max(50).optional(), participants: z.array(z.string().trim().min(1)).min(1).max(50)
    .refine((ids) => new Set(ids).size === ids.length, 'A participant can only be included once.'), splitMethod: z.enum(['equal', 'exact', 'percentage', 'shares', 'adjustment', 'itemized']).optional(), splitDetails: z.union([z.record(z.string(), z.coerce.number().finite()), z.object({ items: z.array(z.object({ name: z.string().max(100), amount: money, memberIds: z.array(z.string()).min(1) })).min(1).max(100), tax: money.optional(), tip: money.optional() })]).optional(),
  kind: z.enum(['expense', 'refund']).optional(), refundOf: z.string().optional(),
  receipt: z.object({ name: z.string().max(120), data: z.string().max(1400000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/) }).nullable().optional(),
  recurrence: z.object({ frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'yearly']), endDate: calendarDay.optional(), active: z.boolean().default(true) }).nullable().optional(),
  contextType: z.enum(['friendship', 'group']), contextId: z.string().trim().min(1),
});

export function expensesRoutes() {
  const router = Router();
  router.post('/', async (req, res, next) => {
    try {
      const parsed = payloadSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      const context = await ledgerContext(req.repo, parsed.data.contextType, parsed.data.contextId, req.user.id);
      if (context.entity.archivedAt) throw badRequest('Unarchive this group before adding expenses.');
      const identity = creationIdentity(req, 'exp', parsed.data);
      const replay = await req.repo.findExpenseById(identity.id);
      if (checkReplay(replay, identity)) return res.json({ expense: replay });
      const expense = { ...makeExpense({ ...parsed.data, ...identity, contextId: context.id, createdBy: req.user.id }), ...identity, activity: [{ action: 'created', userId: req.user.id, at: new Date().toISOString() }] };
      if (expense.kind === 'refund') {
        const original = await req.repo.findExpenseById(expense.refundOf);
        if (!original || original.deletedAt || original.kind === 'refund' || original.contextType !== context.type || original.contextId !== context.id || original.currency !== expense.currency) throw badRequest('Choose an original expense in this ledger and currency.');
        const refunds = (await req.repo.listExpenses({ contextType: context.type, contextId: context.id })).filter((row) => row.refundOf === original.id);
        if (refunds.reduce((sum, row) => sum + minor(row.amount), minor(expense.amount)) > minor(original.amount)) throw badRequest('Refunds cannot exceed the original expense.');
      }
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
      checkRevision(req.body.expectedRevision, current.revision || 1);
      const { splits: _splits, ...currentFields } = current;
      if (!parsed.data.payers && (parsed.data.paidBy || (parsed.data.amount && (current.payers?.length || 1) === 1))) delete currentFields.payers;
      const expense = makeExpense({ ...currentFields, ...parsed.data, contextType: current.contextType, contextId: current.contextId, createdBy: current.createdBy, updatedBy: req.user.id, updatedAt: new Date().toISOString() });
      const valid = validateExpense(expense, { memberIds: context.memberIds });
      if (!valid.ok) {
        const code = valid.errors.splits && expense.splitMethod === 'exact' ? 'SPLIT_TOTAL_MISMATCH'
          : valid.errors.splits && expense.splitMethod === 'percentage' ? 'PERCENTAGE_TOTAL_MISMATCH' : 'INVALID_EXPENSE';
        throw badRequest(valid.errors.splits || 'Please check the highlighted fields.', { code, fieldErrors: valid.errors });
      }
      if (expense.kind !== (current.kind || 'expense') || expense.refundOf !== (current.refundOf || null)) throw badRequest('The transaction type and refund source cannot be changed.');
      const relatedRefunds = (await req.repo.listExpenses({ contextType: context.type, contextId: context.id })).filter((r) => r.refundOf === (current.kind === 'refund' ? current.refundOf : current.id) && r.id !== current.id);
      const original = current.kind === 'refund' ? await req.repo.findExpenseById(current.refundOf) : expense;
      if (relatedRefunds.reduce((sum, row) => sum + minor(row.amount), current.kind === 'refund' ? minor(expense.amount) : 0) > minor(original.amount)) throw badRequest('Refunds cannot exceed the original expense.');
      res.json({ expense: await req.repo.updateExpense(current.id, { ...expense, revision: (current.revision || 1) + 1, activity: [...(current.activity || []), { action: 'edited', userId: req.user.id, at: new Date().toISOString() }] }) });
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try {
      const current = await req.repo.findExpenseById(req.params.id);
      if (!current || current.deletedAt) throw notFound('Expense not found.');
      const context = await ledgerContext(req.repo, current.contextType, current.contextId, req.user.id);
      if (current.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the expense creator or group owner can delete this expense.');
      checkRevision(req.body?.expectedRevision, current.revision || 1);
      const refunds = (await req.repo.listExpenses({ contextType: context.type, contextId: context.id })).filter((row) => row.refundOf === current.id);
      if (refunds.length) throw badRequest('Delete this expense’s refunds first. Payments are kept independently.');
      await req.repo.updateExpense(current.id, { deletedAt: new Date().toISOString(), deletedBy: req.user.id, revision: (current.revision || 1) + 1, activity: [...(current.activity || []), { action: 'deleted', userId: req.user.id, at: new Date().toISOString() }] });
      res.status(204).end();
    } catch (error) { next(error); }
  });
  router.post('/:id/restore', async (req, res, next) => {
    try {
      const row = await req.repo.findExpenseById(req.params.id);
      if (!row) throw notFound('Expense not found.');
      const context = await ledgerContext(req.repo, row.contextType, row.contextId, req.user.id);
      if (row.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the creator or group owner can restore this expense.');
      checkRevision(req.body?.expectedRevision, row.revision || 1);
      if (row.kind === 'refund') {
        const original = await req.repo.findExpenseById(row.refundOf);
        const refunds = (await req.repo.listExpenses({ contextType: context.type, contextId: context.id })).filter((r) => r.refundOf === row.refundOf && r.id !== row.id);
        if (!original || original.deletedAt || refunds.reduce((sum, r) => sum + minor(r.amount), minor(row.amount)) > minor(original.amount)) throw badRequest('Restore the original expense first and check the refund total.');
      }
      res.json({ expense: await req.repo.updateExpense(row.id, { deletedAt: null, deletedBy: null, revision: (row.revision || 1) + 1, activity: [...(row.activity || []), { action: 'restored', userId: req.user.id, at: new Date().toISOString() }] }) });
    } catch (error) { next(error); }
  });
  router.post('/:id/comments', async (req, res, next) => {
    try {
      const row = await req.repo.findExpenseById(req.params.id);
      if (!row || row.deletedAt) throw notFound('Expense not found.');
      await ledgerContext(req.repo, row.contextType, row.contextId, req.user.id);
      const text = z.string().trim().min(1).max(1000).safeParse(req.body?.text);
      if (!text.success) throw badRequest('Enter a comment of 1–1000 characters.');
      const identity = creationIdentity(req, 'comment', { text: text.data, expenseId: row.id });
      if ((row.comments || []).some((c) => c.id === identity.id)) return res.json({ expense: row });
      res.json({ expense: await req.repo.updateExpense(row.id, { comments: [...(row.comments || []), { id: identity.id, text: text.data, userId: req.user.id, at: new Date().toISOString() }], revision: (row.revision || 1) + 1 }) });
    } catch (error) { next(error); }
  });
  router.post('/:id/occurrences', async (req, res, next) => {
    try {
      const template = await req.repo.findExpenseById(req.params.id);
      if (!template || template.deletedAt) throw notFound('Recurring expense not found.');
      const context = await ledgerContext(req.repo, template.contextType, template.contextId, req.user.id);
      if (template.createdBy !== req.user.id && !context.isOwner) throw forbidden('Only the creator or group owner can generate recurring expenses.');
      if (!template.recurrence?.active || context.entity.archivedAt) throw badRequest('This recurring expense is inactive.');
      const valid = validateExpense(template, { memberIds: context.memberIds });
      if (!valid.ok) throw badRequest('Update this recurring template’s participants first.', { fieldErrors: valid.errors });
      const dates = recurringDates(template.date, template.recurrence.frequency, new Date().toISOString().slice(0, 10), template.recurrence.endDate);
      const created = [];
      for (const date of dates) {
        const id = `rec_${fingerprint([template.id, date]).slice(0, 40)}`;
        if (await req.repo.findExpenseById(id)) continue;
        created.push(await req.repo.createExpense({ ...makeExpense({ ...template, id, date, recurrence: null, recurringSourceId: template.id, revision: 1, createdAt: new Date().toISOString(), comments: [], activity: [] }), activity: [{ action: 'recurring occurrence created', userId: req.user.id, at: new Date().toISOString() }] }));
      }
      res.json({ expenses: created });
    } catch (error) { next(error); }
  });
  return router;
}
