/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — PR Architecture Gatekeeper Policy Engine Unit Test Suite
// (Phase 7.5 Tests)
// =============================================================================
// Covers all policy evaluation rules and outcomes:
//   1. Neutral outcome when no baseline is available (comparison === null)
//   2. Pass outcome when score maintained and no anti-pattern boundaries broken
//   3. Fail outcome on health score degradation exceeding maxScoreDegradation
//   4. Fail outcome when new critical findings are introduced
//   5. Fail outcome when new circular dependency cycles are introduced
//   6. Fail outcome when new layer violations are introduced
//   7. Custom policy options overriding default rules
//   8. Identical snapshots pass cleanly
// =============================================================================

import type { ArchitectureHealthComparisonResponse, HealthFinding } from '@forgemind/types';
import type { ArchitectureHealthSnapshot } from '@prisma/client';

import {
  evaluatePRGatekeeperPolicy,
  type PRGatekeeperPolicyOptions,
} from './pr-gatekeeper-policy.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function makeMockSnapshot(
  overrides: Partial<ArchitectureHealthSnapshot> = {},
): ArchitectureHealthSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000007501',
    repositoryId: '00000000-0000-4000-8000-000000007502',
    analysisJobId: '00000000-0000-4000-8000-000000007503',
    commitHash: 'headsha7575757575757575757575757575757575',
    healthScore: 90,
    grade: 'A',
    totalFiles: 10,
    totalDependencies: 8,
    circularCycleCount: 0,
    layerViolationCount: 0,
    hotspotCount: 0,
    orphanExportCount: 0,
    scoreBreakdown: { baseScore: 100, penalties: 10, finalScore: 90 },
    findings: [],
    fanMetrics: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockComparison(
  overrides: Partial<ArchitectureHealthComparisonResponse> = {},
): ArchitectureHealthComparisonResponse {
  return {
    repositoryId: '00000000-0000-4000-8000-000000007502',
    baselineAnalysisId: '00000000-0000-4000-8000-000000007500',
    currentAnalysisId: '00000000-0000-4000-8000-000000007503',
    baselineHealthScore: 90,
    currentHealthScore: 90,
    healthDelta: 0,
    trend: 'STABLE',
    isRegressed: false,
    regressionSeverity: 'NONE',
    newFindings: [],
    resolvedFindings: [],
    unmodifiedFindings: [],
    scoreBreakdownDelta: {
      baseScoreDelta: 0,
      cyclePenaltyDelta: 0,
      layerViolationPenaltyDelta: 0,
      hotspotPenaltyDelta: 0,
      orphanPenaltyDelta: 0,
    },
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function runPRGatekeeperPolicyTests(): void {
  console.log(
    '🧪 ForgeMind — PR Architecture Gatekeeper Policy Engine Unit Test Suite (Phase 7.5)\n',
  );

  const mockSnapshot = makeMockSnapshot({ healthScore: 90 });

  // ── Test 1: Neutral Outcome when Comparison is Null ───────────────────────
  {
    const res = evaluatePRGatekeeperPolicy(null, mockSnapshot);
    assertEqual(res.outcome, 'neutral', 'Test 1: Outcome neutral');
    assertEqual(res.baselineHealthScore, null, 'Test 1: Baseline score null');
    assertEqual(res.prHealthScore, 90, 'Test 1: PR score 90');
    assertEqual(res.healthDelta, 0, 'Test 1: Delta 0');
    assertEqual(res.isRegressed, false, 'Test 1: Not regressed');
    assert(
      res.statusDescription.includes('No baseline snapshot available'),
      'Test 1: Status description includes no baseline',
    );
    console.log('  ✅ Test 1 PASS: Neutral outcome produced when no baseline snapshot exists');
  }

  // ── Test 2: Passing Policy Evaluation ──────────────────────────────────────
  {
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 90,
      healthDelta: 0,
    });
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot);
    assertEqual(res.outcome, 'pass', 'Test 2: Outcome pass');
    assertEqual(res.isRegressed, false, 'Test 2: Not regressed');
    assert(
      res.statusDescription.includes('Architecture health maintained'),
      'Test 2: Status description passes',
    );
    console.log('  ✅ Test 2 PASS: Pass outcome produced when health score maintained');
  }

  // ── Test 3: Failing Policy Evaluation on Score Degradation ───────────────
  {
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 80,
      healthDelta: -10,
      isRegressed: true,
    });
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot);
    assertEqual(res.outcome, 'fail', 'Test 3: Outcome fail on -10 delta');
    assertEqual(res.isRegressed, true, 'Test 3: Is regressed true');
    assert(
      res.reasons.some((r) => r.includes('degraded by 10 points')),
      'Test 3: Reason includes degradation',
    );
    console.log(
      '  ✅ Test 3 PASS: Fail outcome produced on score degradation exceeding maxScoreDegradation',
    );
  }

  // ── Test 4: Failing Policy Evaluation on New Critical Findings ────────────
  {
    const criticalFinding: HealthFinding = {
      id: 'crit-1',
      title: 'Severe Security/Arch Risk',
      category: 'layer_violation',
      severity: 'critical',
      description: 'Critical issue',
      affectedFilePaths: ['src/core.ts'],
      affectedNodeIds: [],
      metrics: {},
      penaltyPoints: 15,
    };
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 88,
      healthDelta: -2,
      newFindings: [criticalFinding],
    });
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot);
    assertEqual(res.outcome, 'fail', 'Test 4: Outcome fail on critical finding');
    assertEqual(res.newCriticalCount, 1, 'Test 4: New critical count 1');
    assert(
      res.reasons.some((r) => r.includes('new critical architecture finding')),
      'Test 4: Reason includes critical finding',
    );
    console.log('  ✅ Test 4 PASS: Fail outcome produced when new critical finding introduced');
  }

  // ── Test 5: Failing Policy Evaluation on New Circular Cycles ──────────────
  {
    const cycleFinding: HealthFinding = {
      id: 'circ-1',
      title: 'Circular Import Cycle',
      category: 'circular_dependency',
      severity: 'high',
      description: 'Cycle detected',
      affectedFilePaths: ['src/a.ts', 'src/b.ts'],
      affectedNodeIds: [],
      metrics: {},
      penaltyPoints: 10,
    };
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 88,
      healthDelta: -2,
      newFindings: [cycleFinding],
    });
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot);
    assertEqual(res.outcome, 'fail', 'Test 5: Outcome fail on circular cycle');
    assertEqual(res.newCircularCyclesCount, 1, 'Test 5: New circular cycle count 1');
    assert(
      res.reasons.some((r) => r.includes('circular dependency cycle')),
      'Test 5: Reason includes circular cycle',
    );
    console.log('  ✅ Test 5 PASS: Fail outcome produced when new circular cycle introduced');
  }

  // ── Test 6: Failing Policy Evaluation on New Layer Violations ─────────────
  {
    const layerFinding: HealthFinding = {
      id: 'layer-1',
      title: 'Domain to UI Layer Violation',
      category: 'layer_violation',
      severity: 'high',
      description: 'Layer violation',
      affectedFilePaths: ['src/domain/user.ts', 'src/ui/Button.tsx'],
      affectedNodeIds: [],
      metrics: {},
      penaltyPoints: 10,
    };
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 88,
      healthDelta: -2,
      newFindings: [layerFinding],
    });
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot);
    assertEqual(res.outcome, 'fail', 'Test 6: Outcome fail on layer violation');
    assertEqual(res.newLayerViolationsCount, 1, 'Test 6: New layer violation count 1');
    assert(
      res.reasons.some((r) => r.includes('layer violation')),
      'Test 6: Reason includes layer violation',
    );
    console.log('  ✅ Test 6 PASS: Fail outcome produced when new layer violation introduced');
  }

  // ── Test 7: Custom Policy Options Overrides ───────────────────────────────
  {
    // Custom option maxScoreDegradation: 15 allows -10 delta
    const comp = makeMockComparison({
      baselineHealthScore: 90,
      currentHealthScore: 80,
      healthDelta: -10,
    });
    const customOpts: PRGatekeeperPolicyOptions = {
      maxScoreDegradation: 15,
      blockOnNewCircularCycles: false,
    };
    const res = evaluatePRGatekeeperPolicy(comp, mockSnapshot, customOpts);
    assertEqual(
      res.outcome,
      'pass',
      'Test 7: Custom policy passed -10 delta with maxScoreDegradation: 15',
    );
    assertEqual(
      res.policyOptions.maxScoreDegradation,
      15,
      'Test 7: Policy option recorded accurately',
    );
    console.log('  ✅ Test 7 PASS: Custom policy options correctly overrode default rules');
  }

  // ── Test 8: Identical Snapshots Pass Cleanly ─────────────────────────────
  {
    const comp = makeMockComparison({
      baselineHealthScore: 100,
      currentHealthScore: 100,
      healthDelta: 0,
    });
    const snapshot100 = makeMockSnapshot({ healthScore: 100 });
    const res = evaluatePRGatekeeperPolicy(comp, snapshot100);
    assertEqual(res.outcome, 'pass', 'Test 8: Identical 100/100 snapshots pass');
    assertEqual(
      res.reasons[0],
      'Architecture health score and anti-pattern boundaries satisfied.',
      'Test 8: Default pass message',
    );
    console.log('  ✅ Test 8 PASS: Identical snapshots evaluated cleanly');
  }

  console.log('\n🎉 ALL PHASE 7.5 PR GATEKEEPER POLICY TESTS PASSED SUCCESSFULLY!\n');
}

runPRGatekeeperPolicyTests();
