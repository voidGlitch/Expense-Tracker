/** Session tokens (JWT) carried in an httpOnly cookie. */
import jwt from 'jsonwebtoken';
import { config } from '../env.js';

export function signSession(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, issuer: 'expense-manager' },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, config.jwtSecret, { issuer: 'expense-manager' });
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  return {
    httpOnly: true,
    sameSite: config.cookieSameSite,
    secure: config.cookieSecure,
    maxAge: maxAgeMs,
    path: '/',
  };
}

export function setSessionCookie(res, user) {
  res.cookie(config.cookieName, signSession(user), cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { ...cookieOptions(0), maxAge: undefined });
}

/** Reads the session from the cookie, or from `Authorization: Bearer` for API clients. */
export function readToken(req) {
  const fromCookie = req.cookies?.[config.cookieName];
  if (fromCookie) return fromCookie;
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}
