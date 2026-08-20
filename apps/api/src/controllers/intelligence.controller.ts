// =============================================================================
// ForgeMind API — Code Intelligence Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import { findRepositoryById } from '../services/index.js';
import {
  explainCode,
  getFileDependencyIntelligence,
  analyzeImpact,
  getArchitectureOverview,
} from '../services/code-intelligence.service.js';

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
 * Sends appropriate error and returns false on failure.
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
// POST /api/v1/repositories/:repositoryId/intelligence/explain
// ---------------------------------------------------------------------------

/**
 * Explains a file or specific symbol using RAG over indexed code chunks.
 *
 * Body: { filePath: string, symbolName?: string, symbolKind?: string }
 */
export async function explainCodeHandler(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const body = (req.body || {}) as {
      filePath?: string;
      symbolName?: string;
      symbolKind?: string;
    };

    if (!body.filePath?.trim()) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'filePath is required.' },
      });
      return;
    }

    if (body.filePath.trim().length > 1024) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'filePath exceeds maximum length of 1024 characters.',
        },
      });
      return;
    }
    if (body.symbolName && body.symbolName.trim().length > 256) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'symbolName exceeds maximum length of 256 characters.',
        },
      });
      return;
    }
    if (body.symbolKind && body.symbolKind.trim().length > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'symbolKind exceeds maximum length of 100 characters.',
        },
      });
      return;
    }

    const result = await explainCode(repositoryId, user.id, {
      filePath: body.filePath.trim(),
      symbolName: body.symbolName?.trim(),
      symbolKind: body.symbolKind?.trim(),
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/repositories/:repositoryId/intelligence/dependencies
// ---------------------------------------------------------------------------

/**
 * Returns dependency intelligence for a specific file.
 *
 * Query: ?filePath=src/services/foo.ts
 */
export async function fileDependencyIntelligenceHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const filePath = typeof req.query['filePath'] === 'string' ? req.query['filePath'].trim() : '';

    if (!filePath) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'filePath query parameter is required.' },
      });
      return;
    }

    if (filePath.length > 1024) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'filePath exceeds maximum length of 1024 characters.',
        },
      });
      return;
    }

    const result = await getFileDependencyIntelligence(repositoryId, user.id, filePath);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/repositories/:repositoryId/intelligence/impact
// ---------------------------------------------------------------------------

/**
 * Analyzes the impact of changing a file or symbol.
 *
 * Body: { filePath: string, symbolName?: string, includeExplanation?: boolean }
 */
export async function impactAnalysisHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const body = (req.body || {}) as {
      filePath?: string;
      symbolName?: string;
      includeExplanation?: boolean;
    };

    if (!body.filePath?.trim()) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'filePath is required.' },
      });
      return;
    }

    if (body.filePath.trim().length > 1024) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'filePath exceeds maximum length of 1024 characters.',
        },
      });
      return;
    }
    if (body.symbolName && body.symbolName.trim().length > 256) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'symbolName exceeds maximum length of 256 characters.',
        },
      });
      return;
    }

    const result = await analyzeImpact(
      repositoryId,
      user.id,
      body.filePath.trim(),
      body.symbolName?.trim(),
      body.includeExplanation ?? false,
    );

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// GET /api/v1/repositories/:repositoryId/intelligence/architecture
// ---------------------------------------------------------------------------

/**
 * Returns a structured architecture overview of the repository using only indexed data.
 * No LLM involved — pure structured metrics from the database.
 */
export async function architectureOverviewHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const { repositoryId } = req.params as { repositoryId: string };
    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const result = await getArchitectureOverview(repositoryId, user.id);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}
