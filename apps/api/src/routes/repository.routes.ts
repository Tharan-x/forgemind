// =============================================================================
// ForgeMind API — Repository Router (/api/v1/repositories)
// =============================================================================

import { Router, type Router as RouterType } from 'express';

import { requireAuth } from '../auth/index.js';
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
router.post('/:repositoryId/analyze', requireAuth, triggerAnalysis);

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
router.post('/:repositoryId/search/semantic', requireAuth, searchSemanticCode);

/**
 * GET /api/v1/repositories/:repositoryId/vector-status
 * Returns vector pipeline status and coverage metrics for the given repository.
 */
router.get('/:repositoryId/vector-status', requireAuth, getVectorStatus);

/**
 * POST /api/v1/repositories/:repositoryId/chat
 * Executes a Retrieval-Augmented Generation (RAG) query over the repository codebase.
 */
router.post('/:repositoryId/chat', requireAuth, chatRepositoryRAG);

export { router as repositoryRouter };
