// =============================================================================
// ForgeMind API — Architecture Decision Memory Service (Milestone 1)
// =============================================================================
//
// Mines deterministic historical evidence (commits, PRs, file diffs, health deltas)
// from GitHub and links changes to ForgeMind architecture entities.
// 100% confirmed evidence — zero AI interpretation or hallucinated rationale.
// =============================================================================

import type { Prisma } from '@prisma/client';
import type {
  ArchitectureDecision,
  HistoricalChangedFileEvidence,
  MineHistoricalEvidenceResult,
} from '@forgemind/types';

import { createGithubClient } from '../github/index.js';
import { prisma } from '../lib/prisma.js';
import { getDecryptedGitHubToken } from './github-credential.service.js';
import { assertRepositoryOwnership, findRepositoryById } from './repository.service.js';

export interface FindDecisionsOptions {
  path?: string;
  prNumber?: number;
  limit?: number;
  page?: number;
}

/**
 * Mines historical commits and associated PR evidence from GitHub for a repository
 * and persists/updates ArchitectureDecision records idempotently.
 */
export async function mineRepositoryHistoricalEvidence(
  repositoryId: string,
  userId: string,
  options: { maxCommits?: number; path?: string } = {},
): Promise<MineHistoricalEvidenceResult> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const githubToken = await getDecryptedGitHubToken(userId);
  if (!githubToken) {
    throw new Error(
      'GitHub token is required to mine historical evidence. Please connect your GitHub account.',
    );
  }

  const github = createGithubClient(githubToken);

  const maxCommits = Math.min(100, Math.max(1, options.maxCommits ?? 30));
  const rawCommits = await github.listCommits(repo.owner, repo.name, {
    per_page: maxCommits,
    path: options.path,
  });

  // Retrieve historical health snapshots for calculating health deltas
  const healthSnapshots = await prisma.architectureHealthSnapshot.findMany({
    where: { repositoryId },
    orderBy: { createdAt: 'asc' },
  });

  const snapshotCommitMap = new Map<string, number>();
  healthSnapshots.forEach((s) => {
    if (s.commitHash) {
      snapshotCommitMap.set(s.commitHash, s.healthScore);
    }
  });

  let decisionsCreated = 0;
  let decisionsUpdated = 0;
  const decisionsSkipped = 0;

  for (const commitSummary of rawCommits) {
    const sha = commitSummary.sha;
    if (!sha) continue;

    let detail;
    try {
      detail = await github.getCommitDetail(repo.owner, repo.name, sha);
    } catch {
      detail = commitSummary;
    }

    const commitMessage = detail.commit?.message || null;
    const author = detail.commit?.author?.name || detail.author?.login || null;
    const committedAt = detail.commit?.author?.date ? new Date(detail.commit.author.date) : null;
    const commitUrl =
      detail.html_url || `https://github.com/${repo.owner}/${repo.name}/commit/${sha}`;

    const changedFilesEvidence: HistoricalChangedFileEvidence[] = (detail.files || []).map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
    }));

    // Entity linking: map changed files to repository architecture entities
    const changedPaths = (detail.files || []).map((f) => f.filename);
    const affectedPaths =
      changedPaths.length > 0 ? changedPaths : options.path ? [options.path] : [];

    // PR Association
    let prNumber: number | null = null;
    let prUrl: string | null = null;
    let prTitle: string | null = null;
    let prBody: string | null = null;

    try {
      const prs = await github.getCommitPullRequests(repo.owner, repo.name, sha);
      if (prs && prs.length > 0) {
        // Prefer merged PR if multiple exist, else first PR
        const selectedPR = prs.find((p) => p.merged_at !== null) || prs[0];
        if (selectedPR) {
          prNumber = selectedPR.number;
          prUrl = selectedPR.html_url;
          prTitle = selectedPR.title;
          prBody = selectedPR.body;
        }
      }
    } catch {
      // Non-fatal: PR retrieval failures leave PR fields null
    }

    // Health Delta Calculation
    let healthScoreDelta: number | null = null;
    const commitScore = snapshotCommitMap.get(sha);
    if (commitScore !== undefined) {
      // Find preceding snapshot in chronological timeline
      const snapIdx = healthSnapshots.findIndex((s) => s.commitHash === sha);
      const precedingSnap = snapIdx > 0 ? healthSnapshots[snapIdx - 1] : undefined;
      if (precedingSnap) {
        healthScoreDelta = commitScore - precedingSnap.healthScore;
      }
    }

    const changedFilesJson = changedFilesEvidence as unknown as Prisma.InputJsonValue;

    // Idempotent Upsert into database
    const existing = await prisma.architectureDecision.findUnique({
      where: {
        repositoryId_commitHash: {
          repositoryId,
          commitHash: sha,
        },
      },
    });

    if (existing) {
      await prisma.architectureDecision.update({
        where: { id: existing.id },
        data: {
          commitUrl,
          commitMessage,
          author,
          committedAt,
          prNumber,
          prUrl,
          prTitle,
          prBody,
          affectedPaths,
          changedFiles: changedFilesJson,
          healthScoreDelta,
          updatedAt: new Date(),
        },
      });
      decisionsUpdated++;
    } else {
      await prisma.architectureDecision.create({
        data: {
          repositoryId,
          commitHash: sha,
          commitUrl,
          commitMessage,
          author,
          committedAt,
          prNumber,
          prUrl,
          prTitle,
          prBody,
          affectedPaths,
          changedFiles: changedFilesJson,
          healthScoreDelta,
          isConfirmed: false,
        },
      });
      decisionsCreated++;
    }
  }

  const latestCommitHash = rawCommits[0]?.sha || null;

  return {
    repositoryId,
    commitsMined: rawCommits.length,
    decisionsCreated,
    decisionsUpdated,
    decisionsSkipped,
    latestCommitHash,
  };
}

