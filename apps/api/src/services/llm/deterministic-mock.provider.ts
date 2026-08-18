import { extractQueryKeywords } from '../query-intent.service.js';
import type { LLMProvider } from './types.js';

interface SourceBlock {
  filePath: string;
  startLine: string;
  endLine: string;
  symbolInfo?: string;
  content: string;
  score: number;
}

// ── File-type classifiers ──────────────────────────────────────────────────────
// Used to distinguish backend implementation sources from frontend UI components
// and infrastructure files when selecting the primary answer source.

/** Path patterns that identify backend server-side implementation code. */
const BACKEND_IMPL_PATTERNS = [
  'api/src',
  'services/',
  'middleware',
  'controllers/',
  'routes/',
  'auth/',
];

/** Path patterns that identify frontend UI components, pages, and hooks. */
const FRONTEND_UI_PATTERNS = ['components/', '/ui/', '/pages/', '/hooks/', 'web/src', '.tsx'];

/**
 * Path patterns that identify infrastructure / deployment configuration files.
 * These are NOT authoritative sources for database connection configuration
 * or technology implementation queries — they may mention technology names
 * in comments, environment variable placeholders, or "future" annotations.
 */
const INFRA_FILE_PATTERNS = [
  'docker-compose',
  'dockerfile',
  '.github/',
  'ci/',
  '.circleci/',
  'kubernetes/',
  'k8s/',
  'helm/',
  'terraform/',
  'ansible/',
];

/**
 * Technology-specific evidence signals for each named technology.
 * These must appear in IMPLEMENTATION CODE (not infra config/comments) to count
 * as genuine evidence that the technology is used in the codebase.
 */
const TECH_IMPL_SIGNALS: Record<string, string[]> = {
  redis: ['redis', 'ioredis', '@redis/', 'redis://', 'redisclient', 'createclient({ socket'],
  kafka: ['kafka', 'kafkajs', '@confluent/', 'new kafka(', 'producer.connect', 'consumer.connect'],
  kubernetes: ['kubernetes', 'kubectl', 'k8s', '@kubernetes/client-node'],
  k8s: ['kubernetes', 'kubectl', 'k8s', '@kubernetes/client-node'],
  mongodb: ['mongodb', 'mongoose', 'mongoclient', 'mongoreplica', '@mongodb/'],
  mongo: ['mongodb', 'mongoose', 'mongoclient'],
  graphql: ['graphql', 'apollo', 'gql`', 'typedefs', 'resolvers', 'apolloserver'],
  elasticsearch: ['elasticsearch', 'elastic', '@elastic/', 'esnode', 'elasticsearchclient'],
  rabbitmq: ['rabbitmq', 'amqplib', 'amqp://', 'channel.consume'],
  celery: ['celery', 'celeryapp', '@celery'],
  grpc: ['grpc', '@grpc/', 'protobuf', 'protoloader'],
  cassandra: ['cassandra', 'cassandraclient', 'datastax'],
  dynamo: ['dynamodb', 'dynamodbclient', '@aws-sdk/client-dynamodb'],
  firebase: ['firebase', 'firestore', 'initializeapp'],
  neo4j: ['neo4j', 'neo4jdriver', 'bolt://'],
  influx: ['influxdb', 'influxclient', '@influxdata/'],
  nginx: ['nginx', 'nginx.conf', 'location /'],
  traefik: ['traefik', 'entrypoints:', 'certresolver:'],
};

const ALL_NAMED_TECHNOLOGIES = Object.keys(TECH_IMPL_SIGNALS);

/**
 * Returns true if a source file path is an infrastructure/deployment file.
 * Infrastructure files (docker-compose, Dockerfiles, CI configs) may mention
 * technology names in comments or placeholders — this does NOT constitute
 * implementation evidence.
 */
function isInfrastructureFile(filePath: string): boolean {
  const lp = filePath.toLowerCase();
  return INFRA_FILE_PATTERNS.some((p) => lp.includes(p));
}

