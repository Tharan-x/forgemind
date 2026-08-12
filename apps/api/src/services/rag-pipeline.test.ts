/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — RAG Pipeline Retrieval & Reranking Test Suite (v2)
// =============================================================================
// Tests: 18 scenarios covering
//   • DB_CONFIGURATION vs migration discrimination
//   • 5 mandatory negative (non-existent technology) queries
//   • 6 mandatory positive queries
//   • FLOW / trace query intent
//   • Evidence quality labels
// =============================================================================

import { analyzeQueryIntent } from './query-intent.service.js';
import { calculateChunkHybridScore } from './context-retrieval.service.js';
import { buildRAGPrompt } from './rag-prompt.service.js';
import { LocalDeterministicLLMProvider } from './llm/deterministic-mock.provider.js';
import type { VectorSearchResult } from '@forgemind/types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

async function runRAGPipelineTests(): Promise<void> {
  console.log('🧪 Starting ForgeMind RAG Pipeline v2 Audit & Verification Suite...\n');

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION A: INTENT DETECTION
  // ─────────────────────────────────────────────────────────────────────────────

  // Test 1: "auth" maps to AUTHENTICATION
  {
    const intent = analyzeQueryIntent('auth');
    assert(intent.category === 'AUTHENTICATION', 'Expected AUTHENTICATION for "auth"');
    assert(intent.keywords.includes('auth'), 'Expected "auth" keyword');
    console.log('  ✅ Test 1: "auth" → AUTHENTICATION intent');
  }

  // Test 2: "Where is the database connection configured?" → DB_CONFIGURATION (NOT DATABASE)
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');
    assert(
      intent.category === 'DB_CONFIGURATION',
      `Expected DB_CONFIGURATION, got ${intent.category}`,
    );
    assert(intent.isConfigurationQuery === true, 'Expected isConfigurationQuery = true');
    assert(
      (intent.lowQualityPathPatterns ?? []).includes('migrations'),
      'Expected "migrations" in lowQualityPathPatterns',
    );
    console.log(
      '  ✅ Test 2: "database connection configured" → DB_CONFIGURATION (not general DATABASE)',
    );
  }

  // Test 3: "Trace the complete authentication flow" → FLOW
  {
    const intent = analyzeQueryIntent(
      'Trace the complete authentication flow from the frontend request to the protected API endpoint.',
    );
    assert(intent.category === 'FLOW', `Expected FLOW, got ${intent.category}`);
    assert(
      intent.pathHints.some((h) => ['auth', 'middleware', 'routes', 'controller'].includes(h)),
      'Expected auth-related pathHints for auth flow',
    );
    console.log('  ✅ Test 3: "Trace authentication flow" → FLOW intent with auth pathHints');
  }

  // Test 4: "prisma" → DATABASE or DB_CONFIGURATION
  {
    const intent = analyzeQueryIntent('prisma');
    assert(
      intent.category === 'DATABASE' || intent.category === 'DB_CONFIGURATION',
      `Expected DATABASE or DB_CONFIGURATION for "prisma", got ${intent.category}`,
    );
    console.log(`  ✅ Test 4: "prisma" → ${intent.category} intent`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION B: RETRIEVAL SCORING / DISCRIMINATION
  // ─────────────────────────────────────────────────────────────────────────────

  // Test 5: DB_CONFIGURATION — schema.prisma scores HIGHER than migration SQL
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');
    assert(intent.category === 'DB_CONFIGURATION', 'Pre-condition: must be DB_CONFIGURATION');

    const schemaChunk: VectorSearchResult = {
      id: 'chunk-schema',
      repositoryId: 'repo-1',
      fileId: 'file-schema',
      chunkIndex: 0,
      content:
        'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}',
      filePath: 'apps/api/prisma/schema.prisma',
      language: 'prisma',
      startLine: 9,
      endLine: 13,
      tokenCount: 30,
      linesCount: 5,
      similarity: 0.5,
      metadata: null,
    };

    const migrationChunk: VectorSearchResult = {
      id: 'chunk-migration',
      repositoryId: 'repo-1',
      fileId: 'file-migration',
      chunkIndex: 0,
      content:
        'CREATE TABLE "users" (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email TEXT NOT NULL UNIQUE\n);',
      filePath: 'apps/api/prisma/migrations/20260806000000_init/migration.sql',
      language: 'sql',
      startLine: 1,
      endLine: 20,
      tokenCount: 60,
      linesCount: 20,
      similarity: 0.5,
      metadata: null,
    };

    const scoreSchema = calculateChunkHybridScore(schemaChunk, intent);
    const scoreMigration = calculateChunkHybridScore(migrationChunk, intent);

    assert(
      scoreSchema > scoreMigration,
      `schema.prisma (${scoreSchema}) must outscore migration (${scoreMigration}) for DB_CONFIGURATION query`,
    );
    assert(scoreMigration <= 0.4, `Migration score (${scoreMigration}) must be capped at ≤0.40`);
    console.log(
      `  ✅ Test 5: DB_CONFIGURATION — schema.prisma (${scoreSchema}) > migration.sql (${scoreMigration}) ✓ cap enforced`,
    );
  }

  // Test 6: env.ts (DATABASE_URL binding) scores HIGHER than migration DDL for config query
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');

    const envChunk: VectorSearchResult = {
      id: 'chunk-env',
      repositoryId: 'repo-1',
      fileId: 'file-env',
      chunkIndex: 0,
      content:
        "export const env = {\n  DATABASE_URL: optionalEnv('DATABASE_URL', ''),\n  DIRECT_URL: optionalEnv('DIRECT_URL', ''),\n};",
      filePath: 'apps/api/src/config/env.ts',
      language: 'typescript',
      startLine: 24,
      endLine: 27,
      tokenCount: 30,
      linesCount: 4,
      similarity: 0.45,
      metadata: null,
    };

    const migrationChunk: VectorSearchResult = {
      id: 'chunk-migration2',
      repositoryId: 'repo-1',
      fileId: 'file-mig2',
      chunkIndex: 0,
      content: 'ALTER TABLE "repositories" ADD COLUMN status TEXT;',
      filePath: 'apps/api/prisma/migrations/20260807000000_update_repository/migration.sql',
      language: 'sql',
      startLine: 1,
      endLine: 5,
      tokenCount: 20,
      linesCount: 5,
      similarity: 0.5,
      metadata: null,
    };

    const scoreEnv = calculateChunkHybridScore(envChunk, intent);
    const scoreMigration = calculateChunkHybridScore(migrationChunk, intent);

    assert(
      scoreEnv > scoreMigration,
      `env.ts (${scoreEnv}) must outscore migration DDL (${scoreMigration})`,
    );
    console.log(
      `  ✅ Test 6: DB_CONFIGURATION — env.ts (${scoreEnv}) > migration DDL (${scoreMigration})`,
    );
  }

  // Test 7: auth middleware scores higher than unrelated footer for auth query
  {
    const intent = analyzeQueryIntent('Where is authentication handled?');
    assert(intent.category === 'AUTHENTICATION', 'Pre-condition: AUTHENTICATION');

    const authChunk: VectorSearchResult = {
      id: 'chunk-auth',
      repositoryId: 'repo-1',
      fileId: 'file-auth',
      chunkIndex: 0,
      content: 'export function verifyToken(req, res, next) { /* verify JWT */ }',
      filePath: 'apps/api/src/auth/auth.middleware.ts',
      language: 'typescript',
      startLine: 1,
      endLine: 20,
      tokenCount: 50,
      linesCount: 20,
      similarity: 0.5,
      metadata: { symbolName: 'verifyToken', symbolKind: 'function' },
    };

    const unrelatedChunk: VectorSearchResult = {
      id: 'chunk-footer',
      repositoryId: 'repo-1',
      fileId: 'file-footer',
      chunkIndex: 0,
      content: 'export function renderFooter() { return <footer>Footer</footer>; }',
      filePath: 'apps/web/src/components/footer.tsx',
      language: 'typescript',
      startLine: 1,
      endLine: 15,
      tokenCount: 40,
      linesCount: 15,
      similarity: 0.4,
      metadata: { symbolName: 'renderFooter', symbolKind: 'function' },
    };

    const scoreAuth = calculateChunkHybridScore(authChunk, intent);
    const scoreFooter = calculateChunkHybridScore(unrelatedChunk, intent);
    assert(
      scoreAuth > scoreFooter,
      `auth score (${scoreAuth}) must exceed footer (${scoreFooter})`,
    );
    assert(scoreAuth >= 0.2, `auth score (${scoreAuth}) must exceed 0.20 threshold`);
    console.log(`  ✅ Test 7: Auth middleware (${scoreAuth}) > footer.tsx (${scoreFooter})`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION C: MANDATORY NEGATIVE TESTS — non-existent technologies
  // Must produce safe refusal, NOT claim the repository implements these.
  // ─────────────────────────────────────────────────────────────────────────────

  const provider = new LocalDeterministicLLMProvider();

  const unrelatedSystemPrompt = (srcFile: string, srcContent: string) =>
    `You are ForgeMind AI...\n=== RETRIEVED REPOSITORY CODE CONTEXT ===\n[SOURCE 1] File: ${srcFile} (Lines 1-10)\n\`\`\`ts\n${srcContent}\n\`\`\`\n=========================================`;

  // Test 8: Redis — must refuse (CachedLLMProvider is NOT Redis)
  {
    const answer = await provider.generateAnswer(
      unrelatedSystemPrompt(
        'apps/api/src/services/llm/cached-llm.provider.ts',
        'export class CachedLLMProvider { private cache = new Map(); }',
      ),
      'User Question: Where is the Redis cache implementation?',
    );
    assert(
      answer.includes("couldn't find sufficiently relevant code"),
      `Redis query must refuse, got: ${answer.substring(0, 120)}`,
    );
    console.log("  ✅ Test 8: 'Where is the Redis cache implementation?' → safe refusal");
  }

  // Test 9: Kafka — must refuse
  {
    const answer = await provider.generateAnswer(
      unrelatedSystemPrompt(
        'apps/api/src/services/repository-sync.service.ts',
        'export async function syncRepositories() { /* sync logic */ }',
      ),
      'User Question: Where is the Kafka consumer implementation?',
    );
    assert(
      answer.includes("couldn't find sufficiently relevant code"),
      `Kafka query must refuse, got: ${answer.substring(0, 120)}`,
    );
    console.log("  ✅ Test 9: 'Where is the Kafka consumer implementation?' → safe refusal");
  }

  // Test 10: Kubernetes — must refuse
  {
    const answer = await provider.generateAnswer(
      unrelatedSystemPrompt(
        'apps/api/src/config/env.ts',
        "export const env = { NODE_ENV: 'development', PORT: 4000 };",
      ),
      'User Question: Where is the Kubernetes controller implementation?',
    );
    assert(
      answer.includes("couldn't find sufficiently relevant code"),
      `K8s query must refuse, got: ${answer.substring(0, 120)}`,
    );
    console.log(
      "  ✅ Test 10: 'Where is the Kubernetes controller implementation?' → safe refusal",
    );
  }

  // Test 11: MongoDB — must refuse (repo uses PostgreSQL/Prisma)
  {
    const answer = await provider.generateAnswer(
      unrelatedSystemPrompt(
        'apps/api/prisma/schema.prisma',
        'datasource db { provider = "postgresql" url = env("DATABASE_URL") }',
      ),
      'User Question: Where is the MongoDB connection configured?',
    );
    assert(
      answer.includes("couldn't find sufficiently relevant code"),
      `MongoDB query must refuse, got: ${answer.substring(0, 120)}`,
    );
    console.log("  ✅ Test 11: 'Where is the MongoDB connection configured?' → safe refusal");
  }

  // Test 12: GraphQL — must refuse
  {
    const answer = await provider.generateAnswer(
      unrelatedSystemPrompt(
        'apps/api/src/routes/repository.routes.ts',
        "router.get('/repositories', requireAuth, listRepositories);",
      ),
      'User Question: Where is the GraphQL server implementation?',
    );
    assert(
      answer.includes("couldn't find sufficiently relevant code"),
      `GraphQL query must refuse, got: ${answer.substring(0, 120)}`,
    );
    console.log("  ✅ Test 12: 'Where is the GraphQL server implementation?' → safe refusal");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION D: MANDATORY POSITIVE TESTS
  // ─────────────────────────────────────────────────────────────────────────────

  // Test 13: Auth query — selects auth.middleware.ts over footer
  {
    const systemPromptWithAuth = [
      'You are ForgeMind AI...',
      '=== RETRIEVED REPOSITORY CODE CONTEXT ===',
      '[SOURCE 1] File: apps/web/src/components/footer.tsx (Lines 1-10)',
      '```tsx',
      'export function Footer() { return <footer>Footer</footer>; }',
      '```',
      '',
      '---',
      '',
      '[SOURCE 2] File: apps/api/src/auth/auth.middleware.ts (Lines 1-20) | Symbol: verifyToken (function)',
      '```ts',
      'export function verifyToken(req, res, next) { /* auth verification logic */ }',
      '```',
      '=========================================',
    ].join('\n');

    const answer = await provider.generateAnswer(
      systemPromptWithAuth,
      'User Question: Where is authentication handled?',
    );
    assert(
      answer.includes('apps/api/src/auth/auth.middleware.ts'),
      'Must identify auth.middleware.ts',
    );
    assert(
      !answer.includes('centered in `apps/web/src/components/footer.tsx`'),
      'Must NOT claim footer.tsx is primary',
    );
    console.log(
      "  ✅ Test 13: 'Where is authentication handled?' → correctly selects auth.middleware.ts",
    );
  }

  // Test 14: DB configuration — migration-only context produces correct config-location answer
  {
    const migrationOnlyPrompt = [
      'You are ForgeMind AI...',
      '=== RETRIEVED REPOSITORY CODE CONTEXT ===',
      '[SOURCE 1] File: apps/api/prisma/migrations/20260806000000_init/migration.sql (Lines 1-20)',
      '```sql',
      'CREATE TABLE "users" ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );',
      '```',
      '=========================================',
    ].join('\n');

    const answer = await provider.generateAnswer(
      migrationOnlyPrompt,
      'User Question: Where is the database connection configured?',
    );
    // Must NOT claim the migration file IS the database connection config
    assert(
      !answer.includes('centered in `apps/api/prisma/migrations'),
      'Must NOT claim migration is the connection config',
    );
    // Must provide correct authoritative locations
    assert(
      answer.includes('schema.prisma') || answer.includes('env.ts'),
      `Must reference schema.prisma or env.ts, got: ${answer.substring(0, 200)}`,
    );
    console.log(
      '  ✅ Test 14: DB config with migration-only evidence → correctly cites schema.prisma/env.ts',
    );
  }

  // Test 15: GitHub sync intent
  {
    const intent = analyzeQueryIntent('How does GitHub repository synchronization work?');
    assert(intent.category === 'GITHUB_SYNC', `Expected GITHUB_SYNC, got ${intent.category}`);
    assert(
      intent.pathHints.includes('sync') || intent.pathHints.includes('github'),
      'Expected sync/github pathHints',
    );
    console.log("  ✅ Test 15: 'GitHub repository synchronization' → GITHUB_SYNC intent");
  }

  // Test 16: AST analysis intent
  {
    const intent = analyzeQueryIntent('What happens when I run AST analysis?');
    assert(intent.category === 'AST_ANALYSIS', `Expected AST_ANALYSIS, got ${intent.category}`);
    console.log("  ✅ Test 16: 'AST analysis' → AST_ANALYSIS intent");
  }

  // Test 17: Architecture query injects structural context
  {
    const intent = analyzeQueryIntent('Explain the repository architecture.');
    assert(intent.category === 'ARCHITECTURE', `Expected ARCHITECTURE, got ${intent.category}`);

    const prompt = buildRAGPrompt([], 'Explain repository architecture.', {
      structuralContext:
        'Repository: ForgeMind\nDirectories: /apps/api, /apps/web, /packages/types',
    });
    assert(
      prompt.systemPrompt.includes('REPOSITORY ARCHITECTURE & STRUCTURE SUMMARY'),
      'Prompt must include structural summary header',
    );
    assert(prompt.systemPrompt.includes('/apps/api'), 'Prompt must include directory details');
    console.log("  ✅ Test 17: 'Explain repository architecture' → injects structural context");
  }

  // Test 18: Authentication FLOW — answer describes interaction steps
  {
    const flowPrompt = [
      'You are ForgeMind AI...',
      '=== RETRIEVED REPOSITORY CODE CONTEXT ===',
      '[SOURCE 1] File: apps/web/src/hooks/useAuth.ts (Lines 1-30) | Symbol: useAuth (function)',
      '```ts',
      'export function useAuth() { /* supabase session hook */ }',
      '```',
      '',
      '---',
      '',
      '[SOURCE 2] File: apps/api/src/auth/auth.middleware.ts (Lines 1-40) | Symbol: requireAuth (function)',
      '```ts',
      'export async function requireAuth(req, res, next) { /* verify JWT token, call next() */ }',
      '```',
      '',
      '---',
      '',
      '[SOURCE 3] File: apps/api/src/routes/repository.routes.ts (Lines 5-30)',
      '```ts',
      "router.get('/repositories', requireAuth, listRepositories);",
      '```',
      '=========================================',
    ].join('\n');

    const answer = await provider.generateAnswer(
      flowPrompt,
      'User Question: Trace the complete authentication flow from the frontend request to the protected API endpoint.',
    );

    // FLOW answer must use step-based structure
    assert(answer.includes('Step'), 'FLOW answer must include numbered steps');
    // Must NOT refuse — auth evidence IS present
    assert(
      !answer.includes("I couldn't find sufficiently relevant code"),
      'FLOW answer must not refuse — auth evidence is present',
    );
    console.log("  ✅ Test 18: 'Trace authentication flow' → structured step-based answer");
  }

  console.log('\n🎉 ALL 18 RAG PIPELINE v2 SCENARIO TESTS PASSED SUCCESSFULLY!');
  console.log('\n📋 Summary:');
  console.log('  Section A — Intent Detection:        Tests 1–4   (4 tests)');
  console.log('  Section B — Retrieval Scoring:       Tests 5–7   (3 tests)');
  console.log('  Section C — Negative/Refusal:        Tests 8–12  (5 tests)');
  console.log('  Section D — Positive Queries:        Tests 13–18 (6 tests)');
}

runRAGPipelineTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
