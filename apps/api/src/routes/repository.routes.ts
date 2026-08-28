// =============================================================================
// ForgeMind API — Repository Router (/api/v1/repositories)
// =============================================================================

import { Router, type Router as RouterType } from 'express';

import { requireAuth } from '../auth/index.js';
import { heavyRouteRateLimiter } from '../lib/rate-limiter.js';
import {
  syncRepositories,
  getRepositories,
  getRepository,
  deleteRepository,
} from '../controllers/repository.controller.js';
import {
  triggerAnalysis,
  retryAnalysis,
  getLatestAnalysis,
  getAnalysisHistory,
  getRepositoryFiles,
  getSymbols,
  getDependencies,
  getRepositoryChunks,
  searchSemanticCode,
  getVectorStatus,
  chatRepositoryRAG,
  getChatHistory,
  clearChatHistory,
  explainCodeHandler,
  fileDependencyIntelligenceHandler,
  impactAnalysisHandler,
  architectureOverviewHandler,
  getGraphTopologyHandler,
  getOnboardingBlueprintHandler,
  askOnboardingStepQuestionHandler,
  shareOnboardingBlueprintHandler,
  getSharedBlueprintHandler,
  getArchitectureHealthHandler,
  explainArchitectureFindingHandler,
  generateStructuredRemediationPlanHandler,
  getArchitecturalRiskIntelligenceHandler,
  explainRemediationActionHandler,
  getArchitectureHealthHistoryHandler,
  compareArchitectureHealthHandler,
} from '../controllers/index.js';

const router: RouterType = Router();
const onboardingShareRouter: RouterType = Router();

/**
 * POST /api/v1/repositories/sync
 * Triggers a full GitHub → database repository sync for the authenticated user.
 */
router.post('/sync', requireAuth, syncRepositories);

/**
 * GET /api/v1/repositories
 * Returns all repositories owned by the authenticated user.
 */
router.get('/', requireAuth, getRepositories);

/**
 * GET /api/v1/repositories/:id
 * Returns a single repository by its database UUID.
 */
router.get('/:id', requireAuth, getRepository);

/**
 * DELETE /api/v1/repositories/:id
 * Deletes a repository record by its database UUID.
 */
router.delete('/:id', requireAuth, deleteRepository);

/**
 * POST /api/v1/repositories/:repositoryId/analyze
 * Triggers repository acquisition and analysis job execution.
 */
router.post('/:repositoryId/analyze', requireAuth, heavyRouteRateLimiter, triggerAnalysis);

/**
 * POST /api/v1/repositories/:repositoryId/retry
 * Retries a failed analysis job for the given repository.
 */
router.post('/:repositoryId/retry', requireAuth, retryAnalysis);

/**
 * GET /api/v1/repositories/:repositoryId/analysis
 * Returns the latest analysis job for the given repository.
 */
router.get('/:repositoryId/analysis', requireAuth, getLatestAnalysis);

/**
 * GET /api/v1/repositories/:repositoryId/analysis/history
 * Returns analysis job history for the given repository.
 */
router.get('/:repositoryId/analysis/history', requireAuth, getAnalysisHistory);

/**
 * GET /api/v1/repositories/:repositoryId/files
 * Returns indexed files for the given repository.
 */
router.get('/:repositoryId/files', requireAuth, getRepositoryFiles);

/**
 * GET /api/v1/repositories/:repositoryId/symbols
 * Returns extracted code symbols for the given repository.
 */
router.get('/:repositoryId/symbols', requireAuth, getSymbols);

/**
 * GET /api/v1/repositories/:repositoryId/dependencies
 * Returns extracted file import dependencies for the given repository.
 */
router.get('/:repositoryId/dependencies', requireAuth, getDependencies);

/**
 * GET /api/v1/repositories/:repositoryId/chunks
 * Returns indexed code chunks for the given repository.
 */
router.get('/:repositoryId/chunks', requireAuth, getRepositoryChunks);

/**
 * POST /api/v1/repositories/:repositoryId/search/semantic
 * Executes a vector semantic search over repository code chunks.
 */
router.post(
  '/:repositoryId/search/semantic',
  requireAuth,
  heavyRouteRateLimiter,
  searchSemanticCode,
);

/**
 * GET /api/v1/repositories/:repositoryId/vector-status
 * Returns vector pipeline status and coverage metrics for the given repository.
 */
router.get('/:repositoryId/vector-status', requireAuth, getVectorStatus);

/**
 * POST /api/v1/repositories/:repositoryId/chat
 * Executes a Retrieval-Augmented Generation (RAG) query over the repository codebase.
 */
router.post('/:repositoryId/chat', requireAuth, heavyRouteRateLimiter, chatRepositoryRAG);

/**
 * GET /api/v1/repositories/:repositoryId/chat/history
 * Returns the most recent chat session and ordered messages for the authenticated user.
 */
router.get('/:repositoryId/chat/history', requireAuth, getChatHistory);

/**
 * DELETE /api/v1/repositories/:repositoryId/chat/history
 * Clears all chat sessions and messages for the authenticated user's repository.
 */
