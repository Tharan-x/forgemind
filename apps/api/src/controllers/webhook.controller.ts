// =============================================================================
// ForgeMind API — GitHub Webhook Controller
// =============================================================================
//
// Handles incoming GitHub webhook deliveries at POST /api/v1/github/webhooks.
//
// SECURITY:
//   - HMAC-SHA256 signature verified before any payload processing.
//   - Always responds 200 OK after verification (GitHub expects 2xx; errors
//     are logged server-side only — never exposed in the response body).
//   - For invalid signatures, responds 401 with minimal error detail.
// =============================================================================

import type { Request, Response } from 'express';

import { verifyWebhookSignature } from '../services/webhook-security.service.js';

/**
 * POST /api/v1/github/webhooks
 *
 * Entry point for all GitHub webhook deliveries. Verifies the HMAC-SHA256
 * signature, then hands off supported events to appropriate handlers.
 *
 * Requires the route to be registered with express.raw() middleware so that
 * req.body is the raw Buffer (not a parsed JSON object).
 */
export async function handleGitHubWebhook(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;
  const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
  const eventType = req.headers['x-github-event'] as string | undefined;
  const deliveryId = req.headers['x-github-delivery'] as string | undefined;

  // ── 1. HMAC Signature Verification ────────────────────────────────────────
  if (!verifyWebhookSignature(rawBody, signatureHeader)) {
    // Log a sanitized warning — never log the signature value or body content
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

  // ── 2. Route by event type ─────────────────────────────────────────────────
  // Phase 7.1: acknowledge receipt and log the event.
  // Phase 7.2+ will add PR event normalization and job enqueuing.
  // eslint-disable-next-line no-console
  console.info('[Webhook] Received verified event', { event: eventType, deliveryId });

  // Respond immediately. GitHub requires a 2xx response within 10 seconds.
  res.status(200).json({ received: true });
}
