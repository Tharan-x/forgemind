// =============================================================================
// ForgeMind API — Repository Analysis Controller
// =============================================================================

import type { Request, Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  enqueueAnalysisJob,
  findLatestAnalysisJobByRepository,
  findAnalysisJobsByRepository,
  findRepositoryById,
  findRepositoryFiles,
  findRepositorySymbols,
  findRepositoryDependencies,
  getDecryptedGitHubToken,
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
 * Enqueues a repository acquisition and analysis job for background execution.
 * Requires authenticated user ownership and a valid GitHub token.
 * Returns HTTP 202 Accepted with job metadata.
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

    const githubToken = user.githubToken || (await getDecryptedGitHubToken(user.id));

    if (!githubToken) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_GITHUB_TOKEN',
          message:
            'GitHub token is required to analyze a repository. Please connect your GitHub account in Settings.',
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

    const job = await enqueueAnalysisJob(repositoryId, user.id);

    res.status(202).json({
      success: true,
      job,
      result: { job },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * POST /repositories/:repositoryId/retry
 *
 * Retries an analysis job for a repository by enqueueing a new pending AnalysisJob.
 * Requires authenticated user ownership.
 * Returns HTTP 202 Accepted with job metadata.
 */
export async function retryAnalysis(req: AnalysisRequest, res: Response): Promise<void> {
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

    const job = await enqueueAnalysisJob(repositoryId, user.id);

    res.status(202).json({
      success: true,
      job,
      result: { job },
    });
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
    const parsedLimit =
      typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
    const limit =
      parsedLimit !== undefined
        ? isNaN(parsedLimit)
          ? 50
          : Math.max(1, Math.min(parsedLimit, 100))
        : undefined;

    const parsedOffset =
      typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : undefined;
    const offset =
      parsedOffset !== undefined
        ? isNaN(parsedOffset)
          ? 0
          : Math.max(0, parsedOffset)
        : undefined;

    const result = await findRepositoryFiles(repositoryId, { language, limit, offset });

    res.status(200).json({ success: true, files: result.files, total: result.total });
  } catch {
    sendInternalError(res);
  }
}

/**
 * GET /repositories/:repositoryId/symbols
 *
 * Returns extracted code symbols for the specified repository.
 */
export async function getSymbols(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const kind = typeof req.query['kind'] === 'string' ? req.query['kind'] : undefined;
    const query = typeof req.query['query'] === 'string' ? req.query['query'] : undefined;
    const parsedLimit =
      typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
    const limit =
      parsedLimit !== undefined
        ? isNaN(parsedLimit)
          ? 50
          : Math.max(1, Math.min(parsedLimit, 100))
        : undefined;

    const parsedOffset =
      typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : undefined;
    const offset =
      parsedOffset !== undefined
        ? isNaN(parsedOffset)
          ? 0
          : Math.max(0, parsedOffset)
        : undefined;

    const result = await findRepositorySymbols(repositoryId, { kind, query, limit, offset });

    res.status(200).json({ success: true, symbols: result.symbols, total: result.total });
  } catch {
    sendInternalError(res);
  }
}

/**
 * GET /repositories/:repositoryId/dependencies
 *
 * Returns extracted file import dependencies for the specified repository.
 */
export async function getDependencies(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const isExternal =
      typeof req.query['isExternal'] === 'string' ? req.query['isExternal'] === 'true' : undefined;
    const parsedLimit =
      typeof req.query['limit'] === 'string' ? parseInt(req.query['limit'], 10) : undefined;
    const limit =
      parsedLimit !== undefined
        ? isNaN(parsedLimit)
          ? 50
          : Math.max(1, Math.min(parsedLimit, 100))
        : undefined;

    const parsedOffset =
      typeof req.query['offset'] === 'string' ? parseInt(req.query['offset'], 10) : undefined;
    const offset =
      parsedOffset !== undefined
        ? isNaN(parsedOffset)
          ? 0
          : Math.max(0, parsedOffset)
        : undefined;

    const result = await findRepositoryDependencies(repositoryId, { isExternal, limit, offset });

    res.status(200).json({ success: true, dependencies: result.dependencies, total: result.total });
  } catch {
    sendInternalError(res);
  }
}