router.delete('/:repositoryId/chat/history', requireAuth, clearChatHistory);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/explain
 * Explains a file or symbol grounded in retrieved code context.
 */
router.post(
  '/:repositoryId/intelligence/explain',
  requireAuth,
  heavyRouteRateLimiter,
  explainCodeHandler,
);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/dependencies
 * Returns incoming/outgoing dependency intelligence for a specific file.
 */
router.get(
  '/:repositoryId/intelligence/dependencies',
  requireAuth,
  fileDependencyIntelligenceHandler,
);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/impact
 * Analyzes the blast radius and affected files/symbols of changing a file/symbol.
 */
router.post(
  '/:repositoryId/intelligence/impact',
  requireAuth,
  heavyRouteRateLimiter,
  impactAnalysisHandler,
);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture
 * Returns a structured architecture overview of the repository.
 */
router.get('/:repositoryId/intelligence/architecture', requireAuth, architectureOverviewHandler);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/graph
 * GET /api/v1/repositories/:repositoryId/graph
 * Returns a structured visual dependency graph topology dataset for the repository.
 */
router.get('/:repositoryId/intelligence/graph', requireAuth, getGraphTopologyHandler);
router.get('/:repositoryId/graph', requireAuth, getGraphTopologyHandler);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/blueprint
 * GET /api/v1/repositories/:repositoryId/onboarding/blueprint
 * Returns an automated onboarding blueprint and 5-step guided code tour.
 */
router.get('/:repositoryId/intelligence/blueprint', requireAuth, getOnboardingBlueprintHandler);
router.get('/:repositoryId/onboarding/blueprint', requireAuth, getOnboardingBlueprintHandler);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/blueprint/step-ask
 * Answers a developer's question grounded in a specific onboarding tour step.
 */
router.post(
  '/:repositoryId/intelligence/blueprint/step-ask',
  requireAuth,
  heavyRouteRateLimiter,
  askOnboardingStepQuestionHandler,
);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/blueprint/share
 * Creates a stateless HMAC-SHA256 signed share token for the onboarding blueprint.
 */
router.post(
  '/:repositoryId/intelligence/blueprint/share',
  requireAuth,
  heavyRouteRateLimiter,
  shareOnboardingBlueprintHandler,
);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/health
 * Returns deterministic 0-100 architecture health score and findings.
 */
router.get('/:repositoryId/intelligence/health', requireAuth, getArchitectureHealthHandler);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/health/explain
 * Provides a RAG-grounded AI explanation and refactoring plan for an architectural finding.
 */
router.post(
  '/:repositoryId/intelligence/health/explain',
  requireAuth,
  heavyRouteRateLimiter,
  explainArchitectureFindingHandler,
);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/health/remediation-plan
 * Generates a structured, repository-grounded refactoring remediation plan for an architectural finding.
 */
router.post(
  '/:repositoryId/intelligence/health/remediation-plan',
  requireAuth,
  heavyRouteRateLimiter,
  generateStructuredRemediationPlanHandler,
);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/risk-intelligence
 * GET /api/v1/repositories/:repositoryId/architecture/risk-intelligence
 * Returns deterministic risk-ranked remediation action plans and projected health scores.
 */
router.get(
  '/:repositoryId/intelligence/architecture/risk-intelligence',
  requireAuth,
  getArchitecturalRiskIntelligenceHandler,
);
router.get(
  '/:repositoryId/architecture/risk-intelligence',
  requireAuth,
  getArchitecturalRiskIntelligenceHandler,
);

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/architecture/remediation-explain
 * POST /api/v1/repositories/:repositoryId/architecture/remediation-explain
 * Generates an evidence-grounded AI code refactoring proposal for a remediation plan.
 */
router.post(
  '/:repositoryId/intelligence/architecture/remediation-explain',
  requireAuth,
  heavyRouteRateLimiter,
  explainRemediationActionHandler,
);
router.post(
  '/:repositoryId/architecture/remediation-explain',
  requireAuth,
  heavyRouteRateLimiter,
  explainRemediationActionHandler,
);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/history
 * GET /api/v1/repositories/:repositoryId/architecture/history
 * Returns historical architecture health trend points over time.
 */
router.get(
  '/:repositoryId/intelligence/architecture/history',
  requireAuth,
  getArchitectureHealthHistoryHandler,
);
router.get('/:repositoryId/architecture/history', requireAuth, getArchitectureHealthHistoryHandler);

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture/compare
 * GET /api/v1/repositories/:repositoryId/architecture/compare
 * Compares two architectural health snapshots to detect score delta and new/resolved findings.
 */
router.get(
  '/:repositoryId/intelligence/architecture/compare',
  requireAuth,
  compareArchitectureHealthHandler,
);
router.get('/:repositoryId/architecture/compare', requireAuth, compareArchitectureHealthHandler);

/**
 * GET /api/v1/onboarding/share/:shareToken
 * Public retrieval of a shared onboarding blueprint by share token (no auth required).
 */
onboardingShareRouter.get('/:shareToken', heavyRouteRateLimiter, getSharedBlueprintHandler);

export { router as repositoryRouter, onboardingShareRouter };
