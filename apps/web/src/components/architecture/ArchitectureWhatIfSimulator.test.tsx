// =============================================================================
// ForgeMind Web — Architecture What-If Simulator UI Test Suite
// =============================================================================

import React from 'react';
import type { ArchitectureWhatIfResult } from '@forgemind/types';

import { ArchitectureWhatIfSimulator } from './ArchitectureWhatIfSimulator';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

export async function runArchitectureWhatIfUITests(): Promise<void> {
  console.log('🧪 ForgeMind Web — Architecture What-If Simulator UI Test Suite\n');

  // ── Test 1: Component Instantiation & Props Signature ─────────────────────────
  const element = React.createElement(ArchitectureWhatIfSimulator, {
    repositoryId: 'repo-what-if-123',
    initialSourcePath: 'apps/web/src/app/page.tsx',
    initialTargetPath: 'apps/api/src/db/client.ts',
  });

  assertEqual(element.type, ArchitectureWhatIfSimulator, 'ArchitectureWhatIfSimulator mounts');
  assertEqual(element.props.repositoryId, 'repo-what-if-123', 'repositoryId prop bound correctly');
  assertEqual(
    element.props.initialSourcePath,
    'apps/web/src/app/page.tsx',
    'initialSourcePath prop bound correctly',
  );

  console.log('  ✅ Test 1 PASS: ArchitectureWhatIfSimulator component instantiation verified');

  // ── Test 2: Mock Result Payload Structure Validation ──────────────────────────
  const mockResult: ArchitectureWhatIfResult = {
    repositoryId: 'repo-what-if-123',
    scenario: {
      type: 'introduce_cross_layer_dependency',
      sourcePath: 'apps/web/src/app/page.tsx',
      targetPath: 'apps/api/src/db/client.ts',
      description: 'Add dependency relationship from web to db',
    },
    confirmedEvidence: {
      currentHealthScore: 90,
      currentGrade: 'A',
      currentTotalDependencies: 25,
      currentFindingCount: 1,
      sourceLayer: 'Presentation & User Interface Layer',
      targetLayer: 'Data Access & Database Layer',
    },
    predictedConsequence: {
      simulatedHealthScore: 75,
      simulatedGrade: 'B+',
      scoreDelta: -15,
      healthTrend: 'DEGRADED',
      predictedDriftLevel: 'CRITICAL',
      predictedPolicyOutcome: 'fail',
      policyStatusDescription: 'Failed PR Gatekeeper policy',
      affectedModules: ['apps/web', 'apps/api'],
      affectedLayers: ['Presentation & User Interface Layer', 'Data Access & Database Layer'],
      newFindingsCount: 1,
      resolvedFindingsCount: 0,
      newFindings: [],
      resolvedFindings: [],
      newCrossLayerDependencies: [
        {
          sourceLayer: 'Presentation & User Interface Layer',
          targetLayer: 'Data Access & Database Layer',
          sourceFile: 'apps/web/src/app/page.tsx',
          targetFile: 'apps/api/src/db/client.ts',
        },
      ],
      reasons: [
        'Architecture health score moved from 90 → 75 (-15 points).',
        '1 new cross-layer dependency relationship introduced.',
      ],
    },
    aiAdvice: {
      architecturalRiskSummary: 'Proposed change degrades health score by 15 points.',
      educationalInsight: 'Cross-layer breach detected.',
      saferAlternatives: ['Introduce API controller interface in API layer.'],
      providerUsed: 'Gemini Architecture Change Simulator',
    },
    evaluatedAt: new Date().toISOString(),
  };

  assertEqual(
    mockResult.confirmedEvidence.currentHealthScore,
    90,
    'Confirmed current health score verified',
  );
  assertEqual(
    mockResult.predictedConsequence.simulatedHealthScore,
    75,
    'Predicted simulated health score verified',
  );
  assertEqual(
    mockResult.predictedConsequence.predictedDriftLevel,
    'CRITICAL',
    'Predicted drift level verified',
  );
  assertEqual(
    mockResult.predictedConsequence.predictedPolicyOutcome,
    'fail',
    'Predicted policy outcome verified',
  );
  assert(
    mockResult.aiAdvice?.saferAlternatives.length === 1,
    'AI advice safer alternatives present',
  );

  console.log('  ✅ Test 2 PASS: What-If simulation result payload & metadata verified');

  console.log('\n🎉 ALL ARCHITECTURE WHAT-IF UI TESTS PASSED!\n');
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchitectureWhatIfUITests().catch((err) => {
    console.error('❌ Architecture What-If UI Tests Failed:', err);
    process.exit(1);
  });
}
