/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Onboarding Blueprint Share Engine Integration Test Suite
// (Sprint 7 Task 3)
// =============================================================================

process.env['NODE_ENV'] = 'test';
process.env['ENCRYPTION_SECRET'] = 'forgemind-test-secret-key-for-hmac-signing';

import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';

import {
  createBlueprintShareToken,
  resolveSharedBlueprint,
} from './onboarding-blueprint.service.js';

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

    if (clientMethod === 'repositorySymbol.findMany' || model === 'RepositorySymbol') {
      return [
        {
          id: 's1',
          repositoryId: REPO_ID_OWNED,
          name: 'bootstrap',
          kind: 'function',
          filePath: 'src/main.ts',
        },
      ];
    }

    if (clientMethod === 'fileDependency.findMany' || model === 'FileDependency') {
      return [];
    }

    return null;
  };
}

async function runTests(): Promise<void> {
  console.log('🧪 Starting Onboarding Blueprint Share Engine Unit Tests...\n');
  setupMocks();

  // Test 1: createBlueprintShareToken for owned repository
  {
    const res = await createBlueprintShareToken(REPO_ID_OWNED, USER_ID_1, {
      includeQAHistory: true,
      customNotes: 'Welcome to ForgeMind team!',
      expiresInDays: 7,
    });

    assert(res.shareToken && res.shareToken.includes('.'), 'Test 1: shareToken generated');
    assert(
      res.shareUrl && res.shareUrl.includes(res.shareToken),
      'Test 1: shareUrl contains token',
    );
    assert(new Date(res.expiresAt) > new Date(), 'Test 1: expiresAt is in the future');
    console.log('  ✅ Test 1: createBlueprintShareToken returns valid token & URL');
  }

  // Test 2: resolveSharedBlueprint resolves valid share token cleanly
  {
    const tokenRes = await createBlueprintShareToken(REPO_ID_OWNED, USER_ID_1, {
      includeQAHistory: true,
      customNotes: 'Team onboarding notes',
      expiresInDays: 5,
    });

    const view = await resolveSharedBlueprint(tokenRes.shareToken, {
      1: [{ query: 'What is main.ts?', answer: 'Main entry point.', timestamp: '12:00 PM' }],
    });

    assert.strictEqual(view.repositoryName, 'forgemind-app', 'Test 2: repositoryName matches');
    assert.strictEqual(view.customNotes, 'Team onboarding notes', 'Test 2: customNotes preserved');
    assert(view.qaThreads && view.qaThreads[1]?.length === 1, 'Test 2: qaThreads included');
    console.log('  ✅ Test 2: resolveSharedBlueprint resolves valid token cleanly');
  }

  // Test 3: resolveSharedBlueprint rejects HMAC tampered token
  {
    const tokenRes = await createBlueprintShareToken(REPO_ID_OWNED, USER_ID_1, {
      includeQAHistory: false,
    });

    const parts = tokenRes.shareToken.split('.');
    const tamperedToken = `${parts[0]}.0000000000000000000000000000000000000000000000000000000000000000`;

    let threw = false;
    try {
      await resolveSharedBlueprint(tamperedToken);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('signature'), 'Test 3: signature error message');
    }
    assert(threw, 'Test 3: tampered token rejected');
    console.log('  ✅ Test 3: resolveSharedBlueprint rejects HMAC tampered token');
  }

  // Test 4: resolveSharedBlueprint rejects malformed token
  {
    let threw = false;
    try {
      await resolveSharedBlueprint('invalid-token-format-without-dot');
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('format'), 'Test 4: format error message');
    }
    assert(threw, 'Test 4: malformed token rejected');
    console.log('  ✅ Test 4: resolveSharedBlueprint rejects malformed token format');
  }

  // Test 5: createBlueprintShareToken rejects non-owned repository
  {
    let threw = false;
    try {
      await createBlueprintShareToken(REPO_ID_OTHER, USER_ID_1, {
        includeQAHistory: false,
      });
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('Access denied'), 'Test 5: access denied message');
    }
    assert(threw, 'Test 5: non-owned repository rejected');
    console.log('  ✅ Test 5: createBlueprintShareToken rejects non-owned repository');
  }

  // Test 6: createBlueprintShareToken rejects non-existent repository
  {
    let threw = false;
    try {
      await createBlueprintShareToken(REPO_ID_NONEXISTENT, USER_ID_1, {
        includeQAHistory: false,
      });
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('not found'), 'Test 6: not found message');
    }
    assert(threw, 'Test 6: non-existent repository rejected');
    console.log('  ✅ Test 6: createBlueprintShareToken rejects non-existent repository');
  }

  // Test 7: resolveSharedBlueprint sanitizes keyEnvironmentVars secret values
  {
    const tokenRes = await createBlueprintShareToken(REPO_ID_OWNED, USER_ID_1, {
      includeQAHistory: false,
    });

    const view = await resolveSharedBlueprint(tokenRes.shareToken);

    for (const envVar of view.quickstart.keyEnvironmentVars) {
      assert(envVar.includes('<REDACTED>'), 'Test 7: env var contains <REDACTED>');
      assert(!envVar.includes('secret-value'), 'Test 7: env var values masked');
    }
    console.log('  ✅ Test 7: resolveSharedBlueprint sanitizes keyEnvironmentVars secrets');
  }

  // Test 8: resolveSharedBlueprint omits qaThreads if token flag is false
  {
    const tokenRes = await createBlueprintShareToken(REPO_ID_OWNED, USER_ID_1, {
      includeQAHistory: false,
    });

    const view = await resolveSharedBlueprint(tokenRes.shareToken, {
      1: [{ query: 'Secret question?', answer: 'Secret answer.', timestamp: '12:00 PM' }],
    });

    assert(!view.qaThreads, 'Test 8: qaThreads omitted when includeQAHistory is false');
    console.log(
      '  ✅ Test 8: resolveSharedBlueprint omits qaThreads when includeQAHistory is false',
    );
  }

  // Test 9: resolveSharedBlueprint handles expired share token
  {
    // Construct manually expired payload
    const expiredPayload = {
      repositoryId: REPO_ID_OWNED,
      repositoryName: 'forgemind-app',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      includeQAHistory: false,
      customNotes: '',
    };
    const payloadB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    // Import sign helper behavior
    const crypto = await import('node:crypto');
    const secret = process.env['ENCRYPTION_SECRET'] || 'forgemind-test-secret-key-for-hmac-signing';
    const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
    const expiredToken = `${payloadB64}.${sig}`;

    let threw = false;
    try {
      await resolveSharedBlueprint(expiredToken);
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('expired'), 'Test 9: expired message');
    }
    assert(threw, 'Test 9: expired share token rejected');
    console.log('  ✅ Test 9: resolveSharedBlueprint rejects expired share token');
  }

  console.log('\n🎉 ALL ONBOARDING SHARE SERVICE UNIT TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
