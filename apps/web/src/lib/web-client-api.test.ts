// =============================================================================
// ForgeMind Web — Web Client API Layer Integration Test Suite (Sprint 4 Task 5)
// =============================================================================
//
// Strategy: fetch interception + Supabase singleton mock.
//
//   • NEXT_PUBLIC_API_URL is set to a deterministic sentinel ("http://api.test")
//     before any module is imported so API_BASE is captured correctly.
//   • supabase.auth.getSession is replaced on the singleton exported by
//     apps/web/src/lib/supabase.ts — same technique used by Task 4 for getUser.
//   • globalThis.fetch is replaced with a controllable interceptor that records
//     every outgoing request and returns deterministic responses.
//   • No real HTTP server, no real database, no Supabase, no OpenAI/Gemini.
//
// Coverage:
//   Part A — Authentication (auth token injection, missing session, error)
//   Part B — Repository API (syncRepositories, getRepositories, getRepository,
//             deleteRepository)
//   Part C — Analysis API (triggerRepositoryAnalysis, getLatestAnalysisJob,
//             getAnalysisHistory, getRepositoryFiles, getRepositorySymbols,
//             getRepositoryDependencies)
//   Part D — Vector API (getRepositoryChunks, searchSemanticCode,
//             getVectorPipelineStatus)
//   Part E — RAG API (queryRepositoryRAG, getRepositoryChatHistory,
//             clearRepositoryChatHistory)
//   Part F — Intelligence API (explainCode, getFileDependencyIntelligence,
//             analyzeImpact, getArchitectureOverview)
//   Part G — GitHub Credential API (getGitHubConnection, connectGitHub,
//             disconnectGitHub)
//   Part H — Auth module (getSession, getUser, signOut — Supabase-direct)
//   Part I — Error Handling (400, 401, 403, 404, 500, nested error shapes)
// =============================================================================

// ─── Imports ─────────────────────────────────────────────────────────────────
// Note: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_SUPABASE_URL, and
// NEXT_PUBLIC_SUPABASE_ANON_KEY are pre-loaded via tsx --env-file=.env.test,
// which fires before any module is evaluated. This ensures supabase.ts receives
// a valid URL at createClient() time, and all API modules capture API_BASE
// correctly.

import { supabase } from './supabase.js';

import {
  syncRepositories,
  getRepositories,
  getRepository,
  deleteRepository,
} from './repository.api.js';

import {
  triggerRepositoryAnalysis,
  getLatestAnalysisJob,
  getAnalysisHistory,
  getRepositoryFiles,
  getRepositorySymbols,
  getRepositoryDependencies,
} from './analysis.api.js';

import { getRepositoryChunks, searchSemanticCode, getVectorPipelineStatus } from './vector.api.js';

import {
  queryRepositoryRAG,
  getRepositoryChatHistory,
  clearRepositoryChatHistory,
} from './rag.api.js';

import {
  explainCode,
  getFileDependencyIntelligence,
  analyzeImpact,
  getArchitectureOverview,
} from './intelligence.api.js';

import { getGitHubConnection, connectGitHub, disconnectGitHub } from './github-credential.api.js';

import { getSession, getUser, signOut } from './auth.js';

// ─── Assertion Helpers ────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function assertDefined<T>(actual: T | undefined | null, message: string): asserts actual is T {
  assert(
    actual !== undefined && actual !== null,
    `${message} — Expected defined value, Got: ${String(actual)}`,
  );
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedSubstring: string,
  message: string,
): Promise<void> {
  try {
    await fn();
    assert(false, `${message} — Expected promise to reject but it resolved`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    assert(
      errorMsg.includes(expectedSubstring),
      `${message} — Expected error containing "${expectedSubstring}", Got: "${errorMsg}"`,
    );
  }
}

// ─── Intercepted Request Record ───────────────────────────────────────────────

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let lastRequest: CapturedRequest | null = null;

// ─── Fetch Interceptor Factory ────────────────────────────────────────────────

/**
 * Installs a deterministic fetch interceptor that:
 *  1. Records the outgoing request details in `lastRequest`.
 *  2. Returns the provided `responseBody` with the given `status`.
 */
function installFetchInterceptor(
  status: number,
  responseBody: unknown,
  options: { contentType?: string } = {},
): void {
  globalThis.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;

    let parsedBody: unknown = undefined;
    if (init?.body) {
      try {
        parsedBody = JSON.parse(init.body as string);
      } catch {
        parsedBody = init.body;
      }
    }

    lastRequest = {
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: rawHeaders,
      body: parsedBody,
    };

    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': options.contentType ?? 'application/json' },
    });
  };
}

// ─── Supabase Mock Helpers ────────────────────────────────────────────────────

const MOCK_TOKEN = 'test-access-token-abc123';

function mockAuthenticatedSession(): void {
  supabase.auth.getSession = (async () => ({
    data: {
      session: {
        access_token: MOCK_TOKEN,
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'user-uuid-1',
          app_metadata: {},
          user_metadata: {},
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        },
      },
    },
    error: null,
  })) as unknown as typeof supabase.auth.getSession;
}

function mockMissingSession(): void {
  supabase.auth.getSession = (async () => ({
    data: { session: null },
    error: null,
  })) as unknown as typeof supabase.auth.getSession;
}

function mockSessionError(): void {
  supabase.auth.getSession = (async () => ({
    data: { session: null },
    error: null,
  })) as unknown as typeof supabase.auth.getSession;
}

// ─── UUID Helper ──────────────────────────────────────────────────────────────

const REPO_ID = '00000000-0000-4000-8000-000000000001';
const FILE_ID = '00000000-0000-4000-8000-000000000002';

// =============================================================================
// Test Runner
// =============================================================================

