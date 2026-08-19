/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Repository Controllers & HTTP API Routes Integration Test Suite
// (Sprint 4 Task 4)
// =============================================================================

import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { PrismaClient } from '@prisma/client';

import { createApp } from '../app.js';
import { encryptToken } from '../lib/encryption.js';
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

const userStore = new Map<string, any>();
const ghCredStore = new Map<string, any>();
const repoStore = new Map<string, any>();
const fileStore = new Map<string, any>();
const symbolStore = new Map<string, any>();
const depStore = new Map<string, any>();
const chunkStore = new Map<string, any>();
const jobStore = new Map<string, any>();
const sessionStore = new Map<string, any>();
const messageStore = new Map<string, any>();

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

supabase.auth.getUser = async (token: string): Promise<any> => {
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
};

// ── Intercept GitHub API via globalThis.fetch ──────────────────────────────────

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: RequestInit): Promise<Response> => {
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
  const { clientMethod, args } = params as {
    clientMethod?: string;
    args: Record<string, any>;
  };

  // ── user ──
  if (clientMethod === 'user.findFirst') {
    const email = args?.where?.email || args?.where?.OR?.find((o: any) => o.email)?.email;
    const id = args?.where?.id || args?.where?.OR?.find((o: any) => o.id)?.id;
    const results = Array.from(userStore.values());
    return results.find((u) => u.id === id || u.email === email) ?? null;
  }
  if (clientMethod === 'user.findUnique') {
    return userStore.get(args?.where?.id) ?? null;
  }
  if (clientMethod === 'user.create') {
    const data = args['data'];
    const id = data.id || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      email: data.email,
      name: data.name || null,
      avatarUrl: data.avatarUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userStore.set(id, record);
    return record;
  }

  // ── userGitHubCredential ──
  if (clientMethod === 'userGitHubCredential.findUnique') {
    return ghCredStore.get(args?.where?.userId) ?? null;
  }
  if (clientMethod === 'userGitHubCredential.upsert') {
    const userId = args.where.userId;
    const record = {
      id: makeUuid(Math.floor(Math.random() * 1000)),
      userId,
      encryptedToken: args.create?.encryptedToken || args.update?.encryptedToken || 'token',
      githubUsername: args.create?.githubUsername || args.update?.githubUsername || 'username',
      githubAvatarUrl: args.create?.githubAvatarUrl || args.update?.githubAvatarUrl || 'avatar',
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
    const userId = args?.where?.userId;
    if (userId) ghCredStore.delete(userId);
    return { count: 1 };
  }

  // ── repository ──
  if (clientMethod === 'repository.findMany') {
    let results = Array.from(repoStore.values());
    if (args?.where?.userId) results = results.filter((r) => r.userId === args.where.userId);
    return results;
  }
  if (clientMethod === 'repository.findUnique' || clientMethod === 'repository.findFirst') {
    if (args?.where?.id) return repoStore.get(args.where.id) ?? null;
    if (args?.where?.githubId) {
      const results = Array.from(repoStore.values());
      return results.find((r) => r.githubId === args.where.githubId) ?? null;
    }
    return null;
  }
  if (clientMethod === 'repository.create') {
    const data = args['data'];
    const id = data.id || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      userId: data.userId,
      githubId: data.githubId,
      name: data.name,
      fullName: data.fullName,
      owner: data.owner,
      private: data.private ?? false,
      defaultBranch: data.defaultBranch || 'main',
      language: data.language || null,
      description: data.description || null,
      stars: data.stars || 0,
      forks: data.forks || 0,
      htmlUrl: data.htmlUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repoStore.set(id, record);
    return record;
  }
  if (clientMethod === 'repository.delete') {
    const id = args?.where?.id;
    const record = repoStore.get(id);
    if (record) repoStore.delete(id);
    return record || null;
  }

  // ── repositoryFile ──
  if (clientMethod === 'repositoryFile.findMany') {
    let results = Array.from(fileStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((f) => f.repositoryId === args.where.repositoryId);
    if (args?.where?.id) results = results.filter((f) => f.id === args.where.id);
    if (args?.take) results = results.slice(0, args.take);
    return results;
  }
  if (clientMethod === 'repositoryFile.findUnique') {
    const results = Array.from(fileStore.values());
    if (args?.where?.repositoryId_path) {
      return (
        results.find(
          (f) =>
            f.repositoryId === args.where.repositoryId_path.repositoryId &&
            f.path === args.where.repositoryId_path.path,
        ) ?? null
      );
    }
    return null;
  }
  if (clientMethod === 'repositoryFile.count') {
    let results = Array.from(fileStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((f) => f.repositoryId === args.where.repositoryId);
    return results.length;
  }
  if (clientMethod === 'repositoryFile.createMany') {
    for (const f of args.data || []) {
      const id = f.id || makeUuid(Math.floor(Math.random() * 10000));
      fileStore.set(id, { ...f, id, createdAt: new Date(), updatedAt: new Date() });
    }
    return { count: args.data?.length || 0 };
  }
  if (clientMethod === 'repositoryFile.deleteMany') {
    if (args?.where?.repositoryId) {
      for (const [id, f] of Array.from(fileStore.entries())) {
        if (f.repositoryId === args.where.repositoryId) fileStore.delete(id);
      }
    }
    return { count: 1 };
  }

  // ── repositorySymbol ──
  if (clientMethod === 'repositorySymbol.findMany') {
    let results = Array.from(symbolStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    if (args?.where?.fileId) results = results.filter((s) => s.fileId === args.where.fileId);
    if (args?.where?.filePath?.contains) {
      const match = args.where.filePath.contains.toLowerCase();
      results = results.filter((s) => s.filePath.toLowerCase().includes(match));
    }
    return results;
  }
  if (clientMethod === 'repositorySymbol.count') {
    let results = Array.from(symbolStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    return results.length;
  }

  // ── fileDependency ──
  if (clientMethod === 'fileDependency.findMany') {
    let results = Array.from(depStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((d) => d.repositoryId === args.where.repositoryId);
    if (args?.where?.targetPath?.contains) {
      const match = args.where.targetPath.contains.toLowerCase();
      results = results.filter((d) => d.targetPath.toLowerCase().includes(match));
    }
    if (args?.where?.sourcePath)
      results = results.filter((d) => d.sourcePath === args.where.sourcePath);
    return results;
  }
  if (clientMethod === 'fileDependency.count') {
    let results = Array.from(depStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((d) => d.repositoryId === args.where.repositoryId);
    return results.length;
  }

  // ── codeChunk ──
  if (clientMethod === 'codeChunk.findMany') {
    let results = Array.from(chunkStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((c) => c.repositoryId === args.where.repositoryId);
    if (args?.where?.fileId) results = results.filter((c) => c.fileId === args.where.fileId);
    return results;
  }
  if (clientMethod === 'codeChunk.count') {
    let results = Array.from(chunkStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((c) => c.repositoryId === args.where.repositoryId);
    return results.length;
  }
  if (clientMethod === 'codeChunk.groupBy') {
    let results = Array.from(chunkStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((c) => c.repositoryId === args.where.repositoryId);
    const uniqueFileIds = Array.from(new Set(results.map((c) => c.fileId)));
    return uniqueFileIds.map((fileId) => ({ fileId }));
  }

  // ── analysisJob ──
  if (clientMethod === 'analysisJob.findMany') {
    let results = Array.from(jobStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((j) => j.repositoryId === args.where.repositoryId);
    return results;
  }
  if (clientMethod === 'analysisJob.findFirst') {
    let results = Array.from(jobStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((j) => j.repositoryId === args.where.repositoryId);
    return results[0] ?? null;
  }
  if (clientMethod === 'analysisJob.create') {
    const data = args['data'];
    const id = data.id || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      repositoryId: data.repositoryId,
      status: data.status || 'pending',
      commitHash: data.commitHash || 'sha-123',
      fileCount: data.fileCount || 0,
      symbolCount: data.symbolCount || 0,
      dependencyCount: data.dependencyCount || 0,
      chunkCount: data.chunkCount || 0,
      errorMessage: data.errorMessage || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobStore.set(id, record);
    return record;
  }
  if (clientMethod === 'analysisJob.update') {
    const id = args?.where?.id;
    const existing = jobStore.get(id);
    if (existing) {
      const updated = { ...existing, ...args.data, updatedAt: new Date() };
      jobStore.set(id, updated);
      return updated;
    }
    return null;
  }

  // ── chatSession ──
  if (clientMethod === 'chatSession.findFirst') {
    let results = Array.from(sessionStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    if (args?.where?.userId) results = results.filter((s) => s.userId === args.where.userId);
    const session = results[0] ?? null;
    if (session && args?.include?.messages) {
      const msgs = Array.from(messageStore.values()).filter((m) => m.sessionId === session.id);
      return { ...session, messages: msgs };
    }
    return session;
  }
  if (clientMethod === 'chatSession.create') {
    const data = args['data'];
    const id = data.id || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      repositoryId: data.repositoryId,
      userId: data.userId,
      title: data.title || 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessionStore.set(id, record);
    return record;
  }
  if (clientMethod === 'chatSession.deleteMany') {
    if (args?.where?.repositoryId) {
      for (const [id, s] of Array.from(sessionStore.entries())) {
        if (s.repositoryId === args.where.repositoryId) sessionStore.delete(id);
      }
    }
    return { count: 1 };
  }

  // ── chatMessage ──
  if (clientMethod === 'chatMessage.findMany') {
    let results = Array.from(messageStore.values());
    if (args?.where?.sessionId)
      results = results.filter((m) => m.sessionId === args.where.sessionId);
    return results;
  }
  if (clientMethod === 'chatMessage.create') {
    const data = args['data'];
    const id = data.id || makeUuid(Math.floor(Math.random() * 1000));
    const record = {
      id,
      sessionId: data.sessionId,
      sender: data.sender,
      text: data.text || data.content,
      content: data.content || data.text,
      metadata: data.metadata || {},
      sources: data.sources || [],
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
    $queryRaw: (query: any, ...args: any[]) => Promise<unknown>;
  }
).$queryRaw = async function (query: any): Promise<unknown> {
  const queryStr = String(query?.strings || query || '');
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

async function apiRequest(
  method: string,
  path: string,
  options: { token?: string; body?: any } = {},
): Promise<{ status: number; body: any }> {
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
  let jsonBody = {};
  try {
    jsonBody = JSON.parse(text);
  } catch {
    jsonBody = { raw: text };
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

  // 15. GET /api/v1/repositories/:id (Single repo lookup)
  {
    const res = await apiRequest('GET', `/api/v1/repositories/${REPO_ID_1}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 15: Status 200');
    assertEqual(res.body.repository.id, REPO_ID_1, 'Test 15: Repo ID matched');
    console.log('  ✅ Test 15: GET /api/v1/repositories/:id returns repository details');
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

  // 17. DELETE /api/v1/repositories/:id (Delete repository)
  {
    const res = await apiRequest('DELETE', `/api/v1/repositories/${REPO_ID_1}`, {
      token: TOKEN_USER_1,
    });
    assertEqual(res.status, 200, 'Test 17: Delete status 200');
    assertEqual(res.body.repository.id, REPO_ID_1, 'Test 17: Deleted repo returned');
    console.log('  ✅ Test 17: DELETE /api/v1/repositories/:id deletes repository');
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

  // 41. Express 404 Fallback
  {
    const res = await apiRequest('GET', '/api/v1/non-existent-endpoint');
    assertEqual(res.status, 404, 'Test 41: Status 404');
    assertEqual(res.body.error.code, 'NOT_FOUND', 'Test 41: NOT_FOUND code');
    console.log('  ✅ Test 41: Unknown route triggers 404 fallback handler');
  }
}

// Execute test suite
runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
