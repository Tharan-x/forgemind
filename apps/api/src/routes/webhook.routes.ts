// =============================================================================
// ForgeMind API — GitHub Webhook Router
// =============================================================================
//
// IMPORTANT: This router must be registered in app.ts with express.raw()
// middleware BEFORE express.json(). The HMAC-SHA256 signature verification
// requires the raw request body Buffer. If express.json() runs first,
// the raw bytes are consumed and verification will always fail.
// =============================================================================

import express, { Router, type Router as RouterType } from 'express';

import { handleGitHubWebhook } from '../controllers/webhook.controller.js';

const webhookRouter: RouterType = Router();

/**
 * POST /api/v1/github/webhooks
 *
 * Receives GitHub webhook deliveries.
 * Uses express.raw() to preserve the unmodified request body Buffer,
 * which is required for HMAC-SHA256 signature verification.
 *
 * No authentication middleware (requireAuth) — GitHub webhooks are
 * verified exclusively via the X-Hub-Signature-256 HMAC header.
 */
webhookRouter.post('/', express.raw({ type: '*/*', limit: '10mb' }), handleGitHubWebhook);

export { webhookRouter };
