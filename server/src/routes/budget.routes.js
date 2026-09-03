/**
 * Budget document routes.
 *
 *   GET /api/budget          -> { store, rev, updatedAt }
 *   PUT /api/budget          -> { store, rev, updatedAt }   (rev = optimistic lock)
 *   POST /api/budget/import  -> replaces the document from a JSON backup
 *
 * The whole document is read and written at once: it is one user's budget, small
 * enough to move in one payload, and that keeps the client free to work offline
 * and sync later. `rev` guards against two devices overwriting each other — a
 * mismatch returns 409 with the server's current revision.
 */
import { Router } from 'express';
import { z } from 'zod';
import { currentMonthKey, ensureMonth, normalizeStore } from '@expense/shared';
import { badRequest, fieldErrorsFromZod } from '../util/http.js';

const saveSchema = z.object({
  store: z.object({}).loose(),
  rev: z.union([z.number(), z.string()]).optional(),
});

/**
 * Roll the document forward to the current month before handing it out, so bills
 * appear on their own even if the app has not been opened in a month or two.
 * Pure reducers make this cheap to detect: an unchanged store is the same object.
 */
async function withCurrentMonth(repo, userId) {
  const doc = await repo.getDocument(userId);
  if (!doc.store?.settings?.onboardingComplete) return doc;
  const { store } = ensureMonth(doc.store, currentMonthKey());
  if (store === doc.store) return doc;
  return repo.saveDocument(userId, store, doc.rev);
}

export function budgetRoutes() {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      res.json(await withCurrentMonth(req.repo, req.user.id));
    } catch (error) {
      next(error);
    }
  });

  router.put('/', async (req, res, next) => {
    try {
      const parsed = saveSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest('The budget payload was not understood.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      }
      const saved = await req.repo.saveDocument(req.user.id, parsed.data.store, parsed.data.rev);
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  router.post('/import', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const candidate = body.store ?? body;
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw badRequest('That file does not look like an Expense Manager backup.');
      }
      // normalizeStore migrates internally, so an older backup upgrades on import.
      const store = normalizeStore(candidate);
      if (store.months.length === 0 && store.billDefinitions.length === 0) {
        throw badRequest('That backup has no months or bills in it — nothing to import.');
      }
      const current = await req.repo.getDocument(req.user.id);
      const saved = await req.repo.saveDocument(req.user.id, store, current.rev);
      res.json(saved);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