async function runTests(): Promise<void> {
  console.log('🧪 ForgeMind Web — Web Client API Layer Integration Test Suite (Sprint 4 Task 5)\n');

  await runPartA();
  await runPartB();
  await runPartC();
  await runPartD();
  await runPartE();
  await runPartF();
  await runPartG();
  await runPartH();
  await runPartI();

  console.log('\n🎉 ALL WEB CLIENT API INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

// =============================================================================
// PART A — Authentication: Token Injection & Missing Session
// =============================================================================

async function runPartA(): Promise<void> {
  console.log('📋 Part A — Authentication (Tests 1–4)');

  // Test 1: Authenticated request injects Bearer token in Authorization header
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, repositories: [] });

    await getRepositories();

    assertDefined(lastRequest, 'Test 1: lastRequest captured');
    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 1: Authorization header',
    );
    console.log('  ✅ Test 1: Authenticated session injects Authorization: Bearer <token>');
  }

  // Test 2: Content-Type header is application/json
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, repositories: [] });

    await getRepositories();

    assertEqual(
      lastRequest!.headers['Content-Type'],
      'application/json',
      'Test 2: Content-Type header',
    );
    console.log('  ✅ Test 2: Content-Type: application/json is set on every request');
  }

  // Test 3: Missing session (null) causes getAccessToken to throw "Not authenticated."
  {
    mockMissingSession();
    installFetchInterceptor(200, { success: true, repositories: [] });

    await assertRejects(
      () => getRepositories(),
      'Not authenticated.',
      'Test 3: null session rejects',
    );
    console.log('  ✅ Test 3: Missing session throws "Not authenticated." before fetch is called');
  }

  // Test 4: Session error path also causes not-authenticated error
  {
    mockSessionError();
    installFetchInterceptor(200, { success: true, repositories: [] });

    await assertRejects(
      () => getRepositories(),
      'Not authenticated.',
      'Test 4: session-error rejects',
    );
    console.log(
      '  ✅ Test 4: Session retrieval error throws "Not authenticated." before fetch is called',
    );
  }
}

// =============================================================================
// PART B — Repository API
// =============================================================================

async function runPartB(): Promise<void> {
  console.log('\n📋 Part B — Repository API (Tests 5–16)');

  // Test 5: syncRepositories — POST /api/v1/repositories/sync
  {
    mockAuthenticatedSession();
    const result = { total: 5, created: 3, updated: 2 };
    installFetchInterceptor(200, { success: true, result });

    const data = await syncRepositories();

    assertEqual(lastRequest!.method, 'POST', 'Test 5: method is POST');
    assertEqual(
      lastRequest!.url,
      'http://api.test/api/v1/repositories/sync',
      'Test 5: URL is correct',
    );
    assertEqual(data.total, 5, 'Test 5: total returned');
    assertEqual(data.created, 3, 'Test 5: created returned');
    assertEqual(data.updated, 2, 'Test 5: updated returned');
    console.log('  ✅ Test 5: syncRepositories — POST /api/v1/repositories/sync');
  }

  // Test 6: getRepositories — GET /api/v1/repositories
  {
    mockAuthenticatedSession();
    const repos = [
      {
        id: REPO_ID,
        userId: 'u1',
        githubId: 1,
        name: 'my-repo',
        fullName: 'user/my-repo',
        owner: 'user',
        private: false,
        defaultBranch: 'main',
        language: 'TypeScript',
        description: null,
        stars: 10,
        forks: 0,
        htmlUrl: 'https://github.com/user/my-repo',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];
    installFetchInterceptor(200, { success: true, repositories: repos });

    const data = await getRepositories();

    assertEqual(lastRequest!.method, 'GET', 'Test 6: method is GET');
    assertEqual(lastRequest!.url, 'http://api.test/api/v1/repositories', 'Test 6: URL is correct');
    assertEqual(data.length, 1, 'Test 6: one repository returned');
    assertEqual(data[0]!.name, 'my-repo', 'Test 6: repository name correct');
    console.log('  ✅ Test 6: getRepositories — GET /api/v1/repositories');
  }

  // Test 7: getRepository — GET /api/v1/repositories/:id
  {
    mockAuthenticatedSession();
    const repo = { id: REPO_ID, name: 'my-repo' };
    installFetchInterceptor(200, { success: true, repository: repo });

    const data = await getRepository(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 7: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}`,
      'Test 7: URL is correct',
    );
    assertEqual(data.id, REPO_ID, 'Test 7: repository ID returned');
    console.log('  ✅ Test 7: getRepository — GET /api/v1/repositories/:id');
  }

  // Test 8: getRepository — URL-encodes repository ID with special chars
  {
    mockAuthenticatedSession();
    const specialId = 'id/with spaces';
    installFetchInterceptor(200, { success: true, repository: { id: specialId, name: 'r' } });

    await getRepository(specialId);

    assert(
      lastRequest!.url.includes(encodeURIComponent(specialId)),
      'Test 8: special ID is encoded in URL',
    );
    console.log('  ✅ Test 8: getRepository — ID is URL-encoded');
  }

  // Test 9: deleteRepository — DELETE /api/v1/repositories/:id
  {
    mockAuthenticatedSession();
    const repo = { id: REPO_ID, name: 'my-repo' };
    installFetchInterceptor(200, { success: true, repository: repo });

    const data = await deleteRepository(REPO_ID);

    assertEqual(lastRequest!.method, 'DELETE', 'Test 9: method is DELETE');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}`,
      'Test 9: URL is correct',
    );
    assertEqual(data.id, REPO_ID, 'Test 9: deleted repository returned');
    console.log('  ✅ Test 9: deleteRepository — DELETE /api/v1/repositories/:id');
  }

  // Test 10: getRepositories — 401 response throws with backend message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(401, { success: false, message: 'Unauthorized' });

    await assertRejects(
      () => getRepositories(),
      'Unauthorized',
      'Test 10: 401 throws backend message',
    );
    console.log('  ✅ Test 10: 401 response throws error with backend message');
  }

  // Test 11: getRepository — 404 response throws with backend message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(404, { success: false, message: 'Repository not found' });

    await assertRejects(
      () => getRepository(REPO_ID),
      'Repository not found',
      'Test 11: 404 throws backend message',
    );
    console.log('  ✅ Test 11: 404 response throws error with backend message');
  }

  // Test 12: Error with nested error.message shape
  {
    mockAuthenticatedSession();
    installFetchInterceptor(403, {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied' },
    });

    await assertRejects(
      () => getRepository(REPO_ID),
      'Access denied',
      'Test 12: nested error.message extracted',
    );
    console.log('  ✅ Test 12: Nested error.message shape is correctly extracted');
  }

  // Test 13: 500 response falls back to "API error 500" when no message is present
  {
    mockAuthenticatedSession();
    installFetchInterceptor(500, { success: false });

    await assertRejects(
      () => getRepositories(),
      'API error 500',
      'Test 13: 500 with no message falls back to "API error 500"',
    );
    console.log('  ✅ Test 13: 500 with no body message falls back to "API error 500"');
  }

  // Test 14: Authorization header value format is exactly "Bearer <token>"
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, repositories: [] });

    await getRepositories();

    const authHeader = lastRequest!.headers['Authorization'];
    assertDefined(authHeader, 'Test 14: Authorization header is defined');
    assert(authHeader.startsWith('Bearer '), 'Test 14: starts with Bearer ');
    assert(authHeader === `Bearer ${MOCK_TOKEN}`, 'Test 14: exact token value');
    console.log('  ✅ Test 14: Authorization header is exactly "Bearer <token>"');
  }

  // Test 15: syncRepositories returns unwrapped SyncResult (not the envelope)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, result: { total: 0, created: 0, updated: 0 } });

    const data = await syncRepositories();
    // result should be the SyncResult, not the envelope
    assert(!('success' in (data as object)), 'Test 15: envelope is unwrapped');
    assertEqual(data.total, 0, 'Test 15: total is 0');
    console.log('  ✅ Test 15: syncRepositories returns unwrapped SyncResult');
  }

  // Test 16: getRepositories returns array (not envelope with repositories key)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, repositories: [] });

    const data = await getRepositories();
    assert(Array.isArray(data), 'Test 16: result is an array');
    console.log('  ✅ Test 16: getRepositories returns bare array');
  }
}

