/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — GitHub Webhook Security Test Suite
// Tests HMAC-SHA256 signature verification for incoming webhook deliveries.
//
// Security invariants tested:
//   - Correct signature → verified (true)
//   - Tampered body → rejected (false)
//   - Tampered signature → rejected (false)
//   - Missing header → rejected (false)
//   - Missing/empty secret → rejected (false)
//   - Wrong prefix → rejected (false)
//   - Buffer-length mismatch → rejected (false), no exception
// =============================================================================

import crypto from 'node:crypto';

import { verifyWebhookSignature } from './webhook-security.service.js';

// ─── Test Utilities ───────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-webhook-secret-forgemind-ci-32';

function makeSignature(body: Buffer, secret = TEST_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hmac}`;
}

function withSecret(secret: string | undefined, fn: () => void): void {
  const original = process.env['GITHUB_WEBHOOK_SECRET'];
  if (secret === undefined) {
    delete process.env['GITHUB_WEBHOOK_SECRET'];
  } else {
    process.env['GITHUB_WEBHOOK_SECRET'] = secret;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env['GITHUB_WEBHOOK_SECRET'];
    } else {
      process.env['GITHUB_WEBHOOK_SECRET'] = original;
    }
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

export async function runWebhookSecurityTests(): Promise<void> {
  console.log('🧪 ForgeMind — GitHub Webhook HMAC Security Test Suite\n');

  // ── Test 1: Valid signature ─────────────────────────────────────────────────
  {
    const body = Buffer.from('{"action":"opened","pull_request":{"number":1}}');
    const sig = makeSignature(body);
    let result = false;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, sig);
    });
    assertEqual(result, true, 'Test 1: Valid matching signature is accepted');
    console.log('  ✅ Test 1 PASS: Valid matching signature accepted');
  }

  // ── Test 2: Empty body with valid signature ─────────────────────────────────
  {
    const body = Buffer.from('');
    const sig = makeSignature(body);
    let result = false;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, sig);
    });
    assertEqual(result, true, 'Test 2: Valid signature for empty body');
    console.log('  ✅ Test 2 PASS: Empty body with valid signature accepted');
  }

  // ── Test 3: Tampered body (one byte changed) ────────────────────────────────
  {
    const originalBody = Buffer.from('{"action":"opened"}');
    const tamperedBody = Buffer.from('{"action":"closed"}');
    const sig = makeSignature(originalBody);
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(tamperedBody, sig);
    });
    assertEqual(result, false, 'Test 3: Tampered body is rejected');
    console.log('  ✅ Test 3 PASS: Tampered body rejected');
  }

  // ── Test 4: Tampered body (bytes appended) ──────────────────────────────────
  {
    const originalBody = Buffer.from('{"action":"opened"}');
    const tamperedBody = Buffer.from('{"action":"opened"} INJECTED');
    const sig = makeSignature(originalBody);
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(tamperedBody, sig);
    });
    assertEqual(result, false, 'Test 4: Injected bytes in body are rejected');
    console.log('  ✅ Test 4 PASS: Injected bytes in body rejected');
  }

  // ── Test 5: Modified signature hex ─────────────────────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const validSig = makeSignature(body);
    const tamperedSig = validSig.slice(0, -1) + (validSig.endsWith('0') ? '1' : '0');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, tamperedSig);
    });
    assertEqual(result, false, 'Test 5: Modified signature hex is rejected');
    console.log('  ✅ Test 5 PASS: Modified signature hex rejected');
  }

  // ── Test 6: Wrong secret used to generate signature ─────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const wrongSig = makeSignature(body, 'completely-different-secret');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, wrongSig);
    });
    assertEqual(result, false, 'Test 6: Signature from wrong secret rejected');
    console.log('  ✅ Test 6 PASS: Signature from wrong secret rejected');
  }

  // ── Test 7: Missing signature header (undefined) ────────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, undefined);
    });
    assertEqual(result, false, 'Test 7: undefined signature header is rejected');
    console.log('  ✅ Test 7 PASS: Undefined signature header rejected');
  }

  // ── Test 8: Empty signature header ─────────────────────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, '');
    });
    assertEqual(result, false, 'Test 8: Empty signature header is rejected');
    console.log('  ✅ Test 8 PASS: Empty signature header rejected');
  }

  // ── Test 9: No sha256= prefix ───────────────────────────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const rawHex = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, rawHex); // no "sha256=" prefix
    });
    assertEqual(result, false, 'Test 9: Missing sha256= prefix is rejected');
    console.log('  ✅ Test 9 PASS: Missing sha256= prefix rejected');
  }

  // ── Test 10: Wrong algorithm prefix (sha1= instead of sha256=) ─────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const rawHex = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    let result = true;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, `sha1=${rawHex}`);
    });
    assertEqual(result, false, 'Test 10: sha1= prefix is rejected');
    console.log('  ✅ Test 10 PASS: Wrong algorithm prefix (sha1=) rejected');
  }

  // ── Test 11: GITHUB_WEBHOOK_SECRET env var not set ─────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const sig = makeSignature(body);
    let result = true;
    withSecret(undefined, () => {
      result = verifyWebhookSignature(body, sig);
    });
    assertEqual(result, false, 'Test 11: Missing env secret → rejected');
    console.log('  ✅ Test 11 PASS: Missing GITHUB_WEBHOOK_SECRET rejected');
  }

  // ── Test 12: GITHUB_WEBHOOK_SECRET is empty string ─────────────────────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const sig = makeSignature(body);
    let result = true;
    withSecret('', () => {
      result = verifyWebhookSignature(body, sig);
    });
    assertEqual(result, false, 'Test 12: Empty env secret → rejected');
    console.log('  ✅ Test 12 PASS: Empty GITHUB_WEBHOOK_SECRET rejected');
  }

  // ── Test 13: Timing-safe path — signature too short (no exception) ──────────
  {
    const body = Buffer.from('{"action":"opened"}');
    let threwError = false;
    let result = true;
    withSecret(TEST_SECRET, () => {
      try {
        result = verifyWebhookSignature(body, 'sha256=dead'); // too short
      } catch {
        threwError = true;
      }
    });
    assertEqual(threwError, false, 'Test 13: Short signature does not throw');
    assertEqual(result, false, 'Test 13: Short signature is rejected');
    console.log('  ✅ Test 13 PASS: Short signature rejected without exception');
  }

  // ── Test 14: Timing-safe path — signature too long (no exception) ───────────
  {
    const body = Buffer.from('{"action":"opened"}');
    const sig = makeSignature(body);
    let threwError = false;
    let result = true;
    withSecret(TEST_SECRET, () => {
      try {
        result = verifyWebhookSignature(body, sig + 'extra');
      } catch {
        threwError = true;
      }
    });
    assertEqual(threwError, false, 'Test 14: Long signature does not throw');
    assertEqual(result, false, 'Test 14: Long signature is rejected');
    console.log('  ✅ Test 14 PASS: Long signature rejected without exception');
  }

  // ── Test 15: Large realistic PR webhook payload ─────────────────────────────
  {
    const largePayload = JSON.stringify({
      action: 'synchronize',
      number: 42,
      pull_request: {
        head: { sha: 'abc123def456' },
        base: { sha: 'base000sha', ref: 'main' },
        title: 'feat: implement Phase 7',
        body: 'A'.repeat(10000),
      },
      repository: {
        id: 12345678,
        full_name: 'acme/my-repo',
        owner: { login: 'acme' },
      },
    });
    const body = Buffer.from(largePayload);
    const sig = makeSignature(body);
    let result = false;
    withSecret(TEST_SECRET, () => {
      result = verifyWebhookSignature(body, sig);
    });
    assertEqual(result, true, 'Test 15: Large payload with valid signature accepted');
    console.log('  ✅ Test 15 PASS: Large PR payload with valid signature accepted');
  }

  console.log('\n🎉 ALL WEBHOOK SECURITY TESTS PASSED SUCCESSFULLY!\n');
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

await runWebhookSecurityTests();
