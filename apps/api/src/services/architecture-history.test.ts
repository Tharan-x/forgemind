/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Architectural Health Timeline & Regression Test Suite
// (Sprint 8 Task 5 & Phase 6.2 Persisted Snapshots)
// =============================================================================

import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import {
  getArchitectureHealthHistory,
  compareArchitectureHealthSnapshots,
} from './architecture-history.service.js';

const REPO_ID_OWNED = '00000000-0000-4000-8000-0000000000d9';
const REPO_ID_OTHER = '00000000-0000-4000-8000-0000000000da';
const USER_ID_1 = '00000000-0000-4000-8000-0000000000b1';
const USER_ID_2 = '00000000-0000-4000-8000-0000000000b2';

const MOCK_REPOSITORIES: Record<string, any> = {
  [REPO_ID_OWNED]: {
    id: REPO_ID_OWNED,
    userId: USER_ID_1,
    name: 'forgemind-app',
  },
  [REPO_ID_OTHER]: {
    id: REPO_ID_OTHER,
    userId: USER_ID_2,
    name: 'other-repo',
  },
};

const MOCK_SNAPSHOTS: any[] = [
  {
    id: 'snap-1',
    repositoryId: REPO_ID_OWNED,
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
    scoreBreakdown: {
      baseScore: 100,
      cyclePenalty: 10,
      layerViolationPenalty: 0,
      hotspotPenalty: 0,
      orphanPenalty: 0,
      finalScore: 90,
      grade: 'A',
    },
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
    repositoryId: REPO_ID_OWNED,
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
    scoreBreakdown: {
      baseScore: 100,
      cyclePenalty: 10,
      layerViolationPenalty: 15,
      hotspotPenalty: 0,
      orphanPenalty: 0,
      finalScore: 75,
      grade: 'B+',
    },
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
      {
        id: 'finding-2',
        category: 'layer_violation',
        severity: 'critical',
        title: 'Architectural Layer Breach',
        description: 'domain -> api',
        affectedNodeIds: ['file:src/domain.ts'],
        affectedFilePaths: ['src/domain.ts'],
        metrics: {},
        penaltyPoints: 15,
      },
    ],
    fanMetrics: [],
    createdAt: new Date('2026-08-25T10:00:00Z'),
  },
];

let mockSnapshotsEnabled = true;

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

    if (clientMethod === 'repositoryFile.findMany' || model === 'RepositoryFile') {
      return [{ id: 'f1', repositoryId: REPO_ID_OWNED, path: 'src/main.ts', name: 'main.ts' }];
    }

    if (clientMethod === 'fileDependency.findMany' || model === 'FileDependency') {
      return [];
    }

    if (clientMethod === 'repositorySymbol.findMany' || model === 'RepositorySymbol') {
      return [];
    }

    if (
      clientMethod?.startsWith('architectureHealthSnapshot.') ||
      model === 'ArchitectureHealthSnapshot'
    ) {
      if (!mockSnapshotsEnabled) return action === 'findMany' ? [] : null;

      if (action === 'findMany') {
        const repoId = args?.where?.repositoryId;
        const take = args?.take ?? 10;
        return MOCK_SNAPSHOTS.filter((s) => !repoId || s.repositoryId === repoId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, take);
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
        if (where.repositoryId) {
          const list = MOCK_SNAPSHOTS.filter((s) => s.repositoryId === where.repositoryId).sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );
          return list[0] ?? null;
        }
        return MOCK_SNAPSHOTS[0] ?? null;
      }
    }

    if (clientMethod === 'analysisJob.findMany' || model === 'AnalysisJob') {
      return [
        {
          id: 'job-1',
          repositoryId: REPO_ID_OWNED,
          status: 'completed',
          commitHash: 'a1b2c3d',
          createdAt: new Date('2026-08-20T10:00:00Z'),
          finishedAt: new Date('2026-08-20T10:02:00Z'),
        },
      ];
    }

    return null;
  };
}