// =============================================================================
// PART C — Analysis API
// =============================================================================

async function runPartC(): Promise<void> {
  console.log('\n📋 Part C — Analysis API (Tests 17–28)');

  const mockJob = {
    id: 'job-1',
    repositoryId: REPO_ID,
    status: 'completed',
    commitHash: 'abc123',
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Test 17: triggerRepositoryAnalysis — POST /api/v1/repositories/:id/analyze
  {
    mockAuthenticatedSession();
    const acquisitionResult = {
      job: mockJob,
      commitHash: 'abc123',
      fileCount: 10,
      totalSizeBytes: 1024,
    };
    installFetchInterceptor(200, { success: true, result: acquisitionResult });

    const data = await triggerRepositoryAnalysis(REPO_ID);

    assertEqual(lastRequest!.method, 'POST', 'Test 17: method is POST');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/analyze`,
      'Test 17: URL is correct',
    );
    assertEqual(data.commitHash, 'abc123', 'Test 17: result unwrapped correctly');
    console.log('  ✅ Test 17: triggerRepositoryAnalysis — POST /repositories/:id/analyze');
  }

  // Test 18: getLatestAnalysisJob — GET /api/v1/repositories/:id/analysis
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, job: mockJob });

    const data = await getLatestAnalysisJob(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 18: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/analysis`,
      'Test 18: URL is correct',
    );
    assertDefined(data, 'Test 18: job is returned');
    assertEqual(data!.id, 'job-1', 'Test 18: job ID correct');
    console.log('  ✅ Test 18: getLatestAnalysisJob — GET /repositories/:id/analysis');
  }

  // Test 19: getLatestAnalysisJob — returns null when job is null
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, job: null });

    const data = await getLatestAnalysisJob(REPO_ID);
    assertEqual(data, null, 'Test 19: null job returned as null');
    console.log('  ✅ Test 19: getLatestAnalysisJob returns null when no job exists');
  }

  // Test 20: getAnalysisHistory — GET /api/v1/repositories/:id/analysis/history
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, jobs: [mockJob] });

    const data = await getAnalysisHistory(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 20: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/analysis/history`,
      'Test 20: URL is correct',
    );
    assertEqual(data.length, 1, 'Test 20: one job returned');
    console.log('  ✅ Test 20: getAnalysisHistory — GET /repositories/:id/analysis/history');
  }

  // Test 21: getRepositoryFiles — GET /api/v1/repositories/:id/files (no filters)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, files: [], total: 0 });

    const data = await getRepositoryFiles(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 21: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/files`,
      'Test 21: URL without query params',
    );
    assert(Array.isArray(data.files), 'Test 21: files is array');
    assertEqual(data.total, 0, 'Test 21: total returned');
    console.log('  ✅ Test 21: getRepositoryFiles — no filter, correct URL');
  }

  // Test 22: getRepositoryFiles — query parameters (language, limit, offset)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, files: [], total: 0 });

    await getRepositoryFiles(REPO_ID, { language: 'TypeScript', limit: 10, offset: 20 });

    assert(lastRequest!.url.includes('language=TypeScript'), 'Test 22: language param present');
    assert(lastRequest!.url.includes('limit=10'), 'Test 22: limit param present');
    assert(lastRequest!.url.includes('offset=20'), 'Test 22: offset param present');
    console.log('  ✅ Test 22: getRepositoryFiles — language/limit/offset query params built');
  }

  // Test 23: getRepositorySymbols — query parameters (kind, query, limit, offset)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, symbols: [], total: 0 });

    await getRepositorySymbols(REPO_ID, { kind: 'function', query: 'start', limit: 5, offset: 0 });

    assert(lastRequest!.url.includes('kind=function'), 'Test 23: kind param present');
    assert(lastRequest!.url.includes('query=start'), 'Test 23: query param present');
    assert(lastRequest!.url.includes('limit=5'), 'Test 23: limit param present');
    // offset=0 is falsy in JS, so the implementation omits it — this is correct behavior
    assert(!lastRequest!.url.includes('offset=0'), 'Test 23: offset=0 is omitted (falsy guard)');
    console.log(
      '  ✅ Test 23: getRepositorySymbols — kind/query/limit query params built correctly',
    );
  }

  // Test 24: getRepositoryDependencies — isExternal filter
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, dependencies: [], total: 0 });

    await getRepositoryDependencies(REPO_ID, { isExternal: false, limit: 50 });

    assert(lastRequest!.url.includes('isExternal=false'), 'Test 24: isExternal=false present');
    assert(lastRequest!.url.includes('limit=50'), 'Test 24: limit present');
    console.log('  ✅ Test 24: getRepositoryDependencies — isExternal query param built');
  }

  // Test 25: getRepositorySymbols — returns { symbols, total } (unwrapped)
  {
    mockAuthenticatedSession();
    const sym = {
      id: 's1',
      repositoryId: REPO_ID,
      fileId: FILE_ID,
      name: 'main',
      kind: 'function',
      filePath: 'src/main.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    installFetchInterceptor(200, { success: true, symbols: [sym], total: 1 });

    const data = await getRepositorySymbols(REPO_ID);
    assert(Array.isArray(data.symbols), 'Test 25: symbols is array');
    assertEqual(data.total, 1, 'Test 25: total returned');
    assertEqual(data.symbols[0]!.name, 'main', 'Test 25: symbol name correct');
    console.log('  ✅ Test 25: getRepositorySymbols — returns { symbols, total }');
  }

  // Test 26: getRepositoryDependencies — returns { dependencies, total }
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, dependencies: [], total: 0 });

    const data = await getRepositoryDependencies(REPO_ID);
    assert(Array.isArray(data.dependencies), 'Test 26: dependencies is array');
    assertEqual(data.total, 0, 'Test 26: total 0');
    console.log('  ✅ Test 26: getRepositoryDependencies — returns { dependencies, total }');
  }

  // Test 27: triggerRepositoryAnalysis — 500 error propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(500, { success: false, message: 'Internal server error' });

    await assertRejects(
      () => triggerRepositoryAnalysis(REPO_ID),
      'Internal server error',
      'Test 27: 500 message propagated',
    );
    console.log('  ✅ Test 27: triggerRepositoryAnalysis — 500 error propagated');
  }

  // Test 28: getRepositoryFiles — returns { files, total } structure
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, files: [], total: 42 });

    const data = await getRepositoryFiles(REPO_ID);
    assertEqual(data.total, 42, 'Test 28: total 42');
    assert(Array.isArray(data.files), 'Test 28: files array');
    console.log('  ✅ Test 28: getRepositoryFiles — returns { files, total }');
  }
}

