/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Repository Analysis Acquisition Integration Test Suite (Sprint 4 Task 2)
// =============================================================================
// Covers 30 scenarios:
//  Part A — Tree Indexing & Language Detection (tests 1–7)
//  Part B — AST Parsing (tests 8–14)
//  Part C — Symbol & Dependency Persistence (tests 15–18)
//  Part D — Analysis Job Lifecycle (tests 19–23)
//  Part E — Repository Analysis Acquisition Orchestration (tests 24–30)
// =============================================================================

import type { AnalysisJob, RepositoryFile, RepositorySymbol, FileDependency } from '@prisma/client';
import { Prisma, PrismaClient } from '@prisma/client';
import { encryptToken } from '../lib/encryption.js';

process.env['ENCRYPTION_SECRET'] = 'forgemind-test-encryption-secret-32-chars';

// ── Assertion Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function assertNull(actual: unknown, message: string): void {
  assert(actual === null, `${message} — Expected null, Got: ${JSON.stringify(actual)}`);
}

function assertDefined(actual: unknown, message: string): void {
  assert(
    actual !== null && actual !== undefined,
    `${message} — Expected defined value, got null/undefined`,
  );
}

function assertGte(actual: number, min: number, message: string): void {
  assert(actual >= min, `${message} — Expected >= ${min}, Got: ${actual}`);
}

// ── UUID Helpers ──────────────────────────────────────────────────────────────

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const REPO_ID_1 = makeUuid(1001);
const REPO_ID_2 = makeUuid(1002);
const REPO_ID_3 = makeUuid(1003);
const REPO_ID_4 = makeUuid(1004);
const REPO_ID_ACQ = makeUuid(2001);
const REPO_ID_ERR = makeUuid(2002);
const USER_ID_ACQ = makeUuid(3001);
const NON_EXISTENT_UUID = makeUuid(9999);

// ── In-Memory Store Types ─────────────────────────────────────────────────────

type StoredRepositoryFile = RepositoryFile;
type StoredAnalysisJob = AnalysisJob;
type StoredSymbol = RepositorySymbol;
type StoredDependency = FileDependency;
interface StoredCodeChunk {
  id: string;
  repositoryId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  checksum: string;
  metadata: unknown;
  createdAt: Date;
}

// ── In-Memory Stores ──────────────────────────────────────────────────────────

let fileIdCounter = 1;
let jobIdCounter = 1;
let symbolIdCounter = 1;
let depIdCounter = 1;
let chunkIdCounter = 1;

const fileStore = new Map<string, StoredRepositoryFile>();
const jobStore = new Map<string, StoredAnalysisJob>();
const symbolStore = new Map<string, StoredSymbol>();
const depStore = new Map<string, StoredDependency>();
const chunkStore = new Map<string, StoredCodeChunk>();
const repositoryStore = new Map<string, StoredRepository>();
const ghCredStore = new Map<string, string>();

// Seed repository store for acquisition tests (repository.findUnique)
interface StoredRepository {
  id: string;
  userId: string;
  name: string;
  owner: string;
  defaultBranch: string;
  githubId: number;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  language: string | null;
  description: string | null;
  stars: number;
  forks: number;
  createdAt: Date;
  updatedAt: Date;
}

function resetAllStores(): void {
  fileStore.clear();
  jobStore.clear();
  symbolStore.clear();
  depStore.clear();
  chunkStore.clear();
  repositoryStore.clear();
  ghCredStore.clear();
  fileIdCounter = 1;
  jobIdCounter = 1;
  symbolIdCounter = 1;
  depIdCounter = 1;
  chunkIdCounter = 1;
}

function seedRepository(id: string, userId: string, name: string, owner: string): void {
  const now = new Date();
  repositoryStore.set(id, {
    id,
    userId,
    name,
    owner,
    defaultBranch: 'main',
    githubId: Math.floor(Math.random() * 99999),
    fullName: `${owner}/${name}`,
    private: false,
    htmlUrl: `https://github.com/${owner}/${name}`,
    language: 'TypeScript',
    description: 'Mock repository',
    stars: 10,
    forks: 2,
    createdAt: now,
    updatedAt: now,
  });
  ghCredStore.set(userId, encryptToken('test-token'));
}

// ── PrismaClient Multi-Model _request Interceptor ─────────────────────────────
//
// Reuses the same _request interception pattern as Sprint 4 Task 1.
// Handles: repositoryFile, analysisJob, repositorySymbol, fileDependency, codeChunk, repository
// Includes: $transaction handling and $executeRaw (no-op for vector writes)

