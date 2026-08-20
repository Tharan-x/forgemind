// =============================================================================
// ForgeMind API — Rate Limiter Middleware
// =============================================================================

import type { Request, Response, NextFunction, RequestHandler } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

interface ClientRecord {
  count: number;
  resetTime: number;
}

/**
 * Creates an in-memory sliding window rate-limiting middleware.
 */
export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const {
    windowMs,
    max,
    message = 'Too many requests. Please try again later.',
    keyGenerator = (req: Request) => {
      const authReq = req as AuthenticatedRequest;
      return authReq.user?.id || req.ip || req.socket.remoteAddress || 'unknown';
    },
  } = options;

  const hits = new Map<string, ClientRecord>();

  // Cleanup expired entries periodically (every 5 minutes)
  const cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      for (const [key, record] of hits.entries()) {
        if (now > record.resetTime) {
          hits.delete(key);
        }
      }
    },
    5 * 60 * 1000,
  );

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, skip rate limiting unless ENABLE_RATE_LIMIT_TEST is true
    if (process.env['NODE_ENV'] === 'test' && process.env['ENABLE_RATE_LIMIT_TEST'] !== 'true') {
      next();
      return;
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let record = hits.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs,
      };
      hits.set(key, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message,
        },
      });
      return;
    }

    next();
  };

  return middleware;
}

export const globalRateLimiter: RequestHandler = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
});

export const heavyRouteRateLimiter: RequestHandler = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 heavy requests per minute
  message: 'Too many analysis/AI requests. Please slow down and try again in a minute.',
});