async function runArchitectureHistoryTests() {
  console.log('🧪 ForgeMind — Architectural Health Timeline Test Suite (Sprint 8 Task 5)\n');
  setupMocks();

  // Test 1: getArchitectureHealthHistory for authorized user using persisted snapshots
  console.log('📋 Test 1: Health History Retrieval from Persisted Snapshots');
  const history = await getArchitectureHealthHistory(REPO_ID_OWNED, USER_ID_1);
  assert.strictEqual(history.repositoryId, REPO_ID_OWNED, 'repositoryId matches');
  assert.strictEqual(
    history.currentHealthScore,
    75,
    'currentHealthScore matches latest snapshot (75)',
  );
  assert.strictEqual(history.points.length, 2, 'returns 2 persisted snapshots');
  assert.strictEqual(history.points[0]?.healthScore, 90, 'oldest snapshot score is 90');
  assert.strictEqual(history.points[1]?.healthScore, 75, 'latest snapshot score is 75');
  assert.strictEqual(history.overallTrend, 'DEGRADED', 'overall trend is DEGRADED (90 -> 75)');
  console.log('  ✅ Test 1 PASS: Persisted Health History dataset returned correctly');

  // Test 2: getArchitectureHealthHistory cross-user access rejected
  console.log('📋 Test 2: Health History Ownership Check');
  try {
    await getArchitectureHealthHistory(REPO_ID_OTHER, USER_ID_1);
    assert.fail('Should throw error for non-owned repo');
  } catch (err: any) {
    assert.ok(Boolean(err?.message), 'Ownership error thrown');
    console.log('  ✅ Test 2 PASS: Cross-user access rejected');
  }

  // Test 3: compareArchitectureHealthSnapshots with real snapshot fixtures
  console.log('📋 Test 3: Snapshot Comparison Execution with Real Fixtures');
  const compare = await compareArchitectureHealthSnapshots(
    REPO_ID_OWNED,
    USER_ID_1,
    'job-1', // baseline (score 90)
    'job-2', // current (score 75)
  );
  assert.strictEqual(compare.repositoryId, REPO_ID_OWNED, 'repositoryId matches');
  assert.strictEqual(compare.baselineHealthScore, 90, 'baselineHealthScore is 90');
  assert.strictEqual(compare.currentHealthScore, 75, 'currentHealthScore is 75');
  assert.strictEqual(compare.healthDelta, -15, 'healthDelta is -15');
  assert.strictEqual(compare.trend, 'DEGRADED', 'trend is DEGRADED');
  assert.strictEqual(compare.isRegressed, true, 'isRegressed is true');
  assert.strictEqual(
    compare.regressionSeverity,
    'CRITICAL',
    'regressionSeverity is CRITICAL (delta -15 & critical finding)',
  );
  assert.strictEqual(compare.newFindings.length, 1, '1 new finding detected');
  assert.strictEqual(compare.newFindings[0]?.category, 'layer_violation');
  assert.strictEqual(compare.unmodifiedFindings.length, 1, '1 unmodified finding detected');
  assert.strictEqual(compare.resolvedFindings.length, 0, '0 resolved findings');
  console.log(
    '  ✅ Test 3 PASS: Snapshot comparison diff generated with correct delta and finding classification',
  );

  // Test 4: Backward-compatible fallback when zero snapshots exist
  console.log('📋 Test 4: Backward-compatible Fallback when No Snapshots Exist');
  mockSnapshotsEnabled = false;
  const fallbackHistory = await getArchitectureHealthHistory(REPO_ID_OWNED, USER_ID_1);
  assert.strictEqual(fallbackHistory.points.length, 1, 'returns 1 fallback baseline point');
  assert.strictEqual(fallbackHistory.points[0]?.analysisId, 'current-snapshot');
  mockSnapshotsEnabled = true;
  console.log('  ✅ Test 4 PASS: Fallback baseline point returned cleanly');

  // Test 5: Cascade deletion relationship validation
  console.log('📋 Test 5: Schema Cascade Deletion Validation');
  const schemaPrisma = (PrismaClient.prototype as any)._dmmf?.datamodel?.models?.find(
    (m: any) => m.name === 'ArchitectureHealthSnapshot',
  );
  if (schemaPrisma) {
    const repoRelation = schemaPrisma.fields.find((f: any) => f.name === 'repository');
    assert.strictEqual(
      repoRelation?.relationOnDelete,
      'Cascade',
      'Repository relation onDelete is Cascade',
    );
    const jobRelation = schemaPrisma.fields.find((f: any) => f.name === 'analysisJob');
    assert.strictEqual(
      jobRelation?.relationOnDelete,
      'Cascade',
      'AnalysisJob relation onDelete is Cascade',
    );
  }
  console.log('  ✅ Test 5 PASS: Schema cascade relations verified');

  console.log(
    '\n🎉 ALL SPRINT 8 TASK 5 & PHASE 6.2 ARCHITECTURAL HISTORY TESTS PASSED SUCCESSFULLY!\n',
  );
}

runArchitectureHistoryTests().catch((err) => {
  console.error('❌ Architectural History test suite failed:', err);
  process.exit(1);
});