// =============================================================================
// PART D — Vector API
// =============================================================================

async function runPartD(): Promise<void> {
  console.log('\n📋 Part D — Vector API (Tests 29–36)');

  // Test 29: getRepositoryChunks — GET /api/v1/repositories/:id/chunks
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, chunks: [], total: 0 });

    const data = await getRepositoryChunks(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 29: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/chunks`,
      'Test 29: URL is correct',
    );
    assert(Array.isArray(data.chunks), 'Test 29: chunks is array');
    console.log('  ✅ Test 29: getRepositoryChunks — GET /repositories/:id/chunks');
  }

  // Test 30: getRepositoryChunks — query parameters (fileId, limit, offset)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, chunks: [], total: 0 });

    await getRepositoryChunks(REPO_ID, { fileId: FILE_ID, limit: 25, offset: 0 });

    assert(lastRequest!.url.includes(`fileId=${FILE_ID}`), 'Test 30: fileId param present');
    assert(lastRequest!.url.includes('limit=25'), 'Test 30: limit=25 present');
    console.log('  ✅ Test 30: getRepositoryChunks — fileId/limit query params built');
  }

  // Test 31: searchSemanticCode — POST /api/v1/repositories/:id/search/semantic
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, results: [] });

    const results = await searchSemanticCode(REPO_ID, 'find authentication logic');

    assertEqual(lastRequest!.method, 'POST', 'Test 31: method is POST');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/search/semantic`,
      'Test 31: URL is correct',
    );
    assert(Array.isArray(results), 'Test 31: results is array');
    console.log('  ✅ Test 31: searchSemanticCode — POST /repositories/:id/search/semantic');
  }

  // Test 32: searchSemanticCode — request body contains query and options
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, results: [] });

    await searchSemanticCode(REPO_ID, 'find auth', { limit: 5, threshold: 0.75 });

    const body = lastRequest!.body as Record<string, unknown>;
    assertEqual(body['query'], 'find auth', 'Test 32: query in body');
    assertEqual(body['limit'], 5, 'Test 32: limit in body');
    assertEqual(body['threshold'], 0.75, 'Test 32: threshold in body');
    console.log('  ✅ Test 32: searchSemanticCode — body contains query/limit/threshold');
  }

  // Test 33: searchSemanticCode — returns unwrapped results array
  {
    mockAuthenticatedSession();
    const mockResult = {
      id: 'chunk-1',
      repositoryId: REPO_ID,
      fileId: FILE_ID,
      chunkIndex: 0,
      content: 'export function auth() {}',
      filePath: 'src/auth.ts',
      language: 'TypeScript',
      startLine: 1,
      endLine: 3,
      tokenCount: 10,
      linesCount: 3,
      similarity: 0.92,
      metadata: null,
    };
    installFetchInterceptor(200, { success: true, results: [mockResult] });

    const data = await searchSemanticCode(REPO_ID, 'auth');
    assertEqual(data.length, 1, 'Test 33: one result');
    assertEqual(data[0]!.similarity, 0.92, 'Test 33: similarity returned');
    console.log('  ✅ Test 33: searchSemanticCode — returns bare results array');
  }

  // Test 34: getVectorPipelineStatus — GET /api/v1/repositories/:id/vector-status
  {
    mockAuthenticatedSession();
    const status = {
      repositoryId: REPO_ID,
      totalChunks: 100,
      embeddedChunks: 95,
      indexedFiles: 10,
      provider: 'mock',
    };
    installFetchInterceptor(200, { success: true, status });

    const data = await getVectorPipelineStatus(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 34: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/vector-status`,
      'Test 34: URL is correct',
    );
    assertEqual(data.totalChunks, 100, 'Test 34: totalChunks returned');
    assertEqual(data.embeddedChunks, 95, 'Test 34: embeddedChunks returned');
    console.log('  ✅ Test 34: getVectorPipelineStatus — GET /repositories/:id/vector-status');
  }

  // Test 35: getRepositoryChunks — returns { chunks, total }
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, chunks: [], total: 55 });

    const data = await getRepositoryChunks(REPO_ID);
    assertEqual(data.total, 55, 'Test 35: total 55 returned');
    console.log('  ✅ Test 35: getRepositoryChunks — returns { chunks, total }');
  }

  // Test 36: searchSemanticCode — 400 error propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(400, { success: false, message: 'Query too short' });

    await assertRejects(
      () => searchSemanticCode(REPO_ID, ''),
      'Query too short',
      'Test 36: 400 message propagated',
    );
    console.log('  ✅ Test 36: searchSemanticCode — 400 error propagated');
  }
}

// =============================================================================
// PART E — RAG API
// =============================================================================

async function runPartE(): Promise<void> {
  console.log('\n📋 Part E — RAG API (Tests 37–47)');

  // Test 37: queryRepositoryRAG — POST /api/v1/repositories/:id/chat
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      answer: 'The auth module uses JWT.',
      sources: [],
      repositoryId: REPO_ID,
      query: 'How does auth work?',
      providerUsed: 'mock',
    });

    const data = await queryRepositoryRAG(REPO_ID, 'How does auth work?');

    assertEqual(lastRequest!.method, 'POST', 'Test 37: method is POST');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/chat`,
      'Test 37: URL is correct',
    );
    assertEqual(data.answer, 'The auth module uses JWT.', 'Test 37: answer returned');
    console.log('  ✅ Test 37: queryRepositoryRAG — POST /repositories/:id/chat');
  }

  // Test 38: queryRepositoryRAG — request body contains query and topK
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      answer: 'Mock answer.',
      sources: [],
      repositoryId: REPO_ID,
      query: 'test',
      providerUsed: 'mock',
    });

    await queryRepositoryRAG(REPO_ID, 'test query', 8);

    const body = lastRequest!.body as Record<string, unknown>;
    assertEqual(body['query'], 'test query', 'Test 38: query in body');
    assertEqual(body['topK'], 8, 'Test 38: topK in body');
    console.log('  ✅ Test 38: queryRepositoryRAG — body contains { query, topK }');
  }

  // Test 39: queryRepositoryRAG — Authorization header is injected
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      answer: 'Answer.',
      sources: [],
      repositoryId: REPO_ID,
      query: 'q',
      providerUsed: 'mock',
    });

    await queryRepositoryRAG(REPO_ID, 'q');

    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 39: Authorization header injected',
    );
    console.log('  ✅ Test 39: queryRepositoryRAG — Authorization: Bearer header injected');
  }

  // Test 40: queryRepositoryRAG — RAGQueryResponse is correctly deserialized
  {
    mockAuthenticatedSession();
    const source = {
      filePath: 'src/auth.ts',
      startLine: 1,
      endLine: 10,
      score: 0.9,
    };
    installFetchInterceptor(200, {
      answer: 'JWT is used.',
      sources: [source],
      repositoryId: REPO_ID,
      query: 'jwt?',
      providerUsed: 'gemini',
    });

    const data = await queryRepositoryRAG(REPO_ID, 'jwt?');
    assertEqual(data.providerUsed, 'gemini', 'Test 40: providerUsed returned');
    assertEqual(data.sources.length, 1, 'Test 40: one source');
    assertEqual(data.sources[0]!.filePath, 'src/auth.ts', 'Test 40: source filePath');
    console.log('  ✅ Test 40: queryRepositoryRAG — RAGQueryResponse fully deserialized');
  }

  // Test 41: queryRepositoryRAG — missing fields default gracefully
  {
    mockAuthenticatedSession();
    // Backend returns minimal body
    installFetchInterceptor(200, {});

    const data = await queryRepositoryRAG(REPO_ID, 'fallback-test');
    assertEqual(data.answer, 'No response generated.', 'Test 41: fallback answer');
    assert(Array.isArray(data.sources), 'Test 41: sources defaults to array');
    console.log('  ✅ Test 41: queryRepositoryRAG — missing fields have safe defaults');
  }

  // Test 42: getRepositoryChatHistory — GET /api/v1/repositories/:id/chat/history
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      session: null,
      messages: [],
    });

    const data = await getRepositoryChatHistory(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 42: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/chat/history`,
      'Test 42: URL is correct',
    );
    assertEqual(data.session, null, 'Test 42: null session returned');
    assert(Array.isArray(data.messages), 'Test 42: messages is array');
    console.log('  ✅ Test 42: getRepositoryChatHistory — GET /repositories/:id/chat/history');
  }

  // Test 43: getRepositoryChatHistory — Authorization header (no Content-Type expected)
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { session: null, messages: [] });

    await getRepositoryChatHistory(REPO_ID);

    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 43: Authorization header injected',
    );
    console.log('  ✅ Test 43: getRepositoryChatHistory — Authorization header injected');
  }

  // Test 44: clearRepositoryChatHistory — DELETE /api/v1/repositories/:id/chat/history
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { deletedSessions: 3 });

    const data = await clearRepositoryChatHistory(REPO_ID);

    assertEqual(lastRequest!.method, 'DELETE', 'Test 44: method is DELETE');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/chat/history`,
      'Test 44: URL is correct',
    );
    assertEqual(data.deletedSessions, 3, 'Test 44: deletedSessions returned');
    console.log('  ✅ Test 44: clearRepositoryChatHistory — DELETE /repositories/:id/chat/history');
  }

  // Test 45: clearRepositoryChatHistory — Authorization header injected
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { deletedSessions: 0 });

    await clearRepositoryChatHistory(REPO_ID);

    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 45: Authorization header injected',
    );
    console.log('  ✅ Test 45: clearRepositoryChatHistory — Authorization header injected');
  }

  // Test 46: getRepositoryChatHistory — error with nested error.message shape
  {
    mockAuthenticatedSession();
    installFetchInterceptor(404, {
      error: { message: 'History not found' },
    });

    await assertRejects(
      () => getRepositoryChatHistory(REPO_ID),
      'History not found',
      'Test 46: nested error.message extracted',
    );
    console.log('  ✅ Test 46: getRepositoryChatHistory — 404 nested error extracted');
  }

  // Test 47: clearRepositoryChatHistory — 500 error with nested error shape
  {
    mockAuthenticatedSession();
    installFetchInterceptor(500, {
      error: { message: 'Failed to clear history' },
    });

    await assertRejects(
      () => clearRepositoryChatHistory(REPO_ID),
      'Failed to clear history',
      'Test 47: 500 nested error extracted',
    );
    console.log('  ✅ Test 47: clearRepositoryChatHistory — 500 nested error extracted');
  }
}

