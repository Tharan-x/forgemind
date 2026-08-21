/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Onboarding Blueprint Service Integration Test Suite
// (Sprint 7 Task 1)
// =============================================================================

import type { Repository, RepositoryFile, RepositorySymbol, FileDependency } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { generateOnboardingBlueprint } from './onboarding-blueprint.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const REPO_ID = makeUuid(7001);
const REPO_ID_OTHER = makeUuid(7002);
const USER_ID_1 = makeUuid(9001);
const USER_ID_2 = makeUuid(9002);

const repositoryStore = new Map<string, Repository>();
const fileStore = new Map<string, RepositoryFile>();
const symbolStore = new Map<string, RepositorySymbol>();
const depStore = new Map<string, FileDependency>();

function resetStores(): void {
  repositoryStore.clear();
  fileStore.clear();
  symbolStore.clear();
  depStore.clear();
}

// Intercept Prisma calls in memory
(PrismaClient.prototype as any)._request = async function (params: any): Promise<any> {
  const { clientMethod, args } = params;

  if (clientMethod === 'repository.findUnique') {
    return repositoryStore.get(args.where.id) ?? null;
  }
  if (clientMethod === 'repositoryFile.findMany') {
    const list = Array.from(fileStore.values()).filter(
      (f) => f.repositoryId === args.where.repositoryId,
    );
    return list.slice(0, args.take ?? list.length);
  }
  if (clientMethod === 'repositoryFile.count') {
    return Array.from(fileStore.values()).filter((f) => f.repositoryId === args.where.repositoryId)
      .length;
  }
  if (clientMethod === 'repositorySymbol.findMany') {
    const list = Array.from(symbolStore.values()).filter(
      (s) => s.repositoryId === args.where.repositoryId,
    );
    return list.slice(0, args.take ?? list.length);
  }
  if (clientMethod === 'repositorySymbol.count') {
    return Array.from(symbolStore.values()).filter(
      (s) => s.repositoryId === args.where.repositoryId,
    ).length;
  }
  if (clientMethod === 'fileDependency.findMany') {
    const list = Array.from(depStore.values()).filter(
      (d) => d.repositoryId === args.where.repositoryId,
    );
    return list.slice(0, args.take ?? list.length);
  }

  return null;
};

async function runTests(): Promise<void> {
  console.log('🧪 Starting Onboarding Blueprint Integration Test Suite...\n');

  resetStores();

  // Setup mock repository owned by USER_ID_1
  const repo: Repository = {
    id: REPO_ID,
    userId: USER_ID_1,
    githubId: 700101,
    name: 'forgemind',
    fullName: 'Tharan-x/forgemind',
    owner: 'Tharan-x',
    private: true,
    defaultBranch: 'main',
    language: 'TypeScript',
    description: 'AI-Powered Repository Intelligence Platform',
    stars: 42,
    forks: 5,
    htmlUrl: 'https://github.com/Tharan-x/forgemind',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  repositoryStore.set(REPO_ID, repo);

  // Setup mock files
  const file1: RepositoryFile = {
    id: makeUuid(101),
    repositoryId: REPO_ID,
    path: 'apps/web/src/app/page.tsx',
    name: 'page.tsx',
    extension: 'tsx',
    language: 'TypeScript',
    type: 'file',
    size: 1500,
    sha: 'sha101',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const file2: RepositoryFile = {
    id: makeUuid(102),
    repositoryId: REPO_ID,
    path: 'apps/api/src/routes/index.ts',
    name: 'index.ts',
    extension: 'ts',
    language: 'TypeScript',
    type: 'file',
    size: 2000,
    sha: 'sha102',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const file3: RepositoryFile = {
    id: makeUuid(103),
    repositoryId: REPO_ID,
    path: 'prisma/schema.prisma',
    name: 'schema.prisma',
    extension: 'prisma',
    language: 'Prisma',
    type: 'file',
    size: 3000,
    sha: 'sha103',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  fileStore.set(file1.id, file1);
  fileStore.set(file2.id, file2);
  fileStore.set(file3.id, file3);

  // Setup mock symbols
  const sym1: RepositorySymbol = {
    id: makeUuid(201),
    repositoryId: REPO_ID,
    fileId: file2.id,
    name: 'repositoryRouter',
    kind: 'function',
    filePath: file2.path,
    startLine: 10,
    endLine: 40,
    exported: true,
    createdAt: new Date(),
  };
  symbolStore.set(sym1.id, sym1);

  // Test 1: Generate Onboarding Blueprint for authorized user
  console.log('📋 Test 1: Generate Onboarding Blueprint for authorized user');
  const blueprint = await generateOnboardingBlueprint(REPO_ID, USER_ID_1);
  assert(blueprint.repositoryId === REPO_ID, 'Test 1: Repository ID matches');
  assert(blueprint.repositoryName === 'forgemind', 'Test 1: Repository name matches');
  assert(blueprint.entryPoints.length >= 1, 'Test 1: At least 1 entry point detected');
  assert(blueprint.guidedTour.length === 5, 'Test 1: Exactly 5 tour steps generated');
  assert(blueprint.architecturalSections.length > 0, 'Test 1: Architectural sections present');
  assert(blueprint.quickstart.setupCommands.length > 0, 'Test 1: Quickstart commands present');
  console.log('  ✅ Test 1 Passed: Blueprint generated successfully');

  // Test 2: Access denied for non-owner
  console.log('📋 Test 2: Access denied for non-owner');
  try {
    await generateOnboardingBlueprint(REPO_ID, USER_ID_2);
    assert(false, 'Test 2: Expected error on unauthorized access');
  } catch (err: any) {
    assert(err.message.includes('Access denied'), 'Test 2: Access denied message returned');
    console.log('  ✅ Test 2 Passed: Non-owner access correctly rejected');
  }

  // Test 3: Non-existent repository throws 404
  console.log('📋 Test 3: Non-existent repository throws error');
  try {
    await generateOnboardingBlueprint(REPO_ID_OTHER, USER_ID_1);
    assert(false, 'Test 3: Expected error on non-existent repo');
  } catch (err: any) {
    assert(
      err.message.includes('Repository not found'),
      'Test 3: Repository not found error returned',
    );
    console.log('  ✅ Test 3 Passed: Non-existent repository correctly caught');
  }

  console.log('\n🎉 ALL ONBOARDING BLUEPRINT SERVICE TESTS PASSED SUCCESSFULLY!\n');
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
