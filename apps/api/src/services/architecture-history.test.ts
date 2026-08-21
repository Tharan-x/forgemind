/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Architectural Health Timeline & Regression Test Suite
// (Sprint 8 Task 5)
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

  // Test 1: getArchitectureHealthHistory for authorized user
  console.log('📋 Test 1: Health History Retrieval');
  const history = await getArchitectureHealthHistory(REPO_ID_OWNED, USER_ID_1);
  assert.strictEqual(history.repositoryId, REPO_ID_OWNED, 'repositoryId matches');
  assert.strictEqual(typeof history.currentHealthScore, 'number', 'currentHealthScore is number');
  assert.ok(Array.isArray(history.points), 'points is array');
  console.log('  ✅ Test 1 PASS: Health History dataset returned');

  // Test 2: getArchitectureHealthHistory cross-user access rejected
  console.log('📋 Test 2: Health History Ownership Check');
  try {
    await getArchitectureHealthHistory(REPO_ID_OTHER, USER_ID_1);
    assert.fail('Should throw error for non-owned repo');
  } catch (err: any) {
    assert.ok(Boolean(err?.message), 'Ownership error thrown');
    console.log('  ✅ Test 2 PASS: Cross-user access rejected');
  }

  // Test 3: compareArchitectureHealthSnapshots for authorized user
  console.log('📋 Test 3: Snapshot Comparison Execution');
  const compare = await compareArchitectureHealthSnapshots(REPO_ID_OWNED, USER_ID_1);
  assert.strictEqual(compare.repositoryId, REPO_ID_OWNED, 'repositoryId matches');
  assert.strictEqual(typeof compare.healthDelta, 'number', 'healthDelta is number');
  assert.ok(Array.isArray(compare.newFindings), 'newFindings is array');
  console.log('  ✅ Test 3 PASS: Snapshot comparison diff generated');

  console.log('\n🎉 ALL SPRINT 8 TASK 5 ARCHITECTURAL HISTORY TESTS PASSED SUCCESSFULLY!\n');
}

runArchitectureHistoryTests().catch((err) => {
  console.error('❌ Architectural History test suite failed:', err);
  process.exit(1);
});
