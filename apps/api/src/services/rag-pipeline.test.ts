/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — RAG Pipeline Regression Test Suite (v3)
// =============================================================================
// 24 scenarios:
//
//  Section A — Intent detection (tests 1–5)
//  Section B — Retrieval scoring / source-type ranking (tests 6–10)
//  Section C — Technology-specificity gate (tests 11–18)
//    — includes Docker-compose-comment false-positive regression
//    — includes genuine Redis-evidence positive test
//  Section D — Positive queries including flow synthesis (tests 19–24)
// =============================================================================

import { analyzeQueryIntent } from './query-intent.service.js';
import { calculateChunkHybridScore } from './context-retrieval.service.js';
import { buildRAGPrompt } from './rag-prompt.service.js';
import { LocalDeterministicLLMProvider } from './llm/deterministic-mock.provider.js';
import type { VectorSearchResult } from '@forgemind/types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`[Assertion Failed] ${message}`);
}

function assertIncludes(text: string, needle: string, label: string): void {
  assert(
    text.includes(needle),
    `${label} — expected "${needle}" in answer:\n${text.substring(0, 300)}`,
  );
}

function assertExcludes(text: string, needle: string, label: string): void {
  assert(
    !text.includes(needle),
    `${label} — must NOT contain "${needle}" in answer:\n${text.substring(0, 300)}`,
  );
}

// ── Shared test helpers ────────────────────────────────────────────────────────

const provider = new LocalDeterministicLLMProvider();

/** Build a minimal system-prompt containing one source block. */
function singleSourcePrompt(filePath: string, content: string, symbol?: string): string {
  const symbolPart = symbol ? ` | Symbol: ${symbol}` : '';
  return [
    'You are ForgeMind AI...',
    '=== RETRIEVED REPOSITORY CODE CONTEXT ===',
    `[SOURCE 1] File: ${filePath} (Lines 1-30)${symbolPart}`,
    '```ts',
    content,
    '```',
    '=========================================',
  ].join('\n');
}

/** Build a multi-source system prompt from an array of [filePath, content, symbol?] tuples. */
function multiSourcePrompt(
  sources: Array<{ file: string; content: string; symbol?: string }>,
): string {
  const lines: string[] = ['You are ForgeMind AI...', '=== RETRIEVED REPOSITORY CODE CONTEXT ==='];
  sources.forEach(({ file, content, symbol }, i) => {
    const symbolPart = symbol ? ` | Symbol: ${symbol}` : '';
    lines.push(`[SOURCE ${i + 1}] File: ${file} (Lines 1-30)${symbolPart}`);
    lines.push('```ts');
    lines.push(content);
    lines.push('```');
    if (i < sources.length - 1) lines.push('\n---\n');
  });
  lines.push('=========================================');
  return lines.join('\n');
}

// =============================================================================
// SECTION A — Intent Detection (tests 1–5)
// =============================================================================

async function runSectionA(): Promise<void> {
  // Test 1: auth → AUTHENTICATION
  {
    const intent = analyzeQueryIntent('Where is authentication handled?');
    assert(intent.category === 'AUTHENTICATION', `Expected AUTHENTICATION, got ${intent.category}`);
    console.log('  ✅ Test 1: "Where is authentication handled?" → AUTHENTICATION intent');
  }

  // Test 2: "what happens when" → NOT swallowed by GENERAL (must be AST_ANALYSIS)
  {
    const intent = analyzeQueryIntent('What happens when I run AST analysis?');
    assert(intent.category === 'AST_ANALYSIS', `Expected AST_ANALYSIS, got ${intent.category}`);
    console.log('  ✅ Test 2: "What happens when I run AST analysis?" → AST_ANALYSIS intent');
  }

  // Test 3: "Where is the database connection configured?" → DB_CONFIGURATION
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');
    assert(
      intent.category === 'DB_CONFIGURATION',
      `Expected DB_CONFIGURATION, got ${intent.category}`,
    );
    assert(intent.isConfigurationQuery === true, 'Expected isConfigurationQuery = true');
    assert(
      (intent.lowQualityPathPatterns ?? []).includes('migrations'),
      'Expected migrations in lowQualityPathPatterns',
    );
    console.log(
      '  ✅ Test 3: "database connection configured" → DB_CONFIGURATION + isConfigurationQuery',
    );
  }

  // Test 4: GitHub sync → GITHUB_SYNC
  {
    const intent = analyzeQueryIntent('How does GitHub repository synchronization work?');
    assert(intent.category === 'GITHUB_SYNC', `Expected GITHUB_SYNC, got ${intent.category}`);
    console.log('  ✅ Test 4: "GitHub repository synchronization" → GITHUB_SYNC');
  }

  // Test 5: Trace auth flow → FLOW with auth pathHints
  {
    const intent = analyzeQueryIntent(
      'Trace the complete authentication flow from frontend to API endpoint.',
    );
    assert(intent.category === 'FLOW', `Expected FLOW, got ${intent.category}`);
    assert(
      intent.pathHints.some((h) => ['auth', 'middleware'].includes(h)),
      'Expected auth pathHints',
    );
    console.log('  ✅ Test 5: "Trace authentication flow" → FLOW intent with auth pathHints');
  }
}

