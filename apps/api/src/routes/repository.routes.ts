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
} from '../controllers/index.js';

const router: RouterType = Router();

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

export { router as repositoryRouter };
