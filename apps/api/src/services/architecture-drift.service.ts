// =============================================================================
// ForgeMind API — Architecture Time Machine & Architecture Drift Intelligence Engine
// =============================================================================
//
// Calculates deterministic architecture drift metrics, changed modules, affected layers,
// dependency churn, cross-layer breaches, and explainable reasons comparing snapshots over time.
// Zero LLM dependencies — pure deterministic, mathematical, and rule-based evaluation.
// =============================================================================

import type {
  ArchitectureCrossLayerDependency,
  ArchitectureDrift,
  ArchitectureDriftEdgeShift,
  ArchitectureDriftLevel,
  HealthFinding,
} from '@forgemind/types';

import type { ArchitectureHealthSnapshot } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import { classifyPathLayer } from './architecture-health.service.js';
import { compareArchitectureHealthSnapshots } from './architecture-history.service.js';
import {
  extractComponent,
  extractModule,
  mapArchitecturalLayers,
} from './architecture-impact.service.js';
import { getGatekeeperConfig } from './gatekeeper-config.service.js';
import { evaluatePRGatekeeperPolicy } from './pr-gatekeeper-policy.service.js';
import { assertRepositoryOwnership, findRepositoryById } from './repository.service.js';

export interface ComputeDriftOptions {
  baselineAnalysisId?: string;
  currentAnalysisId?: string;
  prNumber?: number;
}

/**
 * Maps a file path to a display name for its architectural layer.
 */
export function getLayerDisplayName(filePath: string): string {
  const classified = classifyPathLayer(filePath);
  switch (classified) {
    case 'api':
      return 'API & Controller Layer';
    case 'domain_logic':
      return 'Domain & Business Logic Layer';
    case 'data_layer':
      return 'Data Access & Database Layer';
    case 'frontend':
      return 'Presentation & User Interface Layer';
    case 'configuration':
    default:
      return 'Core Primitives & Shared Layer';
  }
}

/**
 * Deterministically evaluates the ArchitectureDriftLevel.
 */
export function calculateArchitectureDriftLevel(params: {
  scoreDelta: number;
  newFindings: HealthFinding[];
  resolvedFindingsCount: number;
  changedModulesCount: number;
  affectedLayersCount: number;
  totalDependencyDelta: number;
  newCrossLayerDepsCount: number;
  policyOutcome: 'pass' | 'fail' | 'neutral';
}): ArchitectureDriftLevel {
  const {
    scoreDelta,
    newFindings,
    resolvedFindingsCount,
    changedModulesCount,
    affectedLayersCount,
    totalDependencyDelta,
    newCrossLayerDepsCount,
    policyOutcome,
  } = params;

  const criticalCount = newFindings.filter((f) => f.severity === 'critical').length;
  const highCount = newFindings.filter((f) => f.severity === 'high').length;
  const hasStructureChanges =
    changedModulesCount > 0 || affectedLayersCount > 0 || totalDependencyDelta > 0;

  // 0. Absolute zero change
  if (
    !hasStructureChanges &&
    newFindings.length === 0 &&
    resolvedFindingsCount === 0 &&
    scoreDelta === 0
  ) {
    return 'NONE';
  }

  // 1. CRITICAL Level
  if (
    policyOutcome === 'fail' ||
    scoreDelta <= -15 ||
    criticalCount > 0 ||
    (affectedLayersCount >= 4 && scoreDelta <= -10)
  ) {
    return 'CRITICAL';
  }

  // 2. HIGH Level
  if (
    scoreDelta <= -5 ||
    highCount > 0 ||
    newCrossLayerDepsCount >= 2 ||
    (affectedLayersCount >= 3 && scoreDelta < 0) ||
    (totalDependencyDelta >= 10 && scoreDelta < 0)
  ) {
    return 'HIGH';
  }

  // Handle Architecture Improvement / Bug Cleanup Safety:
  // If health score improved or stayed stable and NO critical/high findings were introduced,
  // cap drift at LOW or NONE so refactorings/cleanups do not produce erroneous high drift.
  const isArchitectureImproving = scoreDelta >= 0 && criticalCount === 0 && highCount === 0;

  if (isArchitectureImproving) {
    return 'LOW';
  }

  // 3. MEDIUM Level
  if (
    changedModulesCount >= 2 ||
    affectedLayersCount >= 2 ||
    newCrossLayerDepsCount >= 1 ||
    totalDependencyDelta >= 3 ||
    newFindings.length > 0 ||
    scoreDelta < 0
  ) {
    return 'MEDIUM';
  }

  // 4. LOW Level
  return 'LOW';
}

