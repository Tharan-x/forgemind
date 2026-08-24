// =============================================================================
// ForgeMind API — Vector Semantic Search & Chunk Query Service
// =============================================================================

import type { CodeChunk, VectorPipelineStatus, VectorSearchResult } from '@forgemind/types';

import { getEmbeddingProvider } from './embeddings/factory.js';

import { prisma } from '../lib/prisma.js';

export interface SemanticSearchOptions {
  limit?: number;
  threshold?: number;
  language?: string;
}

export interface RawVectorQueryResult {
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
  metadata: unknown;
  similarity: number;
}

import { extractQueryKeywords } from './query-intent.service.js';

/**
 * Hybrid search over code chunks combining pgvector cosine similarity with lexical keyword search.
 * Merges vector and keyword candidate sets into an expanded candidate pool (~30 candidates).
 *
 * @param repositoryId Database UUID of target repository
 * @param queryText Natural language question or code query
 * @param options Candidate limit and similarity threshold options
 */
export async function searchSemanticCodeChunks(
  repositoryId: string,
  queryText: string,
  options: SemanticSearchOptions = {},
): Promise<VectorSearchResult[]> {
  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) return [];

  const limit = options.limit || 30;
  const threshold = options.threshold ?? 0.0;
  const provider = getEmbeddingProvider();
  const keywords = extractQueryKeywords(trimmedQuery);

  const resultMap = new Map<string, VectorSearchResult>();

  // 1. Vector Search Candidate Retrieval
  if (provider.name !== 'none' && provider.name !== 'disabled') {
    try {
      const queryVector = await provider.generateEmbedding(trimmedQuery);
      const vectorStr = `[${queryVector.join(',')}]`;

      const rawVectorResults = await prisma.$queryRaw<RawVectorQueryResult[]>`
        SELECT
          c.id,
          c.repository_id AS "repositoryId",
          c.file_id AS "fileId",
          c.chunk_index AS "chunkIndex",
          c.content,
          c.file_path AS "filePath",
          c.language,
          c.start_line AS "startLine",
          c.end_line AS "endLine",
          c.token_count AS "tokenCount",
          c.lines_count AS "linesCount",
          c.metadata,
          (1 - (c.embedding <=> ${vectorStr}::vector))::float AS similarity
        FROM "code_chunks" c
        WHERE c.repository_id = ${repositoryId}::uuid
          AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${vectorStr}::vector ASC
        LIMIT ${limit};
      `;

      for (const r of rawVectorResults) {
        if (r.similarity >= threshold) {
          resultMap.set(r.id, {
            id: r.id,
            repositoryId: r.repositoryId,
            fileId: r.fileId,
            chunkIndex: r.chunkIndex,
            content: r.content,
            filePath: r.filePath,
            language: r.language,
            startLine: r.startLine,
            endLine: r.endLine,
            tokenCount: r.tokenCount,
            linesCount: r.linesCount,
            similarity: parseFloat(r.similarity.toFixed(4)),
            metadata: (r.metadata as Record<string, unknown>) || null,
          });
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[Vector Search] Vector search warning:', err);
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      `[Vector Search] Embedding provider is unconfigured ('${provider.name}'). Bypassing vector search and using lexical search.`,
    );
  }

  // 2. Lexical Keyword Candidate Retrieval
  if (keywords.length > 0) {
    try {
      const keywordConditions = keywords.flatMap((kw) => [
        { filePath: { contains: kw, mode: 'insensitive' as const } },
        { content: { contains: kw, mode: 'insensitive' as const } },
      ]);

      const lexicalMatches = await prisma.codeChunk.findMany({
        where: {
          repositoryId,
          OR: keywordConditions,
        },
        take: limit,
        orderBy: { chunkIndex: 'asc' },
      });

      for (const c of lexicalMatches) {
        if (!resultMap.has(c.id)) {
          // Calculate baseline keyword match score
          let matchCount = 0;
          const lowerPath = c.filePath.toLowerCase();
          const lowerContent = c.content.toLowerCase();

          for (const kw of keywords) {
            if (lowerPath.includes(kw)) matchCount += 2;
            if (lowerContent.includes(kw)) matchCount += 1;
          }

          const lexicalSim = Math.min(0.85, 0.4 + matchCount * 0.1);

          resultMap.set(c.id, {
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
            similarity: parseFloat(lexicalSim.toFixed(4)),
            metadata: (c.metadata as Record<string, unknown>) || null,
          });
        }
      }
    } catch (lexErr) {
      // eslint-disable-next-line no-console
      console.warn('[Vector Search] Lexical search warning:', lexErr);
    }
  }

  return Array.from(resultMap.values());
}

/**
 * Lists code chunks for a repository with optional filtering.
 */
export async function findRepositoryChunks(
  repositoryId: string,
  options: { fileId?: string; limit?: number; offset?: number } = {},
): Promise<{ chunks: CodeChunk[]; total: number }> {
  const where = {
    repositoryId,
    ...(options.fileId ? { fileId: options.fileId } : {}),
  };

  const [dbChunks, total] = await Promise.all([
    prisma.codeChunk.findMany({
      where,
      orderBy: [{ filePath: 'asc' }, { chunkIndex: 'asc' }],
      take: options.limit,
      skip: options.offset,
    }),
    prisma.codeChunk.count({ where }),
  ]);

  const chunks: CodeChunk[] = dbChunks.map((c) => ({
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
    checksum: c.checksum,
    metadata: (c.metadata as Record<string, unknown>) || null,
    createdAt: c.createdAt.toISOString(),
  }));

  return { chunks, total };
}

/**
 * Returns vector pipeline indexing status and coverage metrics for a repository.
 */
export async function getVectorPipelineStatus(repositoryId: string): Promise<VectorPipelineStatus> {
  const provider = getEmbeddingProvider();

  const [totalChunks, embeddedChunksResult, indexedFilesCount] = await Promise.all([
    prisma.codeChunk.count({ where: { repositoryId } }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "code_chunks"
      WHERE repository_id = ${repositoryId}::uuid
        AND embedding IS NOT NULL;
    `,
    prisma.codeChunk.groupBy({
      by: ['fileId'],
      where: { repositoryId },
    }),
  ]);

  const embeddedChunks = Number(embeddedChunksResult[0]?.count ?? 0);

  return {
    repositoryId,
    totalChunks,
    embeddedChunks,
    indexedFiles: indexedFilesCount.length,
    provider: provider.name,
  };
}
