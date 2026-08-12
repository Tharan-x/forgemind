// =============================================================================
// ForgeMind API — RAG Chat Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  executeRAGQuery,
  findRepositoryById,
  getRepositoryChatHistory,
  clearRepositoryChatHistory,
} from '../services/index.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sendInternalError(res: Response, message = 'An unexpected error occurred.'): void {
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message },
  });
}

function sendUnauthorized(res: Response): void {
  res.status(401).json({
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
  });
}

/**
 * Verifies repository existence and user ownership.
 * Sends the appropriate error response and returns false if verification fails.
 */
async function verifyRepositoryOwnership(
  repositoryId: string,
  userId: string,
  res: Response,
): Promise<boolean> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Repository not found.' },
    });
    return false;
  }
  if (repo.userId !== userId) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied.' },
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/v1/repositories/:repositoryId/chat
// ---------------------------------------------------------------------------

/**
 * Executes a Retrieval-Augmented Generation (RAG) query over the specified repository.
 * Requires user authentication and repository ownership verification.
 */
export async function chatRepositoryRAG(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const body = (req.body || {}) as { query?: string; topK?: number };
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

// ---------------------------------------------------------------------------
// GET /api/v1/repositories/:repositoryId/chat/history
// ---------------------------------------------------------------------------

/**
 * Returns the most recent chat session and its messages for the authenticated user's repository.
 * Messages are ordered chronologically (oldest first).
 */
export async function getChatHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const { session, messages } = await getRepositoryChatHistory(repositoryId, user.id);

    res.status(200).json({
      success: true,
      session,
      messages,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/repositories/:repositoryId/chat/history
// ---------------------------------------------------------------------------

/**
 * Clears all chat sessions and messages for the authenticated user's repository.
 */
export async function clearChatHistory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const { deletedSessions } = await clearRepositoryChatHistory(repositoryId, user.id);

    res.status(200).json({
      success: true,
      deletedSessions,
      message: `Cleared ${deletedSessions} chat session(s).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}
