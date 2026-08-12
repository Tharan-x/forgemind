// =============================================================================
// ForgeMind API — Repository Acquisition & Analysis Orchestration Service
// =============================================================================

import type { AnalysisJob } from '@prisma/client';

import type { ExtractionResult, IndexingResult, VectorIndexingResult } from '@forgemind/types';

import { createGithubClient } from '../github/index.js';

import { createAnalysisJob, updateAnalysisJobStatus } from './analysis-job.service.js';
import { processAndStoreFileChunks } from './chunk-embedding.service.js';
import { getEmbeddingProvider } from './embeddings/factory.js';
import { findRepositoryById } from './repository.service.js';
import { extractAndIndexFileSymbols } from './symbol-extraction.service.js';
import { findRepositoryFiles, indexRepositoryTree } from './tree-indexing.service.js';

export interface AcquisitionSummary {
  job: AnalysisJob;
  commitHash: string;
  fileCount: number;
  totalSizeBytes: number;
  indexing?: IndexingResult;
  extraction?: ExtractionResult;
  vectorIndexing?: VectorIndexingResult;
}

/**
 * Triggers repository acquisition and analysis job execution for an authenticated user's repository.
 *
 * Steps:
 * 1. Validates repository existence and user ownership.
 * 2. Creates an AnalysisJob in 'pending' status.
 * 3. Transitions status to 'in_progress' and sets startedAt timestamp.
 * 4. Queries GitHub REST API for latest commit and repository git tree file items.
 * 5. Indexes repository tree metadata (files, language classification, ignore filtering).
 * 6. Performs AST symbol & dependency extraction on primary code files.
 * 7. Performs code chunking & vector embedding generation for code files.
 * 8. Transitions job status to 'completed' with finishedAt timestamp (or 'failed' on error).
 *
 * @param repositoryId The database UUID of the repository.
 * @param userId The database UUID of the authenticated user requesting analysis.
 * @param githubToken GitHub OAuth/access token.
 */
export async function triggerRepositoryAnalysis(
  repositoryId: string,
  userId: string,
  githubToken: string,
): Promise<AcquisitionSummary> {
  // 1. Validate repository existence & ownership
  const repo = await findRepositoryById(repositoryId);

  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  if (repo.userId !== userId) {
    throw new Error(`User does not have permission to analyze repository: ${repositoryId}`);
  }

  // 2. Create pending AnalysisJob
  const job = await createAnalysisJob(repositoryId);

  // Initialize GitHub client
  const github = createGithubClient(githubToken);

  try {
    // 3. Mark job as in_progress
    const startedAt = new Date();
    await updateAnalysisJobStatus(job.id, {
      status: 'in_progress',
      startedAt,
    });

    // 4. Acquisition: Fetch latest commit & tree from GitHub
    const defaultBranch = repo.defaultBranch || 'main';
    const commit = await github.getCommit(repo.owner, repo.name, defaultBranch);
    const commitHash = commit.sha;

    const treeResponse = await github.getTree(repo.owner, repo.name, commitHash, true);
    const treeItems = treeResponse.tree || [];

    // 5. Indexing: Parse file metadata, ignore rules, and language classification
    const indexing = await indexRepositoryTree(repositoryId, treeItems);

    // 6. Extraction & Vector Embedding Pipeline
    const { files: indexedFiles } = await findRepositoryFiles(repositoryId, { limit: 5000 });
    const codeFiles = indexedFiles.filter(
      (f) => f.type === 'file' && f.language && (f.size ?? 0) < 500000,
    );

    let totalSymbolsExtracted = 0;
    let totalDependenciesExtracted = 0;
    let filesParsed = 0;

    let filesChunked = 0;
    let totalChunksCreated = 0;
    let totalChunksEmbedded = 0;
    let chunksSkippedUnchanged = 0;

    for (const file of codeFiles) {
      try {
        const content = await github.getFileContent(repo.owner, repo.name, file.path, commitHash);
        if (content) {
          // 6a. AST Symbol & Dependency Extraction
          const res = await extractAndIndexFileSymbols(
            repositoryId,
            file.id,
            file.path,
            content,
            file.language,
          );
          totalSymbolsExtracted += res.symbolCount;
          totalDependenciesExtracted += res.dependencyCount;
          filesParsed += 1;

          // 6b. Code Chunking & Vector Embeddings Generation
          const chunkRes = await processAndStoreFileChunks(
            repositoryId,
            file.id,
            file.path,
            content,
            file.language,
            res.symbols || [],
            file.size,
          );

          if (chunkRes.chunksCreated > 0) {
            filesChunked += 1;
            totalChunksCreated += chunkRes.chunksCreated;
            totalChunksEmbedded += chunkRes.embeddingsGenerated;
            chunksSkippedUnchanged += chunkRes.chunksSkipped;
          }
        }
      } catch (fileErr) {
        // eslint-disable-next-line no-console
        console.warn(`[Analysis] Skipping file ${file.path} due to processing error:`, fileErr);
      }
    }

    const extraction: ExtractionResult = {
      filesParsed,
      totalSymbolsExtracted,
      totalDependenciesExtracted,
    };

    const provider = getEmbeddingProvider();
    const vectorIndexing: VectorIndexingResult = {
      filesChunked,
      totalChunksCreated,
      totalChunksEmbedded,
      chunksSkippedUnchanged,
      providerUsed: provider.name,
    };

    // Calculate basic tree file statistics
    const blobs = treeItems.filter((item) => item.type === 'blob');
    const fileCount = indexing.filesIndexed;
    const totalSizeBytes = blobs.reduce((sum, item) => sum + (item.size || 0), 0);

    // 7. Mark job as completed
    const finishedAt = new Date();
    const completedJob = await updateAnalysisJobStatus(job.id, {
      status: 'completed',
      commitHash,
      finishedAt,
    });

    return {
      job: completedJob || {
        ...job,
        status: 'completed',
        commitHash,
        startedAt,
        finishedAt,
      },
      commitHash,
      fileCount,
      totalSizeBytes,
      indexing,
      extraction,
      vectorIndexing,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown acquisition error';
    const finishedAt = new Date();

    const failedJob = await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: errorMessage,
      finishedAt,
    });

    throw new Error(
      `Repository acquisition failed for job ${job.id}: ${failedJob?.error || errorMessage}`,
    );
  }
}
