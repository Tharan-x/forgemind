// =============================================================================
// ForgeMind API — PR Architecture Gatekeeper & Webhook Dashboard Controller
// =============================================================================

import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/index.js';
import {
  getGatekeeperConfig,
  updateGatekeeperConfig,
  resetGatekeeperConfigToDefault,
  getWebhookStatus,
} from '../services/gatekeeper-config.service.js';
import {
  getGatekeeperOverview,
  getGatekeeperPRs,
  getGatekeeperPRDetail,
  getGatekeeperWebhooks,
} from '../services/gatekeeper-dashboard.service.js';
import { getPRArchitectureImpact } from '../services/architecture-impact.service.js';
import { assertRepositoryOwnership } from '../services/repository.service.js';

function sendInternalError(res: Response, message = 'An unexpected error occurred.'): void {
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}

function getParamString(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/overview
 *
 * Returns summary metrics for the PR Architecture Gatekeeper dashboard.
 */
export async function getGatekeeperOverviewHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const overview = await getGatekeeperOverview(repositoryId);
    res.status(200).json({ success: true, overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs
 *
 * Returns paginated PR gatekeeper analysis history.
 */
export async function getGatekeeperPRsHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const page = parseInt((req.query['page'] as string) || '1', 10);
    const limit = parseInt((req.query['limit'] as string) || '10', 10);

    const data = await getGatekeeperPRs(repositoryId, page, limit);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs/:prNumber
 *
 * Returns detailed PR analysis, comparison, and policy decision for a specific PR number.
 */
export async function getGatekeeperPRDetailHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    const prNumberStr = getParamString(req.params['prNumber']);

    if (!repositoryId || !prNumberStr) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID and PR number are required.' },
      });
      return;
    }

    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Invalid PR number parameter.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    try {
      const detail = await getGatekeeperPRDetail(repositoryId, prNumber);
      res.status(200).json({ success: true, detail });
    } catch (detailErr) {
      const message = detailErr instanceof Error ? detailErr.message : 'PR analysis not found.';
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/webhooks
 *
 * Returns paginated webhook delivery execution logs for a repository.
 */
export async function getGatekeeperWebhooksHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const page = parseInt((req.query['page'] as string) || '1', 10);
    const limit = parseInt((req.query['limit'] as string) || '10', 10);

    const data = await getGatekeeperWebhooks(repositoryId, page, limit);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/config
 *
 * Returns the current gatekeeper policy configuration for a repository.
 */
export async function getGatekeeperConfigHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const config = await getGatekeeperConfig(repositoryId);
    res.status(200).json({ success: true, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * PUT /api/v1/repositories/:repositoryId/gatekeeper/config
 *
 * Updates gatekeeper policy thresholds for a repository.
 */
export async function updateGatekeeperConfigHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    try {
      const config = await updateGatekeeperConfig(repositoryId, req.body || {});
      res.status(200).json({ success: true, config });
    } catch (valErr) {
      const valMessage =
        valErr instanceof Error ? valErr.message : 'Invalid configuration payload.';
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: valMessage },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * POST /api/v1/repositories/:repositoryId/gatekeeper/config/reset
 *
 * Resets repository gatekeeper policy thresholds to system defaults.
 */
export async function resetGatekeeperConfigHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const config = await resetGatekeeperConfigToDefault(repositoryId);
    res.status(200).json({ success: true, config });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/webhooks/status
 *
 * Returns safe webhook configuration status and setup guidance.
 */
export async function getWebhookStatusHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    if (!repositoryId) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Repository ID is required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const status = await getWebhookStatus(repositoryId);
    res.status(200).json({ success: true, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : undefined;
    sendInternalError(res, message);
  }
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs/:prNumber/impact
 *
 * Returns structured Architecture Impact summary for a specific PR number.
 */
export async function getPRArchitectureImpactHandler(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' },
      });
      return;
    }

    const repositoryId = getParamString(req.params['repositoryId']);
    const prNumberRaw = getParamString(req.params['prNumber']);
    const prNumber = prNumberRaw ? parseInt(prNumberRaw, 10) : NaN;

    if (!repositoryId || isNaN(prNumber)) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Valid repository ID and PR number are required.' },
      });
      return;
    }

    try {
      await assertRepositoryOwnership(repositoryId, user.id);
    } catch (authErr) {
      const authMessage = authErr instanceof Error ? authErr.message : 'Access denied.';
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: authMessage },
      });
      return;
    }

    const impact = await getPRArchitectureImpact(repositoryId, prNumber, user.id);
    res.status(200).json({ success: true, impact });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    if (message.includes('No PR analysis found') || message.includes('Repository not found')) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message },
      });
      return;
    }
    sendInternalError(res, message);
  }
}
