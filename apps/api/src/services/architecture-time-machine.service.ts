// =============================================================================
// ForgeMind API — Architecture Time Machine Service
// =============================================================================
//
// Provides historical architecture timeline exploration, historical snapshot scrubber datasets,
// and deterministic snapshot A vs snapshot B structural comparison with explainable consequences.
// Reuses existing ArchitectureHealthSnapshot records, history comparison, and drift engines.
// Zero LLM non-determinism — 100% rule-based and evidence-grounded evaluation.
// =============================================================================

import type {
  ArchitectureTimeMachineComparisonResponse,
  ArchitectureTimeMachineSnapshotItem,
  ArchitectureTimelineResponse,
  HealthFinding,
} from '@forgemind/types';

import { prisma } from '../lib/prisma.js';
import { getArchitectureDrift } from './architecture-drift.service.js';
import { generateArchitectureHealthReport } from './architecture-health.service.js';
import { assertRepositoryOwnership, findRepositoryById } from './repository.service.js';

/**
 * Transforms a database ArchitectureHealthSnapshot into a structured Time Machine timeline item.
 */

function formatSnapshotItem(snapshot: {
  id: string;
  analysisJobId: string;
  commitHash: string | null;
  healthScore: number;
  grade: string;
  totalFiles: number;
  totalDependencies: number;
  findings: unknown;
  createdAt: Date;
  analysisJob?: {
    prNumber: number | null;
    stageLabel: string | null;
    headSha: string | null;
  } | null;
}): ArchitectureTimeMachineSnapshotItem {
  const findingsList = Array.isArray(snapshot.findings)
    ? (snapshot.findings as HealthFinding[])
    : [];

  return {
    snapshotId: snapshot.id,
    analysisJobId: snapshot.analysisJobId,
    commitHash: snapshot.commitHash || snapshot.analysisJob?.headSha || null,
    prNumber: snapshot.analysisJob?.prNumber ?? null,
    prTitle: snapshot.analysisJob?.stageLabel || null,
    healthScore: snapshot.healthScore,
    grade: snapshot.grade as 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F',
    totalFiles: snapshot.totalFiles,
    totalDependencies: snapshot.totalDependencies,
    findingsCount: findingsList.length,
    evaluatedAt: snapshot.createdAt.toISOString(),
  };
}

/**
 * Retrieves the full chronological Architecture Time Machine timeline for a repository.
 */
export async function getArchitectureTimeMachineTimeline(
  repositoryId: string,
  userId: string,
): Promise<ArchitectureTimelineResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const snapshots = await prisma.architectureHealthSnapshot.findMany({
    where: { repositoryId },
    include: { analysisJob: true },
    orderBy: { createdAt: 'asc' },
  });

  const timeline: ArchitectureTimeMachineSnapshotItem[] = [];

  if (snapshots.length > 0) {
    for (let i = 0; i < snapshots.length; i++) {
      const currentSnap = snapshots[i];
      if (!currentSnap) continue;

      const item = formatSnapshotItem(currentSnap);

      if (i > 0) {
        const prevSnap = snapshots[i - 1];
        if (prevSnap) {
          const scoreDelta = currentSnap.healthScore - prevSnap.healthScore;
          const totalDepDelta = Math.abs(
            currentSnap.totalDependencies - prevSnap.totalDependencies,
          );

          item.driftFromPrevious = {
            driftLevel:
              scoreDelta <= -15
                ? 'CRITICAL'
                : scoreDelta <= -5
                  ? 'HIGH'
                  : scoreDelta < 0
                    ? 'MEDIUM'
                    : 'LOW',
            scoreDelta,
            changedModulesCount: scoreDelta !== 0 ? 1 : 0,
            affectedLayersCount:
              currentSnap.layerViolationCount > prevSnap.layerViolationCount ? 2 : 1,
            totalDependencyDelta: totalDepDelta,
          };
        }
      }

      timeline.push(item);
    }
  } else {
    // Fallback if zero persisted snapshots exist in database
    const currentReport = await generateArchitectureHealthReport(repositoryId, userId);
    timeline.push({
      snapshotId: 'current-snapshot',
      analysisJobId: 'latest-analysis',
      commitHash: 'latest',
      prNumber: null,
      prTitle: 'Current Architecture State',
      healthScore: currentReport.healthScore,
      grade: currentReport.grade,
      totalFiles: currentReport.metrics.totalFiles,
      totalDependencies: currentReport.metrics.totalDependencies,
      findingsCount: currentReport.findings.length,
      evaluatedAt: currentReport.evaluatedAt,
      driftFromPrevious: null,
    });
  }

  const currentHealthScore = timeline[timeline.length - 1]?.healthScore ?? 100;

  return {
    repositoryId,
    currentHealthScore,
    totalSnapshots: timeline.length,
    timeline,
  };
}

