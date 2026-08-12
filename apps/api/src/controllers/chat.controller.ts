// =============================================================================
// ForgeMind API — RAG Chat Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import { executeRAGQuery, findRepositoryById } from '../services/index.js';

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
 * POST /api/v1/repositories/:repositoryId/chat
 *
 * Executes a Retrieval-Augmented Generation (RAG) query over the specified repository.
 * Requires user authentication and repository ownership verification.
 */
export async function chatRepositoryRAG(req: AuthenticatedRequest, res: Response): Promise<void> {
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
      topK?: number;
    };

    const query = body.query?.trim();

    if (!query) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Question/query string is required.' },
      });
      return;
    }

    const result = await executeRAGQuery(repositoryId, user.id, query, {
      topK: body.topK,
    });

    res.status(200).json({
      success: true,
      answer: result.answer,
      sources: result.sources,
      repositoryId: result.repositoryId,
      query: result.query,
      providerUsed: result.providerUsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}