// =============================================================================
// SECTION B — Retrieval Scoring / Source-type Ranking (tests 6–10)
// =============================================================================

async function runSectionB(): Promise<void> {
  // Test 6: DB_CONFIGURATION — schema.prisma outscores migration.sql
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');
    const schemaChunk: VectorSearchResult = {
      id: 'c-schema',
      repositoryId: 'r1',
      fileId: 'f1',
      chunkIndex: 0,
      content:
        'datasource db { provider = "postgresql" url = env("DATABASE_URL") directUrl = env("DIRECT_URL") }',
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
      id: 'c-mig',
      repositoryId: 'r1',
      fileId: 'f2',
      chunkIndex: 0,
      content: 'CREATE TABLE "users" ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );',
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
      `schema.prisma (${scoreSchema}) must outscore migration (${scoreMigration})`,
    );
    assert(scoreMigration <= 0.4, `Migration score (${scoreMigration}) must be ≤ 0.40`);
    console.log(
      `  ✅ Test 6: schema.prisma (${scoreSchema}) > migration.sql (${scoreMigration}), cap ≤ 0.40`,
    );
  }

  // Test 7: DB_CONFIGURATION — env.ts outscores migration DDL
  {
    const intent = analyzeQueryIntent('Where is the database connection configured?');
    const envChunk: VectorSearchResult = {
      id: 'c-env',
      repositoryId: 'r1',
      fileId: 'f3',
      chunkIndex: 0,
      content:
        "export const env = { DATABASE_URL: optionalEnv('DATABASE_URL', ''), DIRECT_URL: optionalEnv('DIRECT_URL', '') };",
      filePath: 'apps/api/src/config/env.ts',
      language: 'typescript',
      startLine: 24,
      endLine: 27,
      tokenCount: 30,
      linesCount: 4,
      similarity: 0.45,
      metadata: null,
    };
    const migChunk: VectorSearchResult = {
      id: 'c-mig2',
      repositoryId: 'r1',
      fileId: 'f4',
      chunkIndex: 0,
      content: 'ALTER TABLE "repositories" ADD COLUMN status TEXT;',
      filePath: 'apps/api/prisma/migrations/20260807000000_update/migration.sql',
      language: 'sql',
      startLine: 1,
      endLine: 5,
      tokenCount: 20,
      linesCount: 5,
      similarity: 0.5,
      metadata: null,
    };
    const scoreEnv = calculateChunkHybridScore(envChunk, intent);
    const scoreMig = calculateChunkHybridScore(migChunk, intent);
    assert(scoreEnv > scoreMig, `env.ts (${scoreEnv}) must outscore migration DDL (${scoreMig})`);
    console.log(`  ✅ Test 7: env.ts (${scoreEnv}) > migration DDL (${scoreMig})`);
  }

  // Test 8: AUTHENTICATION — auth.middleware.ts outscores footer.tsx
  {
    const intent = analyzeQueryIntent('Where is authentication handled?');
    const authChunk: VectorSearchResult = {
      id: 'c-auth',
      repositoryId: 'r1',
      fileId: 'f5',
      chunkIndex: 0,
      content: 'export function verifyToken(req, res, next) { /* verify JWT */ }',
      filePath: 'apps/api/src/auth/middleware.ts',
      language: 'typescript',
      startLine: 1,
      endLine: 20,
      tokenCount: 50,
      linesCount: 20,
      similarity: 0.5,
      metadata: { symbolName: 'verifyToken', symbolKind: 'function' },
    };
    const footerChunk: VectorSearchResult = {
      id: 'c-footer',
      repositoryId: 'r1',
      fileId: 'f6',
      chunkIndex: 0,
      content: 'export function Footer() { return <footer>Footer</footer>; }',
      filePath: 'apps/web/src/components/footer.tsx',
      language: 'typescript',
      startLine: 1,
      endLine: 15,
      tokenCount: 40,
      linesCount: 15,
      similarity: 0.4,
      metadata: { symbolName: 'Footer', symbolKind: 'function' },
    };
    const scoreAuth = calculateChunkHybridScore(authChunk, intent);
    const scoreFooter = calculateChunkHybridScore(footerChunk, intent);
    assert(
      scoreAuth > scoreFooter,
      `auth middleware (${scoreAuth}) must outscore footer (${scoreFooter})`,
    );
    console.log(`  ✅ Test 8: auth/middleware.ts (${scoreAuth}) > footer.tsx (${scoreFooter})`);
  }

  // Test 9: AUTHENTICATION — auth.middleware.ts outscores AuthCard.tsx in provider scoring
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'apps/web/src/components/ui/AuthCard.tsx',
          content:
            'interface AuthCardProps { children: React.ReactNode; } export function AuthCard({ children }: AuthCardProps) { return <div>{children}</div>; }',
          symbol: 'AuthCard (function)',
        },
        {
          file: 'apps/api/src/auth/middleware.ts',
          content:
            'export function requireAuth(req: Request, res: Response, next: NextFunction) { const token = req.headers.authorization; verifyToken(token, next); }',
          symbol: 'requireAuth (function)',
        },
        {
          file: 'apps/api/src/auth/service.ts',
          content:
            'export class AuthService { async validateSession(token: string) { return supabase.auth.getUser(token); } }',
          symbol: 'AuthService (class)',
        },
      ]),
      'User Question: Where is authentication handled?',
    );
    assertIncludes(answer, 'apps/api/src/auth/middleware.ts', 'Test 9: must cite middleware.ts');
    assertExcludes(
      answer,
      'centered in `apps/web/src/components/ui/AuthCard.tsx`',
      'Test 9: must not center on AuthCard.tsx',
    );
    console.log(
      '  ✅ Test 9: "Where is authentication handled?" → selects auth/middleware.ts over AuthCard.tsx',
    );
  }

  // Test 10: DB_CONFIGURATION — docker-compose.yml is demoted below schema.prisma
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'docker-compose.yml',
          content:
            'services:\n  api:\n    environment:\n      DATABASE_URL: ${DATABASE_URL:-}\n      DIRECT_URL: ${DIRECT_URL:-}',
        },
        {
          file: 'apps/api/prisma/schema.prisma',
          content:
            'datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n  directUrl = env("DIRECT_URL")\n}',
        },
      ]),
      'User Question: Where is the database connection configured?',
    );
    // schema.prisma must be cited; docker-compose must NOT be the primary
    assertIncludes(answer, 'schema.prisma', 'Test 10: must cite schema.prisma');
    assertExcludes(
      answer,
      'centered in `docker-compose.yml`',
      'Test 10: must not center on docker-compose.yml',
    );
    console.log('  ✅ Test 10: DB config → schema.prisma preferred over docker-compose.yml');
  }
}

