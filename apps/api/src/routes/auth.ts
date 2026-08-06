// =============================================================================
// ForgeMind API — Auth Router (/api/v1/auth)
// =============================================================================

import { Router, type Response, type Router as RouterType } from 'express';

import { successResponse, errorResponse } from '@forgemind/shared';

import { requireAuth, type AuthenticatedRequest } from '../auth/index.js';

const router: RouterType = Router();

/**
 * GET /api/v1/auth/me
 * Returns current authenticated user profile.
 */
router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  res.json(successResponse(req.user));
});

/**
 * POST /api/v1/auth/sync
 * Syncs user profile after frontend login.
 */
router.post('/sync', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  res.json(
    successResponse({
      synced: true,
      user: req.user,
    }),
  );
});

export { router as authRouter };
