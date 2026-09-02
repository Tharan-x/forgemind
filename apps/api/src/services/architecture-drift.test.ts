/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Architecture Drift Intelligence Engine Unit & Integration Test Suite
// =============================================================================

import {
  calculateArchitectureDriftLevel,
  generateDriftReasons,
  getLayerDisplayName,
} from './architecture-drift.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message} (expected ${String(expected)}, got ${String(actual)})`,
    );
  }
}

export async function runArchitectureDriftTests(): Promise<void> {
  console.log('\n🧪 Starting Architecture Drift Intelligence Test Suite...\n');

  // 1. Layer Display Name helper
  assertEqual(
    getLayerDisplayName('apps/api/src/controllers/user.controller.ts'),
    'API & Controller Layer',
    'Controller path mapped to API Layer',
  );
  assertEqual(
    getLayerDisplayName('apps/api/prisma/schema.prisma'),
    'Data Access & Database Layer',
    'Prisma path mapped to Data Layer',
  );
  assertEqual(
    getLayerDisplayName('apps/web/src/components/Card.tsx'),
    'Presentation & User Interface Layer',
    'UI path mapped to Presentation Layer',
  );

  console.log('  ✅ Test 1 PASS: Layer display name mapping verified');

  // 2. NO architectural change → NONE
  const noneLevel = calculateArchitectureDriftLevel({
    scoreDelta: 0,
    newFindings: [],
    resolvedFindingsCount: 0,
    changedModulesCount: 0,
    affectedLayersCount: 0,
    totalDependencyDelta: 0,
    newCrossLayerDepsCount: 0,
    policyOutcome: 'pass',
  });
  assertEqual(noneLevel, 'NONE', 'No structural changes yields NONE drift');

  const noneReasons = generateDriftReasons({
    driftLevel: 'NONE',
    changedModules: [],
    affectedLayers: [],
    totalDependencyDelta: 0,
    addedEdgesCount: 0,
    removedEdgesCount: 0,
    newCrossLayerDeps: [],
    baselineHealthScore: 90,
    currentHealthScore: 90,
    scoreDelta: 0,
    newFindings: [],
    resolvedFindings: [],
    policyOutcome: 'pass',
    baselineFound: true,
  });
  assert(noneReasons.length > 0, 'Generates reason for NONE drift');

  console.log('  ✅ Test 2 PASS: Zero change yields NONE drift with reason');

  // 3. Small isolated change → LOW
  const lowLevel = calculateArchitectureDriftLevel({
    scoreDelta: 0,
    newFindings: [],
    resolvedFindingsCount: 0,
    changedModulesCount: 1,
    affectedLayersCount: 1,
    totalDependencyDelta: 1,
    newCrossLayerDepsCount: 0,
    policyOutcome: 'pass',
  });
  assertEqual(lowLevel, 'LOW', 'Small isolated change yields LOW drift');

  console.log('  ✅ Test 3 PASS: Small isolated change yields LOW drift');

  // 4. Multi-module change → MEDIUM
  const mediumLevel = calculateArchitectureDriftLevel({
    scoreDelta: -2,
    newFindings: [],
    resolvedFindingsCount: 0,
    changedModulesCount: 3,
    affectedLayersCount: 2,
    totalDependencyDelta: 4,
    newCrossLayerDepsCount: 0,
    policyOutcome: 'pass',
  });
  assertEqual(mediumLevel, 'MEDIUM', 'Multi-module change yields MEDIUM drift');

  console.log('  ✅ Test 4 PASS: Multi-module change yields MEDIUM drift');

  // 5. Cross-layer dependency change → HIGH
  const highLevel = calculateArchitectureDriftLevel({
    scoreDelta: -6,
    newFindings: [
      {
        id: 'f-1',
        category: 'layer_violation',
        severity: 'high',
        title: 'Layer breach',
        description: 'Breach detected',
        affectedNodeIds: [],
        affectedFilePaths: ['src/ui.ts'],
        metrics: {},
        penaltyPoints: 10,
      },
    ],
    resolvedFindingsCount: 0,
    changedModulesCount: 2,
    affectedLayersCount: 3,
    totalDependencyDelta: 12,
    newCrossLayerDepsCount: 2,
    policyOutcome: 'pass',
  });
  assertEqual(highLevel, 'HIGH', 'Cross-layer dependency change yields HIGH drift');

  console.log('  ✅ Test 5 PASS: Cross-layer dependency change yields HIGH drift');

  // 6. Severe structural + health regression → CRITICAL
  const criticalLevel = calculateArchitectureDriftLevel({
    scoreDelta: -18,
    newFindings: [
      {
        id: 'f-2',
        category: 'circular_dependency',
        severity: 'critical',
        title: 'Critical Cycle',
        description: 'Large circular cycle',
        affectedNodeIds: [],
        affectedFilePaths: ['src/a.ts', 'src/b.ts'],
        metrics: {},
        penaltyPoints: 20,
      },
    ],
    resolvedFindingsCount: 0,
    changedModulesCount: 4,
    affectedLayersCount: 4,
    totalDependencyDelta: 20,
    newCrossLayerDepsCount: 3,
    policyOutcome: 'fail',
  });
  assertEqual(criticalLevel, 'CRITICAL', 'Severe regression yields CRITICAL drift');

  console.log('  ✅ Test 6 PASS: Severe regression yields CRITICAL drift');

  // 7. Improved/resolved architecture should not incorrectly produce high drift
  const improvedLevel = calculateArchitectureDriftLevel({
    scoreDelta: 10,
    newFindings: [],
    resolvedFindingsCount: 3,
    changedModulesCount: 2,
    affectedLayersCount: 1,
    totalDependencyDelta: 3,
    newCrossLayerDepsCount: 0,
    policyOutcome: 'pass',
  });
  assert(
    improvedLevel === 'LOW' || improvedLevel === 'NONE',
    `Improved architecture should be LOW or NONE, got ${improvedLevel}`,
  );

  const improvedReasons = generateDriftReasons({
    driftLevel: improvedLevel,
    changedModules: ['services/user'],
    affectedLayers: ['Domain & Business Logic Layer'],
    totalDependencyDelta: 3,
    addedEdgesCount: 0,
    removedEdgesCount: 3,
    newCrossLayerDeps: [],
    baselineHealthScore: 80,
    currentHealthScore: 90,
    scoreDelta: 10,
    newFindings: [],
    resolvedFindings: [
      {
        id: 'f-resolved',
        category: 'circular_dependency',
        severity: 'high',
        title: 'Resolved cycle',
        description: 'Fixed',
        affectedNodeIds: [],
        affectedFilePaths: [],
        metrics: {},
        penaltyPoints: 10,
      },
    ],
    policyOutcome: 'pass',
    baselineFound: true,
  });
  assert(
    improvedReasons.some((r) => r.includes('Resolved 1 previously detected')),
    'Explains resolved findings in human readable reasons',
  );

  console.log(
    '  ✅ Test 7 PASS: Improved architecture correctly handled as LOW/NONE drift with resolution explanation',
  );

  // 8. Missing baseline handled safely
  const missingBaselineReasons = generateDriftReasons({
    driftLevel: 'LOW',
    changedModules: ['core/util'],
    affectedLayers: ['Core Primitives & Shared Layer'],
    totalDependencyDelta: 1,
    addedEdgesCount: 1,
    removedEdgesCount: 0,
    newCrossLayerDeps: [],
    baselineHealthScore: 100,
    currentHealthScore: 100,
    scoreDelta: 0,
    newFindings: [],
    resolvedFindings: [],
    policyOutcome: 'neutral',
    baselineFound: false,
  });
  assert(
    missingBaselineReasons.some((r) => r.includes('No baseline snapshot found')),
    'Handles missing baseline safely with explicit reason',
  );

  console.log('  ✅ Test 8 PASS: Missing baseline handled safely');

  console.log('\n🎉 ALL ARCHITECTURE DRIFT ENGINE TESTS PASSED!\n');
}

if (process.argv[1]?.includes('architecture-drift.test.ts')) {
  runArchitectureDriftTests().catch((err) => {
    console.error('❌ Architecture Drift Tests Failed:', err);
    process.exit(1);
  });
}
