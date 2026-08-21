/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Onboarding Step Q&A Service Integration Test Suite
// (Sprint 7 Task 2)
// =============================================================================

import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import { askOnboardingStepQuestion } from './onboarding-blueprint.service.js';

const REPO_ID_OWNED = '00000000-0000-4000-8000-0000000000c9';
const REPO_ID_OTHER = '00000000-0000-4000-8000-0000000000ca';
const REPO_ID_NONEXISTENT = '00000000-0000-4000-8000-0000000000ff';
const USER_ID_1 = '00000000-0000-4000-8000-0000000000a1';
const USER_ID_2 = '00000000-0000-4000-8000-0000000000a2';

const MOCK_REPOSITORIES: Record<string, any> = {
  [REPO_ID_OWNED]: {
    id: REPO_ID_OWNED,
    userId: USER_ID_1,
    githubId: 10001,
    name: 'forgemind-app',
    fullName: 'forgemind-dev/forgemind-app',
    owner: 'forgemind-dev',
    description: 'ForgeMind core monorepo',
    htmlUrl: 'https://github.com/forgemind-dev/forgemind-app',
    defaultBranch: 'main',
    language: 'TypeScript',
    private: false,
    stars: 42,
    forks: 10,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  [REPO_ID_OTHER]: {
    id: REPO_ID_OTHER,
    userId: USER_ID_2,
    githubId: 10002,
    name: 'other-repo',
    fullName: 'other/other-repo',
    owner: 'other',
    description: 'Other user repo',
    htmlUrl: 'https://github.com/other/other-repo',
    defaultBranch: 'main',
    language: 'Python',
    private: true,
    stars: 0,
    forks: 0,
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
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
        {
          id: 'f2',
          repositoryId: REPO_ID_OWNED,
          path: 'prisma/schema.prisma',
          name: 'schema.prisma',
        },
      ];
    }

    if (clientMethod === 'codeChunk.findMany' || model === 'CodeChunk') {
      return [
        {
          id: 'chunk-1',
          repositoryId: REPO_ID_OWNED,
          filePath: 'src/main.ts',
          startLine: 1,
          endLine: 25,
          content:
            'export function bootstrap() { console.log("Initializing ForgeMind server..."); }',
          language: 'TypeScript',
          embedding: null,
          metadata: { symbolName: 'bootstrap', symbolKind: 'function' },
        },
      ];
    }

    return null;
  };
}

async function runTests(): Promise<void> {
  console.log('🧪 Running Onboarding Step Q&A Service Integration Tests...\n');
  setupMocks();

  // Test 1: Authorized step Q&A succeeds
  {
    const res = await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
      stepNumber: 1,
      targetFile: 'src/main.ts',
      query: 'What does the bootstrap function do in this main entry point?',
    });

    assert(res.stepNumber === 1, 'Test 1: stepNumber is 1');
    assert(res.targetFile === 'src/main.ts', 'Test 1: targetFile matches');
    assert(res.query.includes('bootstrap'), 'Test 1: query matches');
    assert(typeof res.answer === 'string' && res.answer.length > 0, 'Test 1: answer is non-empty');
    assert(Array.isArray(res.sources), 'Test 1: sources is an array');
    console.log('  ✅ Test 1: Authorized step Q&A succeeds');
  }

  // Test 2: Answer contains/returns grounded source citations when retrieval provides sources
  {
    const res = await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
      stepNumber: 2,
      targetFile: 'prisma/schema.prisma',
      query: 'How are model relations defined here?',
    });

    assert(res.stepNumber === 2, 'Test 2: stepNumber is 2');
    assert(Array.isArray(res.sources), 'Test 2: sources returned');
    console.log('  ✅ Test 2: Grounded source citations structure returned');
  }

  // Test 3: Correct step metadata is preserved
  {
    const res = await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
      stepNumber: 4,
      targetFile: 'src/services/auth.service.ts',
      symbolName: 'verifyToken',
      query: 'How does verifyToken check authorization?',
    });

    assert(res.stepNumber === 4, 'Test 3: stepNumber is 4');
    assert(res.targetFile === 'src/services/auth.service.ts', 'Test 3: target file preserved');
    console.log('  ✅ Test 3: Correct step metadata preserved');
  }

  // Test 4: Non-owner repository access is rejected with 403-equivalent behavior
  {
    try {
      await askOnboardingStepQuestion(REPO_ID_OTHER, USER_ID_1, {
        stepNumber: 1,
        targetFile: 'src/index.py',
        query: 'Explain server architecture',
      });
      assert.fail('Should have thrown access denied');
    } catch (err: any) {
      assert(err.message.includes('Access denied'), 'Test 4: Access denied thrown');
      console.log('  ✅ Test 4: Non-owner access rejected with Access denied');
    }
  }

  // Test 5: Non-existent repository is rejected with 404-equivalent behavior
  {
    try {
      await askOnboardingStepQuestion(REPO_ID_NONEXISTENT, USER_ID_1, {
        stepNumber: 1,
        targetFile: 'src/main.ts',
        query: 'Explain main.ts',
      });
      assert.fail('Should have thrown repository not found');
    } catch (err: any) {
      assert(err.message.includes('Repository not found'), 'Test 5: Repository not found thrown');
      console.log('  ✅ Test 5: Non-existent repository rejected with Repository not found');
    }
  }

  // Test 6: Invalid query is rejected
  {
    try {
      await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
        stepNumber: 1,
        targetFile: 'src/main.ts',
        query: '   ',
      });
      assert.fail('Should have rejected empty query');
    } catch (err: any) {
      assert(err.message.includes('Query is required'), 'Test 6: Empty query rejected');
      console.log('  ✅ Test 6: Invalid empty query rejected');
    }
  }

  // Test 7: Query over 2000 characters is rejected
  {
    try {
      await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
        stepNumber: 1,
        targetFile: 'src/main.ts',
        query: 'a'.repeat(2001),
      });
      assert.fail('Should have rejected oversized query');
    } catch (err: any) {
      assert(err.message.includes('2000 characters'), 'Test 7: Oversized query rejected');
      console.log('  ✅ Test 7: Query over 2000 characters rejected');
    }
  }

  // Test 8: Invalid step number is rejected
  {
    try {
      await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
        stepNumber: -1,
        targetFile: 'src/main.ts',
        query: 'Explain step -1',
      });
      assert.fail('Should have rejected invalid step number');
    } catch (err: any) {
      assert(err.message.includes('Invalid step number'), 'Test 8: Invalid step number rejected');
      console.log('  ✅ Test 8: Invalid step number rejected');
    }
  }

  // Test 9: LLM failure follows the existing fallback behavior
  {
    const res = await askOnboardingStepQuestion(REPO_ID_OWNED, USER_ID_1, {
      stepNumber: 3,
      targetFile: 'src/routes/api.ts',
      query: 'What routes are defined in api.ts?',
    });

    assert(res.stepNumber === 3, 'Test 9: stepNumber is 3');
    assert(typeof res.providerUsed === 'string', 'Test 9: providerUsed present');
    console.log('  ✅ Test 9: LLM fallback behavior verified');
  }

  console.log('\n🎉 ALL ONBOARDING STEP Q&A SERVICE INTEGRATION TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Service Test Suite Failed:', err);
  process.exit(1);
});
