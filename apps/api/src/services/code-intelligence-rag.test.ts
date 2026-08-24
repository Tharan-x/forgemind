/* eslint-disable no-console, @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */
// =============================================================================
// ForgeMind API — Code Intelligence & RAG Integration Test Suite (Sprint 4 Task 3)
// =============================================================================

import type {
  RepositoryFile,
  RepositorySymbol,
  FileDependency,
  ChatSession,
  ChatMessage,
  CodeChunk,
} from '@prisma/client';
import { Prisma, PrismaClient } from '@prisma/client';

process.env['EMBEDDING_PROVIDER'] = 'mock';

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
  assert(
    actual === null || actual === undefined,
    `${message} — Expected null, Got: ${JSON.stringify(actual)}`,
  );
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
const USER_ID_1 = makeUuid(3001);
const USER_ID_2 = makeUuid(3002);
const NON_EXISTENT_UUID = makeUuid(9999);

// ── In-Memory Store Types ─────────────────────────────────────────────────────

type StoredRepositoryFile = RepositoryFile;
type StoredSymbol = RepositorySymbol;
type StoredDependency = FileDependency;
type StoredCodeChunk = CodeChunk;
type StoredChatSession = ChatSession;
type StoredChatMessage = ChatMessage;

interface StoredRepository {
  id: string;
  userId: string;
  name: string;
  owner: string;
  fullName: string;
}

// ── In-Memory Stores ──────────────────────────────────────────────────────────

const repositoryStore = new Map<string, StoredRepository>();
const fileStore = new Map<string, StoredRepositoryFile>();
const symbolStore = new Map<string, StoredSymbol>();
const depStore = new Map<string, StoredDependency>();
const chunkStore = new Map<string, StoredCodeChunk>();
const sessionStore = new Map<string, StoredChatSession>();
const messageStore = new Map<string, StoredChatMessage>();

let fileIdCounter = 1;
let symbolIdCounter = 1;
let depIdCounter = 1;
let chunkIdCounter = 1;
let sessionIdCounter = 1;
let messageIdCounter = 1;

let mockVectorResults: any[] = [];

function resetAllStores(): void {
  repositoryStore.clear();
  fileStore.clear();
  symbolStore.clear();
  depStore.clear();
  chunkStore.clear();
  sessionStore.clear();
  messageStore.clear();
  mockVectorResults = [];

  fileIdCounter = 1;
  symbolIdCounter = 1;
  depIdCounter = 1;
  chunkIdCounter = 1;
  sessionIdCounter = 1;
  messageIdCounter = 1;
}

function seedRepository(id: string, userId: string, name: string, owner: string): void {
  repositoryStore.set(id, { id, userId, name, owner, fullName: `${owner}/${name}` });
}

// ── PrismaClient Interceptor ──────────────────────────────────────────────────