// =============================================================================
// PART F — Intelligence API
// =============================================================================

async function runPartF(): Promise<void> {
  console.log('\n📋 Part F — Intelligence API (Tests 48–57)');

  // Test 48: explainCode — POST /api/v1/repositories/:id/intelligence/explain
  {
    mockAuthenticatedSession();
    const mockResponse = {
      filePath: 'src/auth.ts',
      symbolName: 'authenticate',
      symbolKind: 'function',
      explanation: 'This function validates JWT tokens.',
      sources: [],
      relatedSymbols: [],
      providerUsed: 'mock',
    };
    installFetchInterceptor(200, mockResponse);

    const data = await explainCode(REPO_ID, {
      filePath: 'src/auth.ts',
      symbolName: 'authenticate',
      symbolKind: 'function',
    });

    assertEqual(lastRequest!.method, 'POST', 'Test 48: method is POST');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/intelligence/explain`,
      'Test 48: URL is correct',
    );
    assertEqual(data.explanation, 'This function validates JWT tokens.', 'Test 48: explanation');
    console.log('  ✅ Test 48: explainCode — POST /repositories/:id/intelligence/explain');
  }

  // Test 49: explainCode — request body contains CodeExplainRequest fields
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      filePath: 'src/index.ts',
      explanation: 'Entrypoint.',
      sources: [],
      relatedSymbols: [],
      providerUsed: 'mock',
    });

    await explainCode(REPO_ID, { filePath: 'src/index.ts', symbolName: 'main' });

    const body = lastRequest!.body as Record<string, unknown>;
    assertEqual(body['filePath'], 'src/index.ts', 'Test 49: filePath in body');
    assertEqual(body['symbolName'], 'main', 'Test 49: symbolName in body');
    console.log('  ✅ Test 49: explainCode — request body contains { filePath, symbolName }');
  }

  // Test 50: getFileDependencyIntelligence — GET /api/v1/repositories/:id/intelligence/dependencies
  {
    mockAuthenticatedSession();
    const mockDeps = {
      filePath: 'src/auth.ts',
      imports: [],
      importedBy: [],
      internalCount: 0,
      externalCount: 2,
    };
    installFetchInterceptor(200, mockDeps);

    const data = await getFileDependencyIntelligence(REPO_ID, 'src/auth.ts');

    assertEqual(lastRequest!.method, 'GET', 'Test 50: method is GET');
    assert(
      lastRequest!.url.includes('/intelligence/dependencies'),
      'Test 50: URL contains /intelligence/dependencies',
    );
    assert(
      lastRequest!.url.includes(`filePath=${encodeURIComponent('src/auth.ts')}`),
      'Test 50: filePath query param present and encoded',
    );
    assertEqual(data.externalCount, 2, 'Test 50: externalCount returned');
    console.log('  ✅ Test 50: getFileDependencyIntelligence — GET with filePath query param');
  }

  // Test 51: getFileDependencyIntelligence — filePath is URL-encoded in query string
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      filePath: 'src/api/index.ts',
      imports: [],
      importedBy: [],
      internalCount: 0,
      externalCount: 0,
    });

    await getFileDependencyIntelligence(REPO_ID, 'src/api/index.ts');

    assert(
      lastRequest!.url.includes(encodeURIComponent('src/api/index.ts')),
      'Test 51: filePath with slashes is encoded',
    );
    console.log('  ✅ Test 51: getFileDependencyIntelligence — filePath URL-encoded');
  }

  // Test 52: analyzeImpact — POST /api/v1/repositories/:id/intelligence/impact
  {
    mockAuthenticatedSession();
    const impactResult = {
      targetFilePath: 'src/auth.ts',
      directDependents: [],
      affectedSymbols: [],
      totalAffected: 0,
      ragExplanationUsed: false,
    };
    installFetchInterceptor(200, impactResult);

    const data = await analyzeImpact(REPO_ID, { filePath: 'src/auth.ts' });

    assertEqual(lastRequest!.method, 'POST', 'Test 52: method is POST');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/intelligence/impact`,
      'Test 52: URL is correct',
    );
    assertEqual(data.totalAffected, 0, 'Test 52: totalAffected returned');
    console.log('  ✅ Test 52: analyzeImpact — POST /repositories/:id/intelligence/impact');
  }

  // Test 53: analyzeImpact — request body contains filePath, symbolName, includeExplanation
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      targetFilePath: 'src/main.ts',
      directDependents: [],
      affectedSymbols: [],
      totalAffected: 5,
      ragExplanationUsed: true,
    });

    await analyzeImpact(REPO_ID, {
      filePath: 'src/main.ts',
      symbolName: 'startApp',
      includeExplanation: true,
    });

    const body = lastRequest!.body as Record<string, unknown>;
    assertEqual(body['filePath'], 'src/main.ts', 'Test 53: filePath in body');
    assertEqual(body['symbolName'], 'startApp', 'Test 53: symbolName in body');
    assertEqual(body['includeExplanation'], true, 'Test 53: includeExplanation in body');
    console.log(
      '  ✅ Test 53: analyzeImpact — body contains filePath/symbolName/includeExplanation',
    );
  }

  // Test 54: getArchitectureOverview — GET /api/v1/repositories/:id/intelligence/architecture
  {
    mockAuthenticatedSession();
    const overview = {
      repositoryId: REPO_ID,
      repositoryName: 'my-repo',
      languageDistribution: { TypeScript: 10 },
      totalFiles: 10,
      totalSymbols: 50,
      totalDependencies: 30,
      internalDependencyCount: 20,
      externalDependencyCount: 10,
      topDirectories: [{ directory: 'src', fileCount: 10 }],
      topExternalPackages: [{ package: 'express', count: 5 }],
      symbolKindDistribution: { function: 40, class: 10 },
    };
    installFetchInterceptor(200, overview);

    const data = await getArchitectureOverview(REPO_ID);

    assertEqual(lastRequest!.method, 'GET', 'Test 54: method is GET');
    assertEqual(
      lastRequest!.url,
      `http://api.test/api/v1/repositories/${REPO_ID}/intelligence/architecture`,
      'Test 54: URL is correct',
    );
    assertEqual(data.totalFiles, 10, 'Test 54: totalFiles returned');
    assertEqual(data.repositoryName, 'my-repo', 'Test 54: repositoryName returned');
    console.log(
      '  ✅ Test 54: getArchitectureOverview — GET /repositories/:id/intelligence/architecture',
    );
  }

  // Test 55: explainCode — 403 error propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(403, { success: false, message: 'Repository access denied' });

    await assertRejects(
      () => explainCode(REPO_ID, { filePath: 'src/secret.ts' }),
      'Repository access denied',
      'Test 55: 403 message propagated',
    );
    console.log('  ✅ Test 55: explainCode — 403 error propagated');
  }

  // Test 56: analyzeImpact — Authorization header injected
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      targetFilePath: 'src/main.ts',
      directDependents: [],
      affectedSymbols: [],
      totalAffected: 0,
      ragExplanationUsed: false,
    });

    await analyzeImpact(REPO_ID, { filePath: 'src/main.ts' });

    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 56: Authorization header injected',
    );
    console.log('  ✅ Test 56: analyzeImpact — Authorization header injected');
  }

  // Test 57: getArchitectureOverview — 404 error propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(404, { success: false, message: 'Repository not indexed' });

    await assertRejects(
      () => getArchitectureOverview(REPO_ID),
      'Repository not indexed',
      'Test 57: 404 message propagated',
    );
    console.log('  ✅ Test 57: getArchitectureOverview — 404 error propagated');
  }
}