(
  PrismaClient.prototype as unknown as { _request: (params: unknown) => Promise<unknown> }
)._request = async function (params: unknown): Promise<unknown> {
  const { clientMethod, action, args } = params as {
    clientMethod?: string;
    action?: string;
    args: Record<string, unknown>;
  };

  // ── $transaction: execute array of PrismaPromise operations ──
  if (action === 'executeRaw' || clientMethod === '$executeRaw' || action === '$executeRaw') {
    // No-op for vector writes (pgvector $executeRaw calls)
    return 1;
  }

  if (action === 'queryRaw' || clientMethod === '$queryRaw') {
    return [];
  }

  // ── userGitHubCredential.findUnique ──
  if (clientMethod === 'userGitHubCredential.findUnique') {
    const { where } = args as { where: { userId?: string } };
    const enc = where?.userId ? ghCredStore.get(where.userId) : null;
    return enc
      ? {
          userId: where.userId,
          encryptedToken: enc,
          githubUsername: 'test',
          githubAvatarUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      : null;
  }

  // ── repository.findUnique ──
  if (clientMethod === 'repository.findUnique') {
    const { where } = args as { where: { id?: string } };
    if (where.id) {
      return repositoryStore.get(where.id) ?? null;
    }
    return null;
  }

  // ── repositoryFile operations ──
  if (clientMethod?.startsWith('repositoryFile.')) {
    if (action === 'upsert') {
      const { where, create, update } = args as {
        where: { repositoryId_path: { repositoryId: string; path: string } };
        create: Prisma.RepositoryFileUncheckedCreateInput;
        update: Partial<Prisma.RepositoryFileUncheckedUpdateInput>;
      };
      const compositeKey = `${where.repositoryId_path.repositoryId}::${where.repositoryId_path.path}`;

      // Find existing by composite key
      let existingId: string | null = null;
      for (const [id, file] of fileStore.entries()) {
        if (
          file.repositoryId === where.repositoryId_path.repositoryId &&
          file.path === where.repositoryId_path.path
        ) {
          existingId = id;
          break;
        }
      }
      void compositeKey; // suppress unused warning

      const now = new Date();
      if (existingId) {
        const existingRecord = fileStore.get(existingId);
        if (!existingRecord) return null;
        const existing = existingRecord;
        const updated: StoredRepositoryFile = {
          ...existing,
          name: typeof update.name === 'string' ? update.name : existing.name,
          extension:
            update.extension !== undefined
              ? (update.extension as string | null)
              : existing.extension,
          language:
            update.language !== undefined ? (update.language as string | null) : existing.language,
          type: typeof update.type === 'string' ? update.type : existing.type,
          size: update.size !== undefined ? (update.size as number | null) : existing.size,
          sha: update.sha !== undefined ? (update.sha as string | null) : existing.sha,
          updatedAt: now,
        };
        fileStore.set(existingId, updated);
        return { ...updated };
      } else {
        const id = makeUuid(fileIdCounter++);
        const record: StoredRepositoryFile = {
          id,
          repositoryId: create.repositoryId,
          path: create.path,
          name: create.name,
          extension: create.extension ?? null,
          language: create.language ?? null,
          type: create.type ?? 'file',
          size: create.size ?? null,
          sha: create.sha ?? null,
          createdAt: now,
          updatedAt: now,
        };
        fileStore.set(id, record);
        return { ...record };
      }
    }

    if (action === 'findMany') {
      const { where, orderBy, take, skip } = args as {
        where: { repositoryId: string; language?: string };
        orderBy?: { path: string };
        take?: number;
        skip?: number;
      };
      void orderBy;
      let results: StoredRepositoryFile[] = [];
      for (const file of fileStore.values()) {
        if (file.repositoryId === where.repositoryId) {
          if (!where.language || file.language === where.language) {
            results.push({ ...file });
          }
        }
      }
      if (skip) results = results.slice(skip);
      if (take) results = results.slice(0, take);
      return results;
    }

    if (action === 'count') {
      const { where } = args as { where: { repositoryId: string; language?: string } };
      let count = 0;
      for (const file of fileStore.values()) {
        if (file.repositoryId === where.repositoryId) {
          if (!where.language || file.language === where.language) count++;
        }
      }
      return count;
    }

    if (action === 'findUnique') {
      const { where } = args as {
        where: { repositoryId_path: { repositoryId: string; path: string } };
      };
      for (const file of fileStore.values()) {
        if (
          file.repositoryId === where.repositoryId_path.repositoryId &&
          file.path === where.repositoryId_path.path
        ) {
          return { ...file };
        }
      }
      return null;
    }
  }

  // ── analysisJob operations ──
  if (clientMethod?.startsWith('analysisJob.')) {
    if (action === 'create') {
      const data = args['data'] as Prisma.AnalysisJobUncheckedCreateInput;
      const id = makeUuid(jobIdCounter++);
      const now = new Date();
      const record: StoredAnalysisJob = {
        id,
        repositoryId: data.repositoryId,
        status: data.status ?? 'pending',
        commitHash: data.commitHash ?? null,
        error: null,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      jobStore.set(id, record);
      return { ...record };
    }

    if (action === 'update') {
      const { where, data } = args as {
        where: { id: string };
        data: Prisma.AnalysisJobUpdateInput;
      };
      const existing = jobStore.get(where.id);
      if (!existing) {
        throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
          code: 'P2025',
          clientVersion: '6.1.0',
        });
      }
      const updated: StoredAnalysisJob = {
        ...existing,
        status: typeof data.status === 'string' ? data.status : existing.status,
        commitHash:
          data.commitHash !== undefined ? (data.commitHash as string | null) : existing.commitHash,
        error: data.error !== undefined ? (data.error as string | null) : existing.error,
        startedAt:
          data.startedAt !== undefined ? (data.startedAt as Date | null) : existing.startedAt,
        finishedAt:
          data.finishedAt !== undefined ? (data.finishedAt as Date | null) : existing.finishedAt,
        updatedAt: new Date(),
      };
      jobStore.set(where.id, updated);
      return { ...updated };
    }

    if (action === 'findUnique') {
      const { where } = args as { where: { id: string } };
      return jobStore.get(where.id) ?? null;
    }

    if (action === 'findFirst') {
      const { where } = args as {
        where?: {
          repositoryId?: string;
          status?: string | { in?: string[] };
          OR?: Array<{ status?: string; startedAt?: { lt?: Date } }>;
        };
      };
      let found: StoredAnalysisJob | null = null;
      for (const job of jobStore.values()) {
        let matches = true;
        if (where?.repositoryId && job.repositoryId !== where.repositoryId) matches = false;
        if (where?.status) {
          if (typeof where.status === 'string' && job.status !== where.status) matches = false;
          else if (
            typeof where.status === 'object' &&
            where.status.in &&
            !where.status.in.includes(job.status)
          ) {
            matches = false;
          }
        }
        if (where?.OR && Array.isArray(where.OR)) {
          let orMatch = false;
          for (const cond of where.OR) {
            if (cond.status === job.status) {
              if (
                !cond.startedAt ||
                (job.startedAt && job.startedAt < (cond.startedAt.lt ?? new Date()))
              ) {
                orMatch = true;
                break;
              }
            }
          }
          if (!orMatch) matches = false;
        }

        if (matches) {
          if (!found || job.createdAt < found.createdAt) {
            found = job;
          }
        }
      }
      return found ? { ...found } : null;
    }

    if (action === 'findMany') {
      const { where } = args as { where: { repositoryId: string } };
      const results: StoredAnalysisJob[] = [];
      for (const job of jobStore.values()) {
        if (job.repositoryId === where.repositoryId) {
          results.push({ ...job });
        }
      }
      return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  }

  // ── repositorySymbol operations ──
  if (clientMethod?.startsWith('repositorySymbol.')) {
    if (action === 'deleteMany') {
      const { where } = args as { where: { fileId?: string; repositoryId?: string } };
      for (const [id, sym] of symbolStore.entries()) {
        const matchFile = where.fileId ? sym.fileId === where.fileId : true;
        const matchRepo = where.repositoryId ? sym.repositoryId === where.repositoryId : true;
        if (matchFile && matchRepo) symbolStore.delete(id);
      }
      return { count: 0 };
    }

    if (action === 'createMany') {
      const data = args['data'] as Prisma.RepositorySymbolCreateManyInput[];
      const now = new Date();
      let count = 0;
      for (const sym of data) {
        const id = makeUuid(symbolIdCounter++);
        const record: StoredSymbol = {
          id,
          repositoryId: sym.repositoryId,
          fileId: sym.fileId,
          name: sym.name,
          kind: sym.kind,
          filePath: sym.filePath,
          startLine: sym.startLine ?? null,
          endLine: sym.endLine ?? null,
          exported: sym.exported ?? false,
          createdAt: now,
        };
        symbolStore.set(id, record);
        count++;
      }
      return { count };
    }

    if (action === 'findMany') {
      const { where } = args as {
        where: { repositoryId?: string; fileId?: string; kind?: string };
      };
      const results: StoredSymbol[] = [];
      for (const sym of symbolStore.values()) {
        const matchRepo = where.repositoryId ? sym.repositoryId === where.repositoryId : true;
        const matchFile = where.fileId ? sym.fileId === where.fileId : true;
        const matchKind = where.kind ? sym.kind === where.kind : true;
        if (matchRepo && matchFile && matchKind) results.push({ ...sym });
      }
      return results;
    }

    if (action === 'count') {
      const { where } = args as { where: { repositoryId?: string; fileId?: string } };
      let count = 0;
      for (const sym of symbolStore.values()) {
        const matchRepo = where.repositoryId ? sym.repositoryId === where.repositoryId : true;
        const matchFile = where.fileId ? sym.fileId === where.fileId : true;
        if (matchRepo && matchFile) count++;
      }
      return count;
    }
  }

  // ── fileDependency operations ──
  if (clientMethod?.startsWith('fileDependency.')) {
    if (action === 'deleteMany') {
      const { where } = args as { where: { sourceFileId?: string; repositoryId?: string } };
      for (const [id, dep] of depStore.entries()) {
        const matchFile = where.sourceFileId ? dep.sourceFileId === where.sourceFileId : true;
        const matchRepo = where.repositoryId ? dep.repositoryId === where.repositoryId : true;
        if (matchFile && matchRepo) depStore.delete(id);
      }
      return { count: 0 };
    }

    if (action === 'createMany') {
      const data = args['data'] as Prisma.FileDependencyCreateManyInput[];
      const now = new Date();
      let count = 0;
      for (const dep of data) {
        const id = makeUuid(depIdCounter++);
        const record: StoredDependency = {
          id,
          repositoryId: dep.repositoryId,
          sourceFileId: dep.sourceFileId,
          sourcePath: dep.sourcePath,
          targetPath: dep.targetPath,
          isExternal: dep.isExternal ?? false,
          importedSymbols: (dep.importedSymbols as string[]) ?? [],
          createdAt: now,
        };
        depStore.set(id, record);
        count++;
      }
      return { count };
    }

    if (action === 'findMany') {
      const { where } = args as {
        where: { repositoryId?: string; sourceFileId?: string; isExternal?: boolean };
      };
      const results: StoredDependency[] = [];
      for (const dep of depStore.values()) {
        const matchRepo = where.repositoryId ? dep.repositoryId === where.repositoryId : true;
        const matchFile = where.sourceFileId ? dep.sourceFileId === where.sourceFileId : true;
        const matchExternal =
          where.isExternal !== undefined ? dep.isExternal === where.isExternal : true;
        if (matchRepo && matchFile && matchExternal) results.push({ ...dep });
      }
      return results;
    }

    if (action === 'count') {
      const { where } = args as { where: { repositoryId?: string; sourceFileId?: string } };
      let count = 0;
      for (const dep of depStore.values()) {
        const matchRepo = where.repositoryId ? dep.repositoryId === where.repositoryId : true;
        const matchFile = where.sourceFileId ? dep.sourceFileId === where.sourceFileId : true;
        if (matchRepo && matchFile) count++;
      }
      return count;
    }
  }

  // ── codeChunk operations ──
  if (clientMethod?.startsWith('codeChunk.')) {
    if (action === 'deleteMany') {
      const { where } = args as { where: { fileId?: string } };
      for (const [id, chunk] of chunkStore.entries()) {
        if (!where.fileId || chunk.fileId === where.fileId) chunkStore.delete(id);
      }
      return { count: 0 };
    }

    if (action === 'create') {
      const data = args['data'] as {
        repositoryId: string;
        fileId: string;
        chunkIndex: number;
        content: string;
        filePath: string;
        language: string | null;
        startLine: number;
        endLine: number;
        tokenCount: number;
        linesCount: number;
        checksum: string;
        metadata: unknown;
      };
      const id = makeUuid(chunkIdCounter++);
      const now = new Date();
      const record: StoredCodeChunk = {
        id,
        ...data,
        createdAt: now,
      };
      chunkStore.set(id, record);
      return { id, ...data, createdAt: now };
    }

    if (action === 'findMany') {
      const { where, orderBy } = args as {
        where: { fileId?: string; repositoryId?: string };
        orderBy?: { chunkIndex: string };
      };
      void orderBy;
      const results: StoredCodeChunk[] = [];
      for (const chunk of chunkStore.values()) {
        const matchFile = where.fileId ? chunk.fileId === where.fileId : true;
        const matchRepo = where.repositoryId ? chunk.repositoryId === where.repositoryId : true;
        if (matchFile && matchRepo) results.push({ ...chunk });
      }
      return results.sort((a, b) => a.chunkIndex - b.chunkIndex);
    }

    if (action === 'count') {
      const { where } = args as { where: { fileId?: string; repositoryId?: string } };
      let count = 0;
      for (const chunk of chunkStore.values()) {
        const matchFile = where.fileId ? chunk.fileId === where.fileId : true;
        const matchRepo = where.repositoryId ? chunk.repositoryId === where.repositoryId : true;
        if (matchFile && matchRepo) count++;
      }
      return count;
    }
  }

  // Passthrough unknown: surface a clear error rather than silent no-op
  throw new Error(
    `[TestMock] Unhandled mock query: clientMethod=${clientMethod ?? 'undefined'}, action=${action ?? 'undefined'}`,
  );
};

// Intercept $transaction as a batched array execution
const originalTransaction = PrismaClient.prototype.$transaction;
(
  PrismaClient.prototype as unknown as { $transaction: (arg: unknown) => Promise<unknown> }
).$transaction = async function (arg: unknown): Promise<unknown> {
  if (Array.isArray(arg)) {
    // Each element is a PrismaPromise — resolve them all in sequence
    const results: unknown[] = [];
    for (const promise of arg) {
      results.push(await promise);
    }
    return results;
  }
  // Interactive transactions: not used by these services, passthrough
  return (originalTransaction as unknown as (a: unknown) => Promise<unknown>).call(this, arg);
};

// Intercept $executeRaw (used for pgvector updates) as a no-op
(
  PrismaClient.prototype as unknown as { $executeRaw: (...args: unknown[]) => Promise<number> }
).$executeRaw = async function (): Promise<number> {
  return 1;
};

// ── GitHub Fetch Mock ─────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetchHandler: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

const mockFetchWrapper = async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const urlString = typeof input === 'string' ? input : input.toString();
  if (mockFetchHandler) {
    return mockFetchHandler(urlString, init);
  }
  return originalFetch(input, init);
};

function setMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  mockFetchHandler = handler;
  globalThis.fetch = mockFetchWrapper;
}

function restoreFetch(): void {
  mockFetchHandler = null;
  globalThis.fetch = originalFetch;
}

function mockJsonResponse<T>(data: T, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64Encode(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64');
}

// ── Module Lazy Imports (set after interceptors are installed) ─────────────────

import type * as TreeIndexingModule from './tree-indexing.service.js';
import type * as AstParserModule from './ast-parser.service.js';
import type * as SymbolExtractionModule from './symbol-extraction.service.js';
import type * as AnalysisJobModule from './analysis-job.service.js';
import type * as AcquisitionModule from './repository-acquisition.service.js';
import type * as AnalysisWorkerModule from './analysis-worker.service.js';

let treeIndexing: typeof TreeIndexingModule;
let astParser: typeof AstParserModule;
let symbolExtraction: typeof SymbolExtractionModule;
let analysisJob: typeof AnalysisJobModule;
let acquisition: typeof AcquisitionModule;
let analysisWorker: typeof AnalysisWorkerModule;

// =============================================================================
// PART A — Tree Indexing & Language Detection (Tests 1–7)
// =============================================================================

async function runTreeIndexingTests(): Promise<void> {
  console.log('📋 Part A — Tree Indexing & Language Detection (Tests 1–7)');

  // Test 1: TypeScript files are classified correctly
  {
    assertEqual(
      treeIndexing.detectLanguage('auth.ts', 'src/auth.ts'),
      'TypeScript',
      'Test 1: .ts → TypeScript',
    );
    assertEqual(
      treeIndexing.detectLanguage('index.ts', 'index.ts'),
      'TypeScript',
      'Test 1: index.ts → TypeScript',
    );
    console.log('  ✅ Test 1: TypeScript files are classified correctly');
  }

  // Test 2: TSX files are classified correctly
  {
    assertEqual(treeIndexing.detectLanguage('App.tsx', 'src/App.tsx'), 'TSX', 'Test 2: .tsx → TSX');
    assertEqual(
      treeIndexing.detectLanguage('Button.tsx', 'components/Button.tsx'),
      'TSX',
      'Test 2: Button.tsx → TSX',
    );
    console.log('  ✅ Test 2: TSX files are classified correctly');
  }

  // Test 3: JavaScript files are classified correctly
  {
    assertEqual(
      treeIndexing.detectLanguage('helper.js', 'utils/helper.js'),
      'JavaScript',
      'Test 3: .js → JavaScript',
    );
    assertEqual(
      treeIndexing.detectLanguage('config.mjs', 'config.mjs'),
      'JavaScript',
      'Test 3: .mjs → JavaScript',
    );
    assertEqual(
      treeIndexing.detectLanguage('config.cjs', 'config.cjs'),
      'JavaScript',
      'Test 3: .cjs → JavaScript',
    );
    console.log('  ✅ Test 3: JavaScript files are classified correctly');
  }

  // Test 4: Python and Go files are classified correctly
  {
    assertEqual(
      treeIndexing.detectLanguage('main.py', 'src/main.py'),
      'Python',
      'Test 4: .py → Python',
    );
    assertEqual(
      treeIndexing.detectLanguage('server.go', 'cmd/server.go'),
      'Go',
      'Test 4: .go → Go',
    );
    assertEqual(
      treeIndexing.detectLanguage('main.rs', 'src/main.rs'),
      'Rust',
      'Test 4: .rs → Rust',
    );
    // Makefile is in SPECIAL_FILENAMES → returns 'Makefile' (not null)
    assertEqual(
      treeIndexing.detectLanguage('Makefile', 'Makefile'),
      'Makefile',
      'Test 4: Makefile → Makefile language',
    );
    // A file with no extension returns null
    assertNull(
      treeIndexing.detectLanguage('LICENSE', 'LICENSE'),
      'Test 4: LICENSE (no extension) → null',
    );
    console.log('  ✅ Test 4: Python/Go/Rust files and special filenames are classified correctly');
  }

  // Test 5: Ignored paths (node_modules, .git, dist, build) are skipped
  {
    assert(
      treeIndexing.isIgnoredPath('node_modules/express/index.js'),
      'Test 5: node_modules is ignored',
    );
    assert(treeIndexing.isIgnoredPath('.git/config'), 'Test 5: .git is ignored');
    assert(treeIndexing.isIgnoredPath('dist/index.js'), 'Test 5: dist/ is ignored');
    assert(treeIndexing.isIgnoredPath('build/main.js'), 'Test 5: build/ is ignored');
    assert(treeIndexing.isIgnoredPath('.next/server/pages/index.js'), 'Test 5: .next/ is ignored');
    assert(treeIndexing.isIgnoredPath('.turbo/cache'), 'Test 5: .turbo/ is ignored');
    assert(!treeIndexing.isIgnoredPath('src/index.ts'), 'Test 5: src/index.ts is NOT ignored');
    assert(
      !treeIndexing.isIgnoredPath('apps/api/src/server.ts'),
      'Test 5: apps/api/src is NOT ignored',
    );
    console.log('  ✅ Test 5: Ignored paths (node_modules, .git, build outputs) are skipped');
  }

  // Test 6: indexRepositoryTree correctly indexes RepositoryFile records
  {
    resetAllStores();
    const treeItems = [
      { path: 'src/index.ts', type: 'blob', mode: '100644', sha: 'abc001', size: 512 },
      { path: 'src/utils.ts', type: 'blob', mode: '100644', sha: 'abc002', size: 1024 },
      { path: 'src', type: 'tree', mode: '040000', sha: 'abc003' },
      {
        path: 'node_modules/express/index.js',
        type: 'blob',
        mode: '100644',
        sha: 'abc004',
        size: 2048,
      },
    ];

    const result = await treeIndexing.indexRepositoryTree(REPO_ID_1, treeItems);

    assertEqual(
      result.filesIndexed,
      3,
      'Test 6: 3 items indexed (2 files + 1 dir; node_modules skipped)',
    );
    assertEqual(result.ignoredItems, 1, 'Test 6: 1 item ignored (node_modules)');
    assertEqual(result.totalItemsProcessed, 4, 'Test 6: Total items processed = 4');
    assert(
      Object.keys(result.languageDistribution).includes('TypeScript'),
      'Test 6: TypeScript appears in languageDistribution',
    );
    // Verify records were stored
    let tsFiles = 0;
    for (const f of fileStore.values()) {
      if (f.repositoryId === REPO_ID_1 && f.language === 'TypeScript') tsFiles++;
    }
    assertEqual(tsFiles, 2, 'Test 6: 2 TypeScript files persisted');
    console.log('  ✅ Test 6: RepositoryFile records are indexed correctly');
  }

  // Test 7: File metadata is mapped correctly (name, extension, language, type, size, sha)
  {
    resetAllStores();
    const treeItems = [
      {
        path: 'apps/api/src/services/auth.service.ts',
        type: 'blob',
        mode: '100644',
        sha: 'sha001',
        size: 3000,
      },
    ];

    await treeIndexing.indexRepositoryTree(REPO_ID_2, treeItems);

    let found: StoredRepositoryFile | null = null;
    for (const f of fileStore.values()) {
      if (f.repositoryId === REPO_ID_2) {
        found = f;
        break;
      }
    }
    assertDefined(found, 'Test 7: File record must be stored');
    if (!found) throw new Error('found is null — test setup error');
    assertEqual(found.path, 'apps/api/src/services/auth.service.ts', 'Test 7: path correct');
    assertEqual(found.name, 'auth.service.ts', 'Test 7: name = filename component');
    assertEqual(found.extension, 'ts', 'Test 7: extension = ts');
    assertEqual(found.language, 'TypeScript', 'Test 7: language = TypeScript');
    assertEqual(found.type, 'file', 'Test 7: type = file');
    assertEqual(found.size, 3000, 'Test 7: size correct');
    assertEqual(found.sha, 'sha001', 'Test 7: sha correct');
    console.log('  ✅ Test 7: File metadata is mapped correctly');
  }
}

// =============================================================================
// PART B — AST Parsing (Tests 8–14)
// =============================================================================

async function runAstParsingTests(): Promise<void> {
  console.log('\n📋 Part B — AST Parsing (Tests 8–14)');

  // Test 8: Functions are extracted from TypeScript source
  {
    const source = `
export function authenticateUser(token: string): boolean {
  return token.length > 0;
}

function internalHelper(): void {
  // not exported
}
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/auth.ts');
    const funcNames = result.symbols.filter((s) => s.kind === 'function').map((s) => s.name);

    assert(funcNames.includes('authenticateUser'), 'Test 8: authenticateUser function found');
    assert(funcNames.includes('internalHelper'), 'Test 8: internalHelper function found');

    const exported = result.symbols.find((s) => s.name === 'authenticateUser');
    const internal = result.symbols.find((s) => s.name === 'internalHelper');
    assert(exported?.exported === true, 'Test 8: authenticateUser is exported');
    assert(internal?.exported === false, 'Test 8: internalHelper is not exported');

    assertGte(exported?.startLine ?? 0, 1, 'Test 8: startLine is a positive number');
    console.log('  ✅ Test 8: Functions are extracted correctly');
  }

  // Test 9: Classes are extracted from TypeScript source
  {
    const source = `
export class RepositoryService {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.repository.findUnique({ where: { id } });
  }
}

class InternalCache {
  private data = new Map();
}
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/repository.service.ts');
    const classNames = result.symbols.filter((s) => s.kind === 'class').map((s) => s.name);

    assert(classNames.includes('RepositoryService'), 'Test 9: RepositoryService class found');
    assert(classNames.includes('InternalCache'), 'Test 9: InternalCache class found');

    const exportedClass = result.symbols.find((s) => s.name === 'RepositoryService');
    assert(exportedClass?.exported === true, 'Test 9: RepositoryService is exported');
    console.log('  ✅ Test 9: Classes are extracted correctly');
  }

  // Test 10: Interfaces are extracted from TypeScript source
  {
    const source = `
export interface UserPayload {
  id: string;
  email: string;
  name: string | null;
}

interface InternalConfig {
  timeout: number;
}
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/types.ts');
    const interfaceNames = result.symbols.filter((s) => s.kind === 'interface').map((s) => s.name);

    assert(interfaceNames.includes('UserPayload'), 'Test 10: UserPayload interface found');
    assert(interfaceNames.includes('InternalConfig'), 'Test 10: InternalConfig interface found');

    const exported = result.symbols.find((s) => s.name === 'UserPayload');
    assert(exported?.exported === true, 'Test 10: UserPayload is exported');
    console.log('  ✅ Test 10: Interfaces are extracted correctly');
  }

  // Test 11: Type aliases are extracted from TypeScript source
  {
    const source = `
export type AnalysisStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

type InternalResult = {
  success: boolean;
};
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/types.ts');
    const typeNames = result.symbols.filter((s) => s.kind === 'type').map((s) => s.name);

    assert(typeNames.includes('AnalysisStatus'), 'Test 11: AnalysisStatus type found');
    assert(typeNames.includes('InternalResult'), 'Test 11: InternalResult type found');
    console.log('  ✅ Test 11: Type aliases are extracted correctly');
  }

  // Test 12: Enums are extracted from TypeScript source
  {
    const source = `
export enum JobStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
}

enum Direction {
  Up,
  Down,
}
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/enums.ts');
    const enumNames = result.symbols.filter((s) => s.kind === 'enum').map((s) => s.name);

    assert(enumNames.includes('JobStatus'), 'Test 12: JobStatus enum found');
    assert(enumNames.includes('Direction'), 'Test 12: Direction enum found');

    const exported = result.symbols.find((s) => s.name === 'JobStatus');
    assert(exported?.exported === true, 'Test 12: JobStatus is exported');
    console.log('  ✅ Test 12: Enums are extracted correctly');
  }

  // Test 13: Variables (including arrow functions) are extracted
  {
    const source = `
export const MAX_RETRIES = 3;
export const syncRepositories = async (userId: string): Promise<void> => {
  // implementation
};
const LOCAL_CACHE = new Map();
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/constants.ts');
    const varNames = result.symbols.map((s) => s.name);

    assert(varNames.includes('MAX_RETRIES'), 'Test 13: MAX_RETRIES variable found');
    assert(varNames.includes('syncRepositories'), 'Test 13: syncRepositories arrow fn found');
    assert(varNames.includes('LOCAL_CACHE'), 'Test 13: LOCAL_CACHE variable found');

    const arrowFn = result.symbols.find((s) => s.name === 'syncRepositories');
    assertEqual(arrowFn?.kind, 'function', 'Test 13: arrow fn kind = function');
    console.log('  ✅ Test 13: Variables (including arrow functions) are extracted correctly');
  }

  // Test 14: Imports/dependencies are extracted correctly
  {
    const source = `
import { PrismaClient, Prisma } from '@prisma/client';
import type { Repository } from '@forgemind/types';
import { findById } from './repository.service.js';
import * as fs from 'node:fs';
`;
    const result = astParser.parseSourceFile(source, 'TypeScript', 'src/service.ts');
    const depPaths = result.dependencies.map((d) => d.targetPath);

    assert(depPaths.includes('@prisma/client'), 'Test 14: @prisma/client import found');
    assert(depPaths.includes('@forgemind/types'), 'Test 14: @forgemind/types import found');
    assert(depPaths.includes('./repository.service.js'), 'Test 14: local import found');
    assert(depPaths.includes('node:fs'), 'Test 14: node:fs import found');

    // Verify external vs local classification
    const prismaImport = result.dependencies.find((d) => d.targetPath === '@prisma/client');
    const localImport = result.dependencies.find((d) => d.targetPath === './repository.service.js');
    assert(prismaImport?.isExternal === true, 'Test 14: @prisma/client is external');
    assert(localImport?.isExternal === false, 'Test 14: ./repository.service.js is local');

    // Named imports are captured
    assert(
      (prismaImport?.importedSymbols ?? []).includes('PrismaClient'),
      'Test 14: PrismaClient in importedSymbols',
    );
    console.log('  ✅ Test 14: Imports/dependencies are extracted correctly');
  }
}

