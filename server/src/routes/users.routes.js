/** Public, authenticated user discovery for starting a friendship or group. */
import { Router } from 'express';
import { z } from 'zod';
import { badRequest, notFound } from '../util/http.js';

const querySchema = z.object({
  q: z.string().trim().max(80).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export function userRoutes() {
  const router = Router();

  router.get('/search', async (req, res, next) => {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) throw badRequest('The search query was not understood.');
      const users = await req.repo.listUsers({
        excludeId: req.user.id,
        query: parsed.data.q,
        limit: parsed.data.limit,
      });
      res.json({ users });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const user = await req.repo.findUserById(req.params.id);
      if (!user) throw notFound('User not found.');
      res.json({ user: req.repo.publicUser(user) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
