// =============================================================================
// ForgeMind API — PR Architecture Gatekeeper Policy Engine (Phase 7.5)
// =============================================================================
//
// Evaluates PR architecture health comparison results against configurable policy
// thresholds (score degradation, new critical findings, new circular cycles, etc.)
// to produce a deterministic pass / fail / neutral decision and status message.
// =============================================================================

import type { ArchitectureHealthComparisonResponse, HealthFinding } from '@forgemind/types';
import type { ArchitectureHealthSnapshot } from '@prisma/client';

export type PRGatekeeperOutcome = 'pass' | 'fail' | 'neutral';

export interface PRGatekeeperPolicyOptions {
  /**
   * Maximum allowed score drop before triggering policy failure.
   * Default: 5 points (i.e. healthDelta < -5 fails).
   */
  maxScoreDegradation?: number;

  /**
   * Whether to fail if any new critical severity finding is introduced.
   * Default: true.
   */
  blockOnNewCriticalFindings?: boolean;

  /**
   * Whether to fail if any new high severity finding is introduced.
   * Default: false.
   */
  blockOnNewHighFindings?: boolean;

  /**
   * Whether to fail if any new circular dependency cycle is introduced.
   * Default: true.
   */
  blockOnNewCircularCycles?: boolean;

  /**
   * Whether to fail if any new layer violation is introduced.
   * Default: true.
   */
  blockOnNewLayerViolations?: boolean;
}

export interface PRGatekeeperPolicyResult {
  outcome: PRGatekeeperOutcome;
  statusDescription: string;
  reasons: string[];
  healthDelta: number;
  baselineHealthScore: number | null;
  prHealthScore: number;
  isRegressed: boolean;
  newCriticalCount: number;
  newHighCount: number;
  newCircularCyclesCount: number;
  newLayerViolationsCount: number;
  policyOptions: Required<PRGatekeeperPolicyOptions>;
  evaluatedAt: string;
}

export const DEFAULT_PR_GATEKEEPER_POLICY: Required<PRGatekeeperPolicyOptions> = {
  maxScoreDegradation: 5,
  blockOnNewCriticalFindings: true,
  blockOnNewHighFindings: false,
  blockOnNewCircularCycles: true,
  blockOnNewLayerViolations: true,
};

/**
 * Evaluates a PR architecture snapshot and baseline comparison against policy rules.
 *
 * @param comparison Optional comparison response from compareArchitectureHealthSnapshots().
 * @param prSnapshot The ArchitectureHealthSnapshot generated for the PR.
 * @param options Optional custom policy threshold overrides.
 * @returns A deterministic PRGatekeeperPolicyResult with pass/fail/neutral outcome.
 */
export function evaluatePRGatekeeperPolicy(
  comparison: ArchitectureHealthComparisonResponse | null,
  prSnapshot: ArchitectureHealthSnapshot,
  options?: PRGatekeeperPolicyOptions,
): PRGatekeeperPolicyResult {
  const policy: Required<PRGatekeeperPolicyOptions> = {
    ...DEFAULT_PR_GATEKEEPER_POLICY,
    ...options,
  };

  const evaluatedAt = new Date().toISOString();
  const prHealthScore = prSnapshot.healthScore;

  // 1. Handle No-Baseline / Neutral Result
  if (!comparison) {
    return {
      outcome: 'neutral',
      statusDescription: `PR architecture analysis completed (${prHealthScore}/100). No baseline snapshot available.`,
      reasons: ['No baseline architecture snapshot available for target branch comparison.'],
      healthDelta: 0,
      baselineHealthScore: null,
      prHealthScore,
      isRegressed: false,
      newCriticalCount: 0,
      newHighCount: 0,
      newCircularCyclesCount: 0,
      newLayerViolationsCount: 0,
      policyOptions: policy,
      evaluatedAt,
    };
  }

  // 2. Evaluate Comparison Findings & Metrics
  const healthDelta = comparison.healthDelta;
  const baselineHealthScore = comparison.baselineHealthScore;
  const newFindings: HealthFinding[] = comparison.newFindings || [];

  const newCriticalFindings = newFindings.filter((f) => f.severity === 'critical');
  const newHighFindings = newFindings.filter((f) => f.severity === 'high');
  const newCircularCycleFindings = newFindings.filter((f) => f.category === 'circular_dependency');
  const newLayerViolationFindings = newFindings.filter((f) => f.category === 'layer_violation');

  const newCriticalCount = newCriticalFindings.length;
  const newHighCount = newHighFindings.length;
  const newCircularCyclesCount = newCircularCycleFindings.length;
  const newLayerViolationsCount = newLayerViolationFindings.length;

  const reasons: string[] = [];
  let isFailed = false;

  // Rule A: Score Degradation Threshold
  if (healthDelta < -policy.maxScoreDegradation) {
    isFailed = true;
    reasons.push(
      `Architecture health score degraded by ${Math.abs(healthDelta)} points (max allowed drop: ${policy.maxScoreDegradation} points).`,
    );
  }

  // Rule B: New Critical Findings
  if (policy.blockOnNewCriticalFindings && newCriticalCount > 0) {
    isFailed = true;
    const titles = newCriticalFindings.map((f) => f.title).join(', ');
    reasons.push(
      `${newCriticalCount} new critical architecture finding(s) introduced (${titles}).`,
    );
  }

  // Rule C: New High Findings
  if (policy.blockOnNewHighFindings && newHighCount > 0) {
    isFailed = true;
    const titles = newHighFindings.map((f) => f.title).join(', ');
    reasons.push(
      `${newHighCount} new high-severity architecture finding(s) introduced (${titles}).`,
    );
  }

  // Rule D: New Circular Dependency Cycles
  if (policy.blockOnNewCircularCycles && newCircularCyclesCount > 0) {
    isFailed = true;
    reasons.push(`${newCircularCyclesCount} new circular dependency cycle(s) introduced.`);
  }

  // Rule E: New Layer Violations
  if (policy.blockOnNewLayerViolations && newLayerViolationsCount > 0) {
    isFailed = true;
    reasons.push(`${newLayerViolationsCount} new architectural layer violation(s) introduced.`);
  }

  const outcome: PRGatekeeperOutcome = isFailed ? 'fail' : 'pass';
  const isRegressed = comparison.isRegressed || isFailed;

  const deltaFormatted = healthDelta >= 0 ? `+${healthDelta}` : `${healthDelta}`;
  const statusDescription =
    outcome === 'pass'
      ? `Architecture health maintained (${prHealthScore}/100, Δ${deltaFormatted}).`
      : `Architecture regression detected (${prHealthScore}/100, Δ${deltaFormatted}): ${reasons.length} rule violation(s).`;

  if (outcome === 'pass' && reasons.length === 0) {
    reasons.push('Architecture health score and anti-pattern boundaries satisfied.');
  }

  return {
    outcome,
    statusDescription,
    reasons,
    healthDelta,
    baselineHealthScore,
    prHealthScore,
    isRegressed,
    newCriticalCount,
    newHighCount,
    newCircularCyclesCount,
    newLayerViolationsCount,
    policyOptions: policy,
    evaluatedAt,
  };
}
