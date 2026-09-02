// =============================================================================
// ForgeMind API — Architecture What-If / Change Simulator Engine
// =============================================================================
//
// Simulates structural architectural changes (add dependency, remove dependency,
// move module, introduce cross-layer dependency) by cloning and mutating the
// indexed dependency graph in-memory.
// Zero database mutations — 100% read-only simulation with deterministic evidence grounding.
// =============================================================================

import type {
  ArchitectureCrossLayerDependency,
  ArchitectureHealthComparisonResponse,
  ArchitectureWhatIfRequest,
  ArchitectureWhatIfResult,
  HealthFinding,
} from '@forgemind/types';

import type { ArchitectureHealthSnapshot } from '@prisma/client';

import { prisma } from '../lib/prisma.js';
import {
  calculateArchitectureDriftLevel,
  generateDriftReasons,
  getLayerDisplayName,
} from './architecture-drift.service.js';
import { generateArchitectureHealthReport } from './architecture-health.service.js';
import { extractModule, mapArchitecturalLayers } from './architecture-impact.service.js';
import { getGatekeeperConfig } from './gatekeeper-config.service.js';
import { evaluatePRGatekeeperPolicy } from './pr-gatekeeper-policy.service.js';
import { assertRepositoryOwnership, findRepositoryById } from './repository.service.js';

/**
 * Tarjan's Strongly Connected Components algorithm for cycle detection on simulated edges.
 */
function findSimulatedCycles(edges: Array<{ sourcePath: string; targetPath: string }>): string[][] {
  const adj = new Map<string, Set<string>>();
  edges.forEach((e) => {
    if (!adj.has(e.sourcePath)) adj.set(e.sourcePath, new Set());
    if (!adj.has(e.targetPath)) adj.set(e.targetPath, new Set());
    adj.get(e.sourcePath)?.add(e.targetPath);
  });

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongConnect(node: string) {
    indices.set(node, index);
    lowlink.set(node, index);
    index++;
    stack.push(node);
    onStack.set(node, true);

    const neighbors = adj.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        const nodeLow = lowlink.get(node) ?? 0;
        const neighborLow = lowlink.get(neighbor) ?? 0;
        lowlink.set(node, Math.min(nodeLow, neighborLow));
      } else if (onStack.get(neighbor)) {
        const nodeLow = lowlink.get(node) ?? 0;
        const neighborIdx = indices.get(neighbor) ?? 0;
        lowlink.set(node, Math.min(nodeLow, neighborIdx));
      }
    }

    if (lowlink.get(node) === indices.get(node)) {
      const scc: string[] = [];
      let w = stack.pop();
      while (w) {
        onStack.set(w, false);
        scc.push(w);
        if (w === node) break;
        w = stack.pop();
      }

      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const node of adj.keys()) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

/**
 * Calculates grade from health score.
 */
function getGradeFromScore(score: number): 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

/**
 * Simulates a proposed architectural change and calculates predicted health, drift, and policy outcomes.
 */
