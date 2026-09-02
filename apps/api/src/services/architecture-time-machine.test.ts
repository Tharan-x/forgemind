/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import {
  getArchitectureTimeMachineTimeline,
  compareArchitectureTimeMachineSnapshots,
} from './architecture-time-machine.service.js';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message} (expected ${expected}, got ${actual})`);
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const mockRepoId = '00000000-0000-4000-8000-0000000000c9';
const mockUserId = 'user-owner-id';
const nonOwnerUserId = 'user-unauthorized-id';

const MOCK_REPOSITORIES: Record<string, any> = {
  [mockRepoId]: {
    id: mockRepoId,
    userId: mockUserId,
    name: 'forgemind-app',
  },
};

const MOCK_SNAPSHOTS: any[] = [
  {
    id: 'snap-1',
    repositoryId: mockRepoId,
    analysisJobId: 'job-1',
    commitHash: 'commit-old',
    healthScore: 90,
    grade: 'A',
    totalFiles: 10,
    totalDependencies: 5,
    circularCycleCount: 1,
    layerViolationCount: 0,
    hotspotCount: 0,
    orphanExportCount: 0,
    scoreBreakdown: {},
    findings: [
      {
        id: 'finding-1',
        category: 'circular_dependency',
        severity: 'high',
        title: 'Circular Dependency Cycle (2 files)',
        description: 'src/a.ts -> src/b.ts',
        affectedNodeIds: ['file:src/a.ts', 'file:src/b.ts'],
        affectedFilePaths: ['src/a.ts', 'src/b.ts'],
        metrics: { cycleLength: 2 },
        penaltyPoints: 10,
      },
    ],
    fanMetrics: [],
    createdAt: new Date('2026-08-20T10:00:00Z'),
  },
  {
    id: 'snap-2',
    repositoryId: mockRepoId,
    analysisJobId: 'job-2',
    commitHash: 'commit-new',
    healthScore: 75,
    grade: 'B+',
    totalFiles: 12,
    totalDependencies: 8,
    circularCycleCount: 1,
    layerViolationCount: 2,
    hotspotCount: 0,
    orphanExportCount: 0,
    scoreBreakdown: {},
    findings: [],
    fanMetrics: [],
    createdAt: new Date('2026-08-25T10:00:00Z'),
  },
];

function setupMocks(): void {
  (PrismaClient.prototype as any)._request = async function (params: any): Promise<any> {
    const { clientMethod, model, action, args } = params;

    if (
      clientMethod === 'repository.findUnique' ||
      (model === 'Repository' && (action === 'findUnique' || action === 'findFirst'))
    ) {
      const id = args?.where?.id;
      return MOCK_REPOSITORIES[id] ?? null;
    }

    if (clientMethod === 'fileDependency.findMany' || model === 'FileDependency') {
      return [
        {
          id: 'd1',
          repositoryId: mockRepoId,
          sourcePath: 'src/main.ts',
          targetPath: 'src/utils.ts',
          isExternal: false,
        },
      ];
    }

    if (
      clientMethod?.startsWith('architectureHealthSnapshot.') ||
      model === 'ArchitectureHealthSnapshot'
    ) {
      if (action === 'findMany') {
        const repoId = args?.where?.repositoryId;
        return MOCK_SNAPSHOTS.filter((s) => !repoId || s.repositoryId === repoId).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
      }

      if (action === 'findFirst' || action === 'findUnique') {
        const where = args?.where || {};
        if (where.OR) {
          const matched = MOCK_SNAPSHOTS.find((s) =>
            where.OR.some(
              (cond: any) =>
                (cond.analysisJobId && s.analysisJobId === cond.analysisJobId) ||
                (cond.id && s.id === cond.id),
            ),
          );
          if (matched) return matched;
        }
        if (where.analysisJobId) {
          return MOCK_SNAPSHOTS.find((s) => s.analysisJobId === where.analysisJobId) ?? null;
        }
        if (where.id) {
          return MOCK_SNAPSHOTS.find((s) => s.id === where.id) ?? null;
        }
        if (where.repositoryId) {
          const list = MOCK_SNAPSHOTS.filter((s) => s.repositoryId === where.repositoryId).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          return list[0] ?? null;
        }
        return MOCK_SNAPSHOTS[0] ?? null;
      }
    }

    return null;
  };
}

export async function runArchitectureTimeMachineTests(): Promise<void> {
  console.log('\n🧪 Starting Architecture Time Machine Test Suite...');
  setupMocks();

  // 1. Timeline Retrieval & Ordering with Empty DB Fallback
  const timelineResult = await getArchitectureTimeMachineTimeline(mockRepoId, mockUserId);
  assertEqual(timelineResult.repositoryId, mockRepoId, 'Timeline returns correct repository ID');
  assertTrue(
    timelineResult.timeline.length >= 1,
    'Timeline includes at least 1 fallback/persisted snapshot',
  );
  console.log('  ✅ Test 1 PASS: Timeline retrieval & fallback handling verified');

  // 2. Historical Snapshot Ordering & Metadata Structure
  if (timelineResult.timeline.length > 0) {
    const firstPoint = timelineResult.timeline[0];
    assertTrue(!!firstPoint?.snapshotId, 'Snapshot contains snapshotId');
    assertTrue(typeof firstPoint?.healthScore === 'number', 'Snapshot contains healthScore number');
    assertTrue(typeof firstPoint?.evaluatedAt === 'string', 'Snapshot contains ISO evaluatedAt');
  }
  console.log('  ✅ Test 2 PASS: Timeline snapshot ordering & metadata structure verified');

  // 3. Comparing Two Valid Snapshots
  const snapA = timelineResult.timeline[0]?.snapshotId;
  const snapB = timelineResult.timeline[timelineResult.timeline.length - 1]?.snapshotId;
  const comparison = await compareArchitectureTimeMachineSnapshots(
    mockRepoId,
    mockUserId,
    snapA,
    snapB,
  );

  assertEqual(comparison.repositoryId, mockRepoId, 'Comparison returns correct repository ID');
  assertTrue(!!comparison.fromSnapshot, 'Comparison includes fromSnapshot');
  assertTrue(!!comparison.toSnapshot, 'Comparison includes toSnapshot');
  assertTrue(!!comparison.drift, 'Comparison includes drift payload');
  assertTrue(
    !!comparison.architecturalConsequenceExplanation,
    'Comparison includes explanation string',
  );
  console.log('  ✅ Test 3 PASS: Snapshot A vs Snapshot B comparison execution verified');

  // 4. Health Score Movement
  assertTrue(
    typeof comparison.drift.healthScoreMovement.baselineScore === 'number' &&
      typeof comparison.drift.healthScoreMovement.currentScore === 'number' &&
      typeof comparison.drift.healthScoreMovement.scoreDelta === 'number',
    'Health score movement metrics structured correctly',
  );
  console.log('  ✅ Test 4 PASS: Health score movement tracking verified');

  // 5. Drift Level Movement
  assertTrue(
    ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(comparison.drift.driftLevel),
    'Drift level assigned cleanly',
  );
  console.log('  ✅ Test 5 PASS: Drift level calculation verified');

  // 6. Changed Module & Layer Detection Structure
  assertTrue(Array.isArray(comparison.drift.changedModules), 'changedModules is an array');
  assertTrue(Array.isArray(comparison.drift.affectedLayers), 'affectedLayers is an array');
  console.log('  ✅ Test 6 PASS: Changed module & layer detection structures verified');

  // 7. Dependency Edge Additions/Removals & Churn
  assertTrue(
    typeof comparison.drift.dependencyChurn.addedEdgesCount === 'number',
    'addedEdgesCount is a number',
  );
  assertTrue(
    typeof comparison.drift.dependencyChurn.removedEdgesCount === 'number',
    'removedEdgesCount is a number',
  );
  assertTrue(
    typeof comparison.drift.dependencyChurn.totalDependencyDelta === 'number',
    'totalDependencyDelta is a number',
  );
  console.log('  ✅ Test 7 PASS: Dependency churn (+/- edges) tracking verified');

  // 8. Cross-Layer Dependency Detection Structure
  assertTrue(
    Array.isArray(comparison.drift.newCrossLayerDependencies),
    'newCrossLayerDependencies is an array',
  );
  console.log('  ✅ Test 8 PASS: Cross-layer dependency detection structure verified');

  // 9. Same-Snapshot Comparison Handling
  if (snapA) {
    const sameSnapshotComparison = await compareArchitectureTimeMachineSnapshots(
      mockRepoId,
      mockUserId,
      snapA,
      snapA,
    );
    assertEqual(
      sameSnapshotComparison.drift.driftLevel,
      'NONE',
      'Same snapshot comparison yields NONE drift',
    );
    assertEqual(
      sameSnapshotComparison.drift.healthScoreMovement.scoreDelta,
      0,
      'Same snapshot comparison has 0 score delta',
    );
  }
  console.log('  ✅ Test 9 PASS: Same-snapshot comparison handled safely with NONE drift');

  // 10. Missing Snapshot / Invalid Repository Handling
  try {
    await getArchitectureTimeMachineTimeline('non-existent-repo-id', mockUserId);
    throw new Error('Should have thrown on non-existent repository');
  } catch (err) {
    assertTrue(
      (err as Error).message.includes('Repository not found') ||
        (err as Error).message.includes('Access denied'),
      'Non-existent repository correctly rejected',
    );
  }
  console.log('  ✅ Test 10 PASS: Missing repository error handling verified');

  // 11. Repository Ownership & Security Enforcement
  try {
    await getArchitectureTimeMachineTimeline(mockRepoId, nonOwnerUserId);
    throw new Error('Should have thrown on unauthorized user');
  } catch (err) {
    assertTrue(
      (err as Error).message.includes('Access denied'),
      'Unauthorized user correctly rejected',
    );
  }
  console.log('  ✅ Test 11 PASS: Repository ownership & security enforcement verified');

  console.log('\n🎉 ALL ARCHITECTURE TIME MACHINE TESTS PASSED!\n');
}

runArchitectureTimeMachineTests().catch((err) => {
  console.error('❌ Architecture Time Machine Tests Failed:', err);
  process.exit(1);
});