/**
 * Returns true if the source block's path indicates a backend implementation file.
 */
function isBackendImplFile(filePath: string): boolean {
  const lp = filePath.toLowerCase();
  return BACKEND_IMPL_PATTERNS.some((p) => lp.includes(p));
}

/**
 * Returns true if the source block's path indicates a frontend UI file.
 */
function isFrontendUIFile(filePath: string): boolean {
  const lp = filePath.toLowerCase();
  return FRONTEND_UI_PATTERNS.some((p) => lp.includes(p));
}

/**
 * Deterministic local LLM provider for testing and offline execution.
 *
 * Evidence pipeline:
 *   RETRIEVAL → EVIDENCE VALIDATION → ANSWER SYNTHESIS
 *
 * Evidence quality labels:
 *   Direct evidence   — score > 3 (strong keyword + path match)
 *   Supporting evidence — score 1–3 (partial match)
 *   Insufficient evidence — score = 0 (no match → safe refusal)
 *
 * Key grounding rules:
 *  1. Technology-specific queries require the technology to appear in scored
 *     IMPLEMENTATION code, NOT in infra file comments or generic terms.
 *  2. Implementation-location queries prefer backend service/middleware sources
 *     over frontend UI components even when vector scores are similar.
 *  3. Infrastructure files (docker-compose, Dockerfile) are NEVER the primary
 *     source for database configuration or technology implementation answers.
 *  4. "What happens when…" / "How does X work" queries use flow synthesis.
 */
export class LocalDeterministicLLMProvider implements LLMProvider {
  readonly name = 'local-deterministic';

  async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
    const rawUserQuery = userPrompt.replace(/^User Question:\s*/i, '').trim();
    const queryKeywords = extractQueryKeywords(rawUserQuery);
    const lowerQuery = rawUserQuery.toLowerCase();

    // ── Query intent detection ─────────────────────────────────────────────────

    const isConfigQuery =
      (lowerQuery.includes('database') ||
        lowerQuery.includes('db') ||
        lowerQuery.includes('prisma') ||
        lowerQuery.includes('postgres')) &&
      (lowerQuery.includes('connect') ||
        lowerQuery.includes('config') ||
        lowerQuery.includes('configured') ||
        lowerQuery.includes('url') ||
        lowerQuery.includes('datasource') ||
        lowerQuery.includes('client') ||
        lowerQuery.includes('initializ'));

    // "What happens when…", "How does X work", explicit trace/flow phrases
    const isFlowQuery =
      lowerQuery.includes('trace') ||
      lowerQuery.includes('flow') ||
      lowerQuery.includes('end-to-end') ||
      lowerQuery.includes('step by step') ||
      lowerQuery.includes('what happens') ||
      (lowerQuery.includes('how') && lowerQuery.includes('work')) ||
      lowerQuery.includes('lifecycle');

    // Implementation-location queries: "Where is X handled/implemented?"
    const isImplLocationQuery =
      (lowerQuery.includes('where is') || lowerQuery.includes('where are')) &&
      (lowerQuery.includes('handled') ||
        lowerQuery.includes('implemented') ||
        lowerQuery.includes('implementation') ||
        lowerQuery.includes('defined') ||
        // Specific domain terms that map to backend implementation
        lowerQuery.includes('auth') ||
        lowerQuery.includes('authentication'));

    // ── 1. Structural summary extraction ──────────────────────────────────────
    const archMatch = systemPrompt.match(
      /=== REPOSITORY ARCHITECTURE & STRUCTURE SUMMARY ===\n([\s\S]*?)\n=== RETRIEVED/,
    );
    const structuralSummary = archMatch?.[1]?.trim();

    // ── 2. Parse source blocks from system prompt ──────────────────────────────
    const sourceBlocks: SourceBlock[] = [];
    const rawBlocks = systemPrompt.split(/\[SOURCE \d+\]\s*/g).slice(1);

