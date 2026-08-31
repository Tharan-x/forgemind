// =============================================================================
// ForgeMind API — Architecture Impact & Change Intelligence Service
// =============================================================================
//
// Calculates deterministic, real-data powered architecture impact summaries
// for Pull Requests by analyzing snapshot differences, touched modules/components,
// layer boundaries, dependency shifts, and newly introduced vs resolved risks.
// =============================================================================

import type { ArchitectureImpact, HealthFinding, ImpactLevel } from '@forgemind/types';

import { prisma } from '../lib/prisma.js';
import { compareArchitectureHealthSnapshots } from './architecture-history.service.js';
import { getGatekeeperConfig } from './gatekeeper-config.service.js';
import { findBaselineSnapshot } from './pr-baseline.service.js';
import { evaluatePRGatekeeperPolicy } from './pr-gatekeeper-policy.service.js';
import { assertRepositoryOwnership, findRepositoryById } from './repository.service.js';

/**
 * Categorizes a file path into its top-level architectural component.
 */
export function extractComponent(filePath: string): string {
  const parts = filePath.split(/[/\\]+/).filter(Boolean);
  if (
    parts.length >= 2 &&
    (parts[0] === 'apps' || parts[0] === 'packages' || parts[0] === 'services')
  ) {
    return `${parts[0]}/${parts[1]}`;
  }
  if (parts.length >= 1) {
    return parts[0] || 'root';
  }
  return 'root';
}

/**
 * Categorizes a file path into its architectural module/feature folder.
 */