/**
 * Generates human-readable, explainable reasons for a drift outcome.
 */
export function generateDriftReasons(params: {
  driftLevel: ArchitectureDriftLevel;
  changedModules: string[];
  affectedLayers: string[];
  totalDependencyDelta: number;
  addedEdgesCount: number;
  removedEdgesCount: number;
  newCrossLayerDeps: ArchitectureCrossLayerDependency[];
  baselineHealthScore: number;
  currentHealthScore: number;
  scoreDelta: number;
  newFindings: HealthFinding[];
  resolvedFindings: HealthFinding[];
  policyOutcome: 'pass' | 'fail' | 'neutral';
  baselineFound: boolean;
}): string[] {
  const {
    driftLevel,
    changedModules,
    affectedLayers,
    totalDependencyDelta,
    addedEdgesCount,
    removedEdgesCount,
    newCrossLayerDeps,
    baselineHealthScore,
    currentHealthScore,
    scoreDelta,
    newFindings,
    resolvedFindings,
    policyOutcome,
    baselineFound,
  } = params;

  const reasons: string[] = [];

  if (!baselineFound) {
    reasons.push(
      'No baseline snapshot found for comparison; evaluated against current codebase baseline.',
    );
  }

  if (driftLevel === 'NONE' && reasons.length === 0) {
    reasons.push('No structural changes, layer breaches, or health regressions detected.');
    return reasons;
  }

  // Module change summary
  if (changedModules.length > 0) {
    if (changedModules.length <= 3) {
      reasons.push(
        `${changedModules.length} architectural module(s) changed: ${changedModules.join(', ')}.`,
      );
    } else {
      reasons.push(`${changedModules.length} architectural modules changed.`);
    }
  }

  // Layer impact
  if (affectedLayers.length > 0) {
    reasons.push(`${affectedLayers.length} architectural layer(s) affected.`);
  }

  // Cross-layer breaches
  if (newCrossLayerDeps.length > 0) {
    reasons.push(
      `${newCrossLayerDeps.length} new cross-layer dependency relationship(s) introduced.`,
    );
    newCrossLayerDeps.slice(0, 3).forEach((dep) => {
      reasons.push(
        `${dep.sourceLayer} → ${dep.targetLayer} dependency detected (${dep.sourceFile}).`,
      );
    });
  }

  // Dependency churn
  if (totalDependencyDelta > 0) {
    reasons.push(
      `Dependency graph churn: +/- ${totalDependencyDelta} edge(s) (+${addedEdgesCount} added, -${removedEdgesCount} removed).`,
    );
  }

  // Health score movement
  if (scoreDelta !== 0) {
    const sign = scoreDelta > 0 ? '+' : '';
    reasons.push(
      `Architecture health score moved from ${baselineHealthScore} → ${currentHealthScore} (${sign}${scoreDelta} points).`,
    );
  } else {
    reasons.push(`Architecture health score stable at ${currentHealthScore}.`);
  }

  // Findings introduced vs resolved
  const criticalCount = newFindings.filter((f) => f.severity === 'critical').length;
  const highCount = newFindings.filter((f) => f.severity === 'high').length;

  if (newFindings.length > 0) {
    const details: string[] = [];
    if (criticalCount > 0) details.push(`${criticalCount} Critical`);
    if (highCount > 0) details.push(`${highCount} High`);
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    reasons.push(`Introduced ${newFindings.length} new architectural finding(s)${detailStr}.`);
  }

  if (resolvedFindings.length > 0) {
    reasons.push(
      `Resolved ${resolvedFindings.length} previously detected architectural finding(s).`,
    );
  }

  if (policyOutcome === 'fail') {
    reasons.push('Triggered PR Gatekeeper policy failure condition.');
  }

  return reasons;
}

