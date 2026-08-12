// =============================================================================
// ForgeMind API — Chunk Persistence & Vector Embedding Storage Service
// =============================================================================

import { PrismaClient, Prisma } from '@prisma/client';
import type { VectorIndexingResult } from '@forgemind/types';

import { chunkSourceFile, type CodeSymbolInfo } from './code-chunker.service.js';
import { getEmbeddingProvider } from './embeddings/factory.js';

const prisma = new PrismaClient();

export interface ProcessFileChunksResult {
  fileId: string;
  filePath: string;
  chunksCreated: number;
  embeddingsGenerated: number;
  chunksSkipped: number;
}

/**
 * Processes source code file content: chunks it into semantic segments, computes embeddings,
 * and persists both chunks and vector embeddings idempotently into PostgreSQL/pgvector.
 *
 * @param repositoryId Database UUID of repository
 * @param fileId Database UUID of repository_files record
 * @param filePath Relative path of file
 * @param content Text content of file
 * @param language Detected programming language
 * @param symbols AST symbols for this file
 * @param fileSize Size in bytes of file
 */
export async function processAndStoreFileChunks(
  repositoryId: string,
  fileId: string,
  filePath: string,
  content: string,
  language: string | null,
  symbols: CodeSymbolInfo[] = [],
  fileSize?: number | null,
): Promise<ProcessFileChunksResult> {
  const generatedChunks = chunkSourceFile(filePath, content, language, symbols, fileSize);

  if (generatedChunks.length === 0) {
    // If file generates 0 chunks (e.g. empty or binary/unsupported file), clear any old chunks
    await prisma.codeChunk.deleteMany({ where: { fileId } });
    return {
      fileId,
      filePath,
      chunksCreated: 0,
      embeddingsGenerated: 0,
      chunksSkipped: 0,
    };
  }

  // Check existing chunks for idempotency
  const existingChunks = await prisma.codeChunk.findMany({
    where: { fileId },
    orderBy: { chunkIndex: 'asc' },
  });

  const isUnchanged =
    existingChunks.length === generatedChunks.length &&
    existingChunks.every(
      (existing, idx) =>
        existing.checksum === generatedChunks[idx]?.checksum &&
        existing.startLine === generatedChunks[idx]?.startLine &&
        existing.endLine === generatedChunks[idx]?.endLine,
    );

  if (isUnchanged) {
    return {
      fileId,
      filePath,
      chunksCreated: generatedChunks.length,
      embeddingsGenerated: 0,
      chunksSkipped: generatedChunks.length,
    };
  }

  // Delete previous stale chunks for this file
  await prisma.codeChunk.deleteMany({ where: { fileId } });

  const provider = getEmbeddingProvider();

  // Extract texts to embed
  const textsToEmbed = generatedChunks.map((c) => {
    const contextHeader = c.metadata['headerContext']
      ? `${c.metadata['headerContext']}\n\n`
      : `File: ${filePath}\n\n`;
    return `${contextHeader}${c.content}`;
  });

  // Batch generate embeddings
  let embeddings: number[][] = [];
  try {
    embeddings = await provider.generateBatchEmbeddings(textsToEmbed);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[Embedding] Error generating embeddings for ${filePath}:`, err);
    // Proceed with empty embeddings if provider fails (chunks are still saved)
  }

  let chunksCreated = 0;
  let embeddingsGenerated = 0;

  for (let i = 0; i < generatedChunks.length; i++) {
    const chunk = generatedChunks[i];
    if (!chunk) continue;
    const embedding = embeddings[i];

    // Clean metadata to strip out undefined properties for Prisma JSON compatibility
    const cleanMetadata =
      (JSON.parse(JSON.stringify(chunk.metadata ?? {})) as Prisma.InputJsonValue) ??
      Prisma.JsonNull;

    const created = await prisma.codeChunk.create({
      data: {
        repositoryId,
        fileId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        filePath,
        language,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        tokenCount: chunk.tokenCount,
        linesCount: chunk.linesCount,
        checksum: chunk.checksum,
        metadata: cleanMetadata,
      },
    });

    chunksCreated++;

    if (embedding && embedding.length > 0) {
      try {
        const vectorStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`UPDATE "code_chunks" SET "embedding" = ${vectorStr}::vector WHERE "id" = ${created.id}::uuid`;
        embeddingsGenerated++;
      } catch (vectorErr) {
        // eslint-disable-next-line no-console
        console.warn(`[Embedding] Could not write vector for chunk ${created.id}:`, vectorErr);
      }
    }
  }

  return {
    fileId,
    filePath,
    chunksCreated,
    embeddingsGenerated,
    chunksSkipped: 0,
  };
}

/**
 * Executes chunking and embedding pipeline across multiple files in a repository.
 */
export async function processRepositoryVectorPipeline(
  repositoryId: string,
  filesWithContent: Array<{
    id: string;
    path: string;
    content: string;
    language: string | null;
    symbols?: CodeSymbolInfo[];
    size?: number | null;
  }>,
): Promise<VectorIndexingResult> {
  let filesChunked = 0;
  let totalChunksCreated = 0;
  let totalChunksEmbedded = 0;
  let chunksSkippedUnchanged = 0;

  const provider = getEmbeddingProvider();

  for (const file of filesWithContent) {
    try {
      const res = await processAndStoreFileChunks(
        repositoryId,
        file.id,
        file.path,
        file.content,
        file.language,
        file.symbols || [],
        file.size,
      );

      if (res.chunksCreated > 0) {
        filesChunked++;
        totalChunksCreated += res.chunksCreated;
        totalChunksEmbedded += res.embeddingsGenerated;
        chunksSkippedUnchanged += res.chunksSkipped;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Vector Pipeline] Failed processing file ${file.path}:`, err);
    }
  }

  return {
    filesChunked,
    totalChunksCreated,
    totalChunksEmbedded,
    chunksSkippedUnchanged,
    providerUsed: provider.name,
  };
}