// =============================================================================
// SECTION C — Technology-specificity Gate (tests 11–18)
// =============================================================================

async function runSectionC(): Promise<void> {
  // Test 11: Redis — generic "cache" / cachedLLMProvider is NOT Redis evidence → refuse
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'apps/api/src/services/llm/factory.ts',
          content:
            'let cachedLLMProvider: LLMProvider | null = null;\nexport function getLLMProvider(): LLMProvider {\n  if (cachedLLMProvider) return cachedLLMProvider;\n  cachedLLMProvider = new LocalDeterministicLLMProvider();\n  return cachedLLMProvider;\n}',
          symbol: 'getLLMProvider (function)',
        },
        {
          file: 'apps/api/src/services/embeddings/factory.ts',
          content:
            'let cachedProvider: EmbeddingProvider | null = null;\nexport function getEmbeddingProvider(): EmbeddingProvider {\n  if (cachedProvider) return cachedProvider;\n  cachedProvider = new LocalDeterministicEmbeddingProvider();\n  return cachedProvider;\n}',
          symbol: 'getEmbeddingProvider (function)',
        },
      ]),
      'User Question: Where is the Redis cache implementation?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 11: must refuse Redis',
    );
    assertExcludes(
      answer,
      'cachedLLMProvider',
      'Test 11: must not cite cachedLLMProvider as Redis',
    );
    assertExcludes(answer, 'cachedProvider', 'Test 11: must not cite cachedProvider as Redis');
    console.log(
      '  ✅ Test 11: Redis query + cachedLLMProvider only → refusal (cachedProvider ≠ Redis)',
    );
  }

  // Test 12: Redis — docker-compose.yml comment "redis (future)" is NOT Redis evidence
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'docker-compose.yml',
        '# Development environment: web, api, postgres, redis (future)\nservices:\n  api:\n    image: forgemind-api',
      ),
      'User Question: Where is the Redis cache implementation?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 12: docker-compose redis comment must not count as evidence',
    );
    console.log("  ✅ Test 12: Redis query + docker-compose comment 'redis (future)' → refusal");
  }

  // Test 13: Redis — genuine Redis implementation → positive answer
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/src/services/cache/redis.service.ts',
        "import Redis from 'ioredis';\nexport class RedisCacheService {\n  private client: Redis;\n  constructor() { this.client = new Redis({ host: process.env.REDIS_HOST }); }\n  async get(key: string) { return this.client.get(key); }\n}",
        'RedisCacheService (class)',
      ),
      'User Question: Where is the Redis cache implementation?',
    );
    assertExcludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 13: genuine Redis must produce positive answer',
    );
    assertIncludes(answer, 'redis.service.ts', 'Test 13: must cite redis.service.ts');
    console.log(
      '  ✅ Test 13: Redis query + genuine ioredis implementation → positive answer with citation',
    );
  }

  // Test 14: Kafka — must refuse
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/src/services/repository-sync.service.ts',
        'export async function syncRepositories() { /* sync logic */ }',
      ),
      'User Question: Where is the Kafka consumer implementation?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 14: Kafka must refuse',
    );
    console.log("  ✅ Test 14: 'Where is the Kafka consumer implementation?' → safe refusal");
  }

  // Test 15: Kubernetes — must refuse
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/src/config/env.ts',
        "export const env = { NODE_ENV: 'development', PORT: 4000 };",
      ),
      'User Question: Where is the Kubernetes controller implementation?',
    );
    assertIncludes(answer, "couldn't find sufficiently relevant code", 'Test 15: K8s must refuse');
    console.log(
      "  ✅ Test 15: 'Where is the Kubernetes controller implementation?' → safe refusal",
    );
  }

  // Test 16: MongoDB — must refuse (repo uses PostgreSQL/Prisma)
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/prisma/schema.prisma',
        'datasource db { provider = "postgresql" url = env("DATABASE_URL") }',
      ),
      'User Question: Where is the MongoDB connection configured?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 16: MongoDB must refuse',
    );
    console.log("  ✅ Test 16: 'Where is the MongoDB connection configured?' → safe refusal");
  }

  // Test 17: GraphQL — must refuse
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/src/routes/repository.routes.ts',
        "router.get('/repositories', requireAuth, listRepositories);",
      ),
      'User Question: Where is the GraphQL server implementation?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 17: GraphQL must refuse',
    );
    console.log("  ✅ Test 17: 'Where is the GraphQL server implementation?' → safe refusal");
  }

  // Test 18: Redis with factory.ts AND docker-compose together — still refuses
  // (neither source contains Redis-specific implementation signals)
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'docker-compose.yml',
          content:
            '# Development environment: web, api, postgres, redis (future)\nservices:\n  api:\n    environment:\n      DATABASE_URL: ${DATABASE_URL:-}',
        },
        {
          file: 'apps/api/src/services/llm/factory.ts',
          content:
            'let cachedLLMProvider: LLMProvider | null = null;\nexport function getLLMProvider() { return cachedLLMProvider ?? new LocalDeterministicLLMProvider(); }',
        },
      ]),
      'User Question: Where is the Redis cache implementation?',
    );
    assertIncludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 18: docker-compose comment + cachedLLMProvider still refuses',
    );
    console.log(
      '  ✅ Test 18: Redis query + docker-compose comment + cachedLLMProvider → refusal (infra comment ≠ impl evidence)',
    );
  }
}

