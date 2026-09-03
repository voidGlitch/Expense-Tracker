/**
 * Export routes.
 *
 *   GET /api/export/months        -> [{ id, label, transactions, bills }]  (the dropdown)
 *   GET /api/export/xlsx?months=  -> Excel workbook (all months, one month, or a list)
 *   GET /api/export/json          -> full backup, restorable via POST /api/budget/import
 */
import { Router } from 'express';
import { formatMonthLabel } from '@expense/shared';
import { buildWorkbook } from '../export/workbook.js';
import { exportFileName, resolveMonthIds } from '../export/rows.js';
import { badRequest } from '../util/http.js';

export function exportRoutes() {
  const router = Router();

  router.get('/months', async (req, res, next) => {
    try {
      const { store } = await req.repo.getDocument(req.user.id);
      const months = [...(store.months || [])]
        .sort((a, b) => b.id.localeCompare(a.id))
        .map((month) => ({
          id: month.id,
          label: formatMonthLabel(month.id),
          status: month.status,
          transactions: (month.transactions || []).length,
          bills: (month.bills || []).length,
        }));
      res.json({ months });
    } catch (error) {
      next(error);
    }
  });

  router.get('/xlsx', async (req, res, next) => {
    try {
      const { store } = await req.repo.getDocument(req.user.id);
      const selection = req.query.months ?? 'all';
      if (resolveMonthIds(store, selection).length === 0) {
        throw badRequest('There is nothing to export for that selection yet.');
      }
      const { buffer, fileName } = await buildWorkbook(store, { months: selection });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.end(buffer);
    } catch (error) {
      next(error);
    }
  });

  router.get('/json', async (req, res, next) => {
    try {
      const doc = await req.repo.getDocument(req.user.id);
      const fileName = exportFileName(resolveMonthIds(doc.store, 'all'), 'json');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.end(JSON.stringify({
        exportedAt: new Date().toISOString(),
        rev: doc.rev,
        store: doc.store,
      }, null, 2));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
