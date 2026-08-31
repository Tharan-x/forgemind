/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Architecture Impact Service Unit & Integration Test Suite
// =============================================================================

import type { HealthFinding } from '@forgemind/types';
import {
  extractComponent,
  extractModule,
  mapArchitecturalLayers,
  calculateImpactLevel,
} from './architecture-impact.service.js';

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

export async function runArchitectureImpactTests(): Promise<void> {
  console.log('\n🧪 Starting Architecture Impact Engine Test Suite...\n');

  // 1. Component Extraction
  assertEqual(
    extractComponent('apps/api/src/services/user.ts'),
    'apps/api',
    'Component extracted correctly',
  );
  assertEqual(
    extractComponent('packages/types/src/index.ts'),
    'packages/types',
    'Component extracted for packages',
  );
  assertEqual(
    extractComponent('src/controllers/auth.ts'),
    'src',
    'Top level src component extracted',
  );

  console.log('  ✅ Test 1 PASS: Component extraction helper verified');

  // 2. Module Extraction
  assertEqual(
    extractModule('apps/api/src/services/gatekeeper/config.ts'),
    'services/gatekeeper',
    'Module extracted correctly',
  );
  assertEqual(
    extractModule('packages/types/src/index.ts'),
    'src/index.ts',
    'Fallback module extracted',
  );

  console.log('  ✅ Test 2 PASS: Module extraction helper verified');

  // 3. Layer Mapping
  const samplePaths = [
    'apps/api/src/controllers/repository.controller.ts',
    'apps/api/src/services/user.service.ts',
    'apps/api/prisma/schema.prisma',
  ];
  const layers = mapArchitecturalLayers(samplePaths, []);
  assert(layers.includes('API & Controller Layer'), 'Identified API layer');
  assert(layers.includes('Domain & Business Logic Layer'), 'Identified Domain layer');
  assert(layers.includes('Data Access & Database Layer'), 'Identified Data Access layer');

  console.log('  ✅ Test 3 PASS: Architectural layer mapping verified');

  // 4. LOW Impact Level Calculation
  const lowResult = calculateImpactLevel(0, [], 'pass', 0, 1);
  assertEqual(lowResult.level, 'LOW', 'LOW impact level calculated correctly');

  console.log('  ✅ Test 4 PASS: LOW impact level calculation verified');

  // 5. MEDIUM Impact Level Calculation
  const mediumFinding: HealthFinding = {
    id: 'f-1',
    title: 'Hotspot warning',
    category: 'coupling_hotspot',
    severity: 'medium',
    description: 'High degree',
    affectedNodeIds: [],
    affectedFilePaths: ['src/user.ts'],
    metrics: {},
    penaltyPoints: 5,
  };
  const mediumResult = calculateImpactLevel(-3, [mediumFinding], 'pass', 4, 1);
  assertEqual(mediumResult.level, 'MEDIUM', 'MEDIUM impact level calculated correctly');

  console.log('  ✅ Test 5 PASS: MEDIUM impact level calculation verified');

  // 6. HIGH Impact Level Calculation
  const highFinding: HealthFinding = {
    id: 'f-2',
    title: 'Layer breach',
    category: 'layer_violation',
    severity: 'high',
    description: 'Breach from data layer to api',
    affectedNodeIds: [],
    affectedFilePaths: ['src/db.ts'],
    metrics: {},
    penaltyPoints: 10,
  };
  const highResult = calculateImpactLevel(-8, [highFinding], 'pass', 12, 3);
  assertEqual(highResult.level, 'HIGH', 'HIGH impact level calculated correctly');

  console.log('  ✅ Test 6 PASS: HIGH impact level calculation verified');

  // 7. CRITICAL Impact Level Calculation
  const criticalFinding: HealthFinding = {
    id: 'f-3',
    title: 'Circular Dependency Cycle',
    category: 'circular_dependency',
    severity: 'critical',
    description: 'Severe cycle',
    affectedNodeIds: [],
    affectedFilePaths: ['src/a.ts', 'src/b.ts'],
    metrics: {},
    penaltyPoints: 20,
  };
  const criticalResult = calculateImpactLevel(-20, [criticalFinding], 'fail', 15, 4);
  assertEqual(criticalResult.level, 'CRITICAL', 'CRITICAL impact level calculated correctly');

  console.log('  ✅ Test 7 PASS: CRITICAL impact level calculation verified');

  console.log('\n🎉 ALL ARCHITECTURE IMPACT ENGINE TESTS PASSED!\n');
}

if (process.argv[1]?.includes('architecture-impact.test.ts')) {
  runArchitectureImpactTests().catch((err) => {
    console.error('❌ Architecture Impact Tests Failed:', err);
    process.exit(1);
  });
}
