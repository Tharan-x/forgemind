// =============================================================================
// ForgeMind API — Auth Router (/api/v1/auth)
// =============================================================================

import { Router, type Response, type Router as RouterType } from 'express';

import { successResponse, errorResponse } from '@forgemind/shared';

import { requireAuth, type AuthenticatedRequest } from '../auth/index.js';
import {
  getGitHubCredentialStatus,
  saveGitHubCredential,
  deleteGitHubCredential,
} from '../services/index.js';

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

/**
 * GET /api/v1/auth/github
 * Returns connection status and GitHub username/avatar for the user. Never returns raw token.
 */
router.get('/github', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  try {
    const status = await getGitHubCredentialStatus(req.user.id);
    res.json(successResponse({ connection: status }));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to retrieve GitHub connection status.';
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message));
  }
});

/**
 * PUT /api/v1/auth/github
 * PATCH /api/v1/auth/github
 * Connects or updates GitHub PAT credential. Validates token against GitHub API and encrypts at rest.
 */
const handleSaveGitHubToken = async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  const { token } = req.body as { token?: string };

  if (!token || typeof token !== 'string' || !token.trim()) {
    res
      .status(400)
      .json(
        errorResponse('INVALID_CREDENTIAL', 'A valid GitHub Personal Access Token is required.'),
      );
    return;
  }

  try {
    const status = await saveGitHubCredential(req.user.id, token);
    res.json(successResponse({ connection: status }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to connect GitHub token.';
    res.status(400).json(errorResponse('INVALID_CREDENTIAL', message));
  }
};

router.put('/github', requireAuth, handleSaveGitHubToken);
router.patch('/github', requireAuth, handleSaveGitHubToken);

/**
 * DELETE /api/v1/auth/github
 * Disconnects / deletes stored GitHub credential for the user.
 */
router.delete('/github', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  try {
    await deleteGitHubCredential(req.user.id);
    res.json(
      successResponse({ success: true, message: 'GitHub credential disconnected successfully.' }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to disconnect GitHub credential.';
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message));
  }
});

export { router as authRouter };