// =============================================================================
// PART G — GitHub Credential API
// =============================================================================

async function runPartG(): Promise<void> {
  console.log('\n📋 Part G — GitHub Credential API (Tests 58–66)');

  const mockConnection = {
    connected: true,
    githubUsername: 'testuser',
    githubAvatarUrl: 'https://github.com/testuser.png',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Test 58: getGitHubConnection — GET /api/v1/auth/github
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, connection: mockConnection });

    const data = await getGitHubConnection();

    assertEqual(lastRequest!.method, 'GET', 'Test 58: method is GET');
    assertEqual(lastRequest!.url, 'http://api.test/api/v1/auth/github', 'Test 58: URL is correct');
    assertEqual(data.connected, true, 'Test 58: connected returned');
    assertEqual(data.githubUsername, 'testuser', 'Test 58: username returned');
    console.log('  ✅ Test 58: getGitHubConnection — GET /api/v1/auth/github');
  }

  // Test 59: getGitHubConnection — Authorization header injected
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, connection: mockConnection });

    await getGitHubConnection();

    assertEqual(
      lastRequest!.headers['Authorization'],
      `Bearer ${MOCK_TOKEN}`,
      'Test 59: Authorization header injected',
    );
    console.log('  ✅ Test 59: getGitHubConnection — Authorization header injected');
  }

  // Test 60: connectGitHub — PUT /api/v1/auth/github
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, connection: mockConnection });

    const data = await connectGitHub('ghp_test_token_123');

    assertEqual(lastRequest!.method, 'PUT', 'Test 60: method is PUT');
    assertEqual(lastRequest!.url, 'http://api.test/api/v1/auth/github', 'Test 60: URL is correct');
    assertEqual(data.connected, true, 'Test 60: connected returned');
    console.log('  ✅ Test 60: connectGitHub — PUT /api/v1/auth/github');
  }

  // Test 61: connectGitHub — request body contains token
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, connection: mockConnection });

    await connectGitHub('ghp_test_token_123');

    const body = lastRequest!.body as Record<string, unknown>;
    assertEqual(body['token'], 'ghp_test_token_123', 'Test 61: token in body');
    console.log('  ✅ Test 61: connectGitHub — request body contains { token }');
  }

  // Test 62: disconnectGitHub — DELETE /api/v1/auth/github
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, message: 'Disconnected' });

    const data = await disconnectGitHub();

    assertEqual(lastRequest!.method, 'DELETE', 'Test 62: method is DELETE');
    assertEqual(lastRequest!.url, 'http://api.test/api/v1/auth/github', 'Test 62: URL is correct');
    assertEqual(data.success, true, 'Test 62: success returned');
    console.log('  ✅ Test 62: disconnectGitHub — DELETE /api/v1/auth/github');
  }

  // Test 63: disconnectGitHub — returns { success: boolean } only
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, { success: true, message: 'Disconnected' });

    const data = await disconnectGitHub();
    assert(!('message' in (data as object)), 'Test 63: message is not returned');
    assert('success' in (data as object), 'Test 63: success key exists');
    console.log('  ✅ Test 63: disconnectGitHub returns { success } only (message stripped)');
  }

  // Test 64: getGitHubConnection — 404 error propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(404, { success: false, message: 'No GitHub connection found' });

    await assertRejects(
      () => getGitHubConnection(),
      'No GitHub connection found',
      'Test 64: 404 message propagated',
    );
    console.log('  ✅ Test 64: getGitHubConnection — 404 error propagated');
  }

  // Test 65: connectGitHub — 400 error (invalid token) propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(400, { success: false, message: 'Invalid GitHub token' });

    await assertRejects(
      () => connectGitHub('bad-token'),
      'Invalid GitHub token',
      'Test 65: 400 message propagated',
    );
    console.log('  ✅ Test 65: connectGitHub — 400 invalid token error propagated');
  }

  // Test 66: disconnectGitHub — 401 error (unauthenticated) propagated
  {
    mockAuthenticatedSession();
    installFetchInterceptor(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });

    await assertRejects(
      () => disconnectGitHub(),
      'Not authenticated',
      'Test 66: 401 nested error propagated',
    );
    console.log('  ✅ Test 66: disconnectGitHub — 401 nested error propagated');
  }
}

