// =============================================================================
// ForgeMind API — Architectural Risk Intelligence & Action Loop Service (Sprint 8 Task 4)
// =============================================================================
//
// Combines deterministic health findings, dependency centrality, blast radius,
// and layer classification into a deterministic 0-100 Risk Score.
// Ranks remediations by highest-value engineering impact and provides
// simulated before->after health score improvement.
// =============================================================================

import type {
  ArchitecturalRiskIntelligenceResponse,
  HealthFinding,
  HealthFindingCategory,
  NodeFanMetrics,
  RAGSourceCitation,
  RemediationActionPlan,
  RemediationExplainRequest,
  RemediationExplanationResponse,
  RiskImpactLevel,
} from '@forgemind/types';

import {
  classifyPathLayer,
  generateArchitectureHealthReport,
} from './architecture-health.service.js';
import { retrieveRepositoryContext } from './context-retrieval.service.js';
import { getLLMProvider } from './llm/factory.js';
import { assertRepositoryOwnership } from './repository.service.js';

/**
 * Calculates a deterministic Architectural Risk Score (0-100) for a health finding.
 */
export function calculateFindingRiskScore(
  finding: HealthFinding,
  fanMetrics: NodeFanMetrics[],
): number {
  const primaryTarget = finding.affectedFilePaths[0] || '';
  const fan = fanMetrics.find((m) => m.filePath === primaryTarget);
  const totalDegree = fan ? fan.totalDegree : (finding.metrics.totalDegree ?? 0);

  // Base Severity Weight
  let severityBase = 10;
  if (finding.severity === 'critical') severityBase = 40;
  else if (finding.severity === 'high') severityBase = 25;
  else if (finding.severity === 'medium') severityBase = 15;

  // Centrality Bonus
  const centralityBonus = Math.min(30, totalDegree * 1.5);

  // Cycle Bonus
  const cycleBonus = finding.category === 'circular_dependency' ? 25 : 0;

  // Layer Multiplier
  const layer = classifyPathLayer(primaryTarget);
  let layerMultiplier = 1.0;
  if (layer === 'data_layer') layerMultiplier = 1.5;
  else if (layer === 'domain_logic') layerMultiplier = 1.4;
  else if (layer === 'api') layerMultiplier = 1.2;
  else if (layer === 'configuration') layerMultiplier = 1.1;

  const rawScore = (severityBase + centralityBonus + cycleBonus) * layerMultiplier;
  return Math.min(100, Math.max(1, Math.round(rawScore)));
}

/**
 * Maps a risk score to a RiskImpactLevel enum.
 */
export function mapRiskImpactLevel(score: number): RiskImpactLevel {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

/**
 * Maps a finding category to a standard refactoring pattern name.
 */
export function mapRefactoringPattern(category: HealthFindingCategory): string {
  switch (category) {
    case 'circular_dependency':
      return 'Decouple Circular Import via Interface Inversion';
    case 'layer_violation':
      return 'Enforce Strict Unidirectional Layer Boundary Separation';
    case 'coupling_hotspot':
      return 'Distribute Responsibilities to Reduce High-Degree Centrality';
    case 'orphan_export':
      return 'Prune Unused Exports or Deprecate Dead Code Branch';
    default:
      return 'Architectural Decoupling & Boundary Hardening';
  }
}

/**
 * Generates deterministic step-by-step remediation instructions.
 */
export function generateStepByStepRemediation(
  finding: HealthFinding,
  targetFile: string,
  affectedFiles: string[],
): string[] {
  const otherFiles = affectedFiles.filter((f) => f !== targetFile);
  const secondary = otherFiles[0] ? otherFiles[0] : 'dependent modules';

  switch (finding.category) {
    case 'circular_dependency':
      return [
        `Identify shared types or utility contracts in '${targetFile}' and '${secondary}'.`,
        `Extract shared interfaces into a decoupled shared layer file (e.g. 'packages/shared' or 'types.ts').`,
        `Update imports in both files to import from the shared interface, breaking the circular cycle.`,
      ];
    case 'coupling_hotspot':
      return [
        `Analyze responsibilities inside '${targetFile}' and identify secondary domain logic blocks.`,
        `Extract sub-task handlers into focused single-responsibility service files.`,
        `Delegate execution from '${targetFile}' to the new sub-services via dependency injection.`,
      ];
    case 'layer_violation':
      return [
        `Remove direct imports from higher architectural layers inside '${targetFile}'.`,
        `Define abstract interface ports in the lower layer for required external actions.`,
        `Inject implementation bindings at runtime to preserve unidirectional layer boundary flow.`,
      ];
    case 'orphan_export':
      return [
        `Audit exported symbols in '${targetFile}' against repository symbol references.`,
        `Remove unused exported functions or interfaces that have zero internal or external consumers.`,
        `Re-verify codebase health to confirm clean public API surface area.`,
      ];
    default:
      return [
        `Isolate shared responsibility in '${targetFile}'.`,
        `Refactor caller dependencies in ${secondary} to use clean interface abstractions.`,
        `Verify penalty point reduction using ForgeMind deterministic architecture engine.`,
      ];
  }
}

/**
 * Generates structured Architectural Risk Intelligence for a repository.
 */
export async function generateArchitecturalRiskIntelligence(
  repositoryId: string,
  userId: string,
): Promise<ArchitecturalRiskIntelligenceResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const report = await generateArchitectureHealthReport(repositoryId, userId);
  const currentHealthScore = report.healthScore;

  const rankedRemediations: RemediationActionPlan[] = report.findings.map((finding) => {
    const targetFile = finding.affectedFilePaths[0] || 'repository-root';
    const riskScore = calculateFindingRiskScore(finding, report.fanMetrics);
    const impactLevel = mapRiskImpactLevel(riskScore);
    const refactoringPattern = mapRefactoringPattern(finding.category);
    const estimatedImprovement = finding.penaltyPoints;
    const projectedScore = Math.min(100, currentHealthScore + estimatedImprovement);
    const stepByStep = generateStepByStepRemediation(
      finding,
      targetFile,
      finding.affectedFilePaths,
    );

    return {
      findingId: finding.id,
      category: finding.category,
      severity: finding.severity,
      impactLevel,
      riskScore,
      title: finding.title,
      targetFile,
      affectedFiles: finding.affectedFilePaths,
      refactoringPattern,
      estimatedHealthImprovement: estimatedImprovement,
      projectedHealthScore: projectedScore,
      stepByStepRemediation: stepByStep,
    };
  });

  // Sort by risk score descending
  rankedRemediations.sort((a, b) => b.riskScore - a.riskScore);

  const highestValueFix = rankedRemediations[0] || null;
  const projectedHealthScore = highestValueFix
    ? highestValueFix.projectedHealthScore
    : currentHealthScore;

  const totalPenaltySum = report.findings.reduce((sum, f) => sum + f.penaltyPoints, 0);
  const totalPotentialScoreImprovement = Math.min(100 - currentHealthScore, totalPenaltySum);

  const summary = {
    totalFindings: rankedRemediations.length,
    criticalRiskCount: rankedRemediations.filter((r) => r.impactLevel === 'CRITICAL').length,
    highRiskCount: rankedRemediations.filter((r) => r.impactLevel === 'HIGH').length,
    mediumRiskCount: rankedRemediations.filter((r) => r.impactLevel === 'MEDIUM').length,
    lowRiskCount: rankedRemediations.filter((r) => r.impactLevel === 'LOW').length,
  };

  return {
    repositoryId,
    currentHealthScore,
    projectedHealthScore,
    totalPotentialScoreImprovement,
    highestValueFix,
    rankedRemediations,
    remediationSummary: summary,
  };
}

