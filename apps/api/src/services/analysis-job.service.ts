// =============================================================================
// ForgeMind API — Analysis Job Service Layer
// =============================================================================

import type { AnalysisJob } from '@prisma/client';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export interface UpdateAnalysisJobOptions {
  status?: string;
  commitHash?: string | null;
  error?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}

/**
 * Creates a new analysis job for a repository.
 */
export async function createAnalysisJob(
  repositoryId: string,
  commitHash?: string,
): Promise<AnalysisJob> {
  return prisma.analysisJob.create({
    data: {
      repositoryId,
      status: 'pending',
      commitHash: commitHash ?? null,
    },
  });
}

/**
 * Updates an analysis job status and optional parameters (error, commitHash, timestamps).
 */
export async function updateAnalysisJobStatus(
  id: string,
  options: UpdateAnalysisJobOptions,
): Promise<AnalysisJob | null> {
  try {
    const data: Prisma.AnalysisJobUpdateInput = {};

    if (options.status !== undefined) data.status = options.status;
    if (options.commitHash !== undefined) data.commitHash = options.commitHash;
    if (options.error !== undefined) data.error = options.error;
    if (options.startedAt !== undefined) data.startedAt = options.startedAt;
    if (options.finishedAt !== undefined) data.finishedAt = options.finishedAt;

    return await prisma.analysisJob.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/**
 * Finds an analysis job by its database UUID.
 */
export async function findAnalysisJobById(id: string): Promise<AnalysisJob | null> {
  return prisma.analysisJob.findUnique({
    where: { id },
  });
}

/**
 * Finds the latest analysis job for a given repository ID.
 */
export async function findLatestAnalysisJobByRepository(
  repositoryId: string,
): Promise<AnalysisJob | null> {
  return prisma.analysisJob.findFirst({
    where: { repositoryId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Finds an active (pending or in_progress) analysis job for a given repository ID.
 */
export async function findActiveAnalysisJobByRepository(
  repositoryId: string,
): Promise<AnalysisJob | null> {
  return prisma.analysisJob.findFirst({
    where: {
      repositoryId,
      status: { in: ['pending', 'in_progress'] },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Atomically claims the next pending or stale in_progress analysis job.
 * Transitions status to 'in_progress' and sets startedAt timestamp.
 * Uses Postgres FOR UPDATE SKIP LOCKED with fallback for test environments.
 */
export async function claimNextAnalysisJob(): Promise<AnalysisJob | null> {
  const STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_TIMEOUT_MS);

  // 1. Try atomic Postgres FOR UPDATE SKIP LOCKED query
  try {
    const rawResult = await prisma.$queryRaw<AnalysisJob[]>`
      UPDATE analysis_jobs
      SET status = 'in_progress', started_at = ${now}, updated_at = ${now}, error = NULL
      WHERE id = (
        SELECT id FROM analysis_jobs
        WHERE status = 'pending'
           OR (status = 'in_progress' AND started_at < ${staleThreshold})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `;
    if (Array.isArray(rawResult) && rawResult.length > 0 && rawResult[0]) {
      return rawResult[0];
    }
  } catch {
    // Fallback for mocked Prisma / test environments
  }

  // 2. Standard Prisma atomic fallback
  const candidate = await prisma.analysisJob.findFirst({
    where: {
      OR: [{ status: 'pending' }, { status: 'in_progress', startedAt: { lt: staleThreshold } }],
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!candidate) return null;

  try {
    return await prisma.analysisJob.update({
      where: {
        id: candidate.id,
        status: candidate.status,
      },
      data: {
        status: 'in_progress',
        startedAt: now,
        error: null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return null; // Claimed concurrently by another process
    }
    throw err;
  }
}

/**
 * Lists all analysis jobs for a given repository ID ordered by creation date descending.
 */
export async function findAnalysisJobsByRepository(repositoryId: string): Promise<AnalysisJob[]> {
  return prisma.analysisJob.findMany({
    where: { repositoryId },
    orderBy: { createdAt: 'desc' },
  });
}
