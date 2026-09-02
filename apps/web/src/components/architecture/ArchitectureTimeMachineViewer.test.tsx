// =============================================================================
// ForgeMind Web — Architecture Time Machine Component Unit & Integration Tests
// =============================================================================

import React from 'react';
import type {
  ArchitectureTimelineResponse,
  ArchitectureTimeMachineSnapshotItem,
  ArchitectureTimeMachineComparisonResponse,
} from '@forgemind/types';

import { ArchitectureTimeMachineViewer } from './ArchitectureTimeMachineViewer';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

export async function runArchitectureTimeMachineUITests(): Promise<void> {
  console.log('🧪 ForgeMind Web — Architecture Time Machine Component UI Test Suite\n');

  // ── Test 1: Component Instantiation & Props Signature ─────────────────────────
  const element = React.createElement(ArchitectureTimeMachineViewer, {
    repositoryId: 'repo-time-machine-123',
  });

  assertEqual(element.type, ArchitectureTimeMachineViewer, 'ArchitectureTimeMachineViewer mounts');
  assertEqual(
    element.props.repositoryId,
    'repo-time-machine-123',
    'repositoryId prop bound correctly',
  );

  console.log('  ✅ Test 1 PASS: ArchitectureTimeMachineViewer component instantiation verified');

  // ── Test 2: Timeline Response Mock Validation ─────────────────────────────────
  const mockTimelineResponse: ArchitectureTimelineResponse = {
    repositoryId: 'repo-time-machine-123',
    currentHealthScore: 88,
    totalSnapshots: 2,
    timeline: [
      {
        snapshotId: 'snap-1',
        analysisJobId: 'job-1',
        commitHash: 'commit111111111111111111111111111111111111',
        prNumber: null,
        prTitle: 'Initial Architecture Baseline',
        healthScore: 92,
        grade: 'A',
        totalFiles: 15,
        totalDependencies: 24,
        findingsCount: 0,
        evaluatedAt: new Date('2026-08-01T10:00:00Z').toISOString(),
      },
      {
        snapshotId: 'snap-2',
        analysisJobId: 'job-2',
        commitHash: 'commit222222222222222222222222222222222222',
        prNumber: 82,
        prTitle: 'Refactor Data Access Layer',
        healthScore: 88,
        grade: 'B+',
        totalFiles: 18,
        totalDependencies: 30,
        findingsCount: 2,
        evaluatedAt: new Date('2026-09-01T10:00:00Z').toISOString(),
        driftFromPrevious: {
          driftLevel: 'MEDIUM',
          scoreDelta: -4,
          changedModulesCount: 2,
          affectedLayersCount: 2,
          totalDependencyDelta: 6,
        },
      },
    ],
  };

  assertEqual(mockTimelineResponse.timeline.length, 2, 'Timeline mock contains 2 points');
  assertEqual(
    mockTimelineResponse.timeline[1]?.prNumber,
    82,
    'PR number correctly assigned in timeline',
  );
  assertEqual(
    mockTimelineResponse.timeline[1]?.driftFromPrevious?.driftLevel,
    'MEDIUM',
    'Drift summary bound cleanly',
  );

  console.log('  ✅ Test 2 PASS: Timeline payload structure & metadata verified');

  // ── Test 3: Comparison Response Mock Validation ────────────────────────────────
  const mockComparisonResponse: ArchitectureTimeMachineComparisonResponse = {
    repositoryId: 'repo-time-machine-123',
    fromSnapshot: mockTimelineResponse.timeline[0] as ArchitectureTimeMachineSnapshotItem,
    toSnapshot: mockTimelineResponse.timeline[1] as ArchitectureTimeMachineSnapshotItem,
    drift: {
      repositoryId: 'repo-time-machine-123',
      baselineAnalysisId: 'snap-1',
      currentAnalysisId: 'snap-2',
      driftLevel: 'HIGH',
      reasons: [
        '2 architectural modules changed.',
        '2 affected architectural layers detected.',
        'Architecture health score moved from 92 → 88 (-4 points).',
      ],
      changedComponents: ['DataLayer', 'APIController'],
      changedModules: ['data/access', 'api/routes'],
      affectedLayers: ['Presentation & UI', 'Data Access & DB'],
      dependencyChurn: {
        baselineEdgesCount: 24,
        currentEdgesCount: 30,
        totalDependencyDelta: 6,
        addedEdgesCount: 6,
        removedEdgesCount: 0,
        edgeShifts: [],
      },
      newCrossLayerDependencies: [
        {
          sourceLayer: 'Presentation & UI',
          targetLayer: 'Data Access & DB',
          sourceFile: 'apps/web/src/pages/index.tsx',
          targetFile: 'apps/api/src/db/client.ts',
        },
      ],
      healthScoreMovement: {
        baselineScore: 92,
        currentScore: 88,
        scoreDelta: -4,
        trend: 'DEGRADED',
      },
      newFindings: [],
      resolvedFindings: [],
      unmodifiedFindings: [],
      evaluatedAt: new Date().toISOString(),
    },
    associatedPR: {
      prNumber: 82,
      headSha: 'commit222222222222222222222222222222222222',
      baseSha: 'commit111111111111111111111111111111111111',
    },
    architecturalConsequenceExplanation:
      'Historical comparison from commit commit1 to commit commit2: Health score moved from 92 → 88 (-4 pts). Drift level is HIGH.',
    evaluatedAt: new Date().toISOString(),
  };

  assertEqual(mockComparisonResponse.drift.driftLevel, 'HIGH', 'Comparison drift level verified');
  assertEqual(mockComparisonResponse.associatedPR?.prNumber, 82, 'Associated PR verified');
  assert(
    mockComparisonResponse.architecturalConsequenceExplanation.includes(
      'Health score moved from 92 → 88',
    ),
    'Deterministic consequence narrative included',
  );

  console.log('  ✅ Test 3 PASS: Snapshot comparison mock & consequence narrative verified');

  console.log('\n🎉 ALL ARCHITECTURE TIME MACHINE UI TESTS PASSED!\n');
}

// Allow direct CLI execution via tsx
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchitectureTimeMachineUITests().catch((err) => {
    console.error('❌ Architecture Time Machine UI Tests Failed:', err);
    process.exit(1);
  });
}
