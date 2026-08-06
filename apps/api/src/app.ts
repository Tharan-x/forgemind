import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { router } from './routes/index.js';

// ─── App Factory ─────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.isDevelopment
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : (process.env['ALLOWED_ORIGINS'] ?? '').split(','),
      credentials: true,
    }),
  );

  // ── Logging ──────────────────────────────────────────────────────────────
  app.use(morgan(env.isDevelopment ? 'dev' : 'combined'));

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1', router);

  // ── 404 fallback ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource does not exist.',
      },
    });
  });

  // ── Global error handler ─────────────────────────────────────────────────
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      // eslint-disable-next-line no-console
      console.error('[Error]', err.message, err.stack);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: env.isDevelopment ? err.message : 'An unexpected error occurred.',
        },
      });
    },
  );

  return app;
}
