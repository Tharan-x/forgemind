import type { Request, Response } from 'express';

import type { HealthStatus } from '@forgemind/types';
import { successResponse } from '@forgemind/shared';

import { env } from '../config/env.js';

const START_TIME = Date.now();

/**
 * GET /health
 * Returns the current health status of the API and its services.
 */
export async function healthHandler(req: Request, res: Response): Promise<void> {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  const health: HealthStatus = {
    status: 'ok',
    version: '0.1.0',
    uptime,
    timestamp: new Date().toISOString(),
    services: [
      {
        name: 'api',
        status: 'ok',
      },
      {
        // Database connectivity will be checked in a future sprint
        name: 'database',
        status: env.DATABASE_URL ? 'ok' : 'degraded',
        message: env.DATABASE_URL ? undefined : 'DATABASE_URL not configured',
      },
    ],
  };

  res.status(200).json(successResponse(health));
}
