// =============================================================================
// ForgeMind API — Vector Semantic Search & Code Chunks Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  findRepositoryById,
  findRepositoryChunks,
  getVectorPipelineStatus,
  searchSemanticCodeChunks,
} from '../services/index.js';

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
 * GET /api/v1/repositories/:repositoryId/chunks
 *
 * Returns indexed code chunks for a repository with optional file filtering and pagination.
 */
export async function getRepositoryChunks(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const fileId = typeof req.query['fileId'] === 'string' ? req.query['fileId'] : undefined;
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

    const result = await findRepositoryChunks(repositoryId, { fileId, limit, offset });

    res.status(200).json({
      success: true,
      chunks: result.chunks,
      total: result.total,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/search/semantic
 *
 * Executes a vector semantic search over repository code chunks.
 */
export async function searchSemanticCode(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const body = (req.body || {}) as {
      query?: string;
      limit?: number;
      threshold?: number;
    };

    const query = body.query?.trim();

    if (!query) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Search query string is required.' },
      });
      return;
    }

    if (query.length > 2000) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Query exceeds maximum length of 2000 characters.',
        },
      });
      return;
    }

    const results = await searchSemanticCodeChunks(repositoryId, query, {
      limit: body.limit,
      threshold: body.threshold,
    });

    res.status(200).json({
      success: true,
      results,
      total: results.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/vector-status
 *
 * Returns vector pipeline indexing coverage and provider details for a repository.
 */
export async function getVectorStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
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

    const status = await getVectorPipelineStatus(repositoryId);

    res.status(200).json({
      success: true,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}
