// =============================================================================
// ForgeMind API — Architectural Health Timeline & Historical Trend Engine (Sprint 8 Task 5)
// =============================================================================
//
// Computes historical health score trends across analysis runs and compares
// baseline vs current architectural health snapshots to detect regressions,
// new anti-pattern breaches, and resolved architectural issues.
// =============================================================================

import type {
  ArchitectureHealthComparisonResponse,
  ArchitectureHealthHistoryResponse,
  ArchitectureHealthPoint,
  ArchitectureHealthScoreBreakdown,
  HealthFinding,
  HealthTrendDirection,
  RegressionSeverity,
} from '@forgemind/types';

import { generateArchitectureHealthReport } from './architecture-health.service.js';
import { assertRepositoryOwnership } from './repository.service.js';

import { prisma } from '../lib/prisma.js';

/**
 * Retrieves historical architecture health trend points for a repository.
 */
export async function getArchitectureHealthHistory(
  repositoryId: string,
  userId: string,
): Promise<ArchitectureHealthHistoryResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  // Fetch recent persisted health snapshots
  const snapshots = await prisma.architectureHealthSnapshot.findMany({
    where: { repositoryId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const points: ArchitectureHealthPoint[] = [];
  let currentHealthScore = 100;

  if (snapshots.length > 0) {
    currentHealthScore = snapshots[0]?.healthScore ?? 100;

    snapshots.forEach((snapshot) => {
      points.push({
        analysisId: snapshot.analysisJobId,
        commitHash: snapshot.commitHash || null,
        healthScore: snapshot.healthScore,
        grade: snapshot.grade as 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F',
        circularCycleCount: snapshot.circularCycleCount,
        layerViolationCount: snapshot.layerViolationCount,
        hotspotCount: snapshot.hotspotCount,
        orphanExportCount: snapshot.orphanExportCount,
        evaluatedAt: snapshot.createdAt.toISOString(),
      });
    });

    // Sort chronological ascending (oldest first)
    points.reverse();
  } else {
    // Phase 6.1 backward-compatible fallback: single point baseline from live evaluation
    const currentReport = await generateArchitectureHealthReport(repositoryId, userId);
    currentHealthScore = currentReport.healthScore;

    points.push({
      analysisId: 'current-snapshot',
      commitHash: 'latest',
      healthScore: currentReport.healthScore,
      grade: currentReport.grade,
      circularCycleCount: currentReport.metrics.circularCycleCount,
      layerViolationCount: currentReport.metrics.layerViolationCount,
      hotspotCount: currentReport.metrics.hotspotCount,
      orphanExportCount: currentReport.metrics.orphanExportCount,
      evaluatedAt: currentReport.evaluatedAt,
    });
  }

  // Determine overall trend
  let overallTrend: HealthTrendDirection = 'STABLE';
  if (points.length >= 2) {
    const firstScore = points[0]?.healthScore ?? currentHealthScore;
    const lastScore = points[points.length - 1]?.healthScore ?? currentHealthScore;
    if (lastScore > firstScore) overallTrend = 'IMPROVED';
    else if (lastScore < firstScore) overallTrend = 'DEGRADED';
  }

  return {
    repositoryId,
    currentHealthScore,
    overallTrend,
    points,
  };
}

/**
 * Generates a stable composite key for a HealthFinding to compare across snapshots.
 */
function getFindingKey(finding: HealthFinding): string {
  const affected = Array.isArray(finding.affectedFilePaths)
    ? [...finding.affectedFilePaths].sort().join(',')
    : '';
  return `${finding.category}::${finding.title}::${affected}`;
}

/**
 * Compares two architecture health snapshots to detect score delta and new/resolved findings.
 */
export async function compareArchitectureHealthSnapshots(
  repositoryId: string,
  userId: string,
  baselineAnalysisId?: string,
  currentAnalysisId?: string,
): Promise<ArchitectureHealthComparisonResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  // 1. Fetch current snapshot (or fallback to latest persisted)
  const currentSnapshot = currentAnalysisId
    ? await prisma.architectureHealthSnapshot.findFirst({
        where: {
          repositoryId,
          OR: [{ analysisJobId: currentAnalysisId }, { id: currentAnalysisId }],
        },
      })
    : await prisma.architectureHealthSnapshot.findFirst({
        where: { repositoryId },
        orderBy: { createdAt: 'desc' },
      });

  // 2. Fetch baseline snapshot (if requested or previous)
  let baselineSnapshot = baselineAnalysisId
    ? await prisma.architectureHealthSnapshot.findFirst({
        where: {
          repositoryId,
          OR: [{ analysisJobId: baselineAnalysisId }, { id: baselineAnalysisId }],
        },
      })
    : null;

  if (!baselineSnapshot && !baselineAnalysisId && currentSnapshot) {
    // If baseline not specified, pick 2nd most recent snapshot
    const recentSnapshots = await prisma.architectureHealthSnapshot.findMany({
      where: { repositoryId },
      orderBy: { createdAt: 'desc' },
      take: 2,
    });
    if (recentSnapshots.length >= 2 && recentSnapshots[1]) {
      baselineSnapshot = recentSnapshots[1];
    }
  }

  // Fallback to live report if no snapshots exist in database at all
  let currentFindings: HealthFinding[] = [];
  let currentScoreBreakdown: ArchitectureHealthScoreBreakdown = {
    baseScore: 100,
    cyclePenalty: 0,
    layerViolationPenalty: 0,
    hotspotPenalty: 0,
    orphanPenalty: 0,
    finalScore: 100,
    grade: 'A+',
  };
  let currentHealthScore = 100;

  if (currentSnapshot) {
    currentHealthScore = currentSnapshot.healthScore;
    currentFindings = (currentSnapshot.findings as unknown as HealthFinding[]) || [];
    currentScoreBreakdown =
      (currentSnapshot.scoreBreakdown as unknown as ArchitectureHealthScoreBreakdown) ||
      currentScoreBreakdown;
  } else {
    const currentReport = await generateArchitectureHealthReport(repositoryId, userId);
    currentHealthScore = currentReport.healthScore;
    currentFindings = currentReport.findings;
    currentScoreBreakdown = currentReport.scoreBreakdown;
  }

  let baselineHealthScore = currentHealthScore;
  let baselineFindings: HealthFinding[] = [];
  let baselineScoreBreakdown: ArchitectureHealthScoreBreakdown = currentScoreBreakdown;

  if (baselineSnapshot) {
    baselineHealthScore = baselineSnapshot.healthScore;
    baselineFindings = (baselineSnapshot.findings as unknown as HealthFinding[]) || [];
    baselineScoreBreakdown =
      (baselineSnapshot.scoreBreakdown as unknown as ArchitectureHealthScoreBreakdown) ||
      currentScoreBreakdown;
  }

  const healthDelta = currentHealthScore - baselineHealthScore;

  let trend: HealthTrendDirection = 'STABLE';
  if (healthDelta > 0) trend = 'IMPROVED';
  else if (healthDelta < 0) trend = 'DEGRADED';

  // Compute finding diffs
  const baselineFindingMap = new Map<string, HealthFinding>();
  baselineFindings.forEach((f) => baselineFindingMap.set(getFindingKey(f), f));

  const currentFindingMap = new Map<string, HealthFinding>();
  currentFindings.forEach((f) => currentFindingMap.set(getFindingKey(f), f));

  const newFindings: HealthFinding[] = [];
  const resolvedFindings: HealthFinding[] = [];
  const unmodifiedFindings: HealthFinding[] = [];

  if (baselineSnapshot && baselineSnapshot.id !== currentSnapshot?.id) {
    currentFindings.forEach((f) => {
      const key = getFindingKey(f);
      if (baselineFindingMap.has(key)) {
        unmodifiedFindings.push(f);
      } else {
        newFindings.push(f);
      }
    });

    baselineFindings.forEach((f) => {
      const key = getFindingKey(f);
      if (!currentFindingMap.has(key)) {
        resolvedFindings.push(f);
      }
    });
  } else {
    unmodifiedFindings.push(...currentFindings);
  }

  const isRegressed = healthDelta < -5 || newFindings.length > 0;

  let regressionSeverity: RegressionSeverity = 'NONE';
  if (isRegressed) {
    if (healthDelta <= -15 || newFindings.some((f) => f.severity === 'critical')) {
      regressionSeverity = 'CRITICAL';
    } else {
      regressionSeverity = 'WARNING';
    }
  }

  return {
    repositoryId,
    baselineAnalysisId:
      baselineSnapshot?.analysisJobId || baselineAnalysisId || 'previous-snapshot',
    currentAnalysisId: currentSnapshot?.analysisJobId || currentAnalysisId || 'latest-snapshot',
    baselineHealthScore,
    currentHealthScore,
    healthDelta,
    trend,
    isRegressed,
    regressionSeverity,
    newFindings,
    resolvedFindings,
    unmodifiedFindings,
    scoreBreakdownDelta: {
      baseScoreDelta: 0,
      cyclePenaltyDelta: currentScoreBreakdown.cyclePenalty - baselineScoreBreakdown.cyclePenalty,
      layerViolationPenaltyDelta:
        currentScoreBreakdown.layerViolationPenalty - baselineScoreBreakdown.layerViolationPenalty,
      hotspotPenaltyDelta:
        currentScoreBreakdown.hotspotPenalty - baselineScoreBreakdown.hotspotPenalty,
      orphanPenaltyDelta:
        currentScoreBreakdown.orphanPenalty - baselineScoreBreakdown.orphanPenalty,
    },
    evaluatedAt: new Date().toISOString(),
  };
}