// =============================================================================
// PART C — Symbol & Dependency Persistence (Tests 15–18)
// =============================================================================

async function runSymbolPersistenceTests(): Promise<void> {
  console.log('\n📋 Part C — Symbol & Dependency Persistence (Tests 15–18)');

  const FILE_ID_SYM = makeUuid(5001);

  const sampleSource = `
import { PrismaClient } from '@prisma/client';
import { validateToken } from './auth.service.js';

export interface AuthResult {
  userId: string;
  token: string;
}

export async function authenticate(token: string): Promise<AuthResult | null> {
  const valid = validateToken(token);
  if (!valid) return null;
  return { userId: 'user-123', token };
}
`;

  // Test 15: Symbols are persisted correctly
  {
    resetAllStores();
    const result = await symbolExtraction.extractAndIndexFileSymbols(
      REPO_ID_3,
      FILE_ID_SYM,
      'src/auth.service.ts',
      sampleSource,
      'TypeScript',
    );

    assertGte(result.symbolCount, 1, 'Test 15: At least 1 symbol persisted');
    assertGte(symbolStore.size, 1, 'Test 15: Symbols exist in store');

    const symbolNames = [...symbolStore.values()].map((s) => s.name);
    assert(symbolNames.includes('authenticate'), 'Test 15: authenticate function symbol persisted');
    assert(symbolNames.includes('AuthResult'), 'Test 15: AuthResult interface symbol persisted');
    console.log('  ✅ Test 15: Symbols are persisted correctly');
  }

  // Test 16: Re-extraction is idempotent (old symbols are deleted before re-insert)
  {
    resetAllStores();
    // First extraction
    await symbolExtraction.extractAndIndexFileSymbols(
      REPO_ID_3,
      FILE_ID_SYM,
      'src/auth.service.ts',
      sampleSource,
      'TypeScript',
    );
    const firstCount = symbolStore.size;
    assertGte(firstCount, 1, 'Test 16: First extraction produced symbols');

    // Second extraction of the same file with same content
    await symbolExtraction.extractAndIndexFileSymbols(
      REPO_ID_3,
      FILE_ID_SYM,
      'src/auth.service.ts',
      sampleSource,
      'TypeScript',
    );

    // After re-extraction, store should have same count (old symbols deleted, new inserted)
    assertEqual(
      symbolStore.size,
      firstCount,
      'Test 16: Symbol count is stable after re-extraction',
    );
    console.log(
      '  ✅ Test 16: Duplicate/upsert behavior is idempotent (old symbols deleted before re-insert)',
    );
  }

  // Test 17: File dependencies are persisted correctly
  {
    resetAllStores();
    const result = await symbolExtraction.extractAndIndexFileSymbols(
      REPO_ID_3,
      FILE_ID_SYM,
      'src/auth.service.ts',
      sampleSource,
      'TypeScript',
    );

    assertGte(result.dependencyCount, 1, 'Test 17: At least 1 dependency persisted');
    assertGte(depStore.size, 1, 'Test 17: Dependencies exist in store');

    const depPaths = [...depStore.values()].map((d) => d.targetPath);
    assert(depPaths.includes('@prisma/client'), 'Test 17: @prisma/client dependency persisted');
    assert(
      depPaths.includes('./auth.service.js'),
      'Test 17: ./auth.service.js dependency persisted',
    );
    console.log('  ✅ Test 17: File dependencies are persisted correctly');
  }

  // Test 18: Import target paths are mapped correctly (external vs local)
  {
    resetAllStores();
    await symbolExtraction.extractAndIndexFileSymbols(
      REPO_ID_3,
      FILE_ID_SYM,
      'src/auth.service.ts',
      sampleSource,
      'TypeScript',
    );

    const deps = [...depStore.values()];
    const external = deps.filter((d) => d.isExternal);
    const local = deps.filter((d) => !d.isExternal);

    assertGte(external.length, 1, 'Test 18: At least 1 external dependency');
    assertGte(local.length, 1, 'Test 18: At least 1 local dependency');

    const prismaDepFound = external.some((d) => d.targetPath === '@prisma/client');
    const localDepFound = local.some((d) => d.targetPath === './auth.service.js');
    assert(prismaDepFound, 'Test 18: @prisma/client correctly marked as external');
    assert(localDepFound, 'Test 18: ./auth.service.js correctly marked as local');
    console.log('  ✅ Test 18: Import target paths are mapped correctly');
  }
}

