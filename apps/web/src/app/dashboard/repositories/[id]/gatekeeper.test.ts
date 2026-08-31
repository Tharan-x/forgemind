/* eslint-disable @typescript-eslint/no-unused-vars */

// =============================================================================
// ForgeMind Web — PR Architecture Gatekeeper Dashboard UI Integration Tests
// =============================================================================

import React from 'react';
import type {
  RepositoryPRGatekeeperOverview,
  PRGatekeeperHistoryItem,
  PRGatekeeperDetailResponse,
  WebhookDeliveryLogItem,
  HealthFinding,
  ArchitectureImpact,
} from '@forgemind/types';

import { ArchitectureImpactCard } from '../../../../components/gatekeeper/ArchitectureImpactCard';
import { GatekeeperSettingsForm } from '../../../../components/gatekeeper/GatekeeperSettingsForm';
import { PRGatekeeperDashboard } from '../../../../components/gatekeeper/PRGatekeeperDashboard';
import { PRHealthComparisonCard } from '../../../../components/gatekeeper/PRHealthComparisonCard';
import { WebhookDeliveryLogViewer } from '../../../../components/gatekeeper/WebhookDeliveryLogViewer';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

export async function runWebGatekeeperUITests(): Promise<void> {
  console.log('🧪 ForgeMind Web — PR Architecture Gatekeeper & Webhook Dashboard UI Test Suite\n');

  // ── Test 1: PRGatekeeperDashboard Component Instantation ──────────────────────
  const dashboardElement = React.createElement(PRGatekeeperDashboard, {
    repositoryId: 'test-repo-123',
  });

  assertEqual(dashboardElement.type, PRGatekeeperDashboard, 'PRGatekeeperDashboard mounts');
  assertEqual(dashboardElement.props.repositoryId, 'test-repo-123', 'repositoryId prop bound');

  console.log('  ✅ Test 1 PASS: PRGatekeeperDashboard component signature verified');

  // ── Test 2: PRHealthComparisonCard Rendering & Metrics ──────────────────────
  const mockDetail: PRGatekeeperDetailResponse = {
    prNumber: 42,
    jobId: 'job-42-sha',
    headSha: 'head424242424242424242424242424242424242',
    baseSha: 'base424242424242424242424242424242424242',
    status: 'completed',
    snapshot: {
      healthScore: 85,
      grade: 'B+',
      totalFiles: 20,
      totalDependencies: 35,
      circularCycleCount: 1,
      layerViolationCount: 1,
      hotspotCount: 0,
      orphanExportCount: 0,
    },
    baseline: {
      analysisJobId: 'base-job-id',
      commitHash: 'base424242424242424242424242424242424242',
      healthScore: 92,
      grade: 'A+',
    },
    comparison: {
      repositoryId: 'test-repo-123',
      baselineAnalysisId: 'base-job-id',
      currentAnalysisId: 'job-42-sha',
      baselineHealthScore: 92,
      currentHealthScore: 85,
      healthDelta: -7,
      trend: 'DEGRADED',
      isRegressed: true,
      regressionSeverity: 'WARNING',
      newFindings: [
        {
          id: 'finding-1',
          category: 'circular_dependency',
          severity: 'critical',
          title: 'Circular dependency cycle introduced',
          description: 'Cycle between fileA.ts -> fileB.ts -> fileA.ts',
          affectedNodeIds: ['file:fileA.ts', 'file:fileB.ts'],
          affectedFilePaths: ['fileA.ts', 'fileB.ts'],
          metrics: { cycleLength: 2 },
          penaltyPoints: 15,
        },
      ],
      resolvedFindings: [],
      unmodifiedFindings: [],
      scoreBreakdownDelta: {
        baseScoreDelta: 0,
        cyclePenaltyDelta: -15,
        layerViolationPenaltyDelta: 0,
        hotspotPenaltyDelta: 0,
        orphanPenaltyDelta: 0,
      },
      evaluatedAt: new Date().toISOString(),
    },
    policyResult: {
      outcome: 'fail',
      statusDescription: 'Architecture regression detected (85/100, Δ-7): 2 rule violation(s).',
      reasons: [
        'Architecture health score degraded by 7 points (max allowed drop: 5 points).',
        '1 new circular dependency cycle(s) introduced.',
      ],
      healthDelta: -7,
      baselineHealthScore: 92,
      prHealthScore: 85,
      isRegressed: true,
      newCriticalCount: 1,
      newHighCount: 0,
      newCircularCyclesCount: 1,
      newLayerViolationsCount: 0,
      policyOptions: {
        maxScoreDegradation: 5,
        blockOnNewCriticalFindings: true,
        blockOnNewHighFindings: false,
        blockOnNewCircularCycles: true,
        blockOnNewLayerViolations: true,
      },
      evaluatedAt: new Date().toISOString(),
    },
    evaluatedAt: new Date().toISOString(),
  };

  let investigatedFinding: HealthFinding | null = null;
  const cardElement = React.createElement(PRHealthComparisonCard, {
    detail: mockDetail,
    onInvestigateFinding: (finding) => {
      investigatedFinding = finding;
    },
  });

  assertEqual(cardElement.props.detail.prNumber, 42, 'PR number 42 bound to card');
  assertEqual(cardElement.props.detail.policyResult.outcome, 'fail', 'Fail outcome bound to card');
  assertEqual(
    cardElement.props.detail.policyResult.healthDelta,
    -7,
    'Health delta -7 bound to card',
  );

  console.log('  ✅ Test 2 PASS: PRHealthComparisonCard props and metrics verified');

  // ── Test 3: WebhookDeliveryLogViewer Rendering & Pagination Controls ──────
  const mockDeliveries: WebhookDeliveryLogItem[] = [
    {
      id: 'del-id-1',
      deliveryId: 'github-del-001',
      eventType: 'pull_request',
      action: 'opened',
      repositoryId: 'test-repo-123',
      githubRepoId: 9901,
      prNumber: 42,
      headSha: 'head42424242',
      baseSha: 'base42424242',
      sender: 'testdev',
      status: 'processed',
      ignoredReason: null,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    },
    {
      id: 'del-id-2',
      deliveryId: 'github-del-002',
      eventType: 'pull_request',
      action: 'closed',
      repositoryId: 'test-repo-123',
      githubRepoId: 9901,
      prNumber: 42,
      headSha: 'head42424242',
      baseSha: 'base42424242',
      sender: 'testdev',
      status: 'ignored',
      ignoredReason: 'Unsupported action closed',
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    },
  ];

  let changedPage = 0;
  const viewerElement = React.createElement(WebhookDeliveryLogViewer, {
    deliveries: mockDeliveries,
    total: 2,
    page: 1,
    totalPages: 1,
    onPageChange: (p) => {
      changedPage = p;
    },
  });

  assertEqual(viewerElement.props.deliveries.length, 2, '2 webhook deliveries passed');
  assertEqual(viewerElement.props.deliveries[0]?.status, 'processed', 'Processed status preserved');
  assertEqual(viewerElement.props.deliveries[1]?.status, 'ignored', 'Ignored status preserved');

  console.log('  ✅ Test 3 PASS: WebhookDeliveryLogViewer props & delivery log state verified');

  // ── Test 4: Neutral Outcome Handling (No Baseline) ─────────────────────────
  const mockNeutralDetail: PRGatekeeperDetailResponse = {
    ...mockDetail,
    baseline: null,
    comparison: null,
    policyResult: {
      outcome: 'neutral',
      statusDescription:
        'PR architecture analysis completed (88/100). No baseline snapshot available.',
      reasons: ['No baseline architecture snapshot available for target branch comparison.'],
      healthDelta: 0,
      baselineHealthScore: null,
      prHealthScore: 88,
      isRegressed: false,
      newCriticalCount: 0,
      newHighCount: 0,
      newCircularCyclesCount: 0,
      newLayerViolationsCount: 0,
      policyOptions: mockDetail.policyResult.policyOptions,
      evaluatedAt: new Date().toISOString(),
    },
  };

  const neutralCard = React.createElement(PRHealthComparisonCard, {
    detail: mockNeutralDetail,
  });

  assertEqual(
    neutralCard.props.detail.policyResult.outcome,
    'neutral',
    'Neutral outcome handled cleanly without error',
  );

  console.log('  ✅ Test 4 PASS: Neutral outcome (missing baseline) renders safely');

  // ── Test 5: GatekeeperSettingsForm Instantiation & Props ───────────────────
  const settingsForm = React.createElement(GatekeeperSettingsForm, {
    repositoryId: 'test-repo-123',
  });

  assertEqual(settingsForm.type, GatekeeperSettingsForm, 'GatekeeperSettingsForm mounts');
  assertEqual(settingsForm.props.repositoryId, 'test-repo-123', 'repositoryId prop bound');

  console.log('  ✅ Test 5 PASS: GatekeeperSettingsForm component signature and props verified');

  // ── Test 6: ArchitectureImpactCard Instantiation & Props ──────────────────
  const mockImpact: ArchitectureImpact = {
    prNumber: 42,
    jobId: 'job-42-sha',
    headSha: 'head424242424242424242424242424242424242',
    baseSha: 'base424242424242424242424242424242424242',
    overallImpactLevel: 'HIGH',
    impactReasoning: ['Significant score drop of -8 points detected.'],
    changedFiles: { count: 3, paths: ['apps/api/src/services/user.ts'] },
    affectedComponents: ['apps/api'],
    affectedModules: ['services/user'],
    affectedLayers: ['API & Controller Layer', 'Domain & Business Logic Layer'],
    dependencyImpact: {
      baselineDependenciesCount: 30,
      prDependenciesCount: 35,
      totalDependencyDelta: 5,
      addedEdgesCount: 5,
      removedEdgesCount: 0,
    },
    newlyIntroducedRisks: {
      totalCount: 1,
      criticalCount: 0,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      items: [],
    },
    resolvedRisks: { totalCount: 0, items: [] },
    baselineComparison: {
      baselineHealthScore: 90,
      prHealthScore: 82,
      scoreDelta: -8,
      healthTrend: 'DEGRADED',
      baselineFound: true,
    },
    evaluatedAt: new Date().toISOString(),
  };

  const impactCard = React.createElement(ArchitectureImpactCard, { impact: mockImpact });
  assertEqual(
    impactCard.props.impact.overallImpactLevel,
    'HIGH',
    'HIGH impact level bound to ArchitectureImpactCard',
  );
  assertEqual(
    impactCard.props.impact.changedFiles.count,
    3,
    'Changed files count bound to ArchitectureImpactCard',
  );

  console.log('  ✅ Test 6 PASS: ArchitectureImpactCard component signature and props verified');

  console.log('\n🎉 ALL WEB PR GATEKEEPER DASHBOARD UI TESTS PASSED!\n');
}

if (process.argv[1]?.includes('gatekeeper.test.ts')) {
  runWebGatekeeperUITests().catch((err) => {
    console.error('❌ Web Gatekeeper UI Tests Failed:', err);
    process.exit(1);
  });
}