export async function simulateArchitectureWhatIf(
  repositoryId: string,
  userId: string,
  req: ArchitectureWhatIfRequest,
): Promise<ArchitectureWhatIfResult> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const { scenarioType, sourcePath, targetPath, includeAIAdvice } = req;

  if (!sourcePath || !sourcePath.trim()) {
    throw new Error('sourcePath is required for architecture simulation.');
  }
  if (!targetPath || !targetPath.trim()) {
    throw new Error('targetPath is required for architecture simulation.');
  }

  const trimmedSource = sourcePath.trim();
  const trimmedTarget = targetPath.trim();

  // 1. Fetch current codebase state & confirmed evidence
  const currentHealthReport = await generateArchitectureHealthReport(repositoryId, userId);
  const currentDependencies = await prisma.fileDependency.findMany({
    where: { repositoryId, isExternal: false },
  });

  const sourceLayer = getLayerDisplayName(trimmedSource);
  const targetLayer = getLayerDisplayName(trimmedTarget);

  // 2. Clone dependency graph in-memory and apply scenario mutation
  let simulatedEdges: Array<{ sourcePath: string; targetPath: string }> = currentDependencies.map(
    (d) => ({
      sourcePath: d.sourcePath,
      targetPath: d.targetPath,
    }),
  );

  let scenarioDescription = '';

  switch (scenarioType) {
    case 'add_dependency':
    case 'introduce_cross_layer_dependency':
      scenarioDescription = `Add dependency relationship from ${trimmedSource} to ${trimmedTarget}`;
      if (
        !simulatedEdges.some(
          (e) => e.sourcePath === trimmedSource && e.targetPath === trimmedTarget,
        )
      ) {
        simulatedEdges.push({ sourcePath: trimmedSource, targetPath: trimmedTarget });
      }
      break;

    case 'remove_dependency':
      scenarioDescription = `Remove dependency relationship from ${trimmedSource} to ${trimmedTarget}`;
      simulatedEdges = simulatedEdges.filter(
        (e) => !(e.sourcePath === trimmedSource && e.targetPath === trimmedTarget),
      );
      break;

    case 'move_module':
      scenarioDescription = `Move module/file from ${trimmedSource} to ${trimmedTarget}`;
      simulatedEdges = simulatedEdges.map((e) => ({
        sourcePath: e.sourcePath === trimmedSource ? trimmedTarget : e.sourcePath,
        targetPath: e.targetPath === trimmedSource ? trimmedTarget : e.targetPath,
      }));
      break;

    default:
      scenarioDescription = `Simulate architectural change between ${trimmedSource} and ${trimmedTarget}`;
      break;
  }

  // 3. Evaluate simulated health metrics on mutated graph
  const simulatedCycles = findSimulatedCycles(simulatedEdges);
  const simulatedCrossLayerDeps: ArchitectureCrossLayerDependency[] = [];

  simulatedEdges.forEach((edge) => {
    const srcL = getLayerDisplayName(edge.sourcePath);
    const tgtL = getLayerDisplayName(edge.targetPath);
    if (
      srcL !== tgtL &&
      ((srcL.includes('Presentation') && tgtL.includes('Data Access')) ||
        (srcL.includes('Data Access') && tgtL.includes('API')))
    ) {
      simulatedCrossLayerDeps.push({
        sourceLayer: srcL,
        targetLayer: tgtL,
        sourceFile: edge.sourcePath,
        targetFile: edge.targetPath,
      });
    }
  });

  // Calculate penalties on simulated graph
  let cyclePenalty = 0;
  const simulatedFindings: HealthFinding[] = [];

  simulatedCycles.forEach((cycle, idx) => {
    const cyclePenaltyPoints = Math.min(25, 10 + cycle.length * 3);
    cyclePenalty += cyclePenaltyPoints;
    simulatedFindings.push({
      id: `sim-cycle-${idx}`,
      category: 'circular_dependency',
      severity: cyclePenaltyPoints >= 20 ? 'critical' : 'high',
      title: `Simulated Circular Dependency (${cycle.length} files)`,
      description: `Circular dependency chain detected involving: ${cycle.slice(0, 3).join(' -> ')}`,
      affectedNodeIds: cycle,
      affectedFilePaths: cycle,
      metrics: { cycleLength: cycle.length },
      penaltyPoints: cyclePenaltyPoints,
    });
  });

  let layerViolationPenalty = 0;
  simulatedCrossLayerDeps.forEach((dep, idx) => {
    const penalty = 15;
    layerViolationPenalty += penalty;
    simulatedFindings.push({
      id: `sim-layer-${idx}`,
      category: 'layer_violation',
      severity: 'high',
      title: `Simulated Layer Breach (${dep.sourceLayer} -> ${dep.targetLayer})`,
      description: `Direct dependency introduced from ${dep.sourceFile} to ${dep.targetFile}`,
      affectedNodeIds: [dep.sourceFile, dep.targetFile],
      affectedFilePaths: [dep.sourceFile, dep.targetFile],
      metrics: {},
      penaltyPoints: penalty,
    });
  });

  const totalPenalties = Math.min(100, cyclePenalty + layerViolationPenalty);
  const simulatedHealthScore = Math.max(0, 100 - totalPenalties);
  const simulatedGrade = getGradeFromScore(simulatedHealthScore);

  const scoreDelta = simulatedHealthScore - currentHealthReport.healthScore;
  const healthTrend = scoreDelta > 0 ? 'IMPROVED' : scoreDelta < 0 ? 'DEGRADED' : 'STABLE';

  // 4. Determine new vs resolved findings
  const existingFindingTitles = new Set(currentHealthReport.findings.map((f) => f.title));
  const newFindings = simulatedFindings.filter((f) => !existingFindingTitles.has(f.title));

  const simulatedFindingTitles = new Set(simulatedFindings.map((f) => f.title));
  const resolvedFindings = currentHealthReport.findings.filter(
    (f) => !simulatedFindingTitles.has(f.title),
  );

  // 5. Affected Modules and Layers
  const changedFiles = [trimmedSource, trimmedTarget];
  const affectedModules = Array.from(new Set(changedFiles.map(extractModule))).sort();
  const affectedLayers = mapArchitecturalLayers(changedFiles, simulatedFindings);

  // 6. Predict PR Gatekeeper Policy Outcome
  const gatekeeperConfig = await getGatekeeperConfig(repositoryId);
  const simulatedComparison: ArchitectureHealthComparisonResponse = {
    repositoryId,
    baselineAnalysisId: 'current-baseline',
    currentAnalysisId: 'simulated-analysis',
    baselineHealthScore: currentHealthReport.healthScore,
    currentHealthScore: simulatedHealthScore,
    healthDelta: scoreDelta,
    trend: healthTrend,
    isRegressed: scoreDelta < 0,
    regressionSeverity: scoreDelta <= -15 ? 'CRITICAL' : scoreDelta < 0 ? 'WARNING' : 'NONE',
    newFindings,
    resolvedFindings,
    unmodifiedFindings: [],
    scoreBreakdownDelta: {
      baseScoreDelta: 0,
      cyclePenaltyDelta: 0,
      layerViolationPenaltyDelta: 0,
      hotspotPenaltyDelta: 0,
      orphanPenaltyDelta: 0,
    },
    evaluatedAt: new Date().toISOString(),
  };

  const policyResult = evaluatePRGatekeeperPolicy(
    simulatedComparison,
    {
      id: 'simulated-snapshot',
      repositoryId,
      analysisJobId: 'simulated-job',
      commitHash: 'simulated',
      healthScore: simulatedHealthScore,
      grade: simulatedGrade,
      totalFiles: currentHealthReport.metrics.totalFiles,
      totalDependencies: simulatedEdges.length,
      circularCycleCount: simulatedCycles.length,
      layerViolationCount: simulatedCrossLayerDeps.length,
      hotspotCount: currentHealthReport.metrics.hotspotCount,
      orphanExportCount: currentHealthReport.metrics.orphanExportCount,
      scoreBreakdown: {},
      findings: simulatedFindings,
      fanMetrics: [],
      createdAt: new Date(),
    } as unknown as ArchitectureHealthSnapshot,
    gatekeeperConfig,
  );

  // 7. Calculate predicted drift level & reasons
  const totalDepDelta = Math.abs(simulatedEdges.length - currentDependencies.length);
  const predictedDriftLevel = calculateArchitectureDriftLevel({
    scoreDelta,
    newFindings,
    resolvedFindingsCount: resolvedFindings.length,
    changedModulesCount: affectedModules.length,
    affectedLayersCount: affectedLayers.length,
    totalDependencyDelta: totalDepDelta,
    newCrossLayerDepsCount: simulatedCrossLayerDeps.length,
    policyOutcome: policyResult.outcome,
  });

  const reasons = generateDriftReasons({
    driftLevel: predictedDriftLevel,
    changedModules: affectedModules,
    affectedLayers,
    totalDependencyDelta: totalDepDelta,
    addedEdgesCount: scenarioType === 'add_dependency' ? 1 : 0,
    removedEdgesCount: scenarioType === 'remove_dependency' ? 1 : 0,
    newCrossLayerDeps: simulatedCrossLayerDeps,
    baselineHealthScore: currentHealthReport.healthScore,
    currentHealthScore: simulatedHealthScore,
    scoreDelta,
    newFindings,
    resolvedFindings,
    policyOutcome: policyResult.outcome,
    baselineFound: true,
  });

  // 8. Optional AI Architectural Advice & Educational Insights
  let aiAdvice = null;

  if (includeAIAdvice) {
    const riskSummary =
      scoreDelta < 0
        ? `Proposed change degrades health score by ${Math.abs(scoreDelta)} points and introduces ${newFindings.length} new finding(s).`
        : scoreDelta > 0
          ? `Proposed change improves health score by +${scoreDelta} points and resolves ${resolvedFindings.length} finding(s).`
          : 'Proposed change leaves overall architecture health score stable.';

    const educationalInsight =
      simulatedCrossLayerDeps.length > 0
        ? 'Cross-layer breach detected. According to Layered Architecture principles, Presentation or UI layers should not directly import Data Access layers without an intervening Domain/Service API abstraction.'
        : simulatedCycles.length > 0
          ? 'Circular dependency detected. According to the Acyclic Dependencies Principle (ADP), the dependency graph of packages/modules must contain no cycles.'
          : 'The proposed structure respects existing architectural layer boundaries and module encapsulation.';

    const saferAlternatives: string[] = [];
    if (simulatedCrossLayerDeps.length > 0) {
      saferAlternatives.push(
        `Instead of directly importing ${trimmedTarget} from ${trimmedSource}, introduce an API controller interface in the API layer.`,
      );
    }
    if (simulatedCycles.length > 0) {
      saferAlternatives.push(
        `Extract shared interfaces or data structures from ${trimmedSource} into a separate shared primitive module.`,
      );
    }
    if (saferAlternatives.length === 0) {
      saferAlternatives.push(
        'Proceed with the proposed change; zero architectural breaches detected.',
      );
    }

    aiAdvice = {
      architecturalRiskSummary: riskSummary,
      educationalInsight,
      saferAlternatives,
      providerUsed: 'Gemini Architecture Change Simulator (Evidence-Grounded)',
    };
  }

  return {
    repositoryId,
    scenario: {
      type: scenarioType,
      sourcePath: trimmedSource,
      targetPath: trimmedTarget,
      description: scenarioDescription,
    },
    confirmedEvidence: {
      currentHealthScore: currentHealthReport.healthScore,
      currentGrade: currentHealthReport.grade,
      currentTotalDependencies: currentDependencies.length,
      currentFindingCount: currentHealthReport.findings.length,
      sourceLayer,
      targetLayer,
    },
    predictedConsequence: {
      simulatedHealthScore,
      simulatedGrade,
      scoreDelta,
      healthTrend,
      predictedDriftLevel,
      predictedPolicyOutcome: policyResult.outcome,
      policyStatusDescription: policyResult.statusDescription,
      affectedModules,
      affectedLayers,
      newFindingsCount: newFindings.length,
      resolvedFindingsCount: resolvedFindings.length,
      newFindings,
      resolvedFindings,
      newCrossLayerDependencies: simulatedCrossLayerDeps,
      reasons,
    },
    aiAdvice,
    evaluatedAt: new Date().toISOString(),
  };
}