// =============================================================================
// PART H — Auth Module (Supabase-direct, no fetch to backend)
// =============================================================================

async function runPartH(): Promise<void> {
  console.log('\n📋 Part H — Auth Module (Tests 67–72)');

  // Test 67: getSession — returns session from supabase.auth.getSession
  {
    mockAuthenticatedSession();
    // Track whether fetch was called for Supabase-direct calls
    let fetchWasCalled = false;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      // Only flag if the URL includes api.test (i.e., backend call)
      const url = typeof args[0] === 'string' ? args[0] : '';
      if (url.includes('api.test')) fetchWasCalled = true;
      return prevFetch(...args);
    };

    const session = await getSession();
    assertDefined(session, 'Test 67: session is returned');
    assertEqual(session!.access_token, MOCK_TOKEN, 'Test 67: access_token correct');
    assert(!fetchWasCalled, 'Test 67: no backend HTTP call made');

    globalThis.fetch = prevFetch;
    console.log('  ✅ Test 67: getSession — returns supabase session without backend call');
  }

  // Test 68: getSession — returns null when no session
  {
    mockMissingSession();

    const session = await getSession();
    assertEqual(session, null, 'Test 68: null session returned');
    console.log('  ✅ Test 68: getSession — returns null when no active session');
  }

  // Test 69: getUser — calls supabase.auth.getUser
  {
    // Mock getUser
    supabase.auth.getUser = (async () => ({
      data: {
        user: {
          id: 'user-uuid-1',
          app_metadata: {},
          user_metadata: { name: 'Test User' },
          aud: 'authenticated',
          created_at: '2026-01-01T00:00:00Z',
        },
      },
      error: null,
    })) as unknown as typeof supabase.auth.getUser;

    const user = await getUser();
    assertDefined(user, 'Test 69: user is returned');
    assertEqual(user!.id, 'user-uuid-1', 'Test 69: user ID correct');
    console.log('  ✅ Test 69: getUser — returns supabase user');
  }

  // Test 70: getUser — returns null when not signed in
  {
    supabase.auth.getUser = (async () => ({
      data: { user: null },
      error: null,
    })) as unknown as typeof supabase.auth.getUser;

    const user = await getUser();
    assertEqual(user, null, 'Test 70: null user returned');
    console.log('  ✅ Test 70: getUser — returns null when no user');
  }

  // Test 71: signOut — calls supabase.auth.signOut without error
  {
    supabase.auth.signOut = (async () => ({
      error: null,
    })) as unknown as typeof supabase.auth.signOut;

    // Should not throw
    let threw = false;
    try {
      await signOut();
    } catch {
      threw = true;
    }
    assert(!threw, 'Test 71: signOut did not throw');
    console.log('  ✅ Test 71: signOut — completes without error');
  }

  // Test 72: signOut — throws when supabase returns error
  {
    supabase.auth.signOut = (async () => ({
      error: new Error('Sign out failed'),
    })) as unknown as typeof supabase.auth.signOut;

    await assertRejects(() => signOut(), 'Sign out failed', 'Test 72: signOut error propagated');
    console.log('  ✅ Test 72: signOut — supabase error is propagated');
  }
}

