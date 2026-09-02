/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';
import { simulateArchitectureWhatIf } from './architecture-whatif.service.js';

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
        {
          id: 'f1',
          repositoryId: mockRepoId,
          path: 'apps/web/src/pages/dashboard.tsx',
          name: 'dashboard.tsx',
        },
        {
          id: 'f2',
          repositoryId: mockRepoId,
          path: 'apps/web/src/components/Header.tsx',
          name: 'Header.tsx',
        },
        { id: 'f3', repositoryId: mockRepoId, path: 'apps/web/src/app/page.tsx', name: 'page.tsx' },
        {
          id: 'f4',
          repositoryId: mockRepoId,
          path: 'apps/api/src/db/client.ts',
          name: 'client.ts',
        },
      ];
    }

    if (clientMethod === 'fileDependency.findMany' || model === 'FileDependency') {
      return [
        {
          id: 'd1',
          repositoryId: mockRepoId,
          sourcePath: 'apps/web/src/pages/dashboard.tsx',
          targetPath: 'apps/web/src/components/Header.tsx',
          isExternal: false,
        },
      ];
    }

    if (clientMethod === 'repositorySymbol.findMany' || model === 'RepositorySymbol') {
      return [];
    }

    if (
      clientMethod === 'prGatekeeperPolicyConfig.findUnique' ||
      model === 'PRGatekeeperPolicyConfig'
    ) {
      return {
        repositoryId: mockRepoId,
        enabled: true,
        maxScoreDegradation: 5,
        blockOnNewCriticalFindings: true,
        blockOnNewHighFindings: false,
        blockOnNewCircularCycles: true,
        blockOnNewLayerViolations: true,
      };
    }

    return null;
  };
}

export async function runArchitectureWhatIfTests(): Promise<void> {
  console.log('\n🧪 Starting Architecture What-If Engine Test Suite...');
  setupMocks();

  // 1. Add Dependency Scenario (Clean addition without breach)
  const addResult = await simulateArchitectureWhatIf(mockRepoId, mockUserId, {
    scenarioType: 'add_dependency',
    sourcePath: 'apps/web/src/pages/dashboard.tsx',
    targetPath: 'apps/web/src/components/Header.tsx',
    includeAIAdvice: true,
  });

  assertEqual(addResult.repositoryId, mockRepoId, 'Returns correct repository ID');
  assertEqual(addResult.scenario.type, 'add_dependency', 'Scenario type is add_dependency');
  assertTrue(
    addResult.confirmedEvidence.currentHealthScore >= 0,
    'Includes confirmed current health score',
  );
  assertTrue(
    addResult.predictedConsequence.simulatedHealthScore >= 0,
    'Includes predicted simulated health score',
  );
  assertTrue(!!addResult.aiAdvice, 'Includes AI advice when requested');
  console.log('  ✅ Test 1 PASS: Add dependency scenario execution verified');

  // 2. Introduce Cross-Layer Breach Scenario
  const breachResult = await simulateArchitectureWhatIf(mockRepoId, mockUserId, {
    scenarioType: 'introduce_cross_layer_dependency',
    sourcePath: 'apps/web/src/app/page.tsx',
    targetPath: 'apps/api/src/db/client.ts',
    includeAIAdvice: true,
  });

  assertTrue(
    breachResult.predictedConsequence.newCrossLayerDependencies.length >= 1,
    'Cross-layer breach detected in simulated consequence',
  );
  assertTrue(
    breachResult.predictedConsequence.scoreDelta <= 0,
    'Layer breach causes health score degradation',
  );
  console.log('  ✅ Test 2 PASS: Cross-layer breach simulation & score penalty verified');

  // 3. Remove Dependency Scenario
  const removeResult = await simulateArchitectureWhatIf(mockRepoId, mockUserId, {
    scenarioType: 'remove_dependency',
    sourcePath: 'apps/api/src/services/user.service.ts',
    targetPath: 'apps/api/src/lib/prisma.ts',
  });

  assertEqual(
    removeResult.scenario.type,
    'remove_dependency',
    'Scenario type is remove_dependency',
  );
  assertTrue(Array.isArray(removeResult.predictedConsequence.reasons), 'Reasons array returned');
  console.log('  ✅ Test 3 PASS: Remove dependency scenario execution verified');

  // 4. Move Module Scenario
  const moveResult = await simulateArchitectureWhatIf(mockRepoId, mockUserId, {
    scenarioType: 'move_module',
    sourcePath: 'apps/api/src/services/old-module.ts',
    targetPath: 'apps/api/src/domain/new-module.ts',
  });

  assertEqual(moveResult.scenario.type, 'move_module', 'Scenario type is move_module');
  assertTrue(
    moveResult.predictedConsequence.affectedModules.length >= 1,
    'Affected modules identified',
  );
  console.log('  ✅ Test 4 PASS: Move module scenario execution verified');

  // 5. Input Validation (Missing sourcePath)
  try {
    await simulateArchitectureWhatIf(mockRepoId, mockUserId, {
      scenarioType: 'add_dependency',
      sourcePath: '',
      targetPath: 'apps/web/src/components/Header.tsx',
    });
    throw new Error('Should have rejected empty sourcePath');
  } catch (err) {
    assertTrue(
      (err as Error).message.includes('sourcePath is required'),
      'Empty sourcePath correctly rejected',
    );
  }
  console.log('  ✅ Test 5 PASS: Input validation for missing sourcePath verified');

  // 6. Security Enforcement (Unauthorized user)
  try {
    await simulateArchitectureWhatIf(mockRepoId, nonOwnerUserId, {
      scenarioType: 'add_dependency',
      sourcePath: 'apps/web/src/pages/dashboard.tsx',
      targetPath: 'apps/web/src/components/Header.tsx',
    });
    throw new Error('Should have rejected unauthorized user');
  } catch (err) {
    assertTrue(
      (err as Error).message.includes('Access denied'),
      'Unauthorized user correctly rejected',
    );
  }
  console.log('  ✅ Test 6 PASS: Repository ownership security enforcement verified');

  console.log('\n🎉 ALL ARCHITECTURE WHAT-IF TESTS PASSED!\n');
}

runArchitectureWhatIfTests().catch((err) => {
  console.error('❌ Architecture What-If Tests Failed:', err);
  process.exit(1);
});
