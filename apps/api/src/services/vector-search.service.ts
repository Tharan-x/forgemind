// =============================================================================
// ForgeMind API — Vector Semantic Search & Chunk Query Service
// =============================================================================

import { PrismaClient } from '@prisma/client';
import type { CodeChunk, VectorPipelineStatus, VectorSearchResult } from '@forgemind/types';

import { getEmbeddingProvider } from './embeddings/factory.js';

const prisma = new PrismaClient();

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

/**
 * Searches code chunks using pgvector cosine distance vector similarity.
 * Falls back to full-text matching if vector search is unavailable.
 *
 * @param repositoryId Database UUID of target repository
 * @param queryText Search prompt or query code snippet
 * @param options Pagination and similarity threshold options
 */
export async function searchSemanticCodeChunks(
  repositoryId: string,
  queryText: string,
  options: SemanticSearchOptions = {},
): Promise<VectorSearchResult[]> {
  const trimmedQuery = queryText.trim();
  if (!trimmedQuery) return [];

  const limit = options.limit || 10;
  const threshold = options.threshold ?? 0.0;
  const provider = getEmbeddingProvider();

  try {
    // 1. Generate query embedding vector
    const queryVector = await provider.generateEmbedding(trimmedQuery);
    const vectorStr = `[${queryVector.join(',')}]`;

    // 2. Perform pgvector cosine distance query (1 - distance = cosine similarity)
    const rawResults = await prisma.$queryRaw<RawVectorQueryResult[]>`
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
      LIMIT ${limit * 2};
    `;

    const filtered = rawResults
      .filter((r) => r.similarity >= threshold)
      .slice(0, limit)
      .map((r) => ({
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
      }));

    return filtered;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Vector Search] Fallback to ILIKE text search due to error:', err);

    // Fallback: ILIKE text search if pgvector query fails
    const textMatches = await prisma.codeChunk.findMany({
      where: {
        repositoryId,
        OR: [
          { content: { contains: trimmedQuery, mode: 'insensitive' } },
          { filePath: { contains: trimmedQuery, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { chunkIndex: 'asc' },
    });

    return textMatches.map((c) => ({
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
      similarity: 0.5,
      metadata: (c.metadata as Record<string, unknown>) || null,
    }));
  }
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
