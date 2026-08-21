/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Deterministic Architecture Health Engine Integration Test Suite
// (Sprint 8 Task 1)
// =============================================================================

import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import {
  analyzeArchitectureHealthSync,
  classifyPathLayer,
  computeFanMetrics,
  generateArchitectureHealthReport,
} from './architecture-health.service.js';

const REPO_ID_OWNED = '00000000-0000-4000-8000-0000000000c9';
const REPO_ID_OTHER = '00000000-0000-4000-8000-0000000000ca';
const USER_ID_1 = '00000000-0000-4000-8000-0000000000a1';
const USER_ID_2 = '00000000-0000-4000-8000-0000000000a2';

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
      return [
        { id: 'f1', repositoryId: REPO_ID_OWNED, path: 'src/main.ts', name: 'main.ts' },
        { id: 'f2', repositoryId: REPO_ID_OWNED, path: 'src/utils.ts', name: 'utils.ts' },
      ];
    }

    if (clientMethod === 'fileDependency.findMany' || model === 'FileDependency') {
      return [
        {
          id: 'd1',
          repositoryId: REPO_ID_OWNED,
          sourcePath: 'src/main.ts',
          targetPath: 'src/utils.ts',
          isExternal: false,
        },
      ];
    }

    if (clientMethod === 'repositorySymbol.findMany' || model === 'RepositorySymbol') {
      return [];
    }

    return null;
  };
}

