/** Auth middleware — resolves the session cookie/bearer token to `req.user`. */
import { readToken, verifySession } from './tokens.js';
import { unauthorized } from '../util/http.js';

/** Populates req.user when a valid session exists; never rejects. */
export async function attachUser(req, _res, next) {
  try {
    const token = readToken(req);
    if (!token) return next();
    const claims = verifySession(token);
    if (!claims?.sub) return next();
    const user = await req.repo.findUserById(claims.sub);
    if (user) req.user = req.repo.publicUser ? req.repo.publicUser(user) : user;
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Guards a route: 401 unless a session resolved to a real account. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized('Please sign in to continue.'));
  return next();
}