/**
 * Computes deterministic Architecture Drift comparing two snapshots or PR analysis baseline vs head.
 */
export async function getArchitectureDrift(
  repositoryId: string,
  userId: string,
  options: ComputeDriftOptions = {},
): Promise<ArchitectureDrift> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  let prJob = null;

  if (options.prNumber) {
    prJob = await prisma.analysisJob.findFirst({
      where: { repositoryId, prNumber: options.prNumber },
      include: { healthSnapshot: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!prJob) {
      throw new Error(`No PR analysis found for PR #${options.prNumber}`);
    }
  }

  // 1. Compare snapshots using existing history comparison service
  const comparison = await compareArchitectureHealthSnapshots(
    repositoryId,
    userId,
    options.baselineAnalysisId || (prJob ? prJob.baseSha || undefined : undefined),
    options.currentAnalysisId || (prJob ? prJob.id : undefined),
  );

  const currentSnapshot = await prisma.architectureHealthSnapshot.findFirst({
    where: {
      repositoryId,
      OR: [{ analysisJobId: comparison.currentAnalysisId }, { id: comparison.currentAnalysisId }],
    },
  });

  const baselineSnapshot = comparison.baselineAnalysisId
    ? await prisma.architectureHealthSnapshot.findFirst({
        where: {
          repositoryId,
          OR: [
            { analysisJobId: comparison.baselineAnalysisId },
            { id: comparison.baselineAnalysisId },
          ],
        },
      })
    : null;

  const baselineFound = Boolean(baselineSnapshot && baselineSnapshot.id !== currentSnapshot?.id);

  const effectiveCurrentSnapshot: ArchitectureHealthSnapshot =
    currentSnapshot ??
    ({
      id: 'synthetic-current',
      repositoryId,
      analysisJobId: comparison.currentAnalysisId,
      commitHash: null,
      healthScore: comparison.currentHealthScore,
      grade: 'A+',
      totalFiles: 0,
      totalDependencies: 0,
      circularCycleCount: 0,
      layerViolationCount: 0,
      hotspotCount: 0,
      orphanExportCount: 0,
      scoreBreakdown: {},
      findings: comparison.newFindings,
      fanMetrics: [],
      createdAt: new Date(),
    } as unknown as ArchitectureHealthSnapshot);

  // Evaluate PR Gatekeeper policy for policyOutcome
  const repoConfig = await getGatekeeperConfig(repositoryId);
  const policyResult = evaluatePRGatekeeperPolicy(comparison, effectiveCurrentSnapshot, repoConfig);

  // 2. Gather touched files from new findings and changed file dependencies
  const newFindings = comparison.newFindings;
  const resolvedFindings = comparison.resolvedFindings;
  const unmodifiedFindings = comparison.unmodifiedFindings;

  const affectedFilesSet = new Set<string>();
  newFindings.forEach((f) => {
    (f.affectedFilePaths || []).forEach((fp) => affectedFilesSet.add(fp));
  });

  // If DB has file dependencies, collect dependency edge shifts
  const dbDependencies = await prisma.fileDependency.findMany({
    where: { repositoryId, isExternal: false },
  });

  const newCrossLayerDeps: ArchitectureCrossLayerDependency[] = [];
  const edgeShifts: ArchitectureDriftEdgeShift[] = [];

  for (const dep of dbDependencies) {
    const srcLayer = getLayerDisplayName(dep.sourcePath);
    const tgtLayer = getLayerDisplayName(dep.targetPath);

    // Cross layer relationship check (e.g. Presentation/UI -> Data Access, or Data Access -> API)
    if (
      srcLayer !== tgtLayer &&
      ((srcLayer.includes('Presentation') && tgtLayer.includes('Data Access')) ||
        (srcLayer.includes('Data Access') && tgtLayer.includes('API')))
    ) {
      newCrossLayerDeps.push({
        sourceLayer: srcLayer,
        targetLayer: tgtLayer,
        sourceFile: dep.sourcePath,
        targetFile: dep.targetPath,
      });
    }

    if (affectedFilesSet.has(dep.sourcePath) || affectedFilesSet.has(dep.targetPath)) {
      edgeShifts.push({
        sourcePath: dep.sourcePath,
        targetPath: dep.targetPath,
        type: 'added',
      });
    }
  }

  const changedFilesList = Array.from(affectedFilesSet).sort();

  // Components & modules
  const componentsSet = new Set<string>();
  const modulesSet = new Set<string>();
  changedFilesList.forEach((fp) => {
    componentsSet.add(extractComponent(fp));
    modulesSet.add(extractModule(fp));
  });

  const changedComponents = Array.from(componentsSet).sort();
  const changedModules = Array.from(modulesSet).sort();
  const affectedLayers = mapArchitecturalLayers(changedFilesList, newFindings);

  // Dependency churn
  const currentDepsCount = currentSnapshot?.totalDependencies ?? dbDependencies.length;
  const baselineDepsCount = baselineSnapshot?.totalDependencies ?? currentDepsCount;
  const totalDependencyDelta = Math.abs(currentDepsCount - baselineDepsCount);
  const addedEdgesCount =
    currentDepsCount > baselineDepsCount ? currentDepsCount - baselineDepsCount : 0;
  const removedEdgesCount =
    baselineDepsCount > currentDepsCount ? baselineDepsCount - currentDepsCount : 0;

  const scoreDelta = comparison.healthDelta;

  const driftLevel = calculateArchitectureDriftLevel({
    scoreDelta,
    newFindings,
    resolvedFindingsCount: resolvedFindings.length,
    changedModulesCount: changedModules.length,
    affectedLayersCount: affectedLayers.length,
    totalDependencyDelta,
    newCrossLayerDepsCount: newCrossLayerDeps.length,
    policyOutcome: policyResult.outcome,
  });

  const reasons = generateDriftReasons({
    driftLevel,
    changedModules,
    affectedLayers,
    totalDependencyDelta,
    addedEdgesCount,
    removedEdgesCount,
    newCrossLayerDeps,
    baselineHealthScore: comparison.baselineHealthScore,
    currentHealthScore: comparison.currentHealthScore,
    scoreDelta,
    newFindings,
    resolvedFindings,
    policyOutcome: policyResult.outcome,
    baselineFound,
  });

  return {
    repositoryId,
    baselineAnalysisId: comparison.baselineAnalysisId,
    currentAnalysisId: comparison.currentAnalysisId,
    driftLevel,
    reasons,
    changedComponents,
    changedModules,
    affectedLayers,
    dependencyChurn: {
      baselineEdgesCount: baselineDepsCount,
      currentEdgesCount: currentDepsCount,
      totalDependencyDelta,
      addedEdgesCount,
      removedEdgesCount,
      edgeShifts,
    },
    newCrossLayerDependencies: newCrossLayerDeps,
    healthScoreMovement: {
      baselineScore: comparison.baselineHealthScore,
      currentScore: comparison.currentHealthScore,
      scoreDelta,
      trend: comparison.trend,
    },
    newFindings,
    resolvedFindings,
    unmodifiedFindings,
    evaluatedAt: new Date().toISOString(),
  };
}
