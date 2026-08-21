import { Router, type IRouter } from 'express';

import { healthHandler } from './health.js';
import { authRouter } from './auth.js';
import { repositoryRouter, onboardingShareRouter } from './repository.routes.js';

const router: IRouter = Router();

// Health check
router.get('/health', healthHandler);

// Auth endpoints
router.use('/auth', authRouter);

// Repository endpoints
router.use('/repositories', repositoryRouter);

// Public onboarding share endpoints (no auth required — token self-validates)
router.use('/onboarding/share', onboardingShareRouter);

// Hello World — Sprint 0 smoke test
router.get('/', (_req, res) => {
  res.json({
    message: 'ForgeMind API — Sprint 0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

export { router, repositoryRouter, onboardingShareRouter };
