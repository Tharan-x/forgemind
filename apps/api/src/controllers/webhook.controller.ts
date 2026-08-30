// =============================================================================
// ForgeMind API — GitHub Webhook Controller
// =============================================================================
//
// Handles incoming GitHub webhook deliveries at POST /api/v1/github/webhooks.
//
// SECURITY & RESPONSIBILITIES:
//   1. Obtain raw body Buffer & headers
//   2. Verify HMAC-SHA256 signature (X-Hub-Signature-256)
//   3. Validate required GitHub webhook headers (X-GitHub-Event, X-GitHub-Delivery)
//   4. Safely parse JSON body
//   5. Delegate event normalization, idempotency, and persistence to services
//   6. Return appropriate HTTP status codes & JSON responses
// =============================================================================

import type { Request, Response } from 'express';

import { verifyWebhookSignature } from '../services/webhook-security.service.js';
import { processWebhookDelivery } from '../services/webhook-event.service.js';

/**
 * POST /api/v1/github/webhooks
 *
 * Entry point for GitHub webhook deliveries.
 * Requires route-level express.raw() middleware so req.body is a raw Buffer.
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  try {
    const rawBody = req.body as Buffer;

    const signatureHeader =
      typeof req.headers['x-hub-signature-256'] === 'string'
        ? req.headers['x-hub-signature-256']
        : Array.isArray(req.headers['x-hub-signature-256'])
          ? req.headers['x-hub-signature-256'][0]
          : undefined;

    const eventType =
      typeof req.headers['x-github-event'] === 'string'
        ? req.headers['x-github-event']
        : Array.isArray(req.headers['x-github-event'])
          ? req.headers['x-github-event'][0]
          : undefined;

    const deliveryId =
      typeof req.headers['x-github-delivery'] === 'string'
        ? req.headers['x-github-delivery']
        : Array.isArray(req.headers['x-github-delivery'])
          ? req.headers['x-github-delivery'][0]
          : undefined;

    // ── 1. HMAC Signature Verification ────────────────────────────────────────
    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      // eslint-disable-next-line no-console
      console.warn('[Webhook] Signature verification failed', {
        event: eventType,
        deliveryId,
        ip: req.ip,
      });
      res.status(401).json({
        success: false,
        error: {
          code: 'WEBHOOK_SIGNATURE_INVALID',
          message: 'Webhook signature verification failed.',
        },
      });
      return;
    }

    // ── 2. Header Validation ──────────────────────────────────────────────────
    if (!eventType || !deliveryId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_WEBHOOK_HEADERS',
          message: 'Missing X-GitHub-Event or X-GitHub-Delivery header.',
        },
      });
      return;
    }

    // ── 3. Parse JSON Body ─────────────────────────────────────────────────────
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_JSON_PAYLOAD',
          message: 'Invalid JSON webhook payload.',
        },
      });
      return;
    }

    // ── 4. Delegate to Webhook Ingestion Service ──────────────────────────────
    const result = await processWebhookDelivery({
      deliveryId,
      eventType,
      payload,
    });

    // ── 5. Respond ────────────────────────────────────────────────────────────
    if (result.status === 'duplicate') {
      res.status(200).json({
        received: true,
        status: 'duplicate',
        deliveryId,
      });
      return;
    }

    if (result.status === 'ignored') {
      res.status(200).json({
        received: true,
        status: 'ignored',
        deliveryId,
        reason: result.ignoredReason,
      });
      return;
    }

    res.status(200).json({
      received: true,
      status: 'processed',
      deliveryId,
      repositoryId: result.repositoryId,
      event: result.event,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process webhook delivery.';
    // eslint-disable-next-line no-console
    console.error('[Webhook] Internal error during webhook processing', { error: message });

    // Respond 500 so GitHub retries delivery on DB / infrastructure failure
    res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_PROCESSING_ERROR',
        message: 'Internal error during webhook processing.',
      },
    });
  }
}