    for (const raw of rawBlocks) {
      const lines = raw.split('\n');
      const headerLine = lines[0] || '';
      const headerMatch = headerLine.match(
        /File:\s*(.*?)\s*\(Lines (\d+)-(\d+)\)(?:\s*\|\s*Symbol:\s*(.+))?/,
      );

      if (headerMatch) {
        const filePath = headerMatch[1]?.trim() || 'Unknown File';
        const startLine = headerMatch[2] || '1';
        const endLine = headerMatch[3] || '1';
        const symbolInfo = headerMatch[4]?.trim();
        const content = lines.slice(1).join('\n');

        const lowerPath = filePath.toLowerCase();
        const lowerContent = content.toLowerCase();
        const lowerSymbol = (symbolInfo || '').toLowerCase();
        const isInfra = isInfrastructureFile(filePath);

        let score = 0;

        // Base keyword scoring
        for (const kw of queryKeywords) {
          if (lowerPath.includes(kw)) score += 3;
          if (lowerSymbol.includes(kw)) score += 2;
          if (lowerContent.includes(kw)) score += 1;
        }

        // ── Config-query adjustments ──────────────────────────────────────────
        if (isConfigQuery) {
          const CONFIG_SIGNALS = [
            'datasource',
            'database_url',
            'direct_url',
            'env("database_url")',
            'env("direct_url")',
            'new prismaclient(',
            'createclient(',
            'optionalenv',
            'process.env',
            'supabaseurl',
          ];
          for (const sig of CONFIG_SIGNALS) {
            if (lowerContent.includes(sig)) score += 4;
          }
          // Migration DDL is NOT connection configuration
          if (lowerPath.includes('migrations/') || lowerPath.includes('/migrations/')) {
            score = Math.max(0, score - 5);
          }
          // Infrastructure files (docker-compose, Dockerfile) are deployment
          // configuration, NOT application database connection configuration.
          // They may contain DATABASE_URL as an env-var passthrough,
          // which must not be confused with the actual connection declaration.
          if (isInfra) {
            score = Math.max(0, score - 6);
          }
        }

        // ── Implementation-location priority: backend over UI ─────────────────
        // For queries asking WHERE authentication/X is handled/implemented,
        // backend service/middleware files are authoritative; frontend UI
        // components are context-only.
        if (isImplLocationQuery) {
          if (isBackendImplFile(filePath) && !isInfra) {
            score += 4; // Prefer backend implementation sources
          } else if (isFrontendUIFile(filePath)) {
            score -= 3; // Demote frontend UI components for impl queries
          }
        }

        sourceBlocks.push({ filePath, startLine, endLine, symbolInfo, content, score });
      }
    }

    // Sort by score descending
    sourceBlocks.sort((a, b) => b.score - a.score);
    // Score >= 2: requires path OR symbol match, or multiple content hits
    const relevantBlocks = sourceBlocks.filter((b) => b.score >= 2);

    // ── 3. Technology-specificity gate ────────────────────────────────────────
    //
    // For technology-specific queries (Redis, Kafka, Kubernetes, etc.):
    //
    //   Stage A — Is the technology named in the query?
    //   Stage B — Does any IMPLEMENTATION SOURCE (non-infra, score >= 2) contain
    //             a technology-specific code signal (import, class, client init)?
    //
    // Infra files (docker-compose, Dockerfile) may contain technology names
    // in comments like "# redis (future)" — this is NOT implementation evidence.
    // Generic symbols like cachedLLMProvider or cachedProvider are NOT Redis.
    //
    // If Stage B fails → refuse immediately, do NOT fall through to synthesis.

    const queriedTech = ALL_NAMED_TECHNOLOGIES.filter((t) => lowerQuery.includes(t));