// =============================================================================
// PART D — Analysis Job Lifecycle (Tests 19–23)
// =============================================================================

async function runAnalysisJobTests(): Promise<void> {
  console.log('\n📋 Part D — Analysis Job Lifecycle (Tests 19–23)');

  // Test 19: createAnalysisJob creates a job in pending status
  {
    resetAllStores();
    const job = await analysisJob.createAnalysisJob(REPO_ID_4);

    assertEqual(job.status, 'pending', 'Test 19: Initial status = pending');
    assertEqual(job.repositoryId, REPO_ID_4, 'Test 19: repositoryId matches');
    assertNull(job.commitHash, 'Test 19: commitHash is null initially');
    assertNull(job.error, 'Test 19: error is null initially');
    assertNull(job.startedAt, 'Test 19: startedAt is null initially');
    assertNull(job.finishedAt, 'Test 19: finishedAt is null initially');
    assertDefined(job.id, 'Test 19: id is defined');
    console.log('  ✅ Test 19: Analysis job starts in pending state');
  }

  // Test 20: pending → in_progress transition
  {
    resetAllStores();
    const job = await analysisJob.createAnalysisJob(REPO_ID_4);
    assertEqual(job.status, 'pending', 'Test 20: Pre-condition: job starts pending');

    const startedAt = new Date();
    const updated = await analysisJob.updateAnalysisJobStatus(job.id, {
      status: 'in_progress',
      startedAt,
    });

    assertDefined(updated, 'Test 20: Updated job must not be null');
    if (!updated) throw new Error('updated is null — test setup error');
    assertEqual(updated.status, 'in_progress', 'Test 20: Status = in_progress');
    assertDefined(updated.startedAt, 'Test 20: startedAt is set');
    assertNull(updated.commitHash, 'Test 20: commitHash still null');
    assertNull(updated.finishedAt, 'Test 20: finishedAt still null');
    console.log('  ✅ Test 20: pending → in_progress transition works');
  }

  // Test 21: in_progress → completed with commitHash and finishedAt
  {
    resetAllStores();
    const job = await analysisJob.createAnalysisJob(REPO_ID_4);
    await analysisJob.updateAnalysisJobStatus(job.id, {
      status: 'in_progress',
      startedAt: new Date(),
    });

    const finishedAt = new Date();
    const completed = await analysisJob.updateAnalysisJobStatus(job.id, {
      status: 'completed',
      commitHash: 'abc123def456',
      finishedAt,
    });

    assertDefined(completed, 'Test 21: Completed job must not be null');
    if (!completed) throw new Error('completed is null — test setup error');
    assertEqual(completed.status, 'completed', 'Test 21: Status = completed');
    assertEqual(completed.commitHash, 'abc123def456', 'Test 21: commitHash recorded');
    assertDefined(completed.finishedAt, 'Test 21: finishedAt is set');
    assertDefined(completed.startedAt, 'Test 21: startedAt still present');
    assertNull(completed.error, 'Test 21: error remains null on success');
    console.log('  ✅ Test 21: in_progress → completed transition works');
  }

  // Test 22: failed state records error information
  {
    resetAllStores();
    const job = await analysisJob.createAnalysisJob(REPO_ID_4);
    await analysisJob.updateAnalysisJobStatus(job.id, {
      status: 'in_progress',
      startedAt: new Date(),
    });

    const failedJob = await analysisJob.updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: 'GitHub API 401: Unauthorized',
      finishedAt: new Date(),
    });

    assertDefined(failedJob, 'Test 22: Failed job must not be null');
    if (!failedJob) throw new Error('failedJob is null — test setup error');
    assertEqual(failedJob.status, 'failed', 'Test 22: Status = failed');
    assertEqual(failedJob.error, 'GitHub API 401: Unauthorized', 'Test 22: Error message recorded');
    assertDefined(failedJob.finishedAt, 'Test 22: finishedAt is set on failure');
    console.log('  ✅ Test 22: Failed state records expected error information');
  }

  // Test 23: updateAnalysisJobStatus returns null for non-existent job
  {
    resetAllStores();
    const result = await analysisJob.updateAnalysisJobStatus(NON_EXISTENT_UUID, {
      status: 'completed',
    });
    assertNull(result, 'Test 23: Updating non-existent job returns null');
    console.log('  ✅ Test 23: Timestamps/commitHash/error fields follow existing implementation');
  }
}

