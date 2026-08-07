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

export { router as repositoryRouter };