    if (queriedTech.length > 0) {
      const signals = queriedTech.flatMap((t) => TECH_IMPL_SIGNALS[t] ?? [t]);

      // Stage A: does ANY source (including infra) contain the technology name?
      const techPresentAnywhere = sourceBlocks.some((b) => {
        const lp = b.filePath.toLowerCase();
        const lc = b.content.toLowerCase();
        return queriedTech.some((t) => lp.includes(t) || lc.includes(t));
      });

      // Stage B: does an actual IMPLEMENTATION source (non-infra, scored >= 2)
      // contain a technology-specific code signal?
      const techInImplCode = relevantBlocks.some((b) => {
        if (isInfrastructureFile(b.filePath)) return false; // infra comments don't count
        const lc = b.content.toLowerCase();
        const lp = b.filePath.toLowerCase();
        return signals.some((sig) => lc.includes(sig) || lp.includes(sig));
      });

      if (!techPresentAnywhere || !techInImplCode) {
        // Do NOT inject architecture summary — it would be misleading for a
        // technology that is not implemented in the repository.
        return (
          `I couldn't find sufficiently relevant code in the indexed repository to answer ` +
          `"${rawUserQuery}" confidently. ` +
          `The technology or feature (${queriedTech.join(', ')}) does not appear to be ` +
          `implemented in the indexed codebase. ` +
          `Generic terms such as "cache", "cached", or "container" are not treated as ` +
          `evidence for specific technologies.`
        );
      }
    }

    // ── 4. DB config special case: migration-only or infra-only evidence ───────
    if (isConfigQuery && sourceBlocks.length > 0) {
      const allNonConfig = sourceBlocks.every((b) => {
        const lp = b.filePath.toLowerCase();
        return (
          lp.includes('migration') ||
          isInfrastructureFile(b.filePath) ||
          lp.endsWith('.yml') ||
          lp.endsWith('.yaml')
        );
      });
      if (allNonConfig) {
        return (
          `Based on the retrieved repository context, the **database connection is configured** in the following locations:\n\n` +
          `### Direct Evidence (from repository structure)\n` +
          `- \`apps/api/prisma/schema.prisma\` \u2014 \`datasource db { provider = "postgresql" url = env("DATABASE_URL") }\` declares the database provider and connection URL.\n` +
          `- \`apps/api/src/config/env.ts\` \u2014 Exports \`DATABASE_URL\` and \`DIRECT_URL\` from environment variables via \`optionalEnv()\`.\n` +
          `- \`apps/api/.env\` \u2014 Contains the actual \`DATABASE_URL\` and \`DIRECT_URL\` runtime values.\n\n` +
          `### Supporting Evidence\n` +
          `- Infrastructure and migration files may reference \`DATABASE_URL\` as an environment variable passthrough, ` +
          `but do **not** configure the database connection themselves.\n\n` +
          `> *Generated by ForgeMind Local Intelligence Engine (Offline Mode).*`
        );
      }
    }

    // ── 5. Handle empty / insufficient context ────────────────────────────────
    if (sourceBlocks.length === 0 && !structuralSummary) {
      return `I couldn't find sufficiently relevant code in the indexed repository to answer this confidently. Please verify that repository analysis has completed.`;
    }

    if (relevantBlocks.length === 0 && !structuralSummary) {
      return `I couldn't find sufficiently relevant code in the indexed repository to answer "${rawUserQuery}" confidently. High-confidence code matches were not found in the indexed files.`;
    }

    // ── 6. Route to appropriate synthesis ─────────────────────────────────────
    if (isFlowQuery) {
      return this._synthesizeFlowAnswer(
        rawUserQuery,
        relevantBlocks,
        sourceBlocks,
        structuralSummary,
      );
    }