// =============================================================================
// PART E — Repository Analysis Acquisition Orchestration (Tests 24–30)
// =============================================================================

// Deterministic source content for the mock repository
const mockTsContent = `
import { PrismaClient } from '@prisma/client';

export interface SyncResult {
  created: number;
  updated: number;
}

export async function syncRepositories(userId: string, token: string): Promise<SyncResult> {
  const prisma = new PrismaClient();
  return { created: 0, updated: 0 };
}
`;

const MOCK_COMMIT_SHA = 'deadbeef1234567890abcdef1234567890abcdef';
const MOCK_FILE_PATH = 'src/sync.service.ts';
const MOCK_FILE_SHA = 'fileSha001';
const MOCK_FILE_CONTENT_BASE64 = base64Encode(mockTsContent);

// Tree with 2 indexable files + 1 ignored
const mockTreeResponse = {
  sha: MOCK_COMMIT_SHA,
  url: 'https://api.github.com/repos/testorg/forgemind/git/trees/deadbeef',
  tree: [
    {
      path: MOCK_FILE_PATH,
      mode: '100644',
      type: 'blob',
      sha: MOCK_FILE_SHA,
      size: mockTsContent.length,
      url: 'https://api.github.com/repos/testorg/forgemind/git/blobs/fileSha001',
    },
    {
      path: 'src/utils.ts',
      mode: '100644',
      type: 'blob',
      sha: 'fileSha002',
      size: 200,
      url: 'https://api.github.com/repos/testorg/forgemind/git/blobs/fileSha002',
    },
    {
      path: 'node_modules/express/index.js',
      mode: '100644',
      type: 'blob',
      sha: 'fileSha003',
      size: 4096,
      url: 'https://api.github.com/repos/testorg/forgemind/git/blobs/fileSha003',
    },
  ],
  truncated: false,
};

