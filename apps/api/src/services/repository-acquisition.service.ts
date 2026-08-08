// =============================================================================
// ForgeMind API — Repository Acquisition & Analysis Orchestration Service
// =============================================================================

import type { AnalysisJob } from '@prisma/client';

import type { IndexingResult } from '@forgemind/types';

import { createGithubClient } from '../github/index.js';

import { createAnalysisJob, updateAnalysisJobStatus } from './analysis-job.service.js';
import { findRepositoryById } from './repository.service.js';
import { indexRepositoryTree } from './tree-indexing.service.js';

export interface AcquisitionSummary {
  job: AnalysisJob;
  commitHash: string;
  fileCount: number;
  totalSizeBytes: number;
  indexing?: IndexingResult;
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
 * 6. Transitions job status to 'completed' with finishedAt timestamp (or 'failed' on error).
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

    // Calculate basic tree file statistics
    const blobs = treeItems.filter((item) => item.type === 'blob');
    const fileCount = indexing.filesIndexed;
    const totalSizeBytes = blobs.reduce((sum, item) => sum + (item.size || 0), 0);

    // 6. Mark job as completed
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
