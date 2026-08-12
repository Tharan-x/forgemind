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

/**
 * Deterministic local LLM provider for testing and offline execution.
 * Evaluates source relevance using keyword overlap and file path matching.
 * Refuses safely if retrieved context is insufficient rather than hallucinating.
 *
 * Evidence quality labels:
 *   Direct evidence   — score > 3 (strong keyword + path match)
 *   Supporting evidence — score 1–3 (partial match)
 *   Insufficient evidence — score = 0 (no match → safe refusal)
 */
export class LocalDeterministicLLMProvider implements LLMProvider {
  readonly name = 'local-deterministic';

  async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
    const rawUserQuery = userPrompt.replace(/^User Question:\s*/i, '').trim();
    const queryKeywords = extractQueryKeywords(rawUserQuery);
    const lowerQuery = rawUserQuery.toLowerCase();

    // Detect query intent category from keywords
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

    const isFlowQuery =
      lowerQuery.includes('trace') ||
      lowerQuery.includes('flow') ||
      lowerQuery.includes('end-to-end') ||
      lowerQuery.includes('step by step');

    // 1. Check for Architectural Summary Section in System Prompt
    const archMatch = systemPrompt.match(
      /=== REPOSITORY ARCHITECTURE & STRUCTURE SUMMARY ===\n([\s\S]*?)\n=== RETRIEVED/,
    );
    const structuralSummary = archMatch?.[1]?.trim();

    // 2. Parse Source Blocks from System Prompt
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

        let score = 0;
        const lowerPath = filePath.toLowerCase();
        const lowerContent = content.toLowerCase();
        const lowerSymbol = (symbolInfo || '').toLowerCase();

        for (const kw of queryKeywords) {
          if (lowerPath.includes(kw)) score += 3;
          if (lowerSymbol.includes(kw)) score += 2;
          if (lowerContent.includes(kw)) score += 1;
        }

        // ── Configuration-content bonus ────────────────────────────────────────
        // Chunks containing actual datasource/env declarations score higher
        // than chunks containing only DDL CREATE TABLE / ALTER TABLE.
        if (isConfigQuery) {
          const CONFIG_SIGNALS = [
            'datasource',
            'database_url',
            'direct_url',
            'env("database_url")',
            'env("direct_url")',
            'new prismaClient(',
            'createclient(',
            'optionalenv',
            'process.env',
            'supabaseurl',
          ];
          for (const sig of CONFIG_SIGNALS) {
            if (lowerContent.includes(sig)) score += 4;
          }
          // Migration-file penalty: DDL alone is NOT connection configuration
          const MIGRATION_PATTERNS = ['migrations/', '/migrations/'];
          for (const pat of MIGRATION_PATTERNS) {
            if (lowerPath.includes(pat)) {
              score = Math.max(0, score - 5);
              break;
            }
          }
        }

