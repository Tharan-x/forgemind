// =============================================================================
// ForgeMind API — Webhook HMAC-SHA256 Signature Security Service
// =============================================================================
//
// Verifies GitHub webhook payloads using HMAC-SHA256 signatures.
//
// SECURITY RULES:
//   - rawBody MUST be the unmodified request Buffer (before any JSON parsing).
//   - Uses crypto.timingSafeEqual to prevent timing-side-channel attacks.
//   - Never logs the signatureHeader value, rawBody contents, or GITHUB_WEBHOOK_SECRET.
//   - Returns false (not throws) on any verification failure.
// =============================================================================

import crypto from 'node:crypto';

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verifies that a GitHub webhook payload matches the expected HMAC-SHA256 signature.
 *
 * @param rawBody    The raw unmodified request body Buffer.
 * @param signatureHeader  The value of the X-Hub-Signature-256 request header.
 * @returns true if the signature is valid, false in all other cases.
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
): boolean {
  const secret = process.env['GITHUB_WEBHOOK_SECRET'];
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (!secret) {
    if (isProduction) {
      // eslint-disable-next-line no-console
      console.error(
        '[Webhook Security] Production error: GITHUB_WEBHOOK_SECRET environment variable is not configured.',
      );
    }
    // In missing secret cases (production or dev), webhook verification fails safely.
    return false;
  }

  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }

  const expected = `${SIGNATURE_PREFIX}${crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')}`;

  try {
    // crypto.timingSafeEqual prevents timing-side-channel attacks.
    // Both buffers must be the same byte length; if not, it throws.
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'utf8'),
      Buffer.from(signatureHeader, 'utf8'),
    );
  } catch {
    // Buffers of different lengths — signature is definitely invalid.
    // No exception is propagated; information about expected vs actual is not exposed.
    return false;
  }
}

/**
 * Checks whether GITHUB_WEBHOOK_SECRET is configured.
 */
export function isWebhookSecretConfigured(): boolean {
  const secret = process.env['GITHUB_WEBHOOK_SECRET'];
  return Boolean(secret && secret.trim().length > 0);
}
