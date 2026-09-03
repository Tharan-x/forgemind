// =============================================================================
// ForgeMind API — Architecture Decision Memory Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  confirmArchitectureDecision,
  createManualArchitectureDecision,
  findArchitectureDecisionById,
  findArchitectureDecisions,
  mineRepositoryHistoricalEvidence,
  synthesizeArchitectureDecision,
} from '../services/architecture-decision.service.js';

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

function sendBadRequest(res: Response, message: string): void {
  res.status(400).json({
    success: false,
    error: { code: 'BAD_REQUEST', message },
  });
}

/**
 * POST /api/v1/repositories/:repositoryId/decisions/mine
 * Triggers GitHub commit/PR historical evidence mining for a repository.
 */
export async function mineHistoricalEvidenceHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    if (!repositoryId) {
      sendBadRequest(res, 'Repository ID is required.');
      return;
    }

    const { maxCommits, path } = req.body || {};
    const parsedMaxCommits = maxCommits ? parseInt(String(maxCommits), 10) : undefined;
    const filterPath = typeof path === 'string' && path.trim() ? path.trim() : undefined;

    const result = await mineRepositoryHistoricalEvidence(repositoryId, user.id, {
      maxCommits: parsedMaxCommits,
      path: filterPath,
    });

    res.status(200).json({ success: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    res.status(400).json({
      success: false,
      error: { code: 'MINING_FAILED', message: message || 'Failed to mine historical evidence.' },
    });
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/decisions
 * Retrieves paginated ArchitectureDecision evidence records for a repository.
 */
export async function getArchitectureDecisionsHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    if (!repositoryId) {
      sendBadRequest(res, 'Repository ID is required.');
      return;
    }

    const path = typeof req.query['path'] === 'string' ? req.query['path'].trim() : undefined;
    const prNumberRaw = req.query['prNumber'] || req.query['pr_number'];
    const prNumber = prNumberRaw ? parseInt(String(prNumberRaw), 10) : undefined;
    const page = req.query['page'] ? parseInt(String(req.query['page']), 10) : 1;
    const limit = req.query['limit'] ? parseInt(String(req.query['limit']), 10) : 20;

    const result = await findArchitectureDecisions(repositoryId, user.id, {
      path,
      prNumber: Number.isNaN(prNumber) ? undefined : prNumber,
      page: Number.isNaN(page) ? 1 : page,
      limit: Number.isNaN(limit) ? 20 : limit,
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/decisions/:decisionId
 * Retrieves a single ArchitectureDecision record by ID.
 */
export async function getArchitectureDecisionByIdHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    const decisionId = (req.params['decisionId'] as string) || '';
    if (!repositoryId || !decisionId) {
      sendBadRequest(res, 'Repository ID and Decision ID are required.');
      return;
    }

    const decision = await findArchitectureDecisionById(repositoryId, decisionId, user.id);
    res.status(200).json({ success: true, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    res.status(404).json({
      success: false,
      error: { code: 'DECISION_NOT_FOUND', message: message || 'Decision record not found.' },
    });
  }
}

/**
 * PATCH /api/v1/repositories/:repositoryId/decisions/:decisionId/confirm
 * Updates human confirmation status for an ArchitectureDecision record.
 */
export async function confirmArchitectureDecisionHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    const decisionId = (req.params['decisionId'] as string) || '';
    if (!repositoryId || !decisionId) {
      sendBadRequest(res, 'Repository ID and Decision ID are required.');
      return;
    }

    const { isConfirmed } = req.body || {};
    if (typeof isConfirmed !== 'boolean') {
      sendBadRequest(res, 'isConfirmed parameter must be a boolean.');
      return;
    }

    const decision = await confirmArchitectureDecision(
      repositoryId,
      decisionId,
      user.id,
      isConfirmed,
    );

    res.status(200).json({ success: true, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    res.status(400).json({
      success: false,
      error: {
        code: 'CONFIRMATION_FAILED',
        message: message || 'Failed to update decision status.',
      },
    });
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/decisions/:decisionId/synthesize
 * Generates or regenerates evidence-grounded AI synthesis for a single decision record.
 */
export async function synthesizeArchitectureDecisionHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    const decisionId = (req.params['decisionId'] as string) || '';
    if (!repositoryId || !decisionId) {
      sendBadRequest(res, 'Repository ID and Decision ID are required.');
      return;
    }

    const forceRaw = req.query['force'] || req.body?.force;
    const force = String(forceRaw) === 'true' || forceRaw === true;

    const decision = await synthesizeArchitectureDecision(repositoryId, decisionId, user.id, {
      force,
    });

    res.status(200).json({ success: true, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    res.status(400).json({
      success: false,
      error: {
        code: 'SYNTHESIS_FAILED',
        message: message || 'Failed to synthesize architecture decision.',
      },
    });
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/decisions
 * Manually creates an Architectural Decision Record (ADR) for a repository.
 */
export async function createManualArchitectureDecisionHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      sendUnauthorized(res);
      return;
    }

    const repositoryId = (req.params['repositoryId'] as string) || '';
    if (!repositoryId) {
      sendBadRequest(res, 'Repository ID is required.');
      return;
    }

    const { title, description, affectedPaths, prNumber } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      sendBadRequest(res, 'Title is required and must be a non-empty string.');
      return;
    }

    if (!description || typeof description !== 'string' || !description.trim()) {
      sendBadRequest(res, 'Description is required and must be a non-empty string.');
      return;
    }

    const parsedPRNumber =
      prNumber !== undefined && prNumber !== null ? parseInt(String(prNumber), 10) : undefined;

    const decision = await createManualArchitectureDecision(repositoryId, user.id, {
      title,
      description,
      affectedPaths: Array.isArray(affectedPaths) ? affectedPaths : undefined,
      prNumber: Number.isNaN(parsedPRNumber) ? undefined : parsedPRNumber,
    });

    res.status(201).json({ success: true, decision });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    res.status(400).json({
      success: false,
      error: {
        code: 'CREATE_ADR_FAILED',
        message: message || 'Failed to create manual architectural decision.',
      },
    });
  }
}