async function runTests(): Promise<void> {
  console.log('🧪 Starting Deterministic Architecture Health Engine Unit Tests...\n');

  // Test 1: Layer Classification Heuristics
  {
    assert.strictEqual(classifyPathLayer('prisma/schema.prisma'), 'data_layer');
    assert.strictEqual(classifyPathLayer('src/controllers/user.controller.ts'), 'api');
    assert.strictEqual(classifyPathLayer('src/services/auth.service.ts'), 'domain_logic');
    assert.strictEqual(classifyPathLayer('src/components/button.tsx'), 'frontend');
    assert.strictEqual(classifyPathLayer('src/config/env.ts'), 'configuration');
    console.log('  ✅ Test 1: Layer Classification Heuristics verified');
  }

  // Test 2: Fan-in and Fan-out calculation for acyclic graph
  {
    const files = [{ path: 'src/a.ts' }, { path: 'src/b.ts' }, { path: 'src/c.ts' }];
    const deps = [
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', isExternal: false },
      { sourcePath: 'src/a.ts', targetPath: 'src/c.ts', isExternal: false },
    ];
    const metrics = computeFanMetrics(files, deps);

    const aMetrics = metrics.find((m) => m.filePath === 'src/a.ts');
    const bMetrics = metrics.find((m) => m.filePath === 'src/b.ts');

    assert.strictEqual(aMetrics?.fanIn, 0);
    assert.strictEqual(aMetrics?.fanOut, 2);
    assert.strictEqual(aMetrics?.totalDegree, 2);

    assert.strictEqual(bMetrics?.fanIn, 1);
    assert.strictEqual(bMetrics?.fanOut, 0);
    assert.strictEqual(bMetrics?.totalDegree, 1);
    console.log('  ✅ Test 2: Fan-in and Fan-out calculation verified');
  }

  // Test 3: Clean acyclic graph produces 100 Health Score (Grade A+)
  {
    const report = analyzeArchitectureHealthSync({
      repositoryId: 'test-repo',
      files: [
        { path: 'src/main.ts', name: 'main.ts' },
        { path: 'src/helper.ts', name: 'helper.ts' },
      ],
      dependencies: [{ sourcePath: 'src/main.ts', targetPath: 'src/helper.ts', isExternal: false }],
    });

    assert.strictEqual(report.healthScore, 100, 'Test 3: score is 100');
    assert.strictEqual(report.grade, 'A+', 'Test 3: grade is A+');
    assert.strictEqual(report.findings.length, 0, 'Test 3: no findings');
    console.log('  ✅ Test 3: Clean acyclic graph produces 100 Health Score (Grade A+)');
  }

  // Test 4: Single circular dependency cycle penalty calculation
  {
    const report = analyzeArchitectureHealthSync({
      repositoryId: 'cycle-repo',
      files: [
        { path: 'src/a.ts', name: 'a.ts' },
        { path: 'src/b.ts', name: 'b.ts' },
      ],
      dependencies: [
        { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', isExternal: false },
        { sourcePath: 'src/b.ts', targetPath: 'src/a.ts', isExternal: false },
      ],
    });

    assert.strictEqual(report.metrics.circularCycleCount, 1, 'Test 4: 1 cycle detected');
    assert.strictEqual(report.scoreBreakdown.cyclePenalty, 10, 'Test 4: cycle penalty is 10');
    assert.strictEqual(report.healthScore, 90, 'Test 4: health score is 90');
    assert.strictEqual(report.grade, 'A+', 'Test 4: grade is A+');
    assert.strictEqual(report.findings[0]?.category, 'circular_dependency');
    console.log('  ✅ Test 4: Single circular dependency cycle penalized cleanly');
  }

  // Test 5: Multiple circular cycles cap penalty at 40 points
  {
    const deps = [
      { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', isExternal: false },
      { sourcePath: 'src/b.ts', targetPath: 'src/a.ts', isExternal: false },
      { sourcePath: 'src/c.ts', targetPath: 'src/d.ts', isExternal: false },
      { sourcePath: 'src/d.ts', targetPath: 'src/c.ts', isExternal: false },
      { sourcePath: 'src/e.ts', targetPath: 'src/f.ts', isExternal: false },
      { sourcePath: 'src/f.ts', targetPath: 'src/e.ts', isExternal: false },
      { sourcePath: 'src/g.ts', targetPath: 'src/h.ts', isExternal: false },
      { sourcePath: 'src/h.ts', targetPath: 'src/g.ts', isExternal: false },
      { sourcePath: 'src/x.ts', targetPath: 'src/y.ts', isExternal: false },
      { sourcePath: 'src/y.ts', targetPath: 'src/x.ts', isExternal: false },
    ];
    const files = Array.from(new Set(deps.flatMap((d) => [d.sourcePath, d.targetPath]))).map(
      (p) => ({
        path: p,
        name: p,
      }),
    );

    const report = analyzeArchitectureHealthSync({
      repositoryId: 'multi-cycle-repo',
      files,
      dependencies: deps,
    });

    assert.strictEqual(
      report.scoreBreakdown.cyclePenalty,
      40,
      'Test 5: cycle penalty capped at 40',
    );
    assert(report.healthScore <= 60, 'Test 5: score reduced by 40');
    console.log('  ✅ Test 5: Multiple circular cycles capped at max penalty');
  }

  // Test 6: Coupling hotspot detection above degree threshold
  {
    const deps = Array.from({ length: 12 }, (_, i) => ({
      sourcePath: 'src/central.ts',
      targetPath: `src/dep${i}.ts`,
      isExternal: false,
    }));
    const files = [{ path: 'src/central.ts', name: 'central.ts' }].concat(
      deps.map((d) => ({ path: d.targetPath, name: d.targetPath })),
    );

    const report = analyzeArchitectureHealthSync({
      repositoryId: 'hotspot-repo',
      files,
      dependencies: deps,
    });

    assert.strictEqual(report.metrics.hotspotCount, 1, 'Test 6: 1 hotspot detected');
    assert.strictEqual(report.findings[0]?.category, 'coupling_hotspot');
    assert.strictEqual(report.scoreBreakdown.hotspotPenalty, 5, 'Test 6: hotspot penalty is 5');
    console.log('  ✅ Test 6: Coupling hotspot detected above degree threshold');
  }

  // Test 7: Layer breach detection (Data layer importing API controller)
  {
    const report = analyzeArchitectureHealthSync({
      repositoryId: 'breach-repo',
      files: [
        { path: 'src/db/user.repository.ts', name: 'user.repository.ts' },
        { path: 'src/controllers/user.controller.ts', name: 'user.controller.ts' },
      ],
      dependencies: [
        {
          sourcePath: 'src/db/user.repository.ts',
          targetPath: 'src/controllers/user.controller.ts',
          isExternal: false,
        },
      ],
    });

    assert.strictEqual(report.metrics.layerViolationCount, 1, 'Test 7: 1 layer breach detected');
    assert.strictEqual(report.findings[0]?.category, 'layer_violation');
    assert.strictEqual(report.scoreBreakdown.layerViolationPenalty, 8);
    console.log('  ✅ Test 7: Layer breach detected (Data layer importing API controller)');
  }

  // Test 8: Empty graph produces score 100 cleanly without crashing
  {
    const report = analyzeArchitectureHealthSync({
      repositoryId: 'empty-repo',
      files: [],
      dependencies: [],
    });

    assert.strictEqual(report.healthScore, 100, 'Test 8: empty graph score is 100');
    assert.strictEqual(report.grade, 'A+');
    assert.strictEqual(report.findings.length, 0);
    console.log('  ✅ Test 8: Empty graph handles cleanly with 100 score');
  }

  // Test 9: Deterministic repeated execution (Idempotency)
  {
    const input = {
      repositoryId: 'idempotent-repo',
      files: [
        { path: 'src/a.ts', name: 'a.ts' },
        { path: 'src/b.ts', name: 'b.ts' },
      ],
      dependencies: [
        { sourcePath: 'src/a.ts', targetPath: 'src/b.ts', isExternal: false },
        { sourcePath: 'src/b.ts', targetPath: 'src/a.ts', isExternal: false },
      ],
    };

    const res1 = analyzeArchitectureHealthSync(input);
    const res2 = analyzeArchitectureHealthSync(input);

    assert.strictEqual(res1.healthScore, res2.healthScore, 'Test 9: health score identical');
    assert.strictEqual(res1.grade, res2.grade, 'Test 9: grade identical');
    assert.strictEqual(
      res1.findings.length,
      res2.findings.length,
      'Test 9: finding count identical',
    );
    console.log('  ✅ Test 9: Deterministic repeated execution verified (Idempotency)');
  }

  // Test 10: Full DB service wrapper with mock ownership check
  {
    setupMocks();

    const report = await generateArchitectureHealthReport(REPO_ID_OWNED, USER_ID_1);
    assert.strictEqual(report.repositoryId, REPO_ID_OWNED);
    assert.strictEqual(report.healthScore, 100);

    let accessDenied = false;
    try {
      await generateArchitectureHealthReport(REPO_ID_OTHER, USER_ID_1);
    } catch (err: any) {
      accessDenied = true;
      assert(err.message.includes('Access denied'));
    }
    assert(accessDenied, 'Test 10: non-owner access denied');
    console.log('  ✅ Test 10: Full DB service wrapper and ownership enforcement verified');
  }

  // Test 11: Duplicate dependency edge deduplication in fan metrics
  {
    const files = [{ path: 'src/A.ts' }, { path: 'src/B.ts' }, { path: 'src/C.ts' }];
    const deps = [
      { sourcePath: 'src/A.ts', targetPath: 'src/B.ts', isExternal: false },
      { sourcePath: 'src/A.ts', targetPath: 'src/B.ts', isExternal: false },
      { sourcePath: 'src/A.ts', targetPath: 'src/C.ts', isExternal: false },
    ];

    const metrics = computeFanMetrics(files, deps);
    const aMetrics = metrics.find((m) => m.filePath === 'src/A.ts');
    const bMetrics = metrics.find((m) => m.filePath === 'src/B.ts');
    const cMetrics = metrics.find((m) => m.filePath === 'src/C.ts');

    assert.strictEqual(aMetrics?.fanOut, 2, 'Test 11: A fanOut is 2');
    assert.strictEqual(bMetrics?.fanIn, 1, 'Test 11: B fanIn is 1');
    assert.strictEqual(cMetrics?.fanIn, 1, 'Test 11: C fanIn is 1');
    console.log('  ✅ Test 11: Duplicate dependency edge deduplication in fan metrics verified');
  }

  console.log('\n🎉 ALL DETERMINISTIC ARCHITECTURE HEALTH ENGINE TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