export function extractModule(filePath: string): string {
  const parts = filePath.split(/[/\\]+/).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[parts.length - 3]}/${parts[parts.length - 2]}`;
  }
  if (parts.length >= 2) {
    return parts[parts.length - 2] || 'core';
  }
  return 'root';
}

/**
 * Maps file paths and findings to architectural layers.
 */
export function mapArchitecturalLayers(filePaths: string[], findings: HealthFinding[]): string[] {
  const layers = new Set<string>();

  const allPaths = [...filePaths, ...findings.flatMap((f) => f.affectedFilePaths || [])];

  for (const fp of allPaths) {
    const lower = fp.toLowerCase();
    if (
      lower.includes('controller') ||
      lower.includes('route') ||
      lower.includes('api/') ||
      lower.includes('endpoint')
    ) {
      layers.add('API & Controller Layer');
    }
    if (
      lower.includes('service') ||
      lower.includes('domain') ||
      lower.includes('usecase') ||
      lower.includes('logic')
    ) {
      layers.add('Domain & Business Logic Layer');
    }
    if (
      lower.includes('db') ||
      lower.includes('prisma') ||
      lower.includes('repository') ||
      lower.includes('model') ||
      lower.includes('entity')
    ) {
      layers.add('Data Access & Database Layer');
    }
    if (
      lower.includes('component') ||
      lower.includes('view') ||
      lower.includes('web') ||
      lower.includes('ui') ||
      lower.includes('app/')
    ) {
      layers.add('Presentation & User Interface Layer');
    }
    if (
      lower.includes('type') ||
      lower.includes('shared') ||
      lower.includes('lib') ||
      lower.includes('util')
    ) {
      layers.add('Core Primitives & Shared Layer');
    }
  }

  if (layers.size === 0) {
    layers.add('General Codebase Infrastructure');
  }

  return Array.from(layers).sort();
}

/**
 * Deterministically evaluates the overall ImpactLevel (LOW, MEDIUM, HIGH, CRITICAL).
 */
export function calculateImpactLevel(
  scoreDelta: number,
  newFindings: HealthFinding[],
  policyOutcome: 'pass' | 'fail' | 'neutral',
  totalDependencyDelta: number,
  affectedLayersCount: number,
): { level: ImpactLevel; reasoning: string[] } {
  const reasoning: string[] = [];

  const criticalFindings = newFindings.filter((f) => f.severity === 'critical');
  const highFindings = newFindings.filter((f) => f.severity === 'high');
  const mediumFindings = newFindings.filter((f) => f.severity === 'medium');

  let level: ImpactLevel = 'LOW';

  // 1. CRITICAL checks
  if (policyOutcome === 'fail' || scoreDelta <= -15 || criticalFindings.length > 0) {
    level = 'CRITICAL';
    if (scoreDelta <= -15) {
      reasoning.push(`Severe health score drop of ${scoreDelta} points exceeds safety thresholds.`);
    }
    if (criticalFindings.length > 0) {
      reasoning.push(
        `Introduced ${criticalFindings.length} new CRITICAL architectural finding(s).`,
      );
    }
    if (policyOutcome === 'fail' && reasoning.length === 0) {
      reasoning.push('Triggered PR Gatekeeper policy failure condition.');
    }
  }
  // 2. HIGH checks
  else if (
    scoreDelta <= -5 ||
    highFindings.length > 0 ||
    totalDependencyDelta >= 10 ||
    affectedLayersCount >= 3
  ) {
    level = 'HIGH';
    if (scoreDelta <= -5) {
      reasoning.push(`Significant health score drop of ${scoreDelta} points detected.`);
    }
    if (highFindings.length > 0) {
      reasoning.push(`Introduced ${highFindings.length} new HIGH severity finding(s).`);
    }
    if (affectedLayersCount >= 3) {
      reasoning.push(`Cross-cutting change spanning ${affectedLayersCount} architectural layers.`);
    }
    if (totalDependencyDelta >= 10) {
      reasoning.push(`High dependency graph churn (+/- ${totalDependencyDelta} edges).`);
    }
  }
  // 3. MEDIUM checks
  else if (
    scoreDelta < 0 ||
    mediumFindings.length > 0 ||
    newFindings.length > 0 ||
    totalDependencyDelta > 2
  ) {
    level = 'MEDIUM';
    if (scoreDelta < 0) {
      reasoning.push(`Minor score drop of ${scoreDelta} points.`);
    }
    if (newFindings.length > 0) {
      reasoning.push(`Introduced ${newFindings.length} new architectural finding(s).`);
    }
    if (totalDependencyDelta > 2) {
      reasoning.push(`Moderate dependency graph shift (+/- ${totalDependencyDelta} edges).`);
    }
  }
  // 4. LOW checks
  else {
    level = 'LOW';
    if (scoreDelta > 0) {
      reasoning.push(`Improved architecture score by +${scoreDelta} points.`);
    } else {
      reasoning.push('No architectural regressions or new findings introduced.');
    }
  }

  return { level, reasoning };
}

/**
 * Computes structured Architecture Impact summary for a target PR number.
 */
export async function getPRArchitectureImpact(
  repositoryId: string,
  prNumber: number,
  userId?: string,
): Promise<ArchitectureImpact> {
  if (userId) {
    await assertRepositoryOwnership(repositoryId, userId);
  }

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // Find PR Analysis Job for target PR number
  const job = await prisma.analysisJob.findFirst({
    where: { repositoryId, prNumber },
    include: { healthSnapshot: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    throw new Error(`No PR analysis found for PR #${prNumber}`);
  }

  const prSnapshot = job.healthSnapshot;
  if (!prSnapshot) {
    throw new Error(`PR AnalysisJob #${job.id} has no completed health snapshot`);
  }

  const baseline = await findBaselineSnapshot(repositoryId, job.baseSha);
  const repoConfig = await getGatekeeperConfig(repositoryId);

  let baselineComparison = null;
  let policyResult;

  if (baseline) {
    baselineComparison = await compareArchitectureHealthSnapshots(
      repositoryId,
      repo.userId,
      baseline.analysisJobId,
      job.id,
    );
    policyResult = evaluatePRGatekeeperPolicy(baselineComparison, prSnapshot, repoConfig);
  } else {
    policyResult = evaluatePRGatekeeperPolicy(null, prSnapshot, repoConfig);
  }

  const newFindings = baselineComparison
    ? baselineComparison.newFindings
    : (prSnapshot.findings as unknown as HealthFinding[]) || [];
  const resolvedFindings = baselineComparison ? baselineComparison.resolvedFindings : [];

  // Gather affected file paths
  const allAffectedFilesSet = new Set<string>();

  newFindings.forEach((f) => {
    (f.affectedFilePaths || []).forEach((fp) => allAffectedFilesSet.add(fp));
  });

  const changedFilesList = Array.from(allAffectedFilesSet).sort();

  // Extract components & modules
  const componentsSet = new Set<string>();
  const modulesSet = new Set<string>();

  changedFilesList.forEach((fp) => {
    componentsSet.add(extractComponent(fp));
    modulesSet.add(extractModule(fp));
  });

  const affectedComponents = Array.from(componentsSet).sort();
  const affectedModules = Array.from(modulesSet).sort();
  const affectedLayers = mapArchitecturalLayers(changedFilesList, newFindings);

  // Dependency deltas
  const prDependenciesCount = prSnapshot.totalDependencies;
  const baselineDependenciesCount = baseline ? baseline.totalDependencies : prDependenciesCount;
  const totalDependencyDelta = Math.abs(prDependenciesCount - baselineDependenciesCount);

  // Severity counts
  const criticalCount = newFindings.filter((f) => f.severity === 'critical').length;
  const highCount = newFindings.filter((f) => f.severity === 'high').length;
  const mediumCount = newFindings.filter((f) => f.severity === 'medium').length;
  const lowCount = newFindings.filter((f) => f.severity === 'low').length;

  const scoreDelta = policyResult.healthDelta;
  const healthTrend: 'IMPROVED' | 'DEGRADED' | 'STABLE' =
    scoreDelta > 0 ? 'IMPROVED' : scoreDelta < 0 ? 'DEGRADED' : 'STABLE';

  const { level: overallImpactLevel, reasoning: impactReasoning } = calculateImpactLevel(
    scoreDelta,
    newFindings,
    policyResult.outcome,
    totalDependencyDelta,
    affectedLayers.length,
  );

  return {
    prNumber,
    jobId: job.id,
    headSha: job.headSha || job.commitHash || '',
    baseSha: job.baseSha,
    overallImpactLevel,
    impactReasoning,
    changedFiles: {
      count: changedFilesList.length,
      paths: changedFilesList,
    },
    affectedComponents,
    affectedModules,
    affectedLayers,
    dependencyImpact: {
      baselineDependenciesCount,
      prDependenciesCount,
      totalDependencyDelta,
      addedEdgesCount:
        prDependenciesCount > baselineDependenciesCount
          ? prDependenciesCount - baselineDependenciesCount
          : 0,
      removedEdgesCount:
        baselineDependenciesCount > prDependenciesCount
          ? baselineDependenciesCount - prDependenciesCount
          : 0,
    },
    newlyIntroducedRisks: {
      totalCount: newFindings.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      items: newFindings,
    },
    resolvedRisks: {
      totalCount: resolvedFindings.length,
      items: resolvedFindings,
    },
    baselineComparison: {
      baselineHealthScore: policyResult.baselineHealthScore,
      prHealthScore: policyResult.prHealthScore,
      scoreDelta,
      healthTrend,
      baselineFound: Boolean(baseline),
    },
    evaluatedAt: new Date().toISOString(),
  };
}
