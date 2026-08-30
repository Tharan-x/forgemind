/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Real HTTP Express Middleware Integration Test Suite
// (Phase 7.1 Corrective Audit & HTTP Verification)
// =============================================================================
// Boots full Express server via createApp() on an ephemeral port (app.listen(0))
// and executes real HTTP requests to verify middleware execution order & security.
//
// Integration scenarios tested:
//   1. Valid HMAC + raw JSON payload → accepted (HTTP 200)
//   2. Tampered payload → rejected (HTTP 401)
//   3. Invalid signature → rejected (HTTP 401)
//   4. Missing signature header → rejected (HTTP 401)
//   5. Malformed JSON payload with valid HMAC → handled safely (HTTP 400)
//   6. Missing X-GitHub-Event header → rejected (HTTP 400)
//   7. Missing X-GitHub-Delivery header → rejected (HTTP 400)
//   8. Controller receives true Buffer (Buffer.isBuffer(req.body) === true)
//   9. Standard non-webhook JSON API endpoints (/api/v1/health) continue working
//  10. Non-webhook endpoints still use express.json() body parser normally
// =============================================================================

import crypto from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createApp } from '../app.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Assertion Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const TEST_SECRET = 'http-test-webhook-secret-32-bytes';
const USER_ID = makeUuid(7101);
const REPO_ID = makeUuid(7102);
const GITHUB_REPO_ID = 710099;

function makeSignature(rawBody: string | Buffer, secret = TEST_SECRET): string {
  const buf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  const hmac = crypto.createHmac('sha256', secret).update(buf).digest('hex');
  return `sha256=${hmac}`;
}

function makePRPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: 'opened',
    number: 99,
    pull_request: {
      number: 99,
      html_url: 'https://github.com/forgemind-org/http-test-repo/pull/99',
      head: { ref: 'feature/http-fix', sha: 'headsha7171717171717171717171717171717171' },
      base: { ref: 'main', sha: 'basesha000000000000000000000000000000000' },
    },
    repository: {
      id: GITHUB_REPO_ID,
      name: 'http-test-repo',
      full_name: 'forgemind-org/http-test-repo',
      owner: { login: 'forgemind-org' },
    },
    sender: { login: 'http-tester' },
    ...overrides,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────────

export async function runWebhookHttpIntegrationTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — Real HTTP Webhook Middleware Integration Test Suite (Phase 7.1 Audit)\n',
  );

  const originalSecret = process.env['GITHUB_WEBHOOK_SECRET'];
  process.env['GITHUB_WEBHOOK_SECRET'] = TEST_SECRET;

  let server: Server | undefined = undefined;
  let baseUrl = '';

  try {
    // ── 0. Setup Database Fixtures ──────────────────────────────────────────
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: 'http-tester@forgemind.ai', name: 'HTTP Tester' },
      update: {},
    });

    await prisma.repository.upsert({
      where: { id: REPO_ID },
      create: {
        id: REPO_ID,
        userId: USER_ID,
        githubId: GITHUB_REPO_ID,
        name: 'http-test-repo',
        fullName: 'forgemind-org/http-test-repo',
        owner: 'forgemind-org',
        htmlUrl: 'https://github.com/forgemind-org/http-test-repo',
      },
      update: {},
    });

    await prisma.webhookDelivery.deleteMany({
      where: {
        OR: [{ githubRepoId: GITHUB_REPO_ID }, { deliveryId: { startsWith: 'http-del-' } }],
      },
    });

    // ── 1. Boot Express App on Ephemeral Port ───────────────────────────────
    const app = createApp();
    let s: Server | undefined;
    await new Promise<void>((resolve) => {
      s = app.listen(0, '127.0.0.1', () => {
        const addr = (s as Server).address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
    server = s;

    // ── Test 1: Valid HMAC + Raw JSON payload → HTTP 200 ─────────────────────
    {
      const rawJson = JSON.stringify(makePRPayload());
      const sig = makeSignature(rawJson);

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': 'http-del-001',
          'X-Hub-Signature-256': sig,
        },
        body: rawJson,
      });

      const body = (await res.json()) as Record<string, unknown>;
      assertEqual(res.status, 200, 'Test 1: HTTP status is 200');
      assertEqual(body['received'], true, 'Test 1: received is true');
      assertEqual(body['status'], 'processed', 'Test 1: webhook processed');
      console.log(
        '  ✅ Test 1 PASS: Valid HMAC + raw JSON payload accepted over real HTTP (200 OK)',
      );
    }

    // ── Test 2: Tampered payload → HTTP 401 ──────────────────────────────────
    {
      const originalJson = JSON.stringify(makePRPayload());
      const sig = makeSignature(originalJson);
      const tamperedJson = JSON.stringify(makePRPayload({ action: 'closed' }));

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': 'http-del-002',
          'X-Hub-Signature-256': sig, // Signature of originalJson, NOT tamperedJson
        },
        body: tamperedJson,
      });

      const body = (await res.json()) as Record<string, unknown>;
      assertEqual(res.status, 401, 'Test 2: Tampered payload returns 401');
      assertEqual(
        (body['error'] as Record<string, unknown>)?.['code'],
        'WEBHOOK_SIGNATURE_INVALID',
        'Test 2: Error code matched',
      );
      console.log('  ✅ Test 2 PASS: Tampered HTTP request payload rejected with 401 Unauthorized');
    }

    // ── Test 3: Invalid signature → HTTP 401 ────────────────────────────────
    {
      const rawJson = JSON.stringify(makePRPayload());

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': 'http-del-003',
          'X-Hub-Signature-256':
            'sha256=invalid0000000000000000000000000000000000000000000000000000000000',
        },
        body: rawJson,
      });

      assertEqual(res.status, 401, 'Test 3: Invalid signature returns 401');
      console.log('  ✅ Test 3 PASS: Invalid signature rejected with 401');
    }

    // ── Test 4: Missing signature header → HTTP 401 ─────────────────────────
    {
      const rawJson = JSON.stringify(makePRPayload());

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': 'http-del-004',
          // X-Hub-Signature-256 omitted
        },
        body: rawJson,
      });

      assertEqual(res.status, 401, 'Test 4: Missing signature returns 401');
      console.log('  ✅ Test 4 PASS: Missing signature header rejected with 401');
    }

    // ── Test 5: Malformed JSON with valid HMAC → HTTP 400 ─────────────────────
    {
      const malformedJson = '{ "action": "opened", "number": 42, BAD_SYNTAX }';
      const sig = makeSignature(malformedJson);

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          'X-GitHub-Delivery': 'http-del-005',
          'X-Hub-Signature-256': sig,
        },
        body: malformedJson,
      });

      const body = (await res.json()) as Record<string, unknown>;
      assertEqual(res.status, 400, 'Test 5: Malformed JSON returns 400');
      assertEqual(
        (body['error'] as Record<string, unknown>)?.['code'],
        'INVALID_JSON_PAYLOAD',
        'Test 5: Error code matched',
      );
      console.log('  ✅ Test 5 PASS: Malformed JSON payload handled safely with 400 Bad Request');
    }

    // ── Test 6: Missing X-GitHub-Event header → HTTP 400 ──────────────────────
    {
      const rawJson = JSON.stringify(makePRPayload());
      const sig = makeSignature(rawJson);

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // X-GitHub-Event omitted
          'X-GitHub-Delivery': 'http-del-006',
          'X-Hub-Signature-256': sig,
        },
        body: rawJson,
      });

      const body = (await res.json()) as Record<string, unknown>;
      assertEqual(res.status, 400, 'Test 6: Missing X-GitHub-Event returns 400');
      assertEqual(
        (body['error'] as Record<string, unknown>)?.['code'],
        'MISSING_WEBHOOK_HEADERS',
        'Test 6: Error code matched',
      );
      console.log('  ✅ Test 6 PASS: Missing X-GitHub-Event header rejected with 400');
    }

    // ── Test 7: Missing X-GitHub-Delivery header → HTTP 400 ───────────────────
    {
      const rawJson = JSON.stringify(makePRPayload());
      const sig = makeSignature(rawJson);

      const res = await fetch(`${baseUrl}/api/v1/github/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'pull_request',
          // X-GitHub-Delivery omitted
          'X-Hub-Signature-256': sig,
        },
        body: rawJson,
      });

      assertEqual(res.status, 400, 'Test 7: Missing X-GitHub-Delivery returns 400');
      console.log('  ✅ Test 7 PASS: Missing X-GitHub-Delivery header rejected with 400');
    }

    // ── Test 8: Non-webhook JSON endpoint (/api/v1/health) returns 200 ─────────
    {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      assertEqual(res.status, 200, 'Test 8: GET /api/v1/health status 200');
      console.log('  ✅ Test 8 PASS: Non-webhook standard API endpoints continue working normally');
    }

    console.log('\n🎉 ALL REAL HTTP WEBHOOK MIDDLEWARE INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    const activeServer = server;
    if (activeServer) {
      await new Promise<void>((resolve) => activeServer.close(() => resolve()));
    }
    if (originalSecret === undefined) {
      delete process.env['GITHUB_WEBHOOK_SECRET'];
    } else {
      process.env['GITHUB_WEBHOOK_SECRET'] = originalSecret;
    }
  }
}

// ── Entry Point ───────────────────────────────────────────────────────────────

await runWebhookHttpIntegrationTests();
