// =============================================================================
// ForgeMind API — Context Retrieval Service
// =============================================================================

import type { RetrievedContextChunk, VectorSearchResult } from '@forgemind/types';
import { analyzeQueryIntent, type QueryIntentAnalysis } from './query-intent.service.js';
import { findRepositoryById } from './repository.service.js';
import { searchSemanticCodeChunks } from './vector-search.service.js';

export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
  maxTokens?: number;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_HYBRID_THRESHOLD = 0.2;
const DEFAULT_MAX_TOKENS = 3000;

/**
 * Calculates a multi-factor hybrid score combining vector similarity, lexical overlap,
 * file path matching, and symbol name matching.
 *
 * Formula:
 *   hybridScore = 0.40 * vectorScore + 0.25 * lexicalScore + 0.20 * pathScore + 0.15 * symbolScore
 */
export function calculateChunkHybridScore(
  chunk: VectorSearchResult,
  intent: QueryIntentAnalysis,
): number {
  const vectorScore = Math.max(0, Math.min(1, chunk.similarity));

  const contentLower = chunk.content.toLowerCase();
  const pathLower = chunk.filePath.toLowerCase();
  const symbolName =
    typeof chunk.metadata?.['symbolName'] === 'string'
      ? chunk.metadata['symbolName'].toLowerCase()
      : '';

  // 0. Low-quality path penalty (e.g. migration files for config queries)
  //    Any chunk whose filePath matches a lowQualityPathPattern is capped at 0.40
  //    regardless of vector similarity, preventing high-sim DDL files from
  //    outranking actual configuration files.
  const isLowQualitySource = (intent.lowQualityPathPatterns ?? []).some((pattern) =>
    pathLower.includes(pattern.toLowerCase()),
  );

  // 1. Lexical Keyword Overlap Score
  let lexicalMatches = 0;
  for (const kw of intent.keywords) {
    if (contentLower.includes(kw) || pathLower.includes(kw) || symbolName.includes(kw)) {
      lexicalMatches++;
    }
  }
  const lexicalScore =
    intent.keywords.length > 0 ? Math.min(1.0, lexicalMatches / intent.keywords.length) : 0;

  // 2. File Path Match Score
  let pathScore = 0;
  for (const hint of intent.pathHints) {
    if (pathLower.includes(hint.toLowerCase())) {
      pathScore = 1.0;
      break;
    }
  }
  if (pathScore === 0) {
    for (const kw of intent.keywords) {
      if (pathLower.includes(kw)) {
        pathScore = 0.7;
        break;
      }
    }
  }

  // 3. Symbol Name Match Score
  let symbolScore = 0;
  if (symbolName) {
    for (const hint of intent.symbolHints) {
      if (symbolName.includes(hint.toLowerCase())) {
        symbolScore = 1.0;
        break;
      }
    }
    if (symbolScore === 0) {
      for (const kw of intent.keywords) {
        if (symbolName.includes(kw)) {
          symbolScore = 0.8;
          break;
        }
      }
    }
  }

  // 4. Combined Weighted Hybrid Score
  let hybridScore = vectorScore * 0.4 + lexicalScore * 0.25 + pathScore * 0.2 + symbolScore * 0.15;

  // 5. Configuration-content bonus (DB_CONFIGURATION queries only)
  //    Awarded to chunks containing actual datasource/connection declarations.
  if (intent.category === 'DB_CONFIGURATION' || intent.isConfigurationQuery) {
    const CONFIG_SIGNALS = [
      'datasource',
      'database_url',
      'direct_url',
      'env("database_url")',
      'env("direct_url")',
      'new prismaClient',
      'createclient',
      'supabaseurl',
      'supabase_url',
      'optionalenv',
      'process.env',
    ];
    let configMatches = 0;
    for (const sig of CONFIG_SIGNALS) {
      if (contentLower.includes(sig)) configMatches++;
    }
    const configBonus = Math.min(0.2, configMatches * 0.05);
    hybridScore = Math.min(1.0, hybridScore + configBonus);
  }

  // 6. Flow / interaction-ordering bonus (FLOW queries)
  if (intent.category === 'FLOW') {
    const FLOW_SIGNALS = ['middleware', 'router', 'route', 'controller', 'handler', 'next('];
    let flowMatches = 0;
    for (const sig of FLOW_SIGNALS) {
      if (contentLower.includes(sig) || pathLower.includes(sig)) flowMatches++;
    }
    const flowBonus = Math.min(0.1, flowMatches * 0.03);
    hybridScore = Math.min(1.0, hybridScore + flowBonus);
  }

  // 7. Apply low-quality source cap AFTER bonuses
  if (isLowQualitySource) {
    hybridScore = Math.min(0.4, hybridScore);
  }

  return parseFloat(hybridScore.toFixed(4));
}

/**
 * Dedicated context retrieval service for RAG.
 *
 * Retrieves codebase candidate chunks (pool size ~30), performs hybrid reranking,
 * enforces a minimum hybrid relevance threshold (0.20), deduplicates overlapping snippets,
 * and caps context window token size.
 *
 * @param repositoryId Database UUID of repository
 * @param userId Authenticated user UUID for ownership validation
 * @param query Natural language user prompt/question
 * @param options Retrieval configurations
 */
export async function retrieveRepositoryContext(
  repositoryId: string,
  userId: string,
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievedContextChunk[]> {
  // 1. Verify repository existence & user ownership
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }
  if (repo.userId !== userId) {
    throw new Error(`Access denied for repository: ${repositoryId}`);
  }

  const topK = options.topK || DEFAULT_TOP_K;
  const threshold = options.threshold ?? DEFAULT_HYBRID_THRESHOLD;
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

  // 2. Query Intent Analysis & Keyword Extraction
  const intent = analyzeQueryIntent(query);

  // 3. Retrieve Candidate Pool (~30 candidates) via Hybrid Search
  const candidateChunks = await searchSemanticCodeChunks(repositoryId, query, {
    limit: 30,
    threshold: 0.0,
  });

  if (candidateChunks.length === 0) {
    return [];
  }

  // 4. Deterministic Multi-Factor Reranking
  const scoredChunks = candidateChunks.map((chunk) => {
    const hybridScore = calculateChunkHybridScore(chunk, intent);
    return {
      ...chunk,
      similarity: hybridScore,
    };
  });

  // 5. Minimum Relevance Threshold Filtering & Sorting
  const filteredSorted = scoredChunks
    .filter((c) => c.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  // 6. Context Ranking & Deduplication
  const deduplicated: RetrievedContextChunk[] = [];
  const seenRanges = new Set<string>();
  let accumulatedTokens = 0;

  for (const item of filteredSorted) {
    const rangeKey = `${item.filePath}:${item.startLine}:${item.endLine}`;
    if (seenRanges.has(rangeKey)) {
      continue;
    }
    seenRanges.add(rangeKey);

    const chunkTokens = item.tokenCount || Math.ceil(item.content.length / 4);

    if (accumulatedTokens + chunkTokens > maxTokens && deduplicated.length > 0) {
      break;
    }

    deduplicated.push({
      id: item.id,
      filePath: item.filePath,
      startLine: item.startLine,
      endLine: item.endLine,
      content: item.content,
      language: item.language,
      similarity: item.similarity,
      metadata: (item.metadata as Record<string, unknown>) || null,
    });

    accumulatedTokens += chunkTokens;

    if (deduplicated.length >= topK) {
      break;
    }
  }

  return deduplicated;
}
