// =============================================================================
// ForgeMind API — Code Intelligence Controller
// =============================================================================

import type { Request, Response } from 'express';

import type { HealthFindingCategory } from '@forgemind/types';

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

function sendBadRequest(res: Response, message: string): void {
  res.status(400).json({
    success: false,
    error: { code: 'BAD_REQUEST', message },
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

// ---------------------------------------------------------------------------
// GET /api/v1/repositories/:repositoryId/intelligence/graph
// ---------------------------------------------------------------------------

/**
 * Returns a structured visual dependency graph topology dataset for the repository.
 * Query: ?depth=3&nodeType=all&limit=100&filter=services
 */
export async function getGraphTopologyHandler(
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

    const { depth, nodeType, limit, filter } = req.query as {
      depth?: string;
      nodeType?: string;
      limit?: string;
      filter?: string;
    };

    const parsedDepth = depth ? parseInt(depth, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const validNodeType =
      nodeType === 'file' ||
      nodeType === 'symbol' ||
      nodeType === 'module' ||
      nodeType === 'package'
        ? nodeType
        : 'all';

    const { generateRepositoryGraphTopology } =
      await import('../services/graph-topology.service.js');
    const result = await generateRepositoryGraphTopology(repositoryId, user.id, {
      depth: isNaN(parsedDepth as number) ? undefined : parsedDepth,
      limit: isNaN(parsedLimit as number) ? undefined : parsedLimit,
      nodeType: validNodeType,
      filter,
    });

    res.status(200).json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// 6. Automated Onboarding Blueprint Handler
// ---------------------------------------------------------------------------

/**
 * Returns an automated onboarding blueprint and 5-step guided code tour for the repository.
 */
export async function getOnboardingBlueprintHandler(
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

    const { generateOnboardingBlueprint } =
      await import('../services/onboarding-blueprint.service.js');
    const blueprint = await generateOnboardingBlueprint(repositoryId, user.id);

    res.status(200).json({ success: true, data: blueprint });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// 7. Onboarding Step Q&A Handler
// ---------------------------------------------------------------------------

/**
 * Answers a developer's question grounded in a specific onboarding tour step and target file.
 */
export async function askOnboardingStepQuestionHandler(
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
    const { stepNumber, targetFile, query, symbolName } = req.body as {
      stepNumber?: unknown;
      targetFile?: unknown;
      query?: unknown;
      symbolName?: unknown;
    };

    if (
      typeof stepNumber !== 'number' ||
      typeof targetFile !== 'string' ||
      typeof query !== 'string' ||
      query.trim().length === 0
    ) {
      sendBadRequest(res, 'Valid stepNumber, targetFile, and non-empty query are required');
      return;
    }

    if (query.length > 2000) {
      sendBadRequest(res, 'Query exceeds maximum length of 2000 characters');
      return;
    }

    const owned = await verifyRepositoryOwnership(repositoryId, user.id, res);
    if (!owned) return;

    const { askOnboardingStepQuestion } =
      await import('../services/onboarding-blueprint.service.js');

    const result = await askOnboardingStepQuestion(repositoryId, user.id, {
      stepNumber,
      targetFile,
      query: query.trim(),
      symbolName: typeof symbolName === 'string' ? symbolName : undefined,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// 8. Share Onboarding Blueprint Handler (Sprint 7 Task 3)
// ---------------------------------------------------------------------------

/**
 * Creates a stateless HMAC-SHA256 signed share token for a repository's onboarding blueprint.
 * Body: { includeQAHistory?: boolean; customNotes?: string; expiresInDays?: number }
 */
export async function shareOnboardingBlueprintHandler(
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

    const { includeQAHistory, customNotes, expiresInDays } = req.body as {
      includeQAHistory?: unknown;
      customNotes?: unknown;
      expiresInDays?: unknown;
    };

    if (customNotes !== undefined && typeof customNotes !== 'string') {
      sendBadRequest(res, 'customNotes must be a string if provided');
      return;
    }

    if (customNotes && (customNotes as string).length > 2000) {
      sendBadRequest(res, 'customNotes exceeds maximum length of 2000 characters');
      return;
    }

    if (
      expiresInDays !== undefined &&
      (typeof expiresInDays !== 'number' || expiresInDays < 1 || expiresInDays > 30)
    ) {
      sendBadRequest(res, 'expiresInDays must be a number between 1 and 30');
      return;
    }

    const { createBlueprintShareToken } =
      await import('../services/onboarding-blueprint.service.js');

    const result = await createBlueprintShareToken(repositoryId, user.id, {
      includeQAHistory: typeof includeQAHistory === 'boolean' ? includeQAHistory : false,
      customNotes: typeof customNotes === 'string' ? customNotes : undefined,
      expiresInDays: typeof expiresInDays === 'number' ? expiresInDays : undefined,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

// ---------------------------------------------------------------------------
// 9. Get Shared Blueprint (Public Token Retrieval) Handler (Sprint 7 Task 3)
// ---------------------------------------------------------------------------

/**
 * Retrieves a shared onboarding blueprint by validating the HMAC-SHA256 signed share token.
 * This is a public endpoint — no authentication required, but ownership is embedded in the token.
 * Body (optional): { qaThreads?: Record<number, Array<{query, answer, timestamp}>> }
 */
export async function getSharedBlueprintHandler(req: Request, res: Response): Promise<void> {
  try {
    const { shareToken } = req.params as { shareToken: string };

    if (!shareToken || typeof shareToken !== 'string' || shareToken.trim().length === 0) {
      sendBadRequest(res, 'shareToken is required');
      return;
    }

    if (shareToken.length > 4096) {
      sendBadRequest(res, 'shareToken exceeds maximum allowed length');
      return;
    }

    const { qaThreads } = (req.body ?? {}) as {
      qaThreads?: unknown;
    };

    const { resolveSharedBlueprint } = await import('../services/onboarding-blueprint.service.js');

    const view = await resolveSharedBlueprint(
      shareToken,
      typeof qaThreads === 'object' && qaThreads !== null && !Array.isArray(qaThreads)
        ? (qaThreads as Record<number, Array<{ query: string; answer: string; timestamp: string }>>)
        : undefined,
    );

    res.status(200).json({ success: true, data: view });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    if (
      message.includes('expired') ||
      message.includes('signature') ||
      message.includes('malformed') ||
      message.includes('format')
    ) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_SHARE_TOKEN', message },
      });
    } else if (message.includes('no longer exists')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    } else {
      sendInternalError(res, message);
    }
  }
}

// ---------------------------------------------------------------------------
// Architecture Health Handlers (Sprint 8 Task 2)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/health
 * Returns a 100% deterministic architectural health report and anti-pattern findings.
 */
export async function getArchitectureHealthHandler(
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

    const { generateArchitectureHealthReport } =
      await import('../services/architecture-health.service.js');

    const report = await generateArchitectureHealthReport(repositoryId, user.id);
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    sendInternalError(res, message);
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/health/explain
 * Provides a RAG-grounded AI explanation and refactoring plan for a deterministic finding.
 *
 * Body: { findingId: string, category?: string, affectedFiles?: string[] }
 */
export async function explainArchitectureFindingHandler(
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
      findingId?: string;
      category?: string;
      affectedFiles?: string[];
    };

    if (!body.findingId?.trim()) {
      sendBadRequest(res, 'findingId is required.');
      return;
    }

    const { explainArchitectureFinding } =
      await import('../services/architecture-health.service.js');

    const explanation = await explainArchitectureFinding(repositoryId, user.id, {
      findingId: body.findingId.trim(),
      category: body.category as HealthFindingCategory | undefined,
      affectedFiles: body.affectedFiles,
    });

    res.status(200).json({ success: true, data: explanation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as Record<string, unknown>).code)
        : '';
    if (code === 'INVALID_FINDING_ID' || message.includes('not found')) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FINDING_ID', message },
      });
    } else {
      sendInternalError(res, message);
    }
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/risk-intelligence
 * GET /api/v1/repositories/:repositoryId/architecture/risk-intelligence
 * Returns deterministic risk-ranked remediation action plans and projected health scores.
 */
export async function getArchitecturalRiskIntelligenceHandler(
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

    const { generateArchitecturalRiskIntelligence } =
      await import('../services/architecture-risk.service.js');

    const result = await generateArchitecturalRiskIntelligence(repositoryId, user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    sendInternalError(res, message);
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/architecture/remediation-explain
 * POST /api/v1/repositories/:repositoryId/architecture/remediation-explain
 * Generates an evidence-grounded AI code refactoring proposal for a remediation plan.
 *
 * Body: { findingId: string, targetFile?: string }
 */
export async function explainRemediationActionHandler(
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
      findingId?: string;
      targetFile?: string;
    };

    if (!body.findingId?.trim()) {
      sendBadRequest(res, 'findingId is required.');
      return;
    }

    const { explainRemediationAction } = await import('../services/architecture-risk.service.js');

    const result = await explainRemediationAction(repositoryId, user.id, {
      findingId: body.findingId.trim(),
      targetFile: body.targetFile?.trim(),
    });

    res.status(200).json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    if (message.includes('not found')) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_FINDING_ID', message },
      });
    } else {
      sendInternalError(res, message);
    }
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/history
 * GET /api/v1/repositories/:repositoryId/architecture/history
 * Returns historical architecture health trend points over time.
 */
export async function getArchitectureHealthHistoryHandler(
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

    const { getArchitectureHealthHistory } =
      await import('../services/architecture-history.service.js');

    const result = await getArchitectureHealthHistory(repositoryId, user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/compare
 * GET /api/v1/repositories/:repositoryId/architecture/compare
 * Compares two architectural health snapshots to detect score delta, regressions, and new/resolved findings.
 */
export async function compareArchitectureHealthHandler(
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

    const { baselineId, currentId } = req.query as {
      baselineId?: string;
      currentId?: string;
    };

    const { compareArchitectureHealthSnapshots } =
      await import('../services/architecture-history.service.js');

    const result = await compareArchitectureHealthSnapshots(
      repositoryId,
      user.id,
      baselineId,
      currentId,
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
    sendInternalError(res, message);
  }
}
