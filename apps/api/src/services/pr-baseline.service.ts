// =============================================================================
// ForgeMind API — PR Architecture Baseline Resolution Service (Phase 7.4)
// =============================================================================
//
// Resolves the baseline architecture health snapshot for a PR:
//   1. Exact commit SHA match on a non-PR (default-branch/manual) snapshot.
//   2. Fallback to latest non-PR snapshot for the repository.
//   3. Returns null if no suitable baseline snapshot exists (neutral result).
// =============================================================================

import type { ArchitectureHealthSnapshot } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/**
 * Resolves the baseline architecture health snapshot for a PR.
 *
 * @param repositoryId The ForgeMind database UUID of the target repository.
 * @param baseSha Optional git base commit SHA from the PR payload.
 * @returns The matching baseline ArchitectureHealthSnapshot, or null if none exists.
 */
export async function findBaselineSnapshot(
  repositoryId: string,
  baseSha?: string | null,
): Promise<ArchitectureHealthSnapshot | null> {
  if (!repositoryId) return null;

  // 1. If baseSha provided, attempt exact commit SHA match on non-PR snapshot
  if (baseSha && baseSha.trim().length > 0) {
    const cleanSha = baseSha.trim();

    const exactMatch = await prisma.architectureHealthSnapshot.findFirst({
      where: {
        repositoryId,
        OR: [
          { commitHash: cleanSha },
          { analysisJob: { commitHash: cleanSha } },
          { analysisJob: { headSha: cleanSha } },
        ],
        analysisJob: {
          OR: [{ triggerSource: { not: 'pull_request' } }, { triggerSource: null }],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (exactMatch) {
      return exactMatch;
    }
  }

  // 2. Fallback to latest non-PR / default-branch snapshot for repositoryId
  const fallback = await prisma.architectureHealthSnapshot.findFirst({
    where: {
      repositoryId,
      analysisJob: {
        OR: [{ triggerSource: { not: 'pull_request' } }, { triggerSource: null }],
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return fallback;
}
