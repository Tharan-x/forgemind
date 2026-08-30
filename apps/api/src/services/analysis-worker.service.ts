// =============================================================================
// ForgeMind API — Background Analysis Worker Service
// =============================================================================

import { claimNextAnalysisJob, updateAnalysisJobStatus } from './analysis-job.service.js';
import { getDecryptedGitHubToken } from './github-credential.service.js';
import { computePRArchitectureSnapshot } from './pr-analysis.service.js';
import { executeAnalysisJob } from './repository-acquisition.service.js';
import { findRepositoryById } from './repository.service.js';
import { isLatestPREvent } from './webhook-event.service.js';

/**
 * Claims and processes the next pending or stale analysis job.
 * Returns true if a job was claimed and processed, false if no job was available.
 */
export async function processNextAnalysisJob(): Promise<boolean> {
  const job = await claimNextAnalysisJob();

  if (!job) {
    return false;
  }

  try {
    const repo = await findRepositoryById(job.repositoryId);
    if (!repo) {
      await updateAnalysisJobStatus(job.id, {
        status: 'failed',
        error: `Repository not found: ${job.repositoryId}`,
        finishedAt: new Date(),
      });
      return true;
    }

    // Check for stale out-of-order PR event before attempting API calls or token decryption
    if (job.triggerSource === 'pull_request' && job.prNumber && job.headSha) {
      const isLatest = await isLatestPREvent(job.repositoryId, job.prNumber, job.headSha);
      if (!isLatest) {
        await updateAnalysisJobStatus(job.id, {
          status: 'completed',
          stage: 'stale_skipped',
          stageLabel: 'Skipped - newer PR commit received',
          finishedAt: new Date(),
        });
        return true;
      }
    }

    const githubToken = await getDecryptedGitHubToken(repo.userId);
    if (!githubToken) {
      await updateAnalysisJobStatus(job.id, {
        status: 'failed',
        error: `No decrypted GitHub token available for repository owner.`,
        finishedAt: new Date(),
      });
      return true;
    }

    if (job.triggerSource === 'pull_request') {
      await computePRArchitectureSnapshot(job, githubToken);
    } else {
      await executeAnalysisJob(job, githubToken);
    }

    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Worker analysis processing error';
    await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: errorMessage,
      finishedAt: new Date(),
    });
    return true;
  }
}

export interface WorkerLoopControls {
  stop: () => void;
}

/**
 * Starts an asynchronous polling loop for the analysis worker.
 */
export function startAnalysisWorkerLoop(options?: { pollIntervalMs?: number }): WorkerLoopControls {
  const interval = options?.pollIntervalMs ?? 2000;
  let running = true;
  let timeoutId: NodeJS.Timeout | null = null;

  async function loop() {
    if (!running) return;

    try {
      const processed = await processNextAnalysisJob();
      if (!running) return;

      if (processed) {
        // Immediately check for another pending job
        setImmediate(loop);
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Worker] Unexpected error in worker loop:', err);
    }

    if (running) {
      timeoutId = setTimeout(loop, interval);
    }
  }

  // Start polling
  loop();

  return {
    stop: () => {
      running = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}