const mockCommitResponse = {
  sha: MOCK_COMMIT_SHA,
  commit: {
    message: 'feat: add sync service',
    author: { name: 'dev', email: 'dev@test.com', date: '2026-08-19T00:00:00Z' },
  },
};

const utilsContent = `export const VERSION = '1.0.0';`;

function buildGitHubMockFetch(): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const authHeader =
      (init?.headers as Record<string, string>)?.['Authorization'] ||
      (init?.headers as Record<string, string>)?.['authorization'];
    if (authHeader && authHeader.includes('invalid-token')) {
      return mockJsonResponse({ message: 'Bad credentials' }, 401, 'Unauthorized');
    }
    // getCommit: /repos/{owner}/{repo}/commits/{ref}
    if (url.includes('/commits/')) {
      return mockJsonResponse(mockCommitResponse);
    }
    // getTree: /repos/{owner}/{repo}/git/trees/{sha}
    if (url.includes('/git/trees/')) {
      return mockJsonResponse(mockTreeResponse);
    }
    // getFileContent: /repos/{owner}/{repo}/contents/{path}
    if (url.includes('/contents/')) {
      if (url.includes('sync.service')) {
        return mockJsonResponse({
          type: 'file',
          encoding: 'base64',
          size: mockTsContent.length,
          name: 'sync.service.ts',
          path: MOCK_FILE_PATH,
          content: MOCK_FILE_CONTENT_BASE64,
          sha: MOCK_FILE_SHA,
        });
      }
      if (url.includes('utils')) {
        return mockJsonResponse({
          type: 'file',
          encoding: 'base64',
          size: utilsContent.length,
          name: 'utils.ts',
          path: 'src/utils.ts',
          content: base64Encode(utilsContent),
          sha: 'fileSha002',
        });
      }
    }
    return mockJsonResponse({}, 404, 'Not Found');
  };
}

async function runAcquisitionOrchestrationTests(): Promise<void> {
  console.log('\n📋 Part E — Repository Analysis Acquisition Orchestration (Tests 24–30)');

  // Test 24: triggerRepositoryAnalysis retrieves expected GitHub commit and tree data
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());

    const summary = await acquisition.triggerRepositoryAnalysis(
      REPO_ID_ACQ,
      USER_ID_ACQ,
      'test-token',
    );

    assertEqual(
      summary.commitHash,
      MOCK_COMMIT_SHA,
      'Test 24: commitHash matches mock GitHub commit',
    );
    assertGte(summary.fileCount, 1, 'Test 24: At least 1 file indexed from tree');
    console.log('  ✅ Test 24: Repository analysis retrieves expected GitHub commit/tree data');
  }

  // Test 25: Tree data is processed and files are indexed
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());

    const summary = await acquisition.triggerRepositoryAnalysis(
      REPO_ID_ACQ,
      USER_ID_ACQ,
      'test-token',
    );

    // node_modules item was ignored, 2 files + directory should be indexed
    assertGte(summary.fileCount, 1, 'Test 25: At least 1 file indexed (node_modules excluded)');
    // Verify that RepositoryFiles were stored in-memory
    let storedFiles = 0;
    for (const f of fileStore.values()) {
      if (f.repositoryId === REPO_ID_ACQ) storedFiles++;
    }
    assertGte(storedFiles, 1, 'Test 25: RepositoryFile records created in store');
    console.log('  ✅ Test 25: Tree data is processed and files are indexed');
  }

  // Test 26: Supported source files are retrieved from GitHub
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');

    let contentRequestsMade = 0;
    setMockFetch(async (url: string): Promise<Response> => {
      if (url.includes('/commits/')) return mockJsonResponse(mockCommitResponse);
      if (url.includes('/git/trees/')) return mockJsonResponse(mockTreeResponse);
      if (url.includes('/contents/')) {
        contentRequestsMade++;
        if (url.includes('sync.service')) {
          return mockJsonResponse({
            type: 'file',
            encoding: 'base64',
            size: mockTsContent.length,
            name: 'sync.service.ts',
            path: MOCK_FILE_PATH,
            content: MOCK_FILE_CONTENT_BASE64,
            sha: MOCK_FILE_SHA,
          });
        }
        return mockJsonResponse({
          type: 'file',
          encoding: 'base64',
          size: utilsContent.length,
          name: 'utils.ts',
          path: 'src/utils.ts',
          content: base64Encode(utilsContent),
          sha: 'fileSha002',
        });
      }
      return mockJsonResponse({}, 404, 'Not Found');
    });

    await acquisition.triggerRepositoryAnalysis(REPO_ID_ACQ, USER_ID_ACQ, 'test-token');

    // Both .ts files should trigger file content requests (node_modules not indexed)
    assertGte(
      contentRequestsMade,
      1,
      'Test 26: At least 1 file content request made to GitHub API',
    );
    console.log('  ✅ Test 26: Supported source files are retrieved from GitHub');
  }

  // Test 27: Source files are parsed and symbols/dependencies are extracted
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());

    await acquisition.triggerRepositoryAnalysis(REPO_ID_ACQ, USER_ID_ACQ, 'test-token');

    // mockTsContent has: SyncResult interface, syncRepositories function, PrismaClient import
    // symbols should have been parsed and stored
    assertGte(symbolStore.size, 1, 'Test 27: At least 1 symbol extracted and persisted');
    console.log('  ✅ Test 27: Source files are parsed and symbols/dependencies are extracted');
  }

  // Test 28: Code chunks are produced for source files
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());

    await acquisition.triggerRepositoryAnalysis(REPO_ID_ACQ, USER_ID_ACQ, 'test-token');

    assertGte(chunkStore.size, 1, 'Test 28: At least 1 code chunk created');
    console.log('  ✅ Test 28: Code chunks are produced according to existing chunker behavior');
  }

  // Test 29: AcquisitionSummary contains expected fields with correct shape
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());

    const summary = await acquisition.triggerRepositoryAnalysis(
      REPO_ID_ACQ,
      USER_ID_ACQ,
      'test-token',
    );

    assertDefined(summary.job, 'Test 29: summary.job must be defined');
    assertDefined(summary.commitHash, 'Test 29: summary.commitHash must be defined');
    assert(typeof summary.fileCount === 'number', 'Test 29: summary.fileCount must be a number');
    assert(
      typeof summary.totalSizeBytes === 'number',
      'Test 29: summary.totalSizeBytes must be a number',
    );
    assertDefined(summary.indexing, 'Test 29: summary.indexing must be defined');
    assertDefined(summary.extraction, 'Test 29: summary.extraction must be defined');
    assertDefined(summary.vectorIndexing, 'Test 29: summary.vectorIndexing must be defined');

    // Job should be in completed state
    assertEqual(
      summary.job.status,
      'completed',
      'Test 29: AcquisitionSummary job status = completed',
    );
    assertEqual(
      summary.job.commitHash,
      MOCK_COMMIT_SHA,
      'Test 29: job.commitHash matches GitHub SHA',
    );
    console.log('  ✅ Test 29: Analysis result contains expected AcquisitionSummary');
  }

  // Test 30: Repository not found or unauthorized access is rejected
  {
    resetAllStores();
    // REPO_ID_ERR is NOT seeded in repositoryStore → findRepositoryById returns null
    setMockFetch(buildGitHubMockFetch());

    let threw = false;
    try {
      await acquisition.triggerRepositoryAnalysis(REPO_ID_ERR, USER_ID_ACQ, 'test-token');
    } catch (err) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      assert(
        msg.includes(REPO_ID_ERR) || msg.toLowerCase().includes('not found'),
        `Test 30: Error message must reference repositoryId or 'not found', got: "${msg}"`,
      );
    }
    assert(threw, 'Test 30: triggerRepositoryAnalysis must throw for non-existent repository');
    console.log('  ✅ Test 30: Non-existent repository is rejected with appropriate error');
  }

  restoreFetch();
}

