/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Embedding, Vector Search & RAG Reliability Test Suite
// =============================================================================

import {
  DisabledEmbeddingProvider,
  EmbeddingUnavailableError,
  GeminiEmbeddingProvider,
  LocalDeterministicEmbeddingProvider,
  OpenAIEmbeddingProvider,
  getEmbeddingProvider,
  resetEmbeddingProvider,
} from './embeddings/index.js';
import { getVectorPipelineStatus, searchSemanticCodeChunks } from './vector-search.service.js';
import { processAndStoreFileChunks } from './chunk-embedding.service.js';
import { executeRAGQuery } from './rag-pipeline.service.js';
import { prisma } from '../lib/prisma.js';

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

const TEST_REPO_ID = makeUuid(8881);
const TEST_USER_ID = makeUuid(8882);
const TEST_FILE_ID = makeUuid(8883);

async function main(): Promise<void> {
  console.log('🧪 Starting Vector Search & RAG Reliability Test Suite...\n');

  const originalEnv = { ...process.env };

  const restoreEnv = () => {
    process.env['EMBEDDING_PROVIDER'] = originalEnv['EMBEDDING_PROVIDER'];
    process.env['OPENAI_API_KEY'] = originalEnv['OPENAI_API_KEY'];
    process.env['GEMINI_API_KEY'] = originalEnv['GEMINI_API_KEY'];
    process.env['LLM_PROVIDER'] = 'mock';
    resetEmbeddingProvider();
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Default missing API key configuration yields DisabledEmbeddingProvider
    // -------------------------------------------------------------------------
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    resetEmbeddingProvider();

    const disabledProvider = getEmbeddingProvider();
    assertEqual(
      disabledProvider.name,
      'none',
      'Test 1a: Default missing keys provider name is "none"',
    );
    assertEqual(disabledProvider.dimension, 0, 'Test 1b: Disabled provider dimension is 0');
    assert(
      disabledProvider instanceof DisabledEmbeddingProvider,
      'Test 1c: Provider is DisabledEmbeddingProvider',
    );
    console.log(
      '  ✅ Test 1: Default missing API key configuration yields DisabledEmbeddingProvider',
    );

    // -------------------------------------------------------------------------
    // Test 2: DisabledEmbeddingProvider methods throw EmbeddingUnavailableError
    // -------------------------------------------------------------------------
    let threwError = false;
    try {
      await disabledProvider.generateEmbedding('hello world');
    } catch (err) {
      threwError = err instanceof EmbeddingUnavailableError;
    }
    assert(threwError, 'Test 2a: generateEmbedding throws EmbeddingUnavailableError');

    let batchThrewError = false;
    try {
      await disabledProvider.generateBatchEmbeddings(['hello']);
    } catch (err) {
      batchThrewError = err instanceof EmbeddingUnavailableError;
    }
    assert(batchThrewError, 'Test 2b: generateBatchEmbeddings throws EmbeddingUnavailableError');
    console.log(
      '  ✅ Test 2: DisabledEmbeddingProvider methods throw EmbeddingUnavailableError explicitly',
    );

    // -------------------------------------------------------------------------
    // Test 3: OpenAI provider selection when OPENAI_API_KEY is set
    // -------------------------------------------------------------------------
    delete process.env['EMBEDDING_PROVIDER'];
    process.env['OPENAI_API_KEY'] = 'sk-test-openai-key-fake';
    delete process.env['GEMINI_API_KEY'];
    resetEmbeddingProvider();

    const openaiProvider = getEmbeddingProvider();
    assertEqual(
      openaiProvider.name,
      'openai',
      'Test 3a: OpenAI provider selected with OPENAI_API_KEY',
    );
    assert(
      openaiProvider instanceof OpenAIEmbeddingProvider,
      'Test 3b: Provider is OpenAIEmbeddingProvider',
    );
    console.log('  ✅ Test 3: OpenAI provider selected when OPENAI_API_KEY is present');

    // -------------------------------------------------------------------------
    // Test 4: Gemini provider selection when GEMINI_API_KEY is set
    // -------------------------------------------------------------------------
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['OPENAI_API_KEY'];
    process.env['GEMINI_API_KEY'] = 'AIzaSyTestGeminiKeyFake';
    resetEmbeddingProvider();

    const geminiProvider = getEmbeddingProvider();
    assertEqual(
      geminiProvider.name,
      'gemini',
      'Test 4a: Gemini provider selected with GEMINI_API_KEY',
    );
    assert(
      geminiProvider instanceof GeminiEmbeddingProvider,
      'Test 4b: Provider is GeminiEmbeddingProvider',
    );
    console.log('  ✅ Test 4: Gemini provider selected when GEMINI_API_KEY is present');

    // -------------------------------------------------------------------------
    // Test 5: Explicit EMBEDDING_PROVIDER=mock selects LocalDeterministicEmbeddingProvider
    // -------------------------------------------------------------------------
    process.env['EMBEDDING_PROVIDER'] = 'mock';
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    resetEmbeddingProvider();

    const mockProvider = getEmbeddingProvider();
    assertEqual(
      mockProvider.name,
      'local-deterministic',
      'Test 5a: Mock provider selected explicitly',
    );
    assert(
      mockProvider instanceof LocalDeterministicEmbeddingProvider,
      'Test 5b: Instance is LocalDeterministic',
    );
    console.log(
      '  ✅ Test 5: Explicit EMBEDDING_PROVIDER=mock selects LocalDeterministicEmbeddingProvider',
    );

    // -------------------------------------------------------------------------
    // Test 6: Explicit EMBEDDING_PROVIDER=openai without key throws configuration error
    // -------------------------------------------------------------------------
    process.env['EMBEDDING_PROVIDER'] = 'openai';
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    resetEmbeddingProvider();

    let openAiKeyError = false;
    try {
      getEmbeddingProvider();
    } catch (err: any) {
      openAiKeyError = err?.message?.includes('OPENAI_API_KEY');
    }
    assert(openAiKeyError, 'Test 6: Requesting openai without key throws configuration error');
    console.log(
      '  ✅ Test 6: Requesting explicit provider without API key throws configuration error',
    );

    // -------------------------------------------------------------------------
    // Setup Database Test Fixtures
    // -------------------------------------------------------------------------
    restoreEnv();

    // Clear existing test fixtures if present
    await prisma.chatMessage.deleteMany({ where: { session: { repositoryId: TEST_REPO_ID } } });
    await prisma.chatSession.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.codeChunk.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.repositoryFile.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.repository.deleteMany({ where: { id: TEST_REPO_ID } });

    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'reliability-test@forgemind.dev',
        name: 'Reliability Test User',
      },
    });

    await prisma.repository.create({
      data: {
        id: TEST_REPO_ID,
        userId: TEST_USER_ID,
        githubId: 888801,
        name: 'reliability-test-repo',
        owner: 'test-org',
        fullName: 'test-org/reliability-test-repo',
        htmlUrl: 'https://github.com/test-org/reliability-test-repo',
        private: false,
      },
    });

    await prisma.repositoryFile.create({
      data: {
        id: TEST_FILE_ID,
        repositoryId: TEST_REPO_ID,
        path: 'src/auth/jwt.service.ts',
        name: 'jwt.service.ts',
        language: 'TypeScript',
        size: 500,
        sha: 'hash-1',
      },
    });

    // -------------------------------------------------------------------------
    // Test 7: File chunking when provider is disabled ("none")
    // -------------------------------------------------------------------------
    delete process.env['EMBEDDING_PROVIDER'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];
    resetEmbeddingProvider();

    const chunkResult = await processAndStoreFileChunks(
      TEST_REPO_ID,
      TEST_FILE_ID,
      'src/auth/jwt.service.ts',
      `export function verifyJwtToken(token: string): boolean {
  if (!token) return false;
  return token.startsWith('Bearer ');
}`,
      'TypeScript',
      [],
      500,
    );

    assertEqual(chunkResult.chunksCreated, 1, 'Test 7a: Chunk is created');
    assertEqual(
      chunkResult.embeddingsGenerated,
      0,
      'Test 7b: Zero embeddings generated when provider is disabled',
    );

    const dbChunks = await prisma.codeChunk.findMany({ where: { fileId: TEST_FILE_ID } });
    assertEqual(dbChunks.length, 1, 'Test 7c: DB code chunk saved');
    console.log(
      '  ✅ Test 7: Chunk persistence saves code chunks with NULL embedding when provider is disabled',
    );

    // -------------------------------------------------------------------------
    // Test 8: Vector search gracefully falls back to lexical search when provider is disabled
    // -------------------------------------------------------------------------
    const searchResults = await searchSemanticCodeChunks(TEST_REPO_ID, 'verifyJwtToken auth');
    assert(searchResults.length >= 1, 'Test 8a: Lexical match returned candidates');
    assertEqual(
      searchResults[0]?.filePath,
      'src/auth/jwt.service.ts',
      'Test 8b: Matched target file path',
    );
    console.log(
      '  ✅ Test 8: Vector search safely bypasses pgvector query and falls back to lexical search',
    );

    // -------------------------------------------------------------------------
    // Test 9: Vector status reports provider: "none" and embeddedChunks: 0
    // -------------------------------------------------------------------------
    const vectorStatus = await getVectorPipelineStatus(TEST_REPO_ID);
    assertEqual(vectorStatus.provider, 'none', 'Test 9a: Pipeline status provider is "none"');
    assertEqual(vectorStatus.totalChunks, 1, 'Test 9b: Total chunks is 1');
    assertEqual(vectorStatus.embeddedChunks, 0, 'Test 9c: Embedded chunks count is 0');
    console.log(
      '  ✅ Test 9: Vector pipeline status accurately reports provider: "none" and 0 embedded chunks',
    );

    // -------------------------------------------------------------------------
    // Test 10: RAG Query executes successfully with lexical context when provider is disabled
    // -------------------------------------------------------------------------
    process.env['LLM_PROVIDER'] = 'mock';

    const ragResponse = await executeRAGQuery(
      TEST_REPO_ID,
      TEST_USER_ID,
      'How does verifyJwtToken work?',
    );
    assert(ragResponse.answer.length > 0, 'Test 10a: RAG response contains synthesized answer');
    assert(ragResponse.sources.length > 0, 'Test 10b: Sources cited from lexical retrieval');
    assertEqual(
      ragResponse.sources[0]?.filePath,
      'src/auth/jwt.service.ts',
      'Test 10c: Correct source file cited',
    );
    console.log(
      '  ✅ Test 10: RAG query synthesizes answer using retrieved lexical context when embeddings are unavailable',
    );

    // Clean up test DB data
    await prisma.chatMessage.deleteMany({ where: { session: { repositoryId: TEST_REPO_ID } } });
    await prisma.chatSession.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.codeChunk.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.repositoryFile.deleteMany({ where: { repositoryId: TEST_REPO_ID } });
    await prisma.repository.deleteMany({ where: { id: TEST_REPO_ID } });

    console.log('\n🎉 ALL VECTOR SEARCH & RAG RELIABILITY TESTS PASSED PERFECTLY!\n');
  } finally {
    restoreEnv();
  }
}

main().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
