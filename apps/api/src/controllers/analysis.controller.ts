// =============================================================================
// ForgeMind API — Repository Analysis Controller
// =============================================================================

import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  triggerRepositoryAnalysis,
  findLatestAnalysisJobByRepository,
  findAnalysisJobsByRepository,
  findRepositoryById,
  findRepositoryFiles,
} from '../services/index.js';

interface AuthenticatedUserWithToken {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  githubToken?: string;
}

interface AnalysisRequest extends Request {
  user?: AuthenticatedUserWithToken;
}

function sendInternalError(res: Response, message = 'An unexpected error occurred.'): void {
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}

/**
 * POST /repositories/:repositoryId/analyze
 *
 * Triggers a repository acquisition and analysis job for the given repository ID.
 * Requires authenticated user ownership and a valid GitHub token.
 */
export async function triggerAnalysis(req: AnalysisRequest, res: Response): Promise<void> {
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
          message: 'GitHub token is required to analyze a repository.',
        },
      });
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };

    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    const result = await triggerRepositoryAnalysis(repositoryId, user.id, user.githubToken);

    res.status(200).json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /repositories/:repositoryId/analysis
 *
 * Returns the latest analysis job for the specified repository.
 */
export async function getLatestAnalysis(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const repo = await findRepositoryById(repositoryId);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Repository not found.' },
      });
      return;
    }

    if (repo.userId !== user.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
      return;
    }

    const job = await findLatestAnalysisJobByRepository(repositoryId);

    res.status(200).json({ success: true, job });
  } catch {
    sendInternalError(res);
  }
}

/**
 * GET /repositories/:repositoryId/analysis/history
 *
 * Returns all past analysis jobs for the specified repository.
 */
export async function getAnalysisHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const repo = await findRepositoryById(repositoryId);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Repository not found.' },
      });
      return;
    }

    if (repo.userId !== user.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
      return;
    }

    const jobs = await findAnalysisJobsByRepository(repositoryId);

    res.status(200).json({ success: true, jobs });
  } catch {
    sendInternalError(res);
  }
}

/**
 * GET /repositories/:repositoryId/files
 *
 * Returns indexed files for the specified repository.
 */
export async function getRepositoryFiles(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const repo = await findRepositoryById(repositoryId);

    if (!repo) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Repository not found.' },
      });
      return;
    }

    if (repo.userId !== user.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied.' },
      });
      return;
    }

    const language = typeof req.query['language'] === 'string' ? req.query['language'] : undefined;
    const limit =
      typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
    const offset =
      typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : undefined;

    const result = await findRepositoryFiles(repositoryId, { language, limit, offset });

    res.status(200).json({ success: true, files: result.files, total: result.total });
  } catch {
    sendInternalError(res);
  }
}
