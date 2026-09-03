/**
 * Authentication routes — email + password, hashed with bcrypt.
 *
 *   POST /api/auth/register  { name, email, password }
 *   POST /api/auth/login     { email, password }
 *   POST /api/auth/logout
 *   GET  /api/auth/me
 *
 * The session is a JWT in an httpOnly cookie, so the token is never readable
 * from JavaScript in the browser.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../env.js';
import { requireAuth } from '../auth/middleware.js';
import {
  describePasswordProblem, hashPassword, normalizeEmail, verifyPassword,
} from '../auth/password.js';
import { clearSessionCookie, setSessionCookie } from '../auth/tokens.js';
import { badRequest, fieldErrorsFromZod, forbidden, tooMany, unauthorized } from '../util/http.js';

const emailField = z.email('Please enter a valid email address.');

const registerSchema = z.object({
  name: z.string('Please enter your name.').trim().min(1, 'Please enter your name.').max(80, 'That name is too long.'),
  email: emailField,
  password: z.string('Please enter a password.'),
});

const loginSchema = z.object({
  email: emailField,
  password: z.string('Please enter your password.').min(1, 'Please enter your password.'),
});

/** Login attempts are throttled per IP; disabled under test so runs stay deterministic. */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  handler: (_req, _res, next) => next(tooMany('Too many sign-in attempts. Please wait a few minutes.')),
});

export function authRoutes() {
  const router = Router();

  router.post('/register', loginLimiter, async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      }

      const passwordProblem = describePasswordProblem(parsed.data.password);
      if (passwordProblem) {
        throw badRequest(passwordProblem, { fieldErrors: { password: passwordProblem } });
      }

      // ALLOW_REGISTRATION=false closes signup, but the very first account is
      // always allowed — otherwise a fresh install could never be used.
      if (!config.allowRegistration && (await req.repo.countUsers()) > 0) {
        throw forbidden('Sign-ups are closed on this server.');
      }

      const email = normalizeEmail(parsed.data.email);
      const existing = await req.repo.findUserByEmail(email);
      if (existing) {
        throw badRequest('An account with that email already exists.', {
          fieldErrors: { email: 'An account with that email already exists.' },
        });
      }

      const user = await req.repo.createUser({
        email,
        name: parsed.data.name,
        passwordHash: await hashPassword(parsed.data.password),
      });

      setSessionCookie(res, user);
      res.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', loginLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      }

      const email = normalizeEmail(parsed.data.email);
      const found = await req.repo.findUserByEmail(email);
      // verifyPassword still runs one bcrypt comparison for unknown accounts, so
      // "no such email" and "wrong password" take the same time and say the same thing.
      const ok = await verifyPassword(parsed.data.password, found?.passwordHash);
      if (!found || !ok) throw unauthorized('That email and password do not match.');

      const user = req.repo.publicUser ? req.repo.publicUser(found) : found;
      setSessionCookie(res, user);
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.get('/me', (req, res) => {
    res.json({ user: req.user ?? null });
  });

  router.patch('/profile', requireAuth, async (req, res, next) => {
    try {
      const schema = z.object({ name: z.string().trim().min(1, 'Please enter your name.').max(80) });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw badRequest('Please check the highlighted fields.', { fieldErrors: fieldErrorsFromZod(parsed.error) });
      }
      const user = await req.repo.updateUser(req.user.id, { name: parsed.data.name });
      res.json({ user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
