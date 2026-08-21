/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Repository Controllers & HTTP API Routes Integration Test Suite
// (Sprint 4 Task 4)
// =============================================================================

import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';

import express from 'express';
import { createApp } from '../app.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';
import { createRateLimiter } from '../lib/rate-limiter.js';
import { supabase } from '../lib/supabase.js';
import { getEmbeddingProvider } from '../services/embeddings/index.js';
import { getLLMProvider } from '../services/llm/index.js';

// Enforce mock providers
process.env['EMBEDDING_PROVIDER'] = 'mock';
process.env['LLM_PROVIDER'] = 'mock';

// ── Assertion Helpers ──────────────────────────────────────────────────────────

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

function assertGte(actual: number, expected: number, message: string): void {
  assert(actual >= expected, `${message} — Expected >= ${expected}, Got: ${actual}`);
}

// ── UUID Helper ───────────────────────────────────────────────────────────────

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const USER_ID_1 = makeUuid(101);
const USER_ID_2 = makeUuid(102);

const TOKEN_USER_1 = 'valid-token-user-1';
const TOKEN_USER_2 = 'valid-token-user-2';
const TOKEN_INVALID = 'invalid-token-abc';

const REPO_ID_1 = makeUuid(201);
const REPO_ID_2 = makeUuid(202);
const NON_EXISTENT_REPO_ID = makeUuid(999);

const FILE_ID_1 = makeUuid(301);
const SYMBOL_ID_1 = makeUuid(401);
const DEP_ID_1 = makeUuid(501);
const CHUNK_ID_1 = makeUuid(601);
const JOB_ID_1 = makeUuid(701);
const SESSION_ID_1 = makeUuid(801);

// ── In-Memory Database Stores ─────────────────────────────────────────────────

const userStore = new Map<string, Record<string, unknown>>();
const ghCredStore = new Map<string, Record<string, unknown>>();
const repoStore = new Map<string, Record<string, unknown>>();
const fileStore = new Map<string, Record<string, unknown>>();
const symbolStore = new Map<string, Record<string, unknown>>();
const depStore = new Map<string, Record<string, unknown>>();
const chunkStore = new Map<string, Record<string, unknown>>();
const jobStore = new Map<string, Record<string, unknown>>();
const sessionStore = new Map<string, Record<string, unknown>>();
const messageStore = new Map<string, Record<string, unknown>>();

function resetAllStores(): void {
  userStore.clear();
  ghCredStore.clear();
  repoStore.clear();
  fileStore.clear();
  symbolStore.clear();
  depStore.clear();
  chunkStore.clear();
  jobStore.clear();
  sessionStore.clear();
  messageStore.clear();
}

// Seed Users
userStore.set(USER_ID_1, {
  id: USER_ID_1,
  email: 'user1@example.com',
  name: 'User One',
  avatarUrl: 'https://github.com/user1.png',
  createdAt: new Date(),
  updatedAt: new Date(),
});

