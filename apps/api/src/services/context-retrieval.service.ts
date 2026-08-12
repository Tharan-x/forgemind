// =============================================================================
// ForgeMind API — Context Retrieval Service
// =============================================================================

import type { RetrievedContextChunk } from '@forgemind/types';
import { findRepositoryById } from './repository.service.js';
import { searchSemanticCodeChunks } from './vector-search.service.js';

export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
  maxTokens?: number;
}

const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.0;
const DEFAULT_MAX_TOKENS = 3000;

/**
 * Dedicated context retrieval service for RAG.
 *
 * Retrieves relevant codebase chunks using pgvector semantic vector search,
 * verifies repository security ownership, deduplicates overlapping snippets,
 * ranks by relevance, and caps context window token size.
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
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

  // 2. Perform vector search over code chunks
  const rawSearchResults = await searchSemanticCodeChunks(repositoryId, query, {
    limit: topK * 2,
    threshold,
  });

  if (rawSearchResults.length === 0) {
    return [];
  }

  // 3. Context Ranking & Deduplication
  const deduplicated: RetrievedContextChunk[] = [];
  const seenRanges = new Set<string>();
  let accumulatedTokens = 0;

  // Sort by similarity score descending
  const sorted = [...rawSearchResults].sort((a, b) => b.similarity - a.similarity);

  for (const item of sorted) {
    const rangeKey = `${item.filePath}:${item.startLine}:${item.endLine}`;
    if (seenRanges.has(rangeKey)) {
      continue;
    }
    seenRanges.add(rangeKey);

    const chunkTokens = item.tokenCount || Math.ceil(item.content.length / 4);

    if (accumulatedTokens + chunkTokens > maxTokens && deduplicated.length > 0) {
      // Reached token capacity limit
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
