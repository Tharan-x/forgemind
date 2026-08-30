// =============================================================================
// ForgeMind API — GitHub Webhook Router
// =============================================================================
//
// IMPORTANT: This router is mounted in app.ts at /api/v1/github/webhooks with
// express.raw() BEFORE global express.json().
// The HMAC-SHA256 signature verification requires the raw request body Buffer.
// =============================================================================

import { Router, type Router as RouterType } from 'express';

import { handleGitHubWebhook } from '../controllers/webhook.controller.js';

const webhookRouter: RouterType = Router();

/**
 * POST /api/v1/github/webhooks
 *
 * Receives GitHub webhook deliveries.
 * Preserves the unmodified request body Buffer for HMAC-SHA256 signature verification.
 * No authentication middleware (requireAuth) — GitHub webhooks are verified exclusively
 * via the X-Hub-Signature-256 HMAC header.
 */
webhookRouter.post('/', handleGitHubWebhook);

export { webhookRouter };
