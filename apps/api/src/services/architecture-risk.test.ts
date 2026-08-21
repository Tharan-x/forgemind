/* eslint-disable no-console */
// =============================================================================

// ForgeMind API — Architectural Risk Intelligence & Action Loop Integration Test Suite
// (Sprint 8 Task 4)
// =============================================================================

import type { HealthFinding, NodeFanMetrics } from '@forgemind/types';
import {
  calculateFindingRiskScore,
  mapRiskImpactLevel,
  mapRefactoringPattern,
  generateStepByStepRemediation,
} from './architecture-risk.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

async function runArchitecturalRiskTests() {
  console.log('🧪 ForgeMind — Architectural Risk Intelligence Test Suite (Sprint 8 Task 4)\n');

  // Test 1: calculateFindingRiskScore determinism & severity weights
  console.log('📋 Test 1: Deterministic Risk Score Calculation');
  const mockFinding: HealthFinding = {
    id: 'find-101',
    category: 'circular_dependency',
    severity: 'critical',
    title: 'Circular import between auth.service.ts and user.service.ts',
    description: 'Direct circular dependency chain detected.',
    affectedNodeIds: ['file:auth.ts', 'file:user.ts'],
    affectedFilePaths: [
      'apps/api/src/services/auth.service.ts',
      'apps/api/src/services/user.service.ts',
    ],
    metrics: { totalDegree: 12, cycleLength: 2 },
    penaltyPoints: 15,
  };

  const fanMetrics: NodeFanMetrics[] = [
    {
      nodeId: 'file:auth.ts',
      filePath: 'apps/api/src/services/auth.service.ts',
      fanIn: 8,
      fanOut: 4,
      totalDegree: 12,
    },
  ];

  const score = calculateFindingRiskScore(mockFinding, fanMetrics);
  assert(score > 0 && score <= 100, 'Score is bounded between 1 and 100');
  assert(
    score >= 80,
    'Critical circular dependency in domain logic receives a high risk score (>=80)',
  );
  console.log(`  ✅ Test 1 PASS (Calculated Risk Score: ${score})`);

  // Test 2: Risk Impact Level Mapping Boundaries
  console.log('📋 Test 2: Risk Impact Level Mapping Boundaries');
  assert(mapRiskImpactLevel(85) === 'CRITICAL', 'Score 85 maps to CRITICAL');
  assert(mapRiskImpactLevel(65) === 'HIGH', 'Score 65 maps to HIGH');
  assert(mapRiskImpactLevel(45) === 'MEDIUM', 'Score 45 maps to MEDIUM');
  assert(mapRiskImpactLevel(20) === 'LOW', 'Score 20 maps to LOW');
  console.log('  ✅ Test 2 PASS');

  // Test 3: Refactoring Pattern Mapping
  console.log('📋 Test 3: Standard Refactoring Pattern Mapping');
  assert(
    mapRefactoringPattern('circular_dependency') ===
      'Decouple Circular Import via Interface Inversion',
    'Circular dependency pattern correctly mapped',
  );
  assert(
    mapRefactoringPattern('coupling_hotspot') ===
      'Distribute Responsibilities to Reduce High-Degree Centrality',
    'Coupling hotspot pattern correctly mapped',
  );
  assert(
    mapRefactoringPattern('layer_violation') ===
      'Enforce Strict Unidirectional Layer Boundary Separation',
    'Layer violation pattern correctly mapped',
  );
  console.log('  ✅ Test 3 PASS');

  // Test 4: Step-by-Step Remediation Instructions
  console.log('📋 Test 4: Step-by-Step Remediation Instruction Generation');
  const steps = generateStepByStepRemediation(
    mockFinding,
    'apps/api/src/services/auth.service.ts',
    ['apps/api/src/services/auth.service.ts', 'apps/api/src/services/user.service.ts'],
  );
  assert(
    Array.isArray(steps) && steps.length === 3,
    'Returns exactly 3 actionable remediation steps',
  );
  assert(steps[0]?.includes('auth.service.ts') ?? false, 'Remediation step references target file');
  console.log('  ✅ Test 4 PASS');

  console.log(
    '\n🎉 ALL SPRINT 8 TASK 4 ARCHITECTURAL RISK INTEGRATION TESTS PASSED SUCCESSFULLY!\n',
  );
}

runArchitecturalRiskTests().catch((err) => {
  console.error('❌ Architectural Risk test suite failed:', err);
  process.exit(1);
});