/**
 * Generates an evidence-grounded AI refactoring code explanation for a remediation action.
 */
export async function explainRemediationAction(
  repositoryId: string,
  userId: string,
  req: RemediationExplainRequest,
): Promise<RemediationExplanationResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const intelligence = await generateArchitecturalRiskIntelligence(repositoryId, userId);
  const plan = intelligence.rankedRemediations.find((r) => r.findingId === req.findingId);

  if (!plan) {
    throw new Error(`Remediation action plan not found for finding ID: ${req.findingId}`);
  }

  const targetFile = req.targetFile || plan.targetFile;

  // Retrieve RAG context for target file
  const retrievedChunks = await retrieveRepositoryContext(
    repositoryId,
    userId,
    `remediation refactoring pattern ${plan.refactoringPattern} ${targetFile}`,
    { maxTokens: 1500 },
  );

  const formattedEvidence = retrievedChunks
    .map(
      (c) =>
        `FILE: ${c.filePath} (lines ${c.startLine}-${c.endLine})\n\`\`\`\n${c.content}\n\`\`\``,
    )
    .join('\n\n');

  const citations: RAGSourceCitation[] = retrievedChunks.map((c) => ({
    filePath: c.filePath,
    startLine: c.startLine,
    endLine: c.endLine,
    content: c.content.slice(0, 150),
    score: c.similarity,
  }));

  const llm = getLLMProvider();

  const systemPrompt = `You are ForgeMind's Lead Software Architect AI.
Your task is to generate a precise, actionable refactoring code proposal to remediate an architectural finding.
You must ground your response strictly in the provided code evidence and deterministic risk plan.

RULES:
1. Provide a clear explanation of why this refactoring improves health score from ${intelligence.currentHealthScore} to ${plan.projectedHealthScore}.
2. Provide step-by-step refactoring code instructions.
3. Provide a clear TypeScript / code snippet diff or before/after refactoring proposal.`;

  const userPrompt = `REMEDIATION TARGET:
- Finding ID: ${plan.findingId}
- Category: ${plan.category}
- Impact Level: ${plan.impactLevel} (Risk Score: ${plan.riskScore}/100)
- Target File: ${targetFile}
- Refactoring Pattern: ${plan.refactoringPattern}
- Affected Files: ${plan.affectedFiles.join(', ')}

RETRIEVED CODE EVIDENCE:
${formattedEvidence || 'No direct code chunks retrieved.'}`;

  let llmExplanation = '';
  try {
    llmExplanation = await llm.generateAnswer(systemPrompt, userPrompt);
  } catch {
    llmExplanation = `The deterministic engine identified '${plan.title}' on '${targetFile}'. Apply pattern '${plan.refactoringPattern}' to recover +${plan.estimatedHealthImprovement} health points.`;
  }

  const codeDiffProposal = `// Proposed Refactoring Pattern: ${plan.refactoringPattern}
// Target File: ${targetFile}

// 1. Extract shared interfaces or sub-service dependencies
// 2. Invert direct import coupling
// 3. Re-evaluate repository health score to confirm +${plan.estimatedHealthImprovement} points recovery.`;

  return {
    findingId: plan.findingId,
    targetFile,
    refactoringPattern: plan.refactoringPattern,
    explanation: llmExplanation,
    codeDiffProposal,
    stepByStepInstructions: plan.stepByStepRemediation,
    affectedFiles: plan.affectedFiles,
    riskScore: plan.riskScore,
    sources: citations,
    providerUsed: llm.name,
  };
}
