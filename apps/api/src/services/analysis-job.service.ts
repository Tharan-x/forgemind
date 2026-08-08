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
 * Lists all analysis jobs for a given repository ID ordered by creation date descending.
 */
export async function findAnalysisJobsByRepository(repositoryId: string): Promise<AnalysisJob[]> {
  return prisma.analysisJob.findMany({
    where: { repositoryId },
    orderBy: { createdAt: 'desc' },
  });
}
