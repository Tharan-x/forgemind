import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { globalRateLimiter } from './lib/rate-limiter.js';
import { router } from './routes/index.js';
import { webhookRouter } from './routes/webhook.routes.js';

// ─── App Factory ─────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ── Security middleware ──────────────────────────────────────────────────
  app.use(helmet());

  const allowedOrigins =
    env.isDevelopment || env.isTest
      ? [
          'http://localhost:3000',
          'http://127.0.0.1:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3001',
        ]
      : (process.env['ALLOWED_ORIGINS'] ?? '')
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0);

  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
    }),
  );

  // ── Logging ──────────────────────────────────────────────────────────────
  if (!env.isTest) {
    app.use(morgan(env.isDevelopment ? 'dev' : 'combined'));
  }

  // ── GitHub Webhook Raw Body Route ────────────────────────────────────────
  // MUST be registered BEFORE global express.json() so the raw request body
  // Buffer is preserved for HMAC-SHA256 signature verification.
  app.use(
    '/api/v1/github/webhooks',
    globalRateLimiter,
    express.raw({ type: '*/*', limit: '10mb' }),
    webhookRouter,
  );

  // ── Body parsing for standard JSON/URL-encoded API endpoints ─────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Rate Limiting & Routes ───────────────────────────────────────────────
  app.use('/api/v1', globalRateLimiter, router);

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
      if (env.isDevelopment) {
        // eslint-disable-next-line no-console
        console.error('[Error]', err.message, err.stack);
      }
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: env.isDevelopment || env.isTest ? err.message : 'An unexpected error occurred.',
        },
      });
    },
  );

  return app;
}