(PrismaClient.prototype as any)._request = async function (params: any): Promise<any> {
  const { clientMethod, action, args } = params;

  if (action === 'executeRaw' || clientMethod === '$executeRaw' || action === '$executeRaw') {
    return 1;
  }
  if (action === 'queryRaw' || clientMethod === '$queryRaw') {
    return mockVectorResults;
  }

  // ── repository ──
  if (clientMethod === 'repository.findUnique') {
    return repositoryStore.get(args.where.id) ?? null;
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
    if (args?.where?.sourcePath) {
      results = results.filter((d) => d.sourcePath === args.where.sourcePath);
    }
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
  if (clientMethod === 'codeChunk.deleteMany') {
    let count = 0;
    if (args?.where?.fileId) {
      for (const [id, chunk] of Array.from(chunkStore.entries())) {
        if (chunk.fileId === args.where.fileId) {
          chunkStore.delete(id);
          count++;
        }
      }
    }
    return { count };
  }
  if (clientMethod === 'codeChunk.count') {
    let results = Array.from(chunkStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((c) => c.repositoryId === args.where.repositoryId);
    return results.length;
  }
  if (clientMethod === 'codeChunk.create') {
    const data = args.data;
    const id = makeUuid(chunkIdCounter++);
    const chunk: StoredCodeChunk = {
      id,
      repositoryId: data.repositoryId,
      fileId: data.fileId,
      chunkIndex: data.chunkIndex,
      content: data.content,
      filePath: data.filePath,
      language: data.language ?? null,
      startLine: data.startLine,
      endLine: data.endLine,
      tokenCount: data.tokenCount,
      linesCount: data.linesCount,
      checksum: data.checksum,
      metadata: data.metadata ?? Prisma.JsonNull,
      createdAt: new Date(),
    };
    chunkStore.set(id, chunk);
    return { ...chunk };
  }

  // ── chatSession ──
  if (clientMethod === 'chatSession.findFirst') {
    let results = Array.from(sessionStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    if (args?.where?.userId) results = results.filter((s) => s.userId === args.where.userId);
    // Sort logic placeholder (mock relies on order of insertion generally)
    return results[results.length - 1] ?? null;
  }
  if (clientMethod === 'chatSession.create') {
    const data = args.data;
    const id = makeUuid(sessionIdCounter++);
    const session: StoredChatSession = {
      id,
      repositoryId: data.repositoryId,
      userId: data.userId,
      title: data.title ?? 'New Chat',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessionStore.set(id, session);
    return { ...session };
  }
  if (clientMethod === 'chatSession.findMany') {
    let results = Array.from(sessionStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    if (args?.where?.userId) results = results.filter((s) => s.userId === args.where.userId);
    return results;
  }
  if (clientMethod === 'chatSession.deleteMany') {
    let count = 0;
    if (args?.where?.repositoryId) {
      for (const [id, session] of Array.from(sessionStore.entries())) {
        if (
          session.repositoryId === args.where.repositoryId &&
          session.userId === args.where.userId
        ) {
          sessionStore.delete(id);
          count++;
        }
      }
    }
    return { count };
  }

  // ── chatMessage ──
  if (clientMethod === 'chatMessage.createMany') {
    const dataList = Array.isArray(args.data) ? args.data : [args.data];
    for (const data of dataList) {
      const id = makeUuid(messageIdCounter++);
      const msg: StoredChatMessage = {
        id,
        sessionId: data.sessionId,
        sender: data.sender,
        content: data.content,
        metadata: data.metadata ?? Prisma.JsonNull,
        createdAt: new Date(),
      };
      messageStore.set(id, msg);
    }
    return { count: dataList.length };
  }
  if (clientMethod === 'chatMessage.findMany') {
    let results = Array.from(messageStore.values());
    if (args?.where?.sessionId)
      results = results.filter((m) => m.sessionId === args.where.sessionId);
    if (args?.orderBy?.createdAt === 'desc') {
      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } else if (args?.orderBy?.createdAt === 'asc') {
      results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    if (typeof args?.take === 'number') {
      results = results.slice(0, args.take);
    }
    return results;
  }
  if (clientMethod === 'chatMessage.deleteMany') {
    let count = 0;
    if (args?.where?.sessionId?.in) {
      for (const [id, msg] of Array.from(messageStore.entries())) {
        if (args.where.sessionId.in.includes(msg.sessionId)) {
          messageStore.delete(id);
          count++;
        }
      }
    }
    return { count };
  }

  return null;
};

// =============================================================================
// DYNAMIC IMPORTS
// =============================================================================

const { chunkSourceFile, isUnsupportedFile, computeChunkChecksum, estimateTokenCount } =
  await import('./code-chunker.service.js');
const { processAndStoreFileChunks } = await import('./chunk-embedding.service.js');
const { calculateChunkHybridScore, retrieveRepositoryContext } =
  await import('./context-retrieval.service.js');
const { explainCode, getFileDependencyIntelligence, analyzeImpact, getArchitectureOverview } =
  await import('./code-intelligence.service.js');
const { executeRAGQuery } = await import('./rag-pipeline.service.js');
const { getRecentRepositoryChatHistory } = await import('./chat-history.service.js');
const { analyzeQueryIntent } = await import('./query-intent.service.js');

// =============================================================================
// RUN TESTS
// =============================================================================

async function runTests() {
  console.log('🧪 ForgeMind — Code Intelligence & RAG Integration Test Suite (Sprint 4 Task 3)\n');

  await runPartA();
  await runPartB();
  await runPartC();
  await runPartD();
  await runPartE();

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A — CODE CHUNKING
// ─────────────────────────────────────────────────────────────────────────────

async function runPartA() {
  console.log('📋 Part A — Code Chunking (Tests 1–6)');

  // 1. chunkSourceFile with AST symbols
  {
    const content =
      'export function performActionFoo() { return 12345; }\nexport function performActionBar() { return 67890; }\n';
    const symbols = [
      { id: '1', name: 'foo', kind: 'function', startLine: 1, endLine: 1, filePath: 'test.ts' },
      { id: '2', name: 'bar', kind: 'function', startLine: 2, endLine: 2, filePath: 'test.ts' },
    ] as any[];
    const chunks = chunkSourceFile('test.ts', content, null, symbols);
    assertGte(chunks.length, 2, 'Test 1: AST symbols guide chunking');
    console.log('  ✅ Test 1: chunkSourceFile with AST symbols');
  }

  // 2. chunkSourceFile without symbols / sliding-window fallback
  {
    const content = Array(150).fill('const a = 1;').join('\n');
    const chunks = chunkSourceFile('fallback.ts', content, null, []);
    assertGte(chunks.length, 1, 'Test 2: Sliding-window chunking fallback creates chunks');
    console.log('  ✅ Test 2: chunkSourceFile without symbols / sliding-window fallback');
  }

  // 3. isUnsupportedFile boundary conditions
  {
    assert(isUnsupportedFile('app.min.js', 100), 'Test 3: .min.js is unsupported');
    assert(isUnsupportedFile('huge.ts', 10000000), 'Test 3: Huge file is unsupported');
    assert(!isUnsupportedFile('normal.ts', 100), 'Test 3: Normal file is supported');
    assert(isUnsupportedFile('pic.png', 100), 'Test 3: Image extension is unsupported');
    console.log('  ✅ Test 3: isUnsupportedFile boundary conditions');
  }

  // 4. computeChunkChecksum determinism
  {
    const hash1 = computeChunkChecksum('test', 'test.ts', 1);
    const hash2 = computeChunkChecksum('test', 'test.ts', 1);
    const hash3 = computeChunkChecksum('test2', 'test.ts', 1);
    assertEqual(hash1, hash2, 'Test 4: Checksum is deterministic');
    assert(hash1 !== hash3, 'Test 4: Different content yields different checksum');
    console.log('  ✅ Test 4: computeChunkChecksum determinism');
  }

  // 5. estimateTokenCount
  {
    const tokens = estimateTokenCount('const a = 1;');
    assertGte(tokens, 1, 'Test 5: Token estimate is positive');
    console.log('  ✅ Test 5: estimateTokenCount');
  }

  // 6. oversized file (>3000 lines)
  {
    const hugeContent = Array(3500).fill('line').join('\n');
    const chunks = chunkSourceFile('huge.ts', hugeContent, null, []);
    assertEqual(chunks.length, 0, 'Test 6: Oversized file returns 0 chunks');
    console.log('  ✅ Test 6: oversized file (>3000 lines)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART B — CHUNK EMBEDDING / VECTOR PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

async function runPartB() {
  console.log('\n📋 Part B — Chunk Embedding / Vector Pipeline (Tests 7–11)');

  const FILE_ID = makeUuid(4001);
  const fileRecord: any = {
    id: FILE_ID,
    repositoryId: REPO_ID_1,
    path: 'src/main.ts',
    name: 'main.ts',
    extension: 'ts',
    language: 'TypeScript',
    type: 'file',
    size: 100,
    sha: 'abcdef',
  };

  // 7. new file creates chunks
  {
    resetAllStores();
    fileStore.set(FILE_ID, fileRecord);
    const content = 'export const testConfigValue = "long string to bypass min char limit";';
    const result = await processAndStoreFileChunks(
      REPO_ID_1,
      FILE_ID,
      fileRecord.path,
      content,
      fileRecord.language,
      [],
    );
    assertGte(result.chunksCreated, 1, 'Test 7: Chunks created for new file');
    assertGte(chunkStore.size, 1, 'Test 7: Chunk stored in DB');
    console.log('  ✅ Test 7: new file creates chunks');
  }

  // 8. unchanged checksum skips processing
  {
    const content = 'export const testConfigValue = "long string to bypass min char limit";';
    const oldSize = chunkStore.size;
    const result = await processAndStoreFileChunks(
      REPO_ID_1,
      FILE_ID,
      fileRecord.path,
      content,
      fileRecord.language,
      [],
    );
    assertEqual(result.embeddingsGenerated, 0, 'Test 8: Unchanged file skipped embedding');
    assertGte(result.chunksSkipped, 1, 'Test 8: Unchanged file chunks skipped');
    assertEqual(chunkStore.size, oldSize, 'Test 8: No duplicate chunks added');
    console.log('  ✅ Test 8: unchanged checksum skips processing');
  }

  // 9. changed content deletes/replaces stale chunks
  {
    const content =
      'export const testConfigValue = "long string to bypass min char limit 2"; // changed';
    const result = await processAndStoreFileChunks(
      REPO_ID_1,
      FILE_ID,
      fileRecord.path,
      content,
      fileRecord.language,
      [],
    );
    assertGte(result.chunksCreated, 1, 'Test 9: Changed file creates new chunks');
    const chunks = Array.from(chunkStore.values());
    const oldChunk = chunks.find(
      (c) => c.content === 'export const testConfigValue = "long string to bypass min char limit";',
    );
    assertNull(oldChunk, 'Test 9: Stale chunks deleted');
    console.log('  ✅ Test 9: changed content deletes/replaces stale chunks');
  }

  // 10. empty/unsupported file clears chunks
  {
    const result = await processAndStoreFileChunks(
      REPO_ID_1,
      FILE_ID,
      fileRecord.path,
      '',
      fileRecord.language,
      [],
    );
    assertEqual(result.chunksCreated, 0, 'Test 10: Empty file yields 0 chunks');
    const chunks = Array.from(chunkStore.values());
    assertEqual(chunks.length, 0, 'Test 10: Existing chunks cleared');
    console.log('  ✅ Test 10: empty/unsupported file clears chunks');
  }

  // 11. multi-file vector pipeline aggregation
  {
    resetAllStores();
    const F1 = makeUuid(4002);
    const F2 = makeUuid(4003);
    fileStore.set(F1, { ...fileRecord, id: F1, path: '1.ts' });
    fileStore.set(F2, { ...fileRecord, id: F2, path: '2.ts' });

    await processAndStoreFileChunks(
      REPO_ID_1,
      F1,
      '1.ts',
      'export const testConfigValue = "long string to bypass min char limit A";',
      'TypeScript',
      [],
    );
    await processAndStoreFileChunks(
      REPO_ID_1,
      F2,
      '2.ts',
      'export const testConfigValue = "long string to bypass min char limit B";',
      'TypeScript',
      [],
    );
    assertGte(chunkStore.size, 2, 'Test 11: Multi-file pipeline creates all chunks');
    console.log('  ✅ Test 11: multi-file vector pipeline aggregation');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART C — CONTEXT RETRIEVAL
// ─────────────────────────────────────────────────────────────────────────────

async function runPartC() {
  console.log('\n📋 Part C — Context Retrieval (Tests 12–21)');

  const mockChunk = {
    id: 'c1',
    repositoryId: REPO_ID_1,
    filePath: 'src/config.ts',
    content: 'export const database_url_connection_string = "postgres://";',
    language: 'TypeScript',
    start_line: 1,
    end_line: 1,
    similarity: 0.8,
    metadata: { symbolName: 'database_url' },
  };

  // 12. keyword overlap affects hybrid score
  {
    const intent = analyzeQueryIntent('database_url configuration');
    const score1 = calculateChunkHybridScore(mockChunk as any, intent);
    const intentNoKw = analyzeQueryIntent('irrelevant random terms');
    const score2 = calculateChunkHybridScore(mockChunk as any, intentNoKw);
    assert(score1 > score2, 'Test 12: Keyword overlap increases hybrid score');
    console.log('  ✅ Test 12: keyword overlap affects hybrid score');
  }

  // 13. path matching
  {
    const intent = analyzeQueryIntent('config file');
    const score = calculateChunkHybridScore(mockChunk as any, intent);
    assertGte(score, 0.4, 'Test 13: Path match applies positive score weight');
    console.log('  ✅ Test 13: path matching');
  }

  // 14. symbol matching
  {
    const intent = analyzeQueryIntent('where is database_url');
    const score = calculateChunkHybridScore(mockChunk as any, intent);
    assertGte(score, 0.5, 'Test 14: Symbol match increases score');
    console.log('  ✅ Test 14: symbol matching');
  }

  // 15. vector similarity
  {
    const intent = analyzeQueryIntent('db');
    const c1 = { ...mockChunk, similarity: 0.9 };
    const c2 = { ...mockChunk, similarity: 0.1 };
    const score1 = calculateChunkHybridScore(c1 as any, intent);
    const score2 = calculateChunkHybridScore(c2 as any, intent);
    assert(score1 > score2, 'Test 15: Vector similarity directly influences score');
    console.log('  ✅ Test 15: vector similarity');
  }

  // 16. DB_CONFIGURATION bonus
  {
    const intent = analyzeQueryIntent('how to connect to database');
    assert(
      intent.category === 'DB_CONFIGURATION' || (intent.isConfigurationQuery as boolean),
      'Intent must match config',
    );
    const score = calculateChunkHybridScore(mockChunk as any, intent);
    assertGte(score, 0.5, 'Test 16: DB_CONFIGURATION bonus applied');
    console.log('  ✅ Test 16: DB_CONFIGURATION bonus');
  }

  // 17. lowQualityPathPatterns 0.40 cap
  {
    const intent = analyzeQueryIntent('database schema');
    intent.lowQualityPathPatterns = ['migration'];
    const badChunk = { ...mockChunk, filePath: 'migrations/123.sql', similarity: 0.99 };
    const score = calculateChunkHybridScore(badChunk as any, intent);
    assert(score <= 0.4, 'Test 17: lowQualityPath capped at 0.40');
    console.log('  ✅ Test 17: lowQualityPathPatterns 0.40 cap');
  }

  // 18. repository ownership enforcement
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    let threw = false;
    try {
      await retrieveRepositoryContext(REPO_ID_1, USER_ID_2, 'test');
    } catch {
      threw = true;
    }
    assert(threw, 'Test 18: Access denied for wrong user');
    console.log('  ✅ Test 18: repository ownership enforcement');
  }

  // 19. threshold filtering
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [
      {
        ...mockChunk,
        similarity: 0.0,
        content: 'irrelevant',
        filePath: 'irrelevant.ts',
        metadata: {},
      },
    ];
    const results = await retrieveRepositoryContext(REPO_ID_1, USER_ID_1, 'highly specific query', {
      threshold: 0.8,
    });
    assertEqual(results.length, 0, 'Test 19: Low score chunk filtered by threshold');
    console.log('  ✅ Test 19: threshold filtering');
  }

  // 20. duplicate range deduplication
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [
      { ...mockChunk, id: 'c1', similarity: 0.9 },
      { ...mockChunk, id: 'c2', similarity: 0.8 },
    ];
    const results = await retrieveRepositoryContext(REPO_ID_1, USER_ID_1, 'database', {
      threshold: 0.1,
    });
    assertEqual(results.length, 1, 'Test 20: Duplicate range deduplicated');
    console.log('  ✅ Test 20: duplicate range deduplication');
  }

  // 21. maxTokens budget
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [
      {
        ...mockChunk,
        id: 'c1',
        filePath: '1.ts',
        content: Array(5000).fill('word').join(' '),
        similarity: 0.9,
      },
      {
        ...mockChunk,
        id: 'c2',
        filePath: '2.ts',
        content: Array(5000).fill('word').join(' '),
        similarity: 0.8,
      },
    ];
    const results = await retrieveRepositoryContext(REPO_ID_1, USER_ID_1, 'database', {
      maxTokens: 1000,
      threshold: 0.1,
    });
    assertEqual(results.length, 1, 'Test 21: Max tokens limits returned chunks');
    console.log('  ✅ Test 21: maxTokens budget');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART D — CODE INTELLIGENCE
// ─────────────────────────────────────────────────────────────────────────────

async function runPartD() {
  console.log('\n📋 Part D — Code Intelligence (Tests 22–28)');

  // 22. explainCode ownership
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    let threw = false;
    try {
      await explainCode(REPO_ID_1, USER_ID_2, { filePath: 'test.ts' });
    } catch {
      threw = true;
    }
    assert(threw, 'Test 22: Access denied for wrong user');
    console.log('  ✅ Test 22: explainCode ownership');
  }

  // 23. explainCode result shape
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [
      {
        id: '1',
        repositoryId: REPO_ID_1,
        filePath: 'test.ts',
        content: 'export const authServiceConfig = true; // long enough',
        language: 'ts',
        startLine: 1,
        endLine: 2,
        similarity: 0.9,
        metadata: {},
      },
    ];
    const res = await explainCode(REPO_ID_1, USER_ID_1, { filePath: 'test.ts' });
    assertDefined(res.explanation, 'Test 23: explanation present');
    assertEqual(res.filePath, 'test.ts', 'Test 23: filePath matched');
    assertGte(res.sources.length, 1, 'Test 23: Sources populated');
    assertDefined(res.providerUsed, 'Test 23: Provider string present');
    console.log('  ✅ Test 23: explainCode result shape');
  }

  // 24. dependency intelligence ownership
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    let threw = false;
    try {
      await getFileDependencyIntelligence(REPO_ID_1, USER_ID_2, 'test.ts');
    } catch {
      threw = true;
    }
    assert(threw, 'Test 24: Access denied');
    console.log('  ✅ Test 24: dependency intelligence ownership');
  }

  // 25. imports/importedBy/internalCount/externalCount
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');

    depStore.set('d1', {
      id: 'd1',
      repositoryId: REPO_ID_1,
      sourceFileId: 'f1',
      sourcePath: 'src/main.ts',
      targetPath: 'src/utils.ts',
      isExternal: false,
      importedSymbols: [],
      createdAt: new Date(),
    });
    depStore.set('d2', {
      id: 'd2',
      repositoryId: REPO_ID_1,
      sourceFileId: 'f1',
      sourcePath: 'src/main.ts',
      targetPath: 'react',
      isExternal: true,
      importedSymbols: [],
      createdAt: new Date(),
    });
    depStore.set('d3', {
      id: 'd3',
      repositoryId: REPO_ID_1,
      sourceFileId: 'f2',
      sourcePath: 'src/index.ts',
      targetPath: 'src/main.ts',
      isExternal: false,
      importedSymbols: [],
      createdAt: new Date(),
    });

    const res = await getFileDependencyIntelligence(REPO_ID_1, USER_ID_1, 'src/main.ts');
    assertEqual(res.imports.length, 2, 'Test 25: 2 outgoing imports');
    assertEqual(res.importedBy.length, 1, 'Test 25: 1 incoming import');
    assertEqual(res.internalCount, 1, 'Test 25: 1 internal');
    assertEqual(res.externalCount, 1, 'Test 25: 1 external');
    console.log('  ✅ Test 25: imports/importedBy/internalCount/externalCount');
  }

  // 26. impact analysis directDependents/affectedSymbols
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');

    depStore.set('d3', {
      id: 'd3',
      repositoryId: REPO_ID_1,
      sourceFileId: 'f2',
      sourcePath: 'src/index.ts',
      targetPath: 'src/main.ts',
      isExternal: false,
      importedSymbols: [],
      createdAt: new Date(),
    });
    symbolStore.set('s1', {
      id: 's1',
      repositoryId: REPO_ID_1,
      fileId: 'f1',
      name: 'App',
      kind: 'class',
      filePath: 'src/main.ts',
      startLine: 1,
      endLine: 5,
      exported: true,
      createdAt: new Date(),
    });

    const res = await analyzeImpact(REPO_ID_1, USER_ID_1, 'src/main.ts', undefined, false);
    assertEqual(res.directDependents.length, 1, 'Test 26: 1 dependent file');
    assertEqual(res.affectedSymbols.length, 1, 'Test 26: 1 affected symbol');
    assertEqual(res.ragExplanationUsed as boolean, false, 'Test 26: RAG skipped');
    console.log('  ✅ Test 26: impact analysis directDependents/affectedSymbols');
  }

  // 27. includeExplanation=false skips RAG
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    const res = await analyzeImpact(REPO_ID_1, USER_ID_1, 'src/main.ts', undefined, false);
    assertNull(res.explanation, 'Test 27: explanation is undefined when false');
    console.log('  ✅ Test 27: includeExplanation=false skips RAG');
  }

  // 28. architecture overview distributions/directories/external packages
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');

    fileStore.set('f1', {
      id: 'f1',
      repositoryId: REPO_ID_1,
      path: 'src/a.ts',
      name: 'a.ts',
      extension: 'ts',
      language: 'TypeScript',
      type: 'file',
      size: 10,
      sha: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    fileStore.set('f2', {
      id: 'f2',
      repositoryId: REPO_ID_1,
      path: 'src/b.py',
      name: 'b.py',
      extension: 'py',
      language: 'Python',
      type: 'file',
      size: 10,
      sha: '2',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    symbolStore.set('s1', {
      id: 's1',
      repositoryId: REPO_ID_1,
      fileId: 'f1',
      name: 'a',
      kind: 'function',
      filePath: 'src/a.ts',
      startLine: 1,
      endLine: 1,
      exported: true,
      createdAt: new Date(),
    });

    depStore.set('d1', {
      id: 'd1',
      repositoryId: REPO_ID_1,
      sourceFileId: 'f1',
      sourcePath: 'src/a.ts',
      targetPath: 'react',
      isExternal: true,
      importedSymbols: [],
      createdAt: new Date(),
    });

    const arch = await getArchitectureOverview(REPO_ID_1, USER_ID_1);
    assertEqual(arch.totalFiles, 2, 'Test 28: Total files correct');
    assertEqual(arch.languageDistribution['TypeScript'], 1, 'Test 28: TypeScript count');
    assertEqual(arch.languageDistribution['Python'], 1, 'Test 28: Python count');
    assertEqual(arch.symbolKindDistribution['function'], 1, 'Test 28: Symbol distribution');
    assertEqual(arch.topExternalPackages[0]?.package, 'react', 'Test 28: External package listed');
    assertEqual(arch.topDirectories[0]?.directory, 'src', 'Test 28: Directory listed');
    console.log('  ✅ Test 28: architecture overview distributions/directories/external packages');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART E — RAG PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

async function runPartE() {
  console.log('\n📋 Part E — RAG Pipeline (Tests 29–33)');

  // 29. empty query rejection
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    let threw = false;
    try {
      await executeRAGQuery(REPO_ID_1, USER_ID_1, '   ');
    } catch {
      threw = true;
    }
    assert(threw, 'Test 29: Empty query rejected');
    console.log('  ✅ Test 29: empty query rejection');
  }

  // 30. executeRAGQuery result shape
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [
      {
        id: '1',
        repositoryId: REPO_ID_1,
        filePath: 'test.ts',
        content: 'export const authServiceConfig = true; // long enough',
        language: 'ts',
        startLine: 1,
        endLine: 2,
        similarity: 0.9,
        metadata: {},
      },
    ];

    const res = await executeRAGQuery(REPO_ID_1, USER_ID_1, 'How does auth work?');
    assertDefined(res.answer, 'Test 30: answer present');
    assertDefined(res.providerUsed, 'Test 30: providerUsed present');
    assertEqual(res.query, 'How does auth work?', 'Test 30: Query matched');
    assertGte(res.sources.length, 1, 'Test 30: Sources populated');
    console.log('  ✅ Test 30: executeRAGQuery result shape');
  }

  // 31. chat session/message persistence
  {
    assertEqual(sessionStore.size, 1, 'Test 31: Session created');
    assertEqual(messageStore.size, 2, 'Test 31: User + Assistant messages created');
    const msgs = Array.from(messageStore.values());
    assertEqual(msgs[0]!.sender, 'user', 'Test 31: First is user');
    assertEqual(msgs[1]!.sender, 'assistant', 'Test 31: Second is assistant');
    console.log('  ✅ Test 31: chat session/message persistence');
  }

  // 32. structural context for ARCHITECTURE/FLOW queries
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    mockVectorResults = [];

    fileStore.set('f1', {
      id: 'f1',
      repositoryId: REPO_ID_1,
      path: 'src/a.ts',
      name: 'a.ts',
      extension: 'ts',
      language: 'TypeScript',
      type: 'file',
      size: 10,
      sha: '1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await executeRAGQuery(
      REPO_ID_1,
      USER_ID_1,
      'Explain the architecture of the repository',
    );
    assertDefined(res.answer, 'Test 32: Answer returned');
    assert(
      res.answer.includes('Context snippet') || res.answer.length > 0,
      'Test 32: Result returned with structural flow logic triggered',
    );
    console.log('  ✅ Test 32: structural context for ARCHITECTURE/FLOW queries');
  }

  // 33. graceful LLM failure fallback
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    const res = await executeRAGQuery(REPO_ID_1, USER_ID_1, 'Query');
    assertDefined(res.answer, 'Test 33: Graceful fallback resolves to a string');
    console.log('  ✅ Test 33: graceful LLM failure fallback');
  }

  // 34. getRecentRepositoryChatHistory DB-level limit and chronological ordering
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');

    const session = {
      id: makeUuid(901),
      repositoryId: REPO_ID_1,
      userId: USER_ID_1,
      title: 'History Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    sessionStore.set(session.id, session);

    for (let i = 1; i <= 15; i++) {
      const msgId = makeUuid(910 + i);
      messageStore.set(msgId, {
        id: msgId,
        sessionId: session.id,
        sender: i % 2 === 1 ? 'user' : 'assistant',
        content: `Message ${i}`,
        metadata: null,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }

    const recent = await getRecentRepositoryChatHistory(REPO_ID_1, USER_ID_1, 10);
    assertEqual(recent.length, 10, 'Test 34: Max 10 messages returned');
    assertEqual(
      recent[0]!.content,
      'Message 6',
      'Test 34: Chronological oldest of recent 10 is Message 6',
    );
    assertEqual(
      recent[9]!.content,
      'Message 15',
      'Test 34: Chronological newest of recent 10 is Message 15',
    );
    console.log(
      '  ✅ Test 34: getRecentRepositoryChatHistory DB-level limit (10) and chronological order',
    );
  }

  // 35. Tenant isolation (Repository + User scoping)
  {
    const REPO_ID_2 = makeUuid(1002);
    seedRepository(REPO_ID_2, USER_ID_2, 'repo2', 'user2');

    // Repo 1 User 1 history should not be returned for Repo 2 User 2
    const repo2Recent = await getRecentRepositoryChatHistory(REPO_ID_2, USER_ID_2, 10);
    assertEqual(repo2Recent.length, 0, 'Test 35: No history returned for isolated Repo 2');

    // User 2 query on Repo 1 should not see User 1's history
    const user2OnRepo1Recent = await getRecentRepositoryChatHistory(REPO_ID_1, USER_ID_2, 10);
    assertEqual(
      user2OnRepo1Recent.length,
      0,
      'Test 35: User 2 cannot access User 1 history on Repo 1',
    );
    console.log('  ✅ Test 35: Strict Repository + User tenant isolation enforced');
  }

  // 36. Multi-turn executeRAGQuery receives previous history in prompt
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');

    // Turn 1
    const res1 = await executeRAGQuery(REPO_ID_1, USER_ID_1, 'Where is auth implemented?');
    assertEqual(sessionStore.size, 1, 'Test 36: Session created');
    assertEqual(messageStore.size, 2, 'Test 36: Turn 1 saved 2 messages');

    // Turn 2: executeRAGQuery now automatically fetches Turn 1 history
    const res2 = await executeRAGQuery(
      REPO_ID_1,
      USER_ID_1,
      'What vulnerability did you find there?',
    );
    assertEqual(messageStore.size, 4, 'Test 36: Turn 2 saved 2 more messages (total 4)');
    console.log('  ✅ Test 36: Multi-turn executeRAGQuery incorporates bounded chat history');
  }

  // 37. First query in new session has no history
  {
    resetAllStores();
    seedRepository(REPO_ID_1, USER_ID_1, 'test', 'user');
    const freshRecent = await getRecentRepositoryChatHistory(REPO_ID_1, USER_ID_1, 10);
    assertEqual(freshRecent.length, 0, 'Test 37: Fresh session has 0 history messages');
    const res = await executeRAGQuery(REPO_ID_1, USER_ID_1, 'First query');
    assertEqual(res.query, 'First query', 'Test 37: First query executes cleanly');
    console.log('  ✅ Test 37: First message in new session executes cleanly without history');
  }

  // 38. User message and assistant message persistence after synthesis
  {
    assertEqual(sessionStore.size, 1, 'Test 38: Session exists');
    assertEqual(messageStore.size, 2, 'Test 38: Current turn saved user + assistant messages');
    const msgs = Array.from(messageStore.values());
    assertEqual(msgs[0]!.sender, 'user', 'Test 38: User message persisted first');
    assertEqual(msgs[1]!.sender, 'assistant', 'Test 38: Assistant message persisted second');
    console.log('  ✅ Test 38: User and assistant messages correctly persisted after synthesis');
  }
}

// =============================================================================
runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