// =============================================================================
// SECTION D — Positive Queries Including Flow Synthesis (tests 19–24)
// =============================================================================

async function runSectionD(): Promise<void> {
  // Test 19: "What happens when I run AST analysis?" → flow synthesis, multi-step
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'apps/api/src/services/analysis-job.service.ts',
          content:
            'export async function runAnalysisJob(repositoryId: string) { await triggerRepositoryAnalysis(repositoryId); }',
          symbol: 'runAnalysisJob (function)',
        },
        {
          file: 'apps/api/src/services/ast-parser.service.ts',
          content:
            'export async function parseSourceFile(filePath: string) { const ast = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true); return ast; }',
          symbol: 'parseSourceFile (function)',
        },
        {
          file: 'apps/api/src/services/symbol-extraction.service.ts',
          content:
            'export async function extractAndIndexFileSymbols(ast: ts.SourceFile, repositoryId: string) { /* walk AST, persist symbols */ }',
          symbol: 'extractAndIndexFileSymbols (function)',
        },
        {
          file: 'apps/web/src/lib/analysis.api.ts',
          content:
            "export async function triggerAnalysis(repoId: string) { return api.post('/repositories/' + repoId + '/analysis'); }",
          symbol: 'triggerAnalysis (function)',
        },
      ]),
      'User Question: What happens when I run AST analysis?',
    );
    // Must produce a multi-step flow, not just a flat file list
    assertIncludes(answer, 'Step', 'Test 19: AST answer must contain flow Steps');
    assertExcludes(
      answer,
      "couldn't find sufficiently relevant code",
      'Test 19: must not refuse — evidence present',
    );
    assertIncludes(answer, 'ast-parser.service.ts', 'Test 19: must cite ast-parser.service.ts');
    console.log(
      "  ✅ Test 19: 'What happens when I run AST analysis?' → multi-step flow synthesis",
    );
  }

  // Test 20: "Trace the complete authentication flow" → flow synthesis
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'apps/web/src/hooks/useAuth.ts',
          content:
            'export function useAuth() { const [session] = useSession(); return { user: session?.user }; }',
          symbol: 'useAuth (function)',
        },
        {
          file: 'apps/api/src/auth/middleware.ts',
          content:
            'export async function requireAuth(req, res, next) { const token = req.headers.authorization; const user = await verifyToken(token); req.user = user; next(); }',
          symbol: 'requireAuth (function)',
        },
        {
          file: 'apps/api/src/routes/repository.routes.ts',
          content: "router.get('/repositories', requireAuth, listRepositories);",
        },
      ]),
      'User Question: Trace the complete authentication flow from the frontend request to the protected API endpoint.',
    );
    assertIncludes(answer, 'Step', 'Test 20: auth flow must contain Steps');
    assertExcludes(answer, "couldn't find sufficiently relevant code", 'Test 20: must not refuse');
    console.log("  ✅ Test 20: 'Trace authentication flow' → structured step-based answer");
  }

  // Test 21: DB config — migration-only context → correct schema.prisma/env.ts guidance
  {
    const answer = await provider.generateAnswer(
      singleSourcePrompt(
        'apps/api/prisma/migrations/20260806000000_init/migration.sql',
        'CREATE TABLE "users" ( id UUID PRIMARY KEY DEFAULT gen_random_uuid() );',
      ),
      'User Question: Where is the database connection configured?',
    );
    assertExcludes(
      answer,
      'centered in `apps/api/prisma/migrations',
      'Test 21: must NOT center on migration',
    );
    assertIncludes(answer, 'schema.prisma', 'Test 21: must reference schema.prisma');
    console.log(
      '  ✅ Test 21: DB config with migration-only evidence → cites schema.prisma/env.ts',
    );
  }

  // Test 22: GitHub sync intent maps correctly
  {
    const intent = analyzeQueryIntent('How does GitHub repository synchronization work?');
    assert(intent.category === 'GITHUB_SYNC', `Expected GITHUB_SYNC, got ${intent.category}`);
    console.log("  ✅ Test 22: 'GitHub synchronization' → GITHUB_SYNC intent");
  }

  // Test 23: Architecture query injects structural context
  {
    const intent = analyzeQueryIntent('Explain the repository architecture.');
    assert(intent.category === 'ARCHITECTURE', `Expected ARCHITECTURE, got ${intent.category}`);
    const prompt = buildRAGPrompt([], 'Explain repository architecture.', {
      structuralContext:
        'Repository: ForgeMind\nDirectories: /apps/api, /apps/web, /packages/types',
    });
    assertIncludes(
      prompt.systemPrompt,
      'REPOSITORY ARCHITECTURE & STRUCTURE SUMMARY',
      'Test 23: structural header',
    );
    assertIncludes(prompt.systemPrompt, '/apps/api', 'Test 23: must include directory details');
    console.log("  ✅ Test 23: 'Explain repository architecture' → structural context injected");
  }

  // Test 24: "Where is authentication handled?" — final synthesis check
  // Auth sources only: middleware outranks AuthCard even with same vector similarity
  {
    const answer = await provider.generateAnswer(
      multiSourcePrompt([
        {
          file: 'apps/web/src/components/ui/AuthCard.tsx',
          content:
            'interface AuthCardProps { title: string; children: React.ReactNode; }\nexport function AuthCard({ title, children }: AuthCardProps) { return <Card><CardHeader>{title}</CardHeader>{children}</Card>; }',
          symbol: 'AuthCard (function)',
        },
        {
          file: 'apps/api/src/auth/middleware.ts',
          content:
            'export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {\n  const authHeader = req.headers.authorization;\n  if (!authHeader) { res.status(401).json({ error: "Unauthorized" }); return; }\n  const token = authHeader.replace("Bearer ", "");\n  const { data, error } = await supabase.auth.getUser(token);\n  if (error || !data.user) { res.status(401).json({ error: "Invalid token" }); return; }\n  req.user = data.user;\n  next();\n}',
          symbol: 'requireAuth (function)',
        },
        {
          file: 'apps/api/src/routes/auth.ts',
          content:
            "router.get('/me', requireAuth, getProfile);\nrouter.post('/refresh', refreshToken);",
        },
        {
          file: 'apps/api/src/auth/service.ts',
          content:
            'export class AuthService { async validateSession(token: string) { return supabase.auth.getUser(token); } }',
          symbol: 'AuthService (class)',
        },
      ]),
      'User Question: Where is authentication handled?',
    );
    // Primary source MUST be a backend auth file, not AuthCard.tsx
    assertIncludes(
      answer,
      'apps/api/src/auth/middleware.ts',
      'Test 24: must cite middleware.ts as primary',
    );
    assertExcludes(
      answer,
      'centered in `apps/web/src/components/ui/AuthCard.tsx`',
      'Test 24: must NOT center on AuthCard.tsx',
    );
    assertExcludes(answer, "couldn't find sufficiently relevant code", 'Test 24: must not refuse');
    console.log(
      "  ✅ Test 24: 'Where is authentication handled?' → middleware.ts as primary, AuthCard.tsx demoted",
    );
  }
}

// =============================================================================
// Main runner
// =============================================================================

async function runAllTests(): Promise<void> {
  console.log('🧪 ForgeMind RAG Pipeline Regression Test Suite v3 — 24 scenarios\n');

  console.log('📋 Section A — Intent Detection (tests 1–5)');
  await runSectionA();

  console.log('\n📋 Section B — Retrieval Scoring / Source-type Ranking (tests 6–10)');
  await runSectionB();

  console.log('\n📋 Section C — Technology-specificity Gate (tests 11–18)');
  await runSectionC();

  console.log('\n📋 Section D — Positive Queries + Flow Synthesis (tests 19–24)');
  await runSectionD();

  console.log('\n🎉 ALL 24 REGRESSION TESTS PASSED SUCCESSFULLY!\n');
  console.log('Summary:');
  console.log('  Section A — Intent Detection:              Tests 1–5   (5 tests)');
  console.log('  Section B — Retrieval Scoring/Ranking:     Tests 6–10  (5 tests)');
  console.log('  Section C — Technology-specificity Gate:   Tests 11–18 (8 tests)');
  console.log('  Section D — Positive Queries + Flow:       Tests 19–24 (6 tests)');
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err.message ?? err);
  process.exit(1);
});
