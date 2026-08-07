// =============================================================================
// ForgeMind API — Repository Controller
// =============================================================================

import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  syncRepositories as syncReposService,
  findRepositoriesByUser,
  findRepositoryById,
  deleteRepository as deleteRepoService,
} from '../services/index.js';

// ─── Extended Request Types ───────────────────────────────────────────────────

/**
 * Extends AuthenticatedUser with an optional GitHub OAuth token.
 * The token is forwarded by the frontend via a custom header or injected
 * by an upstream middleware that enriches req.user before reaching this
 * controller.
 */
interface AuthenticatedUserWithToken {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  githubToken?: string;
}

interface RepositoryRequest extends Request {
  user?: AuthenticatedUserWithToken;
}

// ─── Shared Error Helper ──────────────────────────────────────────────────────

function sendInternalError(res: Response, message = 'An unexpected error occurred.'): void {
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}

// ─── Controller Methods ───────────────────────────────────────────────────────

/**
 * POST /repositories/sync
 *
 * Triggers a full GitHub → database repository synchronisation for the
 * authenticated user. Requires a GitHub token on req.user.githubToken.
 */
export async function syncRepositories(req: RepositoryRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    if (!user.githubToken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_GITHUB_TOKEN',
          message: 'GitHub token is required to sync repositories.',
        },
      });
      return;
    }

    const result = await syncReposService(user.id, user.githubToken);

    res.status(200).json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /repositories
 *
 * Returns all repositories owned by the authenticated user.
 */
export async function getRepositories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositories = await findRepositoriesByUser(user.id);

    res.status(200).json({ success: true, repositories });
  } catch {
    sendInternalError(res);
  }
}

/**
 * GET /repositories/:id
 *
 * Returns a single repository by its database UUID.
 */
export async function getRepository(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const { id } = req.params as { id: string };
    const repository = await findRepositoryById(id);

    if (!repository) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Repository not found.' },
      });
      return;
    }

    res.status(200).json({ success: true, repository });
  } catch {
    sendInternalError(res);
  }
}

/**
 * DELETE /repositories/:id
 *
 * Deletes a repository record by its database UUID.
 */
export async function deleteRepository(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const { id } = req.params as { id: string };
    const deleted = await deleteRepoService(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Repository not found.' },
      });
      return;
    }

    res.status(200).json({ success: true, repository: deleted });
  } catch {
    sendInternalError(res);
  }
}