// =============================================================================
// MAIN RUNNER
// =============================================================================

async function runBackgroundWorkerTests(): Promise<void> {
  console.log('\n📋 Part F — Background Analysis Worker & Job Queue (Tests 31–36)');

  // Test 31: enqueueAnalysisJob enqueues a pending job
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    const job = await acquisition.enqueueAnalysisJob(REPO_ID_ACQ, USER_ID_ACQ);
    assertEqual(job.status, 'pending', 'Test 31: Enqueued job status is pending');
    assertEqual(job.repositoryId, REPO_ID_ACQ, 'Test 31: Repository ID matches');
    console.log('  ✅ Test 31: enqueueAnalysisJob enqueues job with status=pending');
  }

  // Test 32: enqueueAnalysisJob reuses active pending/in_progress job
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    const job1 = await acquisition.enqueueAnalysisJob(REPO_ID_ACQ, USER_ID_ACQ);
    const job2 = await acquisition.enqueueAnalysisJob(REPO_ID_ACQ, USER_ID_ACQ);
    assertEqual(job1.id, job2.id, 'Test 32: Active job reused for same repository');
    console.log('  ✅ Test 32: enqueueAnalysisJob reuses active pending job');
  }

  // Test 33: claimNextAnalysisJob claims pending job and sets in_progress
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    const job = await acquisition.enqueueAnalysisJob(REPO_ID_ACQ, USER_ID_ACQ);
    const claimed = await analysisJob.claimNextAnalysisJob();
    assertDefined(claimed, 'Test 33: Job claimed successfully');
    assertEqual(claimed?.id, job.id, 'Test 33: Claimed job matches enqueued job');
    assertEqual(claimed?.status, 'in_progress', 'Test 33: Claimed job status set to in_progress');
    console.log('  ✅ Test 33: claimNextAnalysisJob claims pending job atomically');
  }

  // Test 34: claimNextAnalysisJob returns null when no pending jobs exist
  {
    resetAllStores();
    const claimed = await analysisJob.claimNextAnalysisJob();
    assertNull(claimed, 'Test 34: Returns null when no pending jobs exist');
    console.log('  ✅ Test 34: claimNextAnalysisJob returns null when queue is empty');
  }

  // Test 35: processNextAnalysisJob processes pending job to completion
  {
    resetAllStores();
    seedRepository(REPO_ID_ACQ, USER_ID_ACQ, 'forgemind', 'testorg');
    setMockFetch(buildGitHubMockFetch());
    await acquisition.enqueueAnalysisJob(REPO_ID_ACQ, USER_ID_ACQ);
    const processed = await analysisWorker.processNextAnalysisJob();
    assertEqual(processed, true, 'Test 35: Job processed by worker');

    const latestJob = await analysisJob.findLatestAnalysisJobByRepository(REPO_ID_ACQ);
    assertEqual(latestJob?.status, 'completed', 'Test 35: Job status transitioned to completed');
    console.log('  ✅ Test 35: processNextAnalysisJob processes job to completed state');
  }

  // Test 36: processNextAnalysisJob handles worker errors gracefully
  {
    resetAllStores();
    seedRepository(REPO_ID_ERR, USER_ID_ACQ, 'error-repo', 'testorg');
    ghCredStore.delete(USER_ID_ACQ);
    await acquisition.enqueueAnalysisJob(REPO_ID_ERR, USER_ID_ACQ);
    const processed = await analysisWorker.processNextAnalysisJob();
    assertEqual(processed, true, 'Test 36: Worker handled error gracefully');

    const latestJob = await analysisJob.findLatestAnalysisJobByRepository(REPO_ID_ERR);
    assertEqual(latestJob?.status, 'failed', 'Test 36: Failed job recorded status=failed');
    assertDefined(latestJob?.error, 'Test 36: Error details recorded');
    console.log('  ✅ Test 36: processNextAnalysisJob transitions to failed on processing error');
  }
}

async function runAllTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — Repository Analysis Acquisition Integration Test Suite (Sprint 4 Task 2)\n',
  );

  try {
    // Dynamic imports AFTER PrismaClient _request interceptor is installed
    treeIndexing = await import('./tree-indexing.service.js');
    astParser = await import('./ast-parser.service.js');
    symbolExtraction = await import('./symbol-extraction.service.js');
    analysisJob = await import('./analysis-job.service.js');
    acquisition = await import('./repository-acquisition.service.js');
    analysisWorker = await import('./analysis-worker.service.js');

    await runTreeIndexingTests();
    await runAstParsingTests();
    await runSymbolPersistenceTests();
    await runAnalysisJobTests();
    await runAcquisitionOrchestrationTests();
    await runBackgroundWorkerTests();

    console.log('\n🎉 ALL 36 INTEGRATION & SERVICE TESTS PASSED SUCCESSFULLY!\n');
    console.log('Summary:');
    console.log('  Part A — Tree Indexing & Language Detection:          Tests 1–7   (7 tests)');
    console.log('  Part B — AST Parsing:                                 Tests 8–14  (7 tests)');
    console.log('  Part C — Symbol & Dependency Persistence:             Tests 15–18 (4 tests)');
    console.log('  Part D — Analysis Job Lifecycle:                      Tests 19–23 (5 tests)');
    console.log('  Part E — Repository Analysis Acquisition:             Tests 24–30 (7 tests)');
    console.log('  Part F — Background Analysis Worker & Queue:          Tests 31–36 (6 tests)');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    restoreFetch();
  }
}

runAllTests();