/**
 * Compares two historical snapshot states (fromSnapshot vs toSnapshot) deterministically.
 */
export async function compareArchitectureTimeMachineSnapshots(
  repositoryId: string,
  userId: string,
  fromSnapshotId?: string,
  toSnapshotId?: string,
): Promise<ArchitectureTimeMachineComparisonResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // 1. Resolve Target/Current Snapshot (toSnapshot)
  const toSnapshotRaw = toSnapshotId
    ? await prisma.architectureHealthSnapshot.findFirst({
        where: {
          repositoryId,
          OR: [{ id: toSnapshotId }, { analysisJobId: toSnapshotId }],
        },
        include: { analysisJob: true },
      })
    : await prisma.architectureHealthSnapshot.findFirst({
        where: { repositoryId },
        include: { analysisJob: true },
        orderBy: { createdAt: 'desc' },
      });

  // 2. Resolve Baseline Snapshot (fromSnapshot)
  let fromSnapshotRaw = fromSnapshotId
    ? await prisma.architectureHealthSnapshot.findFirst({
        where: {
          repositoryId,
          OR: [{ id: fromSnapshotId }, { analysisJobId: fromSnapshotId }],
        },
        include: { analysisJob: true },
      })
    : null;

  if (!fromSnapshotRaw && !fromSnapshotId && toSnapshotRaw) {
    // Pick 2nd most recent snapshot if fromSnapshotId omitted
    const recentSnapshots = await prisma.architectureHealthSnapshot.findMany({
      where: { repositoryId },
      include: { analysisJob: true },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    if (recentSnapshots.length >= 2 && recentSnapshots[1]) {
      fromSnapshotRaw = recentSnapshots[1];
    }
  }

  if (!toSnapshotRaw) {
    throw new Error(`No architectural snapshots found for repository ${repositoryId}`);
  }

  const toSnapshot = formatSnapshotItem(toSnapshotRaw);
  const fromSnapshot = fromSnapshotRaw ? formatSnapshotItem(fromSnapshotRaw) : toSnapshot;

  // Handle same-snapshot comparison cleanly
  const isSameSnapshot = fromSnapshot.snapshotId === toSnapshot.snapshotId;

  const drift = await getArchitectureDrift(repositoryId, userId, {
    baselineAnalysisId: isSameSnapshot ? toSnapshot.analysisJobId : fromSnapshot.analysisJobId,
    currentAnalysisId: toSnapshot.analysisJobId,
  });

  // Synthesize deterministic consequence explanation
  const fromCommit = fromSnapshot.commitHash
    ? `commit ${fromSnapshot.commitHash.slice(0, 7)}`
    : 'baseline';
  const toCommit = toSnapshot.commitHash
    ? `commit ${toSnapshot.commitHash.slice(0, 7)}`
    : 'target state';

  const scoreChangeStr =
    drift.healthScoreMovement.scoreDelta === 0
      ? `Health score remained stable at ${drift.healthScoreMovement.currentScore}.`
      : `Health score moved from ${drift.healthScoreMovement.baselineScore} → ${drift.healthScoreMovement.currentScore} (${drift.healthScoreMovement.scoreDelta >= 0 ? '+' : ''}${drift.healthScoreMovement.scoreDelta} pts).`;

  const consequenceExplanation = isSameSnapshot
    ? `Identical snapshot state compared. ${scoreChangeStr} Zero architectural drift or structural shift detected.`
    : `Historical comparison from ${fromCommit} to ${toCommit}: ${scoreChangeStr} Architectural drift level is evaluated as ${drift.driftLevel}. Primary drivers: ${drift.reasons.join(' ')}`;

  const associatedPR = toSnapshotRaw.analysisJob?.prNumber
    ? {
        prNumber: toSnapshotRaw.analysisJob.prNumber,
        headSha: toSnapshotRaw.analysisJob.headSha || toSnapshotRaw.commitHash || '',
        baseSha: toSnapshotRaw.analysisJob.baseSha || null,
      }
    : null;

  return {
    repositoryId,
    fromSnapshot,
    toSnapshot,
    drift,
    associatedPR,
    architecturalConsequenceExplanation: consequenceExplanation,
    evaluatedAt: new Date().toISOString(),
  };
}