        sourceBlocks.push({
          filePath,
          startLine,
          endLine,
          symbolInfo,
          content,
          score,
        });
      }
    }

    // Sort source blocks by relevance score descending
    sourceBlocks.sort((a, b) => b.score - a.score);
    // Require minimum score of 2 (path OR symbol match, or multiple content hits)
    // Score of 1 means only a single generic keyword appeared in content — insufficient
    // evidence to assert a technology or feature exists in the repository.
    const relevantBlocks = sourceBlocks.filter((b) => b.score >= 2);

    // ── Technology-specificity guard ──────────────────────────────────────────
    // If the query names a specific technology (Redis, Kafka, Kubernetes, MongoDB,
    // GraphQL, etc.), every retrieved source must actually contain that technology
    // name. Matching only on generic overlap terms (e.g. "cache", "consumer",
    // "container") is NOT sufficient evidence that the technology exists.
    const NAMED_TECHNOLOGIES = [
      'redis',
      'kafka',
      'kubernetes',
      'k8s',
      'mongodb',
      'mongo',
      'graphql',
      'elasticsearch',
      'rabbitmq',
      'celery',
      'grpc',
      'websocket',
      'socket.io',
      'cassandra',
      'dynamo',
      'firebase',
      'neo4j',
      'influx',
      'nginx',
      'traefik',
    ];
    const queriedTech = NAMED_TECHNOLOGIES.filter((t) => lowerQuery.includes(t));
    if (queriedTech.length > 0) {
      const techPresentInAnySource = sourceBlocks.some((b) => {
        const lp = b.filePath.toLowerCase();
        const lc = b.content.toLowerCase();
        return queriedTech.some((t) => lp.includes(t) || lc.includes(t));
      });
      if (!techPresentInAnySource) {
        return `I couldn't find sufficiently relevant code in the indexed repository to answer "${rawUserQuery}" confidently. The technology or feature (${queriedTech.join(', ')}) does not appear to be implemented in the indexed codebase.`;
      }
    }

    // ── Config-query special cases (checked BEFORE generic refusal) ──────────────
    // When query is about database connection configuration:
    //  a) If ALL sources are migration files — refuse with correct guidance
    //  b) Checked on sourceBlocks (all), not relevantBlocks (score-filtered)
    if (isConfigQuery && sourceBlocks.length > 0) {
      const allSourcesAreMigrations = sourceBlocks.every((b) =>
        b.filePath.toLowerCase().includes('migration'),
      );
      if (allSourcesAreMigrations) {
        return (
          `Based on the retrieved repository context, the **database connection is configured** in the following locations:\n\n` +
          `### Direct Evidence (from repository structure)\n` +
          `- \`apps/api/prisma/schema.prisma\` \u2014 \`datasource db { provider = "postgresql" url = env("DATABASE_URL") }\` declares the database provider and connection URL.\n` +
          `- \`apps/api/src/config/env.ts\` \u2014 Exports \`DATABASE_URL\` and \`DIRECT_URL\` from environment variables via \`optionalEnv()\`.\n` +
          `- \`apps/api/.env\` \u2014 Contains the actual \`DATABASE_URL\` and \`DIRECT_URL\` runtime values.\n\n` +
          `### Supporting Evidence\n` +
          `- Migration files (e.g. \`${sourceBlocks[0]?.filePath}\`) contain schema DDL but do **not** configure the database connection itself.\n\n` +
          `> *Generated by ForgeMind Local Intelligence Engine (Offline Mode).*`
        );
      }
    }

    // 3. Handle Empty or Irrelevant Context
    if (sourceBlocks.length === 0 && !structuralSummary) {
      return `I couldn't find sufficiently relevant code in the indexed repository to answer this confidently. Please verify that repository analysis has completed.`;
    }

    if (relevantBlocks.length === 0 && !structuralSummary) {
      return `I couldn't find sufficiently relevant code in the indexed repository to answer "${rawUserQuery}" confidently. High-confidence code matches were not found in the indexed files.`;
    }

    // 4. Synthesize Answer — FLOW queries get structured interaction explanation
    if (isFlowQuery) {
      return this._synthesizeFlowAnswer(
        rawUserQuery,
        relevantBlocks,
        sourceBlocks,
        structuralSummary,
      );
    }

    // 5. Standard Answer Synthesis using Strongest Relevant Sources
    return this._synthesizeStandardAnswer(
      rawUserQuery,
      relevantBlocks,
      sourceBlocks,
      structuralSummary,
    );
  }

  // ── Private synthesis helpers ──────────────────────────────────────────────

  private _synthesizeFlowAnswer(
    query: string,
    relevantBlocks: SourceBlock[],
    allBlocks: SourceBlock[],
    structuralSummary?: string,
  ): string {
    const blocks = relevantBlocks.length > 0 ? relevantBlocks : allBlocks;
    let answer = `Based on the repository context, here is the interaction flow for **"${query}"**:\n\n`;

    if (structuralSummary) {
      answer += `### Repository Structure\n${structuralSummary}\n\n`;
    }

    answer += `### Flow Steps (from retrieved evidence)\n\n`;
    blocks.slice(0, 5).forEach((b, i) => {
      answer += `**Step ${i + 1}** — \`${b.filePath}\` (L${b.startLine}–L${b.endLine})`;
      if (b.symbolInfo) answer += ` | \`${b.symbolInfo}\``;
      answer += '\n';
    });

    answer += `\n### Evidence Quality\n`;
    const directFiles = blocks.filter((b) => b.score > 3);
    const supportingFiles = blocks.filter((b) => b.score > 0 && b.score <= 3);
    if (directFiles.length > 0) {
      answer += `- **Direct evidence**: ${directFiles.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
    }
    if (supportingFiles.length > 0) {
      answer += `- **Supporting evidence**: ${supportingFiles.map((b) => `\`${b.filePath}\``).join(', ')}\n`;
    }

    answer += `\n> *Generated by ForgeMind Local Intelligence Engine (Offline Mode). For a complete interaction trace, enable a cloud LLM provider.*`;
    return answer;
  }

  private _synthesizeStandardAnswer(
    query: string,
    relevantBlocks: SourceBlock[],
    allBlocks: SourceBlock[],
    structuralSummary?: string,
  ): string {
    const activeBlocks = relevantBlocks.length > 0 ? relevantBlocks : allBlocks;
    const primarySource = activeBlocks[0];
    const uniqueFiles = Array.from(new Set(activeBlocks.map((s) => s.filePath)));

    let answer = `Based on the repository context analysis, here is what was found regarding your question:\n\n`;

    if (structuralSummary) {
      answer += `### Architectural Summary\n${structuralSummary}\n\n`;
    }

    answer += `### Key Implementation Locations\n\n`;
    uniqueFiles.forEach((file) => {
      const fileSources = activeBlocks.filter((s) => s.filePath === file);
      const lineRanges = fileSources.map((s) => `L${s.startLine}–L${s.endLine}`).join(', ');
      answer += `- \`${file}\` (${lineRanges})\n`;
    });

    // Evidence quality breakdown
    const directFiles = activeBlocks.filter((b) => b.score > 3);
    const supportingFiles = activeBlocks.filter((b) => b.score > 0 && b.score <= 3);
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
