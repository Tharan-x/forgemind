import type { Request, Response } from 'express';

import type { HealthStatus } from '@forgemind/types';
import { successResponse } from '@forgemind/shared';

import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

const START_TIME = Date.now();

/**
 * GET /health
 * Returns the current health status of the API and its services.
 */
export async function healthHandler(req: Request, res: Response): Promise<void> {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  let dbStatus: 'ok' | 'degraded' = 'degraded';
  let dbMessage: string | undefined = undefined;

  if (!env.DATABASE_URL) {
    dbMessage = 'DATABASE_URL not configured';
  } else {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'ok';
    } catch (err) {
      dbStatus = 'degraded';
      dbMessage = err instanceof Error ? err.message : 'Database query failed';
    }
  }

  const health: HealthStatus = {
    status: dbStatus === 'ok' ? 'ok' : 'degraded',
    version: '0.1.0',
    uptime,
    timestamp: new Date().toISOString(),
    services: [
      {
        name: 'api',
        status: 'ok',
      },
      {
        name: 'database',
        status: dbStatus,
        message: dbMessage,
      },
    ],
  };

  res.status(200).json(successResponse(health));
}
