// =============================================================================
// ForgeMind API — Repository Acquisition & Analysis Orchestration Service
// =============================================================================

import type { AnalysisJob } from '@prisma/client';

import type { ExtractionResult, IndexingResult, VectorIndexingResult } from '@forgemind/types';

import { createGithubClient } from '../github/index.js';

import {
  createAnalysisJob,
  findActiveAnalysisJobByRepository,
  updateAnalysisJobStatus,
} from './analysis-job.service.js';
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
 * Validates user ownership and enqueues a new pending AnalysisJob (or returns an active running job).
 */
export async function enqueueAnalysisJob(
  repositoryId: string,
  userId: string,
): Promise<AnalysisJob> {
  const repo = await findRepositoryById(repositoryId);

  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  if (repo.userId !== userId) {
    throw new Error(`User does not have permission to analyze repository: ${repositoryId}`);
  }

  const activeJob = await findActiveAnalysisJobByRepository(repositoryId);
  if (activeJob) {
    return activeJob;
  }

  return createAnalysisJob(repositoryId);
}

/**
 * Executes repository acquisition, AST symbol extraction, file indexing, and vector chunking
 * for a specific AnalysisJob.
 */
export async function executeAnalysisJob(
  job: AnalysisJob,
  githubToken: string,
): Promise<AcquisitionSummary> {
  const repositoryId = job.repositoryId;
  const repo = await findRepositoryById(repositoryId);

  if (!repo) {
    await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: `Repository not found: ${repositoryId}`,
      finishedAt: new Date(),
    });
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const github = createGithubClient(githubToken);

  try {
    const startedAt = job.startedAt ?? new Date();
    await updateAnalysisJobStatus(job.id, {
      status: 'in_progress',
      startedAt,
    });

    const defaultBranch = repo.defaultBranch || 'main';
    const commit = await github.getCommit(repo.owner, repo.name, defaultBranch);
    const commitHash = commit.sha;

    const treeResponse = await github.getTree(repo.owner, repo.name, commitHash, true);
    const treeItems = treeResponse.tree || [];

    const indexing = await indexRepositoryTree(repositoryId, treeItems);

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

    const blobs = treeItems.filter((item) => item.type === 'blob');
    const fileCount = indexing.filesIndexed;
    const totalSizeBytes = blobs.reduce((sum, item) => sum + (item.size || 0), 0);

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

/**
 * Legacy synchronous helper that enqueues and immediately executes an analysis job.
 * Preserves backwards compatibility for direct calls and integration test suites.
 */
export async function triggerRepositoryAnalysis(
  repositoryId: string,
  userId: string,
  githubToken: string,
): Promise<AcquisitionSummary> {
  const job = await enqueueAnalysisJob(repositoryId, userId);
  return executeAnalysisJob(job, githubToken);
}