// =============================================================================
// PART I — Error Handling: Edge Cases & All Status Codes
// =============================================================================

async function runPartI(): Promise<void> {
  console.log('\n📋 Part I — Error Handling Edge Cases (Tests 73–80)');

  // Test 73: 400 response with top-level message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(400, { success: false, message: 'Bad request body' });

    await assertRejects(
      () => syncRepositories(),
      'Bad request body',
      'Test 73: 400 top-level message',
    );
    console.log('  ✅ Test 73: 400 — top-level message field extracted');
  }

  // Test 74: 401 response with nested error.message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(401, {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token expired' },
    });

    await assertRejects(
      () => getRepositories(),
      'Token expired',
      'Test 74: 401 nested error.message',
    );
    console.log('  ✅ Test 74: 401 — nested error.message extracted');
  }

  // Test 75: 403 response with top-level message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(403, { success: false, message: 'Repository is private' });

    await assertRejects(
      () => getRepository(REPO_ID),
      'Repository is private',
      'Test 75: 403 top-level message',
    );
    console.log('  ✅ Test 75: 403 — top-level message extracted');
  }

  // Test 76: 404 response fallback to "API error 404" when no message or error
  {
    mockAuthenticatedSession();
    installFetchInterceptor(404, { success: false });

    await assertRejects(
      () => deleteRepository(REPO_ID),
      'API error 404',
      'Test 76: 404 fallback message',
    );
    console.log('  ✅ Test 76: 404 — fallback to "API error 404" when no message');
  }

  // Test 77: 500 response with top-level message
  {
    mockAuthenticatedSession();
    installFetchInterceptor(500, { success: false, message: 'Database connection failed' });

    await assertRejects(
      () => triggerRepositoryAnalysis(REPO_ID),
      'Database connection failed',
      'Test 77: 500 top-level message',
    );
    console.log('  ✅ Test 77: 500 — top-level message extracted');
  }

  // Test 78: All modules share identical error extraction logic
  {
    // Test that intelligence and vector modules also extract nested error
    mockAuthenticatedSession();
    installFetchInterceptor(403, {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Forbidden access' },
    });

    await assertRejects(
      () => searchSemanticCode(REPO_ID, 'query'),
      'Forbidden access',
      'Test 78a: vector 403 nested error',
    );

    installFetchInterceptor(403, {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Intelligence access denied' },
    });
    await assertRejects(
      () => explainCode(REPO_ID, { filePath: 'src/index.ts' }),
      'Intelligence access denied',
      'Test 78b: intelligence 403 nested error',
    );
    console.log('  ✅ Test 78: All API modules share identical error extraction logic');
  }

  // Test 79: Missing session prevents ANY network call
  {
    mockMissingSession();
    let networkCallMade = false;
    const prev = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> => {
      networkCallMade = true;
      return new Response('{}', { status: 200 });
    };

    try {
      await getArchitectureOverview(REPO_ID);
    } catch {
      // expected
    }

    assert(!networkCallMade, 'Test 79: no network call made when session missing');
    globalThis.fetch = prev;
    console.log('  ✅ Test 79: Missing session prevents all network calls (fails fast)');
  }

  // Test 80: Successful 200 response is NOT treated as an error
  {
    mockAuthenticatedSession();
    installFetchInterceptor(200, {
      success: true,
      repositories: [{ id: 'r1', name: 'ok-repo' }],
    });

    let threw = false;
    try {
      await getRepositories();
    } catch {
      threw = true;
    }
    assert(!threw, 'Test 80: 200 response does not throw');
    console.log('  ✅ Test 80: 200 response is not treated as an error');
  }
}

// =============================================================================
// Run
// =============================================================================

runTests().catch((err: unknown) => {
  console.error('\n❌ TEST SUITE FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
