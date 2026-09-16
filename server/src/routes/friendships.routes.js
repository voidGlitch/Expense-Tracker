/** Friendship resource. Financial child resources are added in later phases. */
import { Router } from 'express';
import { friendshipOther } from '@expense/shared';
import { requireFriendshipMember } from './friends.routes.js';

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
  return router;
}