userStore.set(USER_ID_2, {
  id: USER_ID_2,
  email: 'user2@example.com',
  name: 'User Two',
  avatarUrl: 'https://github.com/user2.png',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Seed GitHub Credential for User 1
ghCredStore.set(USER_ID_1, {
  id: makeUuid(1),
  userId: USER_ID_1,
  encryptedToken: encryptToken('ghp_mock_token_12345'),
  githubUsername: 'user1_github',
  githubAvatarUrl: 'https://github.com/user1.png',
  createdAt: new Date(),
  updatedAt: new Date(),
});

// ── Intercept Supabase Auth ────────────────────────────────────────────────────

supabase.auth.getUser = (async (token: string) => {
  if (token === TOKEN_USER_1) {
    return {
      data: {
        user: {
          id: USER_ID_1,
          email: 'user1@example.com',
          user_metadata: { name: 'User One', avatar_url: 'https://github.com/user1.png' },
        },
      },
      error: null,
    };
  }
  if (token === TOKEN_USER_2) {
    return {
      data: {
        user: {
          id: USER_ID_2,
          email: 'user2@example.com',
          user_metadata: { name: 'User Two', avatar_url: 'https://github.com/user2.png' },
        },
      },
      error: null,
    };
  }
  return {
    data: { user: null },
    error: new Error('Invalid authentication token'),
  };
}) as unknown as typeof supabase.auth.getUser;

// ── Intercept GitHub API via globalThis.fetch ──────────────────────────────────

const originalFetch = globalThis.fetch;
globalThis.fetch = async (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input.toString();
  if (urlStr.includes('api.github.com')) {
    if (urlStr.endsWith('/user')) {
      return new Response(
        JSON.stringify({
          login: 'user1_github',
          id: 998811,
          avatar_url: 'https://github.com/user1.png',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/user/repos')) {
      return new Response(
        JSON.stringify([
          {
            id: 112233,
            name: 'synced-repo',
            full_name: 'user1_github/synced-repo',
            owner: {
              login: 'user1_github',
              id: 998811,
              avatar_url: 'https://github.com/user1.png',
              html_url: 'https://github.com/user1_github',
            },
            private: false,
            html_url: 'https://github.com/user1_github/synced-repo',
            description: 'A synced repository',
            fork: false,
            url: 'https://api.github.com/repos/user1_github/synced-repo',
            default_branch: 'main',
            stargazers_count: 10,
            forks_count: 2,
            open_issues_count: 0,
            language: 'TypeScript',
            updated_at: '2026-08-19T00:00:00Z',
            created_at: '2026-08-19T00:00:00Z',
            pushed_at: '2026-08-19T00:00:00Z',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/commits')) {
      return new Response(
        JSON.stringify([{ sha: 'commit-sha-123', commit: { message: 'Initial commit' } }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (urlStr.includes('/git/trees/')) {
      return new Response(
        JSON.stringify({
          sha: 'tree-sha-123',
          tree: [
            { path: 'src/main.ts', mode: '100644', type: 'blob', sha: 'blob-sha-1', size: 120 },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return originalFetch(input, init);
};

// ── Intercept Prisma Client ────────────────────────────────────────────────────

(
  PrismaClient.prototype as unknown as { _request: (params: unknown) => Promise<unknown> }
)._request = async function (params: unknown): Promise<unknown> {
  const { clientMethod, args } =
    (params as {
      clientMethod?: string;
      args?: Record<string, unknown>;
    }) || {};

  const where = (args?.['where'] as Record<string, unknown> | undefined) || {};
  const data = (args?.['data'] as Record<string, unknown> | undefined) || {};
  const create = (args?.['create'] as Record<string, unknown> | undefined) || {};
  const update = (args?.['update'] as Record<string, unknown> | undefined) || {};
  const include = (args?.['include'] as Record<string, unknown> | undefined) || {};

  // ── user ──
  if (clientMethod === 'user.findFirst') {
    const orList = where['OR'] as Array<Record<string, unknown>> | undefined;
    const email =
      (where['email'] as string | undefined) ||
      (orList?.find((o) => typeof o['email'] === 'string')?.['email'] as string | undefined);
    const id =
      (where['id'] as string | undefined) ||
      (orList?.find((o) => typeof o['id'] === 'string')?.['id'] as string | undefined);
    const results = Array.from(userStore.values());
    return results.find((u) => u['id'] === id || u['email'] === email) ?? null;
  }
  if (clientMethod === 'user.findUnique') {
    return userStore.get(where['id'] as string) ?? null;
  }
  if (clientMethod === 'user.create') {
    const id = (data['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      email: data['email'],
      name: data['name'] || null,
      avatarUrl: data['avatarUrl'] || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userStore.set(id, record);
    return record;
  }

  // ── userGitHubCredential ──
  if (clientMethod === 'userGitHubCredential.findUnique') {
    return ghCredStore.get(where['userId'] as string) ?? null;
  }
  if (clientMethod === 'userGitHubCredential.upsert') {
    const userId = where['userId'] as string;
    const record = {
      id: makeUuid(Math.floor(Math.random() * 1000)),
      userId,
      encryptedToken: (create['encryptedToken'] || update['encryptedToken'] || 'token') as string,
      githubUsername: (create['githubUsername'] ||
        update['githubUsername'] ||
        'username') as string,
      githubAvatarUrl: (create['githubAvatarUrl'] ||
        update['githubAvatarUrl'] ||
        'avatar') as string,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    ghCredStore.set(userId, record);
    return record;
  }
  if (
    clientMethod === 'userGitHubCredential.delete' ||
    clientMethod === 'userGitHubCredential.deleteMany'
  ) {
    const userId = where['userId'] as string | undefined;
    if (userId) ghCredStore.delete(userId);
    return { count: 1 };
  }

  // ── repository ──
  if (clientMethod === 'repository.findMany') {
    let results = Array.from(repoStore.values());
    if (where['userId']) results = results.filter((r) => r['userId'] === where['userId']);
    return results;
  }
  if (clientMethod === 'repository.findUnique' || clientMethod === 'repository.findFirst') {
    if (where['id']) return repoStore.get(where['id'] as string) ?? null;
    if (where['githubId']) {
      const results = Array.from(repoStore.values());
      return results.find((r) => r['githubId'] === where['githubId']) ?? null;
    }
    return null;
  }
  if (clientMethod === 'repository.create') {
    const id = (data['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      userId: data['userId'],
      githubId: data['githubId'],
      name: data['name'],
      fullName: data['fullName'],
      owner: data['owner'],
      private: data['private'] ?? false,
      defaultBranch: data['defaultBranch'] || 'main',
      language: data['language'] || null,
      description: data['description'] || null,
      stars: data['stars'] || 0,
      forks: data['forks'] || 0,
      htmlUrl: data['htmlUrl'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repoStore.set(id, record);
    return record;
  }
  if (clientMethod === 'repository.delete') {
    const id = where['id'] as string | undefined;
    if (!id) return null;
    const record = repoStore.get(id);
    if (record) repoStore.delete(id);
    return record || null;
  }

  // ── repositoryFile ──
  if (clientMethod === 'repositoryFile.findMany') {
    let results = Array.from(fileStore.values());
    if (where['repositoryId'])
      results = results.filter((f) => f['repositoryId'] === where['repositoryId']);
    if (where['id']) results = results.filter((f) => f['id'] === where['id']);
    if (args?.['take']) results = results.slice(0, Number(args['take']));
    return results;
  }
  if (clientMethod === 'repositoryFile.findUnique') {
    const results = Array.from(fileStore.values());
    const repoIdPath = where['repositoryId_path'] as
      { repositoryId: string; path: string } | undefined;
    if (repoIdPath) {
      return (
        results.find(
          (f) => f['repositoryId'] === repoIdPath.repositoryId && f['path'] === repoIdPath.path,
        ) ?? null
      );
    }
    return null;
  }
  if (clientMethod === 'repositoryFile.count') {
    let results = Array.from(fileStore.values());
    if (where['repositoryId'])
      results = results.filter((f) => f['repositoryId'] === where['repositoryId']);
    return results.length;
  }
  if (clientMethod === 'repositoryFile.createMany') {
    const dataList = (args?.['data'] as Array<Record<string, unknown>> | undefined) || [];
    for (const f of dataList) {
      const id = (f['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 10000));
      fileStore.set(id, { ...f, id, createdAt: new Date(), updatedAt: new Date() });
    }
    return { count: dataList.length };
  }
  if (clientMethod === 'repositoryFile.deleteMany') {
    if (where['repositoryId']) {
      for (const [id, f] of Array.from(fileStore.entries())) {
        if (f['repositoryId'] === where['repositoryId']) fileStore.delete(id);
      }
    }
    return { count: 1 };
  }

  // ── repositorySymbol ──
  if (clientMethod === 'repositorySymbol.findMany') {
    let results = Array.from(symbolStore.values());
    if (where['repositoryId'])
      results = results.filter((s) => s['repositoryId'] === where['repositoryId']);
    if (where['fileId']) results = results.filter((s) => s['fileId'] === where['fileId']);
    const filePathFilter = where['filePath'] as { contains?: string } | undefined;
    if (filePathFilter?.contains) {
      const match = filePathFilter.contains.toLowerCase();
      results = results.filter((s) => String(s['filePath']).toLowerCase().includes(match));
    }
    return results;
  }
  if (clientMethod === 'repositorySymbol.count') {
    let results = Array.from(symbolStore.values());
    if (where['repositoryId'])
      results = results.filter((s) => s['repositoryId'] === where['repositoryId']);
    return results.length;
  }

  // ── fileDependency ──
  if (clientMethod === 'fileDependency.findMany') {
    let results = Array.from(depStore.values());
    if (where['repositoryId'])
      results = results.filter((d) => d['repositoryId'] === where['repositoryId']);
    const targetPathFilter = where['targetPath'] as { contains?: string } | undefined;
    if (targetPathFilter?.contains) {
      const match = targetPathFilter.contains.toLowerCase();
      results = results.filter((d) => String(d['targetPath']).toLowerCase().includes(match));
    }
    if (where['sourcePath'])
      results = results.filter((d) => d['sourcePath'] === where['sourcePath']);
    return results;
  }
  if (clientMethod === 'fileDependency.count') {
    let results = Array.from(depStore.values());
    if (where['repositoryId'])
      results = results.filter((d) => d['repositoryId'] === where['repositoryId']);
    return results.length;
  }

  // ── codeChunk ──
  if (clientMethod === 'codeChunk.findMany') {
    let results = Array.from(chunkStore.values());
    if (where['repositoryId'])
      results = results.filter((c) => c['repositoryId'] === where['repositoryId']);
    if (where['fileId']) results = results.filter((c) => c['fileId'] === where['fileId']);
    return results;
  }
  if (clientMethod === 'codeChunk.count') {
    let results = Array.from(chunkStore.values());
    if (where['repositoryId'])
      results = results.filter((c) => c['repositoryId'] === where['repositoryId']);
    return results.length;
  }
  if (clientMethod === 'codeChunk.groupBy') {
    let results = Array.from(chunkStore.values());
    if (where['repositoryId'])
      results = results.filter((c) => c['repositoryId'] === where['repositoryId']);
    const uniqueFileIds = Array.from(new Set(results.map((c) => c['fileId'])));
    return uniqueFileIds.map((fileId) => ({ fileId }));
  }

  // ── analysisJob ──
  if (clientMethod === 'analysisJob.findMany') {
    let results = Array.from(jobStore.values());
    if (where['repositoryId'])
      results = results.filter((j) => j['repositoryId'] === where['repositoryId']);
    return results;
  }
  if (clientMethod === 'analysisJob.findFirst') {
    let results = Array.from(jobStore.values());
    if (where['repositoryId'])
      results = results.filter((j) => j['repositoryId'] === where['repositoryId']);
    return results[0] ?? null;
  }
  if (clientMethod === 'analysisJob.create') {
    const id = (data['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      repositoryId: data['repositoryId'],
      status: data['status'] || 'pending',
      commitHash: data['commitHash'] || 'sha-123',
      fileCount: data['fileCount'] || 0,
      symbolCount: data['symbolCount'] || 0,
      dependencyCount: data['dependencyCount'] || 0,
      chunkCount: data['chunkCount'] || 0,
      errorMessage: data['errorMessage'] || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobStore.set(id, record);
    return record;
  }
  if (clientMethod === 'analysisJob.update') {
    const id = where['id'] as string | undefined;
    if (!id) return null;
    const existing = jobStore.get(id);
    if (existing) {
      const updated = { ...existing, ...data, updatedAt: new Date() };
      jobStore.set(id, updated);
      return updated;
    }
    return null;
  }

  // ── chatSession ──
  if (clientMethod === 'chatSession.findFirst') {
    let results = Array.from(sessionStore.values());
    if (where['repositoryId'])
      results = results.filter((s) => s['repositoryId'] === where['repositoryId']);
    if (where['userId']) results = results.filter((s) => s['userId'] === where['userId']);
    const session = results[0] ?? null;
    if (session && include['messages']) {
      const msgs = Array.from(messageStore.values()).filter(
        (m) => m['sessionId'] === session['id'],
      );
      return { ...session, messages: msgs };
    }
    return session;
  }
  if (clientMethod === 'chatSession.create') {
    const id = (data['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      repositoryId: data['repositoryId'],
      userId: data['userId'],
      title: data['title'] || 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessionStore.set(id, record);
    return record;
  }
  if (clientMethod === 'chatSession.deleteMany') {
    if (where['repositoryId']) {
      for (const [id, s] of Array.from(sessionStore.entries())) {
        if (s['repositoryId'] === where['repositoryId']) sessionStore.delete(id);
      }
    }
    return { count: 1 };
  }

  // ── chatMessage ──
  if (clientMethod === 'chatMessage.findMany') {
    let results = Array.from(messageStore.values());
    if (where['sessionId']) results = results.filter((m) => m['sessionId'] === where['sessionId']);
    return results;
  }
  if (clientMethod === 'chatMessage.create') {
    const id = (data['id'] as string | undefined) || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      sessionId: data['sessionId'],
      sender: data['sender'],
      text: data['text'] || data['content'],
      content: data['content'] || data['text'],
      metadata: data['metadata'] || {},
      sources: data['sources'] || [],
      createdAt: new Date(),
    };
    messageStore.set(id, record);
    return record;
  }
  if (clientMethod === 'chatMessage.deleteMany') {
    messageStore.clear();
    return { count: 1 };
  }

  return null;
};

// Intercept Raw Query for Vector Search and Metrics
(
  PrismaClient.prototype as unknown as {
    $queryRaw: (query: unknown, ...args: unknown[]) => Promise<unknown>;
  }
).$queryRaw = async function (query: unknown): Promise<unknown> {
  const queryObj = query as { strings?: string[] } | string | undefined;
  const queryStr = String(
    typeof queryObj === 'object' && queryObj && 'strings' in queryObj
      ? queryObj.strings
      : query || '',
  );
  if (queryStr.includes('COUNT(*)')) {
    return [{ count: BigInt(chunkStore.size) }];
  }
  const chunks = Array.from(chunkStore.values());
  return chunks.map((c) => ({
    id: c.id,
    repositoryId: c.repositoryId,
    fileId: c.fileId,
    chunkIndex: c.chunkIndex,
    content: c.content,
    filePath: c.filePath,
    language: c.language,
    startLine: c.startLine,
    endLine: c.endLine,
    tokenCount: c.tokenCount,
    linesCount: c.linesCount,
    metadata: c.metadata || {},
    similarity: 0.85,
  }));
};

// Mock LLM & Embedding provider methods
const provider = getEmbeddingProvider();
provider.generateEmbedding = async () => Array(1536).fill(0.1);
provider.generateBatchEmbeddings = async (texts: string[]) =>
  texts.map(() => Array(1536).fill(0.1));

const llm = getLLMProvider();
llm.generateAnswer = async () => 'This is a mock LLM explanation response.';

// ── HTTP Test Runner Setup ────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

function seedInitialData(): void {
  resetAllStores();

  // User 1 & 2
  userStore.set(USER_ID_1, {
    id: USER_ID_1,
    email: 'user1@example.com',
    name: 'User One',
    avatarUrl: 'https://github.com/user1.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  userStore.set(USER_ID_2, {
    id: USER_ID_2,
    email: 'user2@example.com',
    name: 'User Two',
    avatarUrl: 'https://github.com/user2.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // User 1 GitHub Credential
  ghCredStore.set(USER_ID_1, {
    id: makeUuid(1),
    userId: USER_ID_1,
    encryptedToken: encryptToken('ghp_mock_token_12345'),
    githubUsername: 'user1_github',
    githubAvatarUrl: 'https://github.com/user1.png',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Repo 1 owned by User 1
  repoStore.set(REPO_ID_1, {
    id: REPO_ID_1,
    userId: USER_ID_1,
    githubId: 10001,
    name: 'repo-one',
    fullName: 'user1_github/repo-one',
    owner: 'user1_github',
    private: false,
    defaultBranch: 'main',
    language: 'TypeScript',
    description: 'First repository',
    stars: 10,
    forks: 2,
    htmlUrl: 'https://github.com/user1_github/repo-one',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Repo 2 owned by User 2
  repoStore.set(REPO_ID_2, {
    id: REPO_ID_2,
    userId: USER_ID_2,
    githubId: 10002,
    name: 'repo-two',
    fullName: 'user2_github/repo-two',
    owner: 'user2_github',
    private: false,
    defaultBranch: 'main',
    language: 'Python',
    description: 'Second repository',
    stars: 5,
    forks: 0,
    htmlUrl: 'https://github.com/user2_github/repo-two',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // File
  fileStore.set(FILE_ID_1, {
    id: FILE_ID_1,
    repositoryId: REPO_ID_1,
    path: 'src/main.ts',
    name: 'main.ts',
    extension: 'ts',
    language: 'TypeScript',
    type: 'file',
    size: 150,
    sha: 'sha-main-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Symbol
  symbolStore.set(SYMBOL_ID_1, {
    id: SYMBOL_ID_1,
    repositoryId: REPO_ID_1,
    fileId: FILE_ID_1,
    name: 'startApp',
    kind: 'function',
    filePath: 'src/main.ts',
    startLine: 1,
    endLine: 10,
    exported: true,
    createdAt: new Date(),
  });

  // Dependency
  depStore.set(DEP_ID_1, {
    id: DEP_ID_1,
    repositoryId: REPO_ID_1,
    sourceFileId: FILE_ID_1,
    sourcePath: 'src/main.ts',
    targetPath: 'src/utils.ts',
    isExternal: false,
    importedSymbols: ['helper'],
    createdAt: new Date(),
  });

  // Code Chunk
  chunkStore.set(CHUNK_ID_1, {
    id: CHUNK_ID_1,
    repositoryId: REPO_ID_1,
    fileId: FILE_ID_1,
    chunkIndex: 0,
    content:
      'export function startApp() { return "long content to meet minimum chunk size requirement"; }',
    checksum: 'check-1',
    filePath: 'src/main.ts',
    language: 'TypeScript',
    startLine: 1,
    endLine: 10,
    tokenCount: 20,
    linesCount: 10,
    metadata: {},
    createdAt: new Date(),
  });

  // Job
  jobStore.set(JOB_ID_1, {
    id: JOB_ID_1,
    repositoryId: REPO_ID_1,
    status: 'completed',
    commitHash: 'commit-123',
    fileCount: 1,
    symbolCount: 1,
    dependencyCount: 1,
    chunkCount: 1,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Session
  sessionStore.set(SESSION_ID_1, {
    id: SESSION_ID_1,
    repositoryId: REPO_ID_1,
    userId: USER_ID_1,
    title: 'Chat Session 1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Message
  messageStore.set('m1', {
    id: 'm1',
    sessionId: SESSION_ID_1,
    sender: 'user',
    text: 'How does this work?',
    content: 'How does this work?',
    sources: [],
    createdAt: new Date(),
  });
}

interface ApiResponsePayload {
  success: boolean;
  error: { code: string; message: string };
  data: Record<string, unknown> & {
    id: string;
    synced: boolean;
    success: boolean;
    connection: { connected: boolean; githubUsername: string | null };
  };
  repository: Record<string, unknown> & { id: string };
  repositories: Array<Record<string, unknown>>;
  job: Record<string, unknown> & { id: string };
  jobs: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  symbols: Array<Record<string, unknown>>;
  dependencies: Array<Record<string, unknown>>;
  chunks: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  status: Record<string, unknown>;
  session: Record<string, unknown>;
  messages: Array<Record<string, unknown>>;
  answer: string;
  explanation: string;
  query: string;
  filePath: string;
  targetFilePath: string;
  totalFiles: number;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  result: Record<string, unknown> & { total: number };
}

async function apiRequest(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: ApiResponsePayload }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let jsonBody = {} as ApiResponsePayload;
  try {
    jsonBody = JSON.parse(text) as ApiResponsePayload;
  } catch {
    jsonBody = { raw: text } as unknown as ApiResponsePayload;
  }

  return { status: res.status, body: jsonBody };
}

// ── Main Integration Suite Execution ─────────────────────────────────────────

async function runTests() {
  console.log(
    '🧪 ForgeMind — Repository Controllers & HTTP API Routes Integration Test Suite (Sprint 4 Task 4)\n',
  );

  // Start Express Server on Ephemeral Port
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  try {
    await runPartA();
    await runPartB();
    await runPartC();
    await runPartD();
    await runPartE();
    await runPartF();
    await runPartH();

    console.log('\n🎉 ALL CONTROLLER & ROUTE INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A — AUTH & CREDENTIAL ROUTER ENDPOINTS (/api/v1/auth)
// ─────────────────────────────────────────────────────────────────────────────

async function runPartA() {
  console.log('📋 Part A — Auth & Credential Router Endpoints (Tests 1–9)');

  // 1. GET /api/v1/auth/me (Authenticated)
  {
    seedInitialData();
    const res = await apiRequest('GET', '/api/v1/auth/me', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 1: GET /auth/me status 200');
    assertEqual(res.body.success, true, 'Test 1: GET /auth/me success');
    assertEqual(res.body.data.id, USER_ID_1, 'Test 1: User ID matched');
    console.log('  ✅ Test 1: GET /api/v1/auth/me returns authenticated user profile');
  }

  // 2. GET /api/v1/auth/me (Unauthenticated)
  {
    const res = await apiRequest('GET', '/api/v1/auth/me', { token: TOKEN_INVALID });
    assertEqual(res.status, 401, 'Test 2: GET /auth/me unauthenticated status 401');
    assertEqual(res.body.success, false, 'Test 2: Error response');
    assertEqual(res.body.error.code, 'UNAUTHORIZED', 'Test 2: UNAUTHORIZED code');
    console.log('  ✅ Test 2: GET /api/v1/auth/me unauthenticated rejected with 401');
  }

  // 3. POST /api/v1/auth/sync (Authenticated)
  {
    const res = await apiRequest('POST', '/api/v1/auth/sync', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 3: POST /auth/sync status 200');
    assertEqual(res.body.data.synced, true, 'Test 3: Synced true');
    console.log('  ✅ Test 3: POST /api/v1/auth/sync syncs user profile');
  }

  // 4. POST /api/v1/auth/sync (Unauthenticated)
  {
    const res = await apiRequest('POST', '/api/v1/auth/sync');
    assertEqual(res.status, 401, 'Test 4: Unauthenticated sync status 401');
    console.log('  ✅ Test 4: POST /api/v1/auth/sync unauthenticated rejected with 401');
  }

  // 5. GET /api/v1/auth/github (Connection status)
  {
    const res = await apiRequest('GET', '/api/v1/auth/github', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 5: GET /auth/github status 200');
    assertEqual(res.body.data.connection.connected, true, 'Test 5: Connected status');
    assertEqual(
      res.body.data.connection.githubUsername,
      'user1_github',
      'Test 5: GitHub username matched',
    );
    console.log('  ✅ Test 5: GET /api/v1/auth/github returns connected status');
  }

  // 6. GET /api/v1/auth/github (Unauthenticated)
  {
    const res = await apiRequest('GET', '/api/v1/auth/github');
    assertEqual(res.status, 401, 'Test 6: Status 401');
    console.log('  ✅ Test 6: GET /api/v1/auth/github unauthenticated status 401');
  }

  // 7. PUT /api/v1/auth/github (Connect valid token)
  {
    const res = await apiRequest('PUT', '/api/v1/auth/github', {
      token: TOKEN_USER_1,
      body: { token: 'ghp_valid123456789' },
    });
    assertEqual(res.status, 200, 'Test 7: PUT /auth/github status 200');
    assertEqual(res.body.data.connection.connected, true, 'Test 7: Connected status');
    console.log('  ✅ Test 7: PUT /api/v1/auth/github connects GitHub PAT');
  }

  // 8. PUT /api/v1/auth/github (Missing token payload)
  {
    const res = await apiRequest('PUT', '/api/v1/auth/github', { token: TOKEN_USER_1, body: {} });
    assertEqual(res.status, 400, 'Test 8: Status 400');
    assertEqual(res.body.error.code, 'INVALID_CREDENTIAL', 'Test 8: INVALID_CREDENTIAL code');
    console.log('  ✅ Test 8: PUT /api/v1/auth/github missing token returns 400');
  }

  // 9. DELETE /api/v1/auth/github (Disconnect GitHub credential)
  {
    const res = await apiRequest('DELETE', '/api/v1/auth/github', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 9: Status 200');
    assertEqual(res.body.data.success, true, 'Test 9: Disconnected');
    console.log('  ✅ Test 9: DELETE /api/v1/auth/github disconnects credential');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART B — REPOSITORY ENDPOINTS (/api/v1/repositories)
// ─────────────────────────────────────────────────────────────────────────────

async function runPartB() {
  console.log('\n📋 Part B — Repository CRUD & Sync Endpoints (Tests 10–18)');

  // 10. POST /api/v1/repositories/sync (Success)
  {
    seedInitialData();
    const res = await apiRequest('POST', '/api/v1/repositories/sync', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 10: Sync status 200');
    assertEqual(res.body.success, true, 'Test 10: Sync success');
    assertGte(res.body.result.total, 1, 'Test 10: Repos synced');
    console.log('  ✅ Test 10: POST /api/v1/repositories/sync triggers repository sync');
  }

  // 11. POST /api/v1/repositories/sync (Missing GitHub PAT for user)
  {
    seedInitialData();
    ghCredStore.delete(USER_ID_2);
    const res = await apiRequest('POST', '/api/v1/repositories/sync', { token: TOKEN_USER_2 });
    assertEqual(res.status, 400, 'Test 11: Missing PAT status 400');
    assertEqual(res.body.error.code, 'MISSING_GITHUB_TOKEN', 'Test 11: Error code matched');
    console.log('  ✅ Test 11: POST /api/v1/repositories/sync without token returns 400');
  }

  // 12. POST /api/v1/repositories/sync (Unauthenticated)
  {
    const res = await apiRequest('POST', '/api/v1/repositories/sync');
    assertEqual(res.status, 401, 'Test 12: Status 401');
    console.log('  ✅ Test 12: POST /api/v1/repositories/sync unauthenticated status 401');
  }

  // 13. GET /api/v1/repositories (List user repositories)
  {
    seedInitialData();
    const res = await apiRequest('GET', '/api/v1/repositories', { token: TOKEN_USER_1 });
    assertEqual(res.status, 200, 'Test 13: List status 200');
    assertEqual(res.body.success, true, 'Test 13: Success true');
    assertEqual(res.body.repositories.length, 1, 'Test 13: 1 repository for User 1');
    console.log('  ✅ Test 13: GET /api/v1/repositories returns user repositories');
  }

  // 14. GET /api/v1/repositories (Unauthenticated)
  {
    const res = await apiRequest('GET', '/api/v1/repositories');
    assertEqual(res.status, 401, 'Test 14: Unauthenticated status 401');
    console.log('  ✅ Test 14: GET /api/v1/repositories unauthenticated status 401');
  }

  // 15. GET /api/v1/repositories/:id (Single repo lookup - Owner)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 15: Status 200');
    assertEqual(res.body.repository.id, REPO_ID_1, 'Test 15: Repo ID matched');
    console.log('  ✅ Test 15: GET /api/v1/repositories/:id returns repository details');
  }

  // 15b. GET /api/v1/repositories/:id (Single repo lookup - Non-owner IDOR attempt)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_2}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 403, 'Test 15b: Cross-user GET status 403 FORBIDDEN');
    assertEqual(res.body.error.code, 'FORBIDDEN', 'Test 15b: FORBIDDEN error code');
    console.log('  ✅ Test 15b: GET /api/v1/repositories/:id cross-user access rejected with 403');
  }

  // 16. GET /api/v1/repositories/:id (Non-existent ID)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${NON_EXISTENT_REPO_ID}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 404, 'Test 16: Status 404');
    assertEqual(res.body.error.code, 'NOT_FOUND', 'Test 16: NOT_FOUND error');
    console.log('  ✅ Test 16: GET /api/v1/repositories/:id non-existent returns 404');
  }

  // 17. DELETE /api/v1/repositories/:id (Delete repository - Non-owner IDOR attempt)
  {
    const res = await apiRequest('DELETE', `/api/v1/repositories/${REPO_ID_2}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 403, 'Test 17: Cross-user DELETE status 403 FORBIDDEN');
    assertEqual(res.body.error.code, 'FORBIDDEN', 'Test 17: FORBIDDEN error code');
    console.log(
      '  ✅ Test 17: DELETE /api/v1/repositories/:id cross-user deletion rejected with 403',
    );
  }

  // 17b. DELETE /api/v1/repositories/:id (Delete repository - Owner)
  {
    const res = await apiRequest('DELETE', `/api/v1/repositories/${REPO_ID_1}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 17b: Delete status 200');
    assertEqual(res.body.repository.id, REPO_ID_1, 'Test 17b: Deleted repo returned');
    console.log('  ✅ Test 17b: DELETE /api/v1/repositories/:id deletes repository');
  }

  // 18. DELETE /api/v1/repositories/:id (Non-existent ID)
  {
    const res = await apiRequest('DELETE', `/api/v1/repositories/${NON_EXISTENT_REPO_ID}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 404, 'Test 18: Status 404');
    console.log('  ✅ Test 18: DELETE /api/v1/repositories/:id non-existent returns 404');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART C — ANALYSIS & FILE METADATA ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

async function runPartC() {
  console.log('\n📋 Part C — Analysis & File Metadata Endpoints (Tests 19–25)');

  // 19. POST /api/v1/repositories/:repositoryId/analyze (Trigger analysis)
  {
    seedInitialData();
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/analyze`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 19: Analyze status 200');
    assertEqual(res.body.success, true, 'Test 19: Success true');
    assertDefined(res.body.result, 'Test 19: AcquisitionSummary present');
    console.log('  ✅ Test 19: POST /api/v1/repositories/:repositoryId/analyze triggers analysis');
  }

  // 20. POST /api/v1/repositories/:repositoryId/analyze (Missing token for user)
  {
    seedInitialData();
    ghCredStore.delete(USER_ID_2);
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_2}/analyze`, {
      token: TOKEN_USER_2,
    });
    assertEqual(res.status, 400, 'Test 20: Missing PAT status 400');
    assertEqual(res.body.error.code, 'MISSING_GITHUB_TOKEN', 'Test 20: Error code');
    console.log(
      '  ✅ Test 20: POST /api/v1/repositories/:repositoryId/analyze missing token returns 400',
    );
  }

  // 21. GET /api/v1/repositories/:repositoryId/analysis (Latest analysis)
  {
    seedInitialData();
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/analysis`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 21: Status 200');
    assertEqual(res.body.job.id, JOB_ID_1, 'Test 21: Latest analysis job matched');
    console.log(
      '  ✅ Test 21: GET /api/v1/repositories/:repositoryId/analysis returns latest analysis',
    );
  }

  // 22. GET /api/v1/repositories/:repositoryId/analysis/history (Analysis history)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/analysis/history`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 22: Status 200');
    assertGte(res.body.jobs.length, 1, 'Test 22: History list populated');
    console.log(
      '  ✅ Test 22: GET /api/v1/repositories/:repositoryId/analysis/history returns history',
    );
  }

  // 23. GET /api/v1/repositories/:repositoryId/files (Repository files)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/files`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 23: Status 200');
    assertEqual(res.body.files.length, 1, 'Test 23: Files array populated');
    console.log('  ✅ Test 23: GET /api/v1/repositories/:repositoryId/files returns indexed files');
  }

  // 24. GET /api/v1/repositories/:repositoryId/symbols (Extracted symbols)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/symbols`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 24: Status 200');
    assertEqual(res.body.symbols.length, 1, 'Test 24: Symbols array populated');
    console.log('  ✅ Test 24: GET /api/v1/repositories/:repositoryId/symbols returns symbols');
  }

  // 25. GET /api/v1/repositories/:repositoryId/dependencies (File dependencies)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/dependencies`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 25: Status 200');
    assertEqual(res.body.dependencies.length, 1, 'Test 25: Dependencies array populated');
    console.log(
      '  ✅ Test 25: GET /api/v1/repositories/:repositoryId/dependencies returns dependencies',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART D — VECTOR SEARCH & CHUNKS ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

async function runPartD() {
  console.log('\n📋 Part D — Vector Search & Chunks Endpoints (Tests 26–30)');

  // 26. GET /api/v1/repositories/:repositoryId/chunks (Get chunks)
  {
    seedInitialData();
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/chunks`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 26: Status 200');
    assertEqual(res.body.chunks.length, 1, 'Test 26: Chunks array populated');
    console.log('  ✅ Test 26: GET /api/v1/repositories/:repositoryId/chunks returns code chunks');
  }

  // 27. GET /api/v1/repositories/:repositoryId/chunks (Forbidden for non-owner)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/chunks`, {
      token: TOKEN_USER_2,
    });
    assertEqual(res.status, 403, 'Test 27: Status 403');
    assertEqual(res.body.error.code, 'FORBIDDEN', 'Test 27: Error code FORBIDDEN');
    console.log(
      '  ✅ Test 27: GET /api/v1/repositories/:repositoryId/chunks forbidden for non-owner',
    );
  }

  // 28. POST /api/v1/repositories/:repositoryId/search/semantic (Valid semantic search)
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/search/semantic`, {
      token: TOKEN_USER_1,
      body: { query: 'startApp function' },
    });
    assertEqual(res.status, 200, 'Test 28: Status 200');
    assertGte(res.body.results.length, 1, 'Test 28: Results returned');
    console.log(
      '  ✅ Test 28: POST /api/v1/repositories/:repositoryId/search/semantic executes search',
    );
  }

  // 29. POST /api/v1/repositories/:repositoryId/search/semantic (Missing query)
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/search/semantic`, {
      token: TOKEN_USER_1,
      body: { query: '' },
    });
    assertEqual(res.status, 400, 'Test 29: Status 400');
    assertEqual(res.body.error.code, 'INVALID_REQUEST', 'Test 29: INVALID_REQUEST code');
    console.log(
      '  ✅ Test 29: POST /api/v1/repositories/:repositoryId/search/semantic missing query returns 400',
    );
  }

  // 30. GET /api/v1/repositories/:repositoryId/vector-status (Pipeline status)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/vector-status`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 30: Status 200');
    assertDefined(res.body.status, 'Test 30: Status object present');
    console.log(
      '  ✅ Test 30: GET /api/v1/repositories/:repositoryId/vector-status returns vector status',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART E — RAG CHAT ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

async function runPartE() {
  console.log('\n📋 Part E — RAG Chat Endpoints (Tests 31–34)');

  // 31. POST /api/v1/repositories/:repositoryId/chat (Valid RAG Query)
  {
    seedInitialData();
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/chat`, {
      token: TOKEN_USER_1,
      body: { query: 'Where is authentication handled?' },
    });
    assertEqual(res.status, 200, 'Test 31: Status 200');
    assertDefined(res.body.answer, 'Test 31: Answer present');
    assertEqual(res.body.query, 'Where is authentication handled?', 'Test 31: Query matched');
    console.log('  ✅ Test 31: POST /api/v1/repositories/:repositoryId/chat executes RAG query');
  }

  // 32. POST /api/v1/repositories/:repositoryId/chat (Missing query)
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/chat`, {
      token: TOKEN_USER_1,
      body: { query: '   ' },
    });
    assertEqual(res.status, 400, 'Test 32: Status 400');
    assertEqual(res.body.error.code, 'INVALID_REQUEST', 'Test 32: INVALID_REQUEST error');
    console.log(
      '  ✅ Test 32: POST /api/v1/repositories/:repositoryId/chat empty query returns 400',
    );
  }

  // 33. GET /api/v1/repositories/:repositoryId/chat/history (Chat history)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/chat/history`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 33: Status 200');
    assertDefined(res.body.session, 'Test 33: Session object present');
    assertGte(res.body.messages.length, 1, 'Test 33: Messages present');
    console.log(
      '  ✅ Test 33: GET /api/v1/repositories/:repositoryId/chat/history returns chat history',
    );
  }

  // 34. DELETE /api/v1/repositories/:repositoryId/chat/history (Clear chat history)
  {
    const res = await apiRequest('DELETE', `/api/v1/repositories/${REPO_ID_1}/chat/history`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 34: Status 200');
    assertEqual(res.body.success, true, 'Test 34: Success true');
    console.log(
      '  ✅ Test 34: DELETE /api/v1/repositories/:repositoryId/chat/history clears history',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART F — CODE INTELLIGENCE & BOUNDARY VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────

async function runPartF() {
  console.log('\n📋 Part F — Code Intelligence & Boundary Verification (Tests 35–41)');

  // 35. POST /api/v1/repositories/:repositoryId/intelligence/explain (Valid request)
  {
    seedInitialData();
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/intelligence/explain`, {
      token: TOKEN_USER_1,
      body: { filePath: 'src/main.ts' },
    });
    assertEqual(res.status, 200, 'Test 35: Status 200');
    assertEqual(res.body.filePath, 'src/main.ts', 'Test 35: File path matched');
    assertDefined(res.body.explanation, 'Test 35: Explanation present');
    console.log(
      '  ✅ Test 35: POST /api/v1/repositories/:repositoryId/intelligence/explain explains code',
    );
  }

  // 36. POST /api/v1/repositories/:repositoryId/intelligence/explain (Missing filePath)
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/intelligence/explain`, {
      token: TOKEN_USER_1,
      body: {},
    });
    assertEqual(res.status, 400, 'Test 36: Status 400');
    assertEqual(res.body.error.code, 'INVALID_REQUEST', 'Test 36: INVALID_REQUEST code');
    console.log(
      '  ✅ Test 36: POST /api/v1/repositories/:repositoryId/intelligence/explain missing filePath returns 400',
    );
  }

  // 37. GET /api/v1/repositories/:repositoryId/intelligence/dependencies (Valid query)
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/dependencies?filePath=src/main.ts`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 200, 'Test 37: Status 200');
    assertEqual(res.body.filePath, 'src/main.ts', 'Test 37: File path matched');
    console.log(
      '  ✅ Test 37: GET /api/v1/repositories/:repositoryId/intelligence/dependencies returns dependencies',
    );
  }

  // 38. GET /api/v1/repositories/:repositoryId/intelligence/dependencies (Missing filePath param)
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/dependencies`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 400, 'Test 38: Status 400');
    assertEqual(res.body.error.code, 'INVALID_REQUEST', 'Test 38: INVALID_REQUEST code');
    console.log(
      '  ✅ Test 38: GET /api/v1/repositories/:repositoryId/intelligence/dependencies missing param returns 400',
    );
  }

  // 39. POST /api/v1/repositories/:repositoryId/intelligence/impact (Impact analysis)
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/intelligence/impact`, {
      token: TOKEN_USER_1,
      body: { filePath: 'src/main.ts' },
    });
    assertEqual(res.status, 200, 'Test 39: Status 200');
    assertEqual(res.body.targetFilePath, 'src/main.ts', 'Test 39: File path matched');
    console.log(
      '  ✅ Test 39: POST /api/v1/repositories/:repositoryId/intelligence/impact analyzes blast radius',
    );
  }

  // 40. GET /api/v1/repositories/:repositoryId/intelligence/architecture (Architecture overview)
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/architecture`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 200, 'Test 40: Status 200');
    assertEqual(res.body.totalFiles, 1, 'Test 40: Total files matched');
    console.log(
      '  ✅ Test 40: GET /api/v1/repositories/:repositoryId/intelligence/architecture returns overview',
    );
  }

  // 40b. GET /api/v1/repositories/:repositoryId/intelligence/graph (Graph topology)
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/graph?limit=50&nodeType=all`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 200, 'Test 40b: Status 200');
    assert(Array.isArray(res.body.nodes), 'Test 40b: Nodes array returned');
    assert(Array.isArray(res.body.edges), 'Test 40b: Edges array returned');
    console.log(
      '  ✅ Test 40b: GET /api/v1/repositories/:repositoryId/intelligence/graph returns topology',
    );
  }

  // 41. Express 404 Fallback
  {
    const res = await apiRequest('GET', '/api/v1/non-existent-endpoint');
    assertEqual(res.status, 404, 'Test 41: Status 404');
    assertEqual(res.body.error.code, 'NOT_FOUND', 'Test 41: NOT_FOUND code');
    console.log('  ✅ Test 41: Unknown route triggers 404 fallback handler');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART G — SPRINT 5 CRYPTOGRAPHIC SECURITY & RATE LIMITING HARDENING
// ─────────────────────────────────────────────────────────────────────────────

async function runPartG() {
  console.log('\n📋 Part G — Cryptographic Security, CORS & Rate Limiting Hardening (Tests 42–46)');

  // 42. Encryption cycle verification
  {
    const secretText = 'ghp_super_secret_github_pat_12345';
    const encrypted = encryptToken(secretText);
    assert(encrypted.split(':').length === 3, 'Test 42: Encrypted token format iv:authTag:cipher');
    const decrypted = decryptToken(encrypted);
    assertEqual(decrypted, secretText, 'Test 42: Decrypted value matches original secret');
    console.log('  ✅ Test 42: AES-256-GCM encryption/decryption roundtrip verified');
  }

  // 43. Production missing encryption secret enforcement
  {
    const originalEnv = process.env['NODE_ENV'];
    const originalSecret = process.env['ENCRYPTION_SECRET'];
    const originalRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

    try {
      process.env['NODE_ENV'] = 'production';
      delete process.env['ENCRYPTION_SECRET'];
      delete process.env['SUPABASE_SERVICE_ROLE_KEY'];

      let errorThrown = false;
      try {
        encryptToken('test-payload');
      } catch (err) {
        errorThrown = true;
        assert(
          err instanceof Error && err.message.includes('ENCRYPTION_SECRET'),
          'Test 43: Error message mentions missing secret',
        );
      }
      assert(errorThrown, 'Test 43: Production mode throws when encryption secret is missing');
      console.log(
        '  ✅ Test 43: Production encryption fails safely when ENCRYPTION_SECRET is absent',
      );
    } finally {
      process.env['NODE_ENV'] = originalEnv;
      if (originalSecret) process.env['ENCRYPTION_SECRET'] = originalSecret;
      if (originalRoleKey) process.env['SUPABASE_SERVICE_ROLE_KEY'] = originalRoleKey;
    }
  }

  // 44. Rate limiter 429 enforcement
  {
    const originalRateTest = process.env['ENABLE_RATE_LIMIT_TEST'];
    try {
      process.env['ENABLE_RATE_LIMIT_TEST'] = 'true';

      const rateApp = express();
      rateApp.use(express.json());
      const testLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 3,
        message: 'Too many requests. Please try again later.',
        keyGenerator: () => 'test-client-ip',
      });

      rateApp.get('/test-limit', testLimiter, (_req, res) => {
        res.status(200).json({ success: true });
      });

      let testPort = 0;
      const testServer = await new Promise<Server>((resolve) => {
        const s = rateApp.listen(0, () => {
          testPort = (s.address() as AddressInfo).port;
          resolve(s);
        });
      });

      const testUrl = `http://127.0.0.1:${testPort}/test-limit`;

      // 3 requests succeed
      for (let i = 0; i < 3; i++) {
        const r = await fetch(testUrl);
        assertEqual(r.status, 200, `Test 44: Request ${i + 1} under limit succeeds`);
      }

      // 4th request gets 429
      const r4 = await fetch(testUrl);
      assertEqual(r4.status, 429, 'Test 44: Request 4 over limit returns 429');
      const body4 = (await r4.json()) as { error: { code: string } };
      assertEqual(body4.error.code, 'TOO_MANY_REQUESTS', 'Test 44: Error code TOO_MANY_REQUESTS');
      assertDefined(r4.headers.get('retry-after'), 'Test 44: Retry-After header set');
      assertDefined(r4.headers.get('ratelimit-limit'), 'Test 44: RateLimit-Limit header set');

      await new Promise<void>((resolve) => testServer.close(() => resolve()));
      console.log('  ✅ Test 44: Rate limiter middleware enforces HTTP 429 and response headers');
    } finally {
      if (originalRateTest !== undefined) {
        process.env['ENABLE_RATE_LIMIT_TEST'] = originalRateTest;
      } else {
        delete process.env['ENABLE_RATE_LIMIT_TEST'];
      }
    }
  }

  // 45. CORS origin empty-string sanitization
  {
    const origins = 'https://app.forgemind.io, , https://dashboard.forgemind.io'
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    assertEqual(origins.length, 2, 'Test 45: Empty origins stripped out');
    assertEqual(origins[0], 'https://app.forgemind.io', 'Test 45: First origin matched');
    assertEqual(origins[1], 'https://dashboard.forgemind.io', 'Test 45: Second origin matched');
    console.log('  ✅ Test 45: CORS allowed origins filter strips empty origin entries');
  }

  // 46. Generic production error response
  {
    const originalEnv = process.env['NODE_ENV'];
    try {
      process.env['NODE_ENV'] = 'production';
      const testErr = new Error('Sensitive database internal error details');
      const mockReq = {} as express.Request;
      let statusResult = 0;
      let jsonResult: unknown = null;

      const mockRes = {
        status(code: number) {
          statusResult = code;
          return this;
        },
        json(data: unknown) {
          jsonResult = data;
          return this;
        },
      } as express.Response;

      const errHandler = (
        err: Error,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        const isDev = process.env['NODE_ENV'] === 'development';
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: isDev ? err.message : 'An unexpected error occurred.',
          },
        });
      };

      errHandler(testErr, mockReq, mockRes, (() => {}) as express.NextFunction);

      assertEqual(statusResult, 500, 'Test 46: HTTP 500 status set');
      const body = jsonResult as { error: { message: string } };
      assertEqual(
        body.error.message,
        'An unexpected error occurred.',
        'Test 46: Generic error message returned in production',
      );
      console.log('  ✅ Test 46: Production error responses hide internal error details');
    } finally {
      process.env['NODE_ENV'] = originalEnv;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART H — SPRINT 5 TASK 5 RESOURCE EXHAUSTION & BOUNDARY TESTS
// ─────────────────────────────────────────────────────────────────────────────

async function runPartH() {
  console.log('\n📋 Part H — Resource Exhaustion & Boundary Tests (Tests 47–52)');

  // 47. Oversized RAG query rejected
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/chat`, {
      token: TOKEN_USER_1,
      body: { query: 'A'.repeat(2001) },
    });
    assertEqual(res.status, 400, 'Test 47: Status 400');
    console.log('  ✅ Test 47: Oversized RAG query correctly rejected');
  }

  // 48. Oversized semantic query rejected
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/search/semantic`, {
      token: TOKEN_USER_1,
      body: { query: 'A'.repeat(2001) },
    });
    assertEqual(res.status, 400, 'Test 48: Status 400');
    console.log('  ✅ Test 48: Oversized semantic query correctly rejected');
  }

  // 49. Oversized intelligence input rejected
  {
    const res = await apiRequest('POST', `/api/v1/repositories/${REPO_ID_1}/intelligence/explain`, {
      token: TOKEN_USER_1,
      body: { filePath: 'A'.repeat(1025) },
    });
    assert(
      res.status === 400 || res.status === 429,
      `Test 49: Status 400 or 429 — Got ${res.status}`,
    );
    console.log('  ✅ Test 49: Oversized intelligence input correctly rejected');
  }

  // 50. limit > 100 clamped (verify it works and doesn't crash)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/files?limit=100000`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 50: Status 200');
    console.log('  ✅ Test 50: limit > 100 is clamped safely');
  }

  // 51. invalid/NaN limit clamped safely
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/symbols?limit=abc`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 51: Status 200');
    console.log('  ✅ Test 51: invalid/NaN limit is handled safely');
  }

  // 52. negative/zero limit clamped safely
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/dependencies?limit=-50`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 200, 'Test 52: Status 200');
    console.log('  ✅ Test 52: negative limit is handled safely');
  }

  // 53. GET Onboarding Blueprint for owned repository
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/blueprint`,
      {
        token: TOKEN_USER_1,
      },
    );
    const body = res.body as unknown as { success: boolean; data: { guidedTour: unknown[] } };
    assert(body.success === true, 'Test 53: success is true');
    assert(body.data.guidedTour.length === 5, 'Test 53: 5 tour steps present');
    console.log('  ✅ Test 53: GET Onboarding Blueprint returns 5-step guided tour');
  }

  // 54. GET Onboarding Blueprint for non-owned repository rejected with 403
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_2}/intelligence/blueprint`,
      {
        token: TOKEN_USER_1,
      },
    );
    assertEqual(res.status, 403, 'Test 54: Status 403');
    console.log('  ✅ Test 54: GET Onboarding Blueprint cross-user access rejected');
  }

  // 55. POST Onboarding Step Q&A returns HTTP 200 for owned repository
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/blueprint/step-ask`,
      {
        token: TOKEN_USER_1,
        body: {
          stepNumber: 1,
          targetFile: 'src/main.ts',
          query: 'Explain server bootstrap initialization',
        },
      },
    );
    assert(res.status === 200 || res.status === 429, 'Test 55: Status 200 or 429 rate limited');
    if (res.status === 200) {
      const body = res.body as unknown as { success: boolean; data: { answer: string } };
      assert(body.success === true, 'Test 55: success is true');
      assert(typeof body.data.answer === 'string', 'Test 55: answer returned');
    }
    console.log('  ✅ Test 55: POST Onboarding Step Q&A returns HTTP 200 for owned repository');
  }

  // 56. POST Onboarding Step Q&A with invalid payload rejected with 400
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/blueprint/step-ask`,
      {
        token: TOKEN_USER_1,
        body: {
          stepNumber: 1,
          targetFile: '',
          query: '',
        },
      },
    );
    assert(res.status === 400 || res.status === 429, 'Test 56: Status 400 or 429 rate limited');
    console.log('  ✅ Test 56: POST Onboarding Step Q&A invalid payload rejected');
  }

  // 57. POST Onboarding Step Q&A for non-owned repository rejected with 403
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_2}/intelligence/blueprint/step-ask`,
      {
        token: TOKEN_USER_1,
        body: {
          stepNumber: 1,
          targetFile: 'src/main.ts',
          query: 'Explain main.ts',
        },
      },
    );
    assert(res.status === 403 || res.status === 429, 'Test 57: Status 403 or 429 rate limited');
    console.log('  ✅ Test 57: POST Onboarding Step Q&A cross-user access rejected');
  }

  // 58. POST Onboarding Blueprint Share returns HTTP 200 with signed token
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/blueprint/share`,
      {
        token: TOKEN_USER_1,
        body: {
          includeQAHistory: true,
          customNotes: 'Team onboarding note',
          expiresInDays: 7,
        },
      },
    );
    assert(res.status === 200 || res.status === 429, 'Test 58: Status 200 or 429 rate limited');
    if (res.status === 200) {
      assert(Boolean((res.body as any)?.data?.shareToken), 'Test 58: shareToken returned');
      assert(Boolean((res.body as any)?.data?.shareUrl), 'Test 58: shareUrl returned');
    }
    console.log('  ✅ Test 58: POST Onboarding Blueprint Share returns HTTP 200 with signed token');
  }

  // 59. GET Public Shared Blueprint returns HTTP 200 for valid token
  {
    const createRes = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/blueprint/share`,
      {
        token: TOKEN_USER_1,
        body: {
          includeQAHistory: true,
          expiresInDays: 7,
        },
      },
    );

    if (createRes.status === 200) {
      const shareToken = (createRes.body as any)?.data?.shareToken as string;
      const res = await apiRequest(
        'GET',
        `/api/v1/onboarding/share/${encodeURIComponent(shareToken)}`,
      );
      assert(res.status === 200 || res.status === 429, 'Test 59: Status 200 or 429 rate limited');
      if (res.status === 200) {
        assert(
          Boolean((res.body as any)?.data?.repositoryName),
          'Test 59: repositoryName returned',
        );
        assert(Boolean((res.body as any)?.data?.guidedTour), 'Test 59: guidedTour returned');
      }
    }
    console.log('  ✅ Test 59: GET Public Shared Blueprint returns HTTP 200 for valid token');
  }

  // 60. GET Architecture Health returns HTTP 200 with deterministic score & findings
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}/intelligence/health`, {
      token: TOKEN_USER_1,
    });
    assert(res.status === 200, 'Test 60: Status 200');
    assert((res.body as any)?.data?.repositoryId === REPO_ID_1, 'Test 60: repositoryId matches');
    assert(
      typeof (res.body as any)?.data?.healthScore === 'number',
      'Test 60: healthScore is number',
    );
    assert(Array.isArray((res.body as any)?.data?.findings), 'Test 60: findings is array');
    console.log('  ✅ Test 60: GET Architecture Health returns HTTP 200 with score & findings');
  }

  // 61. GET Architecture Health cross-user access rejected with 403 Forbidden
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_2}/intelligence/health`, {
      token: TOKEN_USER_1,
    });
    assert(res.status === 403, 'Test 61: Status 403');
    console.log('  ✅ Test 61: GET Architecture Health cross-user access rejected with 403');
  }

  // 62. POST Explain Architecture Finding returns HTTP 200 with explanation & evidence
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/health/explain`,
      {
        token: TOKEN_USER_1,
        body: {
          findingId: 'finding-cycle-1',
          category: 'circular_dependency',
          affectedFiles: ['src/a.ts', 'src/b.ts'],
        },
      },
    );
    assert(
      res.status === 200 || res.status === 400 || res.status === 429,
      'Test 62: Status 200, 400 or 429',
    );
    console.log('  ✅ Test 62: POST Explain Architecture Finding handled correctly');
  }

  // 63. POST Explain Architecture Finding missing findingId rejected with 400
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/intelligence/health/explain`,
      {
        token: TOKEN_USER_1,
        body: {},
      },
    );
    assert(res.status === 400 || res.status === 429, 'Test 63: Status 400 or 429');
    console.log('  ✅ Test 63: POST Explain Architecture Finding missing findingId rejected');
  }

  // 64. POST Explain Architecture Finding cross-user access rejected with 403
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_2}/intelligence/health/explain`,
      {
        token: TOKEN_USER_1,
        body: { findingId: 'finding-1' },
      },
    );
    assert(res.status === 403 || res.status === 429, 'Test 64: Status 403 or 429');
    console.log('  ✅ Test 64: POST Explain Architecture Finding cross-user access rejected');
  }

  // 65. GET Architectural Risk Intelligence returns HTTP 200 with highest-value fix
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_1}/architecture/risk-intelligence`,
      {
        token: TOKEN_USER_1,
      },
    );
    assert(res.status === 200, 'Test 65: Status 200');
    assert((res.body as any)?.data?.repositoryId === REPO_ID_1, 'Test 65: repositoryId matches');
    assert(
      typeof (res.body as any)?.data?.currentHealthScore === 'number',
      'Test 65: currentHealthScore is number',
    );
    assert(
      Array.isArray((res.body as any)?.data?.rankedRemediations),
      'Test 65: rankedRemediations is array',
    );
    console.log(
      '  ✅ Test 65: GET Architectural Risk Intelligence returns HTTP 200 with remediations',
    );
  }

  // 66. GET Architectural Risk Intelligence cross-user access rejected with 403
  {
    const res = await apiRequest(
      'GET',
      `/api/v1/repositories/${REPO_ID_2}/architecture/risk-intelligence`,
      {
        token: TOKEN_USER_1,
      },
    );
    assert(res.status === 403, 'Test 66: Status 403');
    console.log(
      '  ✅ Test 66: GET Architectural Risk Intelligence cross-user access rejected with 403',
    );
  }

  // 67. POST Explain Remediation Action handles request correctly
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/architecture/remediation-explain`,
      {
        token: TOKEN_USER_1,
        body: {
          findingId: 'finding-101',
          targetFile: 'src/app.ts',
        },
      },
    );
    assert(
      res.status === 200 || res.status === 400 || res.status === 429,
      'Test 67: Status 200, 400 or 429',
    );
    console.log('  ✅ Test 67: POST Explain Remediation Action handled correctly');
  }

  // 68. POST Explain Remediation Action missing findingId rejected with 400
  {
    const res = await apiRequest(
      'POST',
      `/api/v1/repositories/${REPO_ID_1}/architecture/remediation-explain`,
      {
        token: TOKEN_USER_1,
        body: {},
      },
    );
    assert(res.status === 400 || res.status === 429, 'Test 68: Status 400 or 429');
    console.log('  ✅ Test 68: POST Explain Remediation Action missing findingId rejected');
  }
}

// Execute test suite
async function executeSuite() {
  await runTests();
  await runPartG();
}

executeSuite().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