/**
 * Retrieves paginated ArchitectureDecision records for a repository.
 */
export async function findArchitectureDecisions(
  repositoryId: string,
  userId: string,
  options: FindDecisionsOptions = {},
): Promise<{
  items: ArchitectureDecision[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  await assertRepositoryOwnership(repositoryId, userId);

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const whereClause: Prisma.ArchitectureDecisionWhereInput = { repositoryId };

  if (options.path) {
    whereClause.affectedPaths = { has: options.path };
  }

  if (options.prNumber) {
    whereClause.prNumber = options.prNumber;
  }

  const [records, total] = await Promise.all([
    prisma.architectureDecision.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.architectureDecision.count({ where: whereClause }),
  ]);

  const items: ArchitectureDecision[] = records.map((r) => ({
    id: r.id,
    repositoryId: r.repositoryId,
    commitHash: r.commitHash,
    commitUrl: r.commitUrl,
    commitMessage: r.commitMessage,
    author: r.author,
    committedAt: r.committedAt ? r.committedAt.toISOString() : null,
    prNumber: r.prNumber,
    prUrl: r.prUrl,
    prTitle: r.prTitle,
    prBody: r.prBody,
    affectedPaths: r.affectedPaths,
    changedFiles: r.changedFiles
      ? (r.changedFiles as unknown as HistoricalChangedFileEvidence[])
      : null,
    healthScoreDelta: r.healthScoreDelta,
    evidenceMetadata: r.evidenceMetadata ? (r.evidenceMetadata as Record<string, unknown>) : null,
    isConfirmed: r.isConfirmed,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    total,
    page,
    limit,
    totalPages,
  };
}

/**
 * Retrieves a single ArchitectureDecision record by ID.
 */
export async function findArchitectureDecisionById(
  repositoryId: string,
  decisionId: string,
  userId: string,
): Promise<ArchitectureDecision> {
  await assertRepositoryOwnership(repositoryId, userId);

  const record = await prisma.architectureDecision.findFirst({
    where: {
      id: decisionId,
      repositoryId,
    },
  });

  if (!record) {
    throw new Error(`Architecture decision not found: ${decisionId}`);
  }

  return {
    id: record.id,
    repositoryId: record.repositoryId,
    commitHash: record.commitHash,
    commitUrl: record.commitUrl,
    commitMessage: record.commitMessage,
    author: record.author,
    committedAt: record.committedAt ? record.committedAt.toISOString() : null,
    prNumber: record.prNumber,
    prUrl: record.prUrl,
    prTitle: record.prTitle,
    prBody: record.prBody,
    affectedPaths: record.affectedPaths,
    changedFiles: record.changedFiles
      ? (record.changedFiles as unknown as HistoricalChangedFileEvidence[])
      : null,
    healthScoreDelta: record.healthScoreDelta,
    evidenceMetadata: record.evidenceMetadata
      ? (record.evidenceMetadata as Record<string, unknown>)
      : null,
    isConfirmed: record.isConfirmed,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Updates human confirmation status for an ArchitectureDecision record.
 */
export async function confirmArchitectureDecision(
  repositoryId: string,
  decisionId: string,
  userId: string,
  isConfirmed: boolean,
): Promise<ArchitectureDecision> {
  await assertRepositoryOwnership(repositoryId, userId);

  const existing = await prisma.architectureDecision.findFirst({
    where: {
      id: decisionId,
      repositoryId,
    },
  });

  if (!existing) {
    throw new Error(`Architecture decision not found: ${decisionId}`);
  }

  const updated = await prisma.architectureDecision.update({
    where: { id: decisionId },
    data: { isConfirmed },
  });

  return {
    id: updated.id,
    repositoryId: updated.repositoryId,
    commitHash: updated.commitHash,
    commitUrl: updated.commitUrl,
    commitMessage: updated.commitMessage,
    author: updated.author,
    committedAt: updated.committedAt ? updated.committedAt.toISOString() : null,
    prNumber: updated.prNumber,
    prUrl: updated.prUrl,
    prTitle: updated.prTitle,
    prBody: updated.prBody,
    affectedPaths: updated.affectedPaths,
    changedFiles: updated.changedFiles
      ? (updated.changedFiles as unknown as HistoricalChangedFileEvidence[])
      : null,
    healthScoreDelta: updated.healthScoreDelta,
    evidenceMetadata: updated.evidenceMetadata
      ? (updated.evidenceMetadata as Record<string, unknown>)
      : null,
    isConfirmed: updated.isConfirmed,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}
