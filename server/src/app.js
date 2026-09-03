/**
 * Express app factory. The repository is injected, so tests can run the real app
 * against the in-memory driver with no database and no file system.
 */
import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './env.js';
import { attachUser, requireAuth } from './auth/middleware.js';
import { authRoutes } from './routes/auth.routes.js';
import { budgetRoutes } from './routes/budget.routes.js';
import { exportRoutes } from './routes/export.routes.js';
import { notFound } from './util/http.js';

export function createApp(repo) {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet({
    // The built client loads its own bundles; allow inline styles (Tailwind
    // injects a couple) plus data:/blob: images for icons and chart exports.
    contentSecurityPolicy: config.isProduction ? {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': [
            "'self'",
            'https://expense-manager-api-ynqn.onrender.com',
          ],
        'font-src': ["'self'", 'data:'],
        'object-src': ["'none'"],
      },
    } : false,
    crossOriginEmbedderPolicy: false,
  }));

  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins, credentials: true }));
  }

  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());

  app.use((req, _res, next) => { req.repo = repo; next(); });
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      storage: repo.driver || config.storageDriver,
      env: config.nodeEnv,
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes());
  app.use('/api/budget', requireAuth, budgetRoutes());
  app.use('/api/export', requireAuth, exportRoutes());

  app.use('/api', (_req, _res, next) => next(notFound('That endpoint does not exist.')));

  // --- Built client (production / `npm run build`) ---------------------------
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    const indexHtml = path.join(config.clientDist, 'index.html');
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      return res.sendFile(indexHtml, (error) => (error ? next(error) : undefined));
    });
  }

  // --- Errors ---------------------------------------------------------------
  app.use((error, _req, res, _next) => {
    const status = Number(error.status) || 500;
    if (status >= 500) console.error('[api]', error);
    res.status(status).json({
      error: {
        message: status >= 500 ? 'Something went wrong on the server.' : error.message,
        ...(error.details || {}),
      },
    });
  });

  return app;
}