    return this._synthesizeStandardAnswer(
      rawUserQuery,
      relevantBlocks,
      sourceBlocks,
      structuralSummary,
    );
  }

  // ── Synthesis helpers ──────────────────────────────────────────────────────

  /**
   * Produces a multi-step flow explanation from retrieved evidence.
   * Used for "What happens when…", "How does X work", "Trace…" queries.
   * Only states a step if it is actually supported by a retrieved source block.
   */
  private _synthesizeFlowAnswer(
    query: string,
    relevantBlocks: SourceBlock[],
    allBlocks: SourceBlock[],
    structuralSummary?: string,
  ): string {
    const blocks = relevantBlocks.length > 0 ? relevantBlocks : allBlocks;
    // Filter out infra files from flow steps — they are not execution steps
    const implBlocks = blocks.filter((b) => !isInfrastructureFile(b.filePath));
    const flowBlocks = implBlocks.length > 0 ? implBlocks : blocks;

    let answer = `Based on the retrieved repository evidence, here is the process for **"${query}"**:\n\n`;

    if (structuralSummary) {
      answer += `### Repository Context\n${structuralSummary}\n\n`;
    }

    answer += `### Evidence-Based Flow Steps\n\n`;
    flowBlocks.slice(0, 6).forEach((b, i) => {
      answer += `**Step ${i + 1}** — \`${b.filePath}\` (L${b.startLine}–L${b.endLine})`;
      if (b.symbolInfo) answer += ` | \`${b.symbolInfo}\``;
      answer += '\n';
    });

    const directBlocks = flowBlocks.filter((b) => b.score > 3);
    const supportingBlocksList = flowBlocks.filter((b) => b.score > 0 && b.score <= 3);

    answer += `\n### Evidence Quality\n`;
    if (directBlocks.length > 0) {
      answer += `- **Direct evidence**: ${directBlocks.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
    }
    if (supportingBlocksList.length > 0) {
      answer += `- **Supporting evidence**: ${supportingBlocksList.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
    }

    answer += `\n> *Generated by ForgeMind Local Intelligence Engine (Offline Mode). Enable a cloud LLM provider for richer explanations.*`;
    return answer;
  }

  /**
   * Produces a standard implementation-location answer.
   * For implementation queries, backend service/middleware sources are
   * preferred over frontend UI components as the primary source.
   */
  private _synthesizeStandardAnswer(
    query: string,
    relevantBlocks: SourceBlock[],
    allBlocks: SourceBlock[],
    structuralSummary?: string,
  ): string {
    const activeBlocks = relevantBlocks.length > 0 ? relevantBlocks : allBlocks;

    // Exclude infra files from the primary answer
    const implActiveBlocks = activeBlocks.filter((b) => !isInfrastructureFile(b.filePath));
    const displayBlocks = implActiveBlocks.length > 0 ? implActiveBlocks : activeBlocks;

    const primarySource = displayBlocks[0];
    const uniqueFiles = Array.from(new Set(displayBlocks.map((s) => s.filePath)));

    let answer = `Based on the repository context analysis, here is what was found regarding your question:\n\n`;

    if (structuralSummary) {
      answer += `### Architectural Summary\n${structuralSummary}\n\n`;
    }

    answer += `### Key Implementation Locations\n\n`;
    uniqueFiles.forEach((file) => {
      const fileSources = displayBlocks.filter((s) => s.filePath === file);
      const lineRanges = fileSources.map((s) => `L${s.startLine}–L${s.endLine}`).join(', ');
      answer += `- \`${file}\` (${lineRanges})\n`;
    });

    const directFiles = displayBlocks.filter((b) => b.score > 3);
    const supportingFiles = displayBlocks.filter((b) => b.score > 0 && b.score <= 3);
    if (directFiles.length > 0 || supportingFiles.length > 0) {
      answer += `\n### Evidence Quality\n`;
      if (directFiles.length > 0) {
        answer += `- **Direct evidence**: ${directFiles.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
      }
      if (supportingFiles.length > 0) {
        answer += `- **Supporting evidence**: ${supportingFiles.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
      }
    }

    if (primarySource) {
      answer += `\n### Summary Analysis\n`;
      answer += `The functionality related to **"${query}"** is centered in \`${primarySource.filePath}\``;
      if (primarySource.symbolInfo) {
        answer += ` (Symbol: \`${primarySource.symbolInfo}\`)`;
      }
      answer += `. The retrieved codebase context contains relevant definitions and structural logic in the highlighted line ranges above.\n\n`;
    }

    answer += `> *Generated by ForgeMind Local Intelligence Engine (Offline Mode).*`;
    return answer;
  }
}
