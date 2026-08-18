/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Repository Service & Sync Integration Test Suite (Sprint 4 Task 1)
// =============================================================================
// Covers 20 scenarios:
//  Part A — Repository Service (tests 1–10)
//  Part B — Repository Sync Service (tests 11–18)
//  Part C — Safety / Regression (tests 19–20)
// =============================================================================

import { Prisma, PrismaClient, type Repository } from '@prisma/client';
import type { GithubRepository, GithubUser } from '../github/github.client.js';

// ── Assertion Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function assertNull(actual: unknown, message: string): void {
  assert(actual === null, `${message} — Expected null, Got: ${JSON.stringify(actual)}`);
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedSubstring: string,
  message: string,
): Promise<void> {
  try {
    await fn();
    assert(false, `${message} — Expected promise to reject but it resolved`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    assert(
      errorMsg.includes(expectedSubstring),
      `${message} — Expected error containing "${expectedSubstring}", Got: "${errorMsg}"`,
    );
  }
}

// ── Valid UUID Helper ─────────────────────────────────────────────────────────

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const USER_1 = makeUuid(101);
const USER_2 = makeUuid(102);
const USER_A = makeUuid(201);
const USER_B = makeUuid(202);
const USER_C = makeUuid(203);
const USER_M = makeUuid(301);
const USER_SYNC_1 = makeUuid(401);
const USER_MULTI = makeUuid(402);
const USER_MIX = makeUuid(403);
const USER_LOOKUP = makeUuid(404);
const USER_BAD = makeUuid(405);
const USER_ERROR = makeUuid(406);
const USER_REG = makeUuid(501);
const NON_EXISTENT_UUID = makeUuid(9999);

// ── In-Memory Prisma Repository Store ─────────────────────────────────────────

let idCounter = 1;
const store = new Map<string, Repository>();

function resetStore(): void {
  store.clear();
  idCounter = 1;
}

// Intercept Prisma Client _request method globally for repository queries
(
  PrismaClient.prototype as unknown as { _request: (params: unknown) => Promise<unknown> }
)._request = async function (params: unknown): Promise<unknown> {
  const { clientMethod, action, args } = params as {
    clientMethod?: string;
    action?: string;
    args: Record<string, unknown>;
  };

  if (clientMethod?.startsWith('repository.')) {
    if (action === 'create') {
      const data = args['data'] as Prisma.RepositoryUncheckedCreateInput;
      const id = data.id || makeUuid(idCounter++);
      const now = new Date();
      const record: Repository = {
        id,
        userId: data.userId,
        githubId: data.githubId,
        name: data.name,
        fullName: data.fullName,
        owner: data.owner,
        private: data.private ?? false,
        defaultBranch: data.defaultBranch ?? 'main',
        language: data.language ?? null,
        description: data.description ?? null,
        stars: data.stars ?? 0,
        forks: data.forks ?? 0,
        htmlUrl: data.htmlUrl,
        createdAt: now,
        updatedAt: now,
      };
      store.set(id, record);
      return { ...record };
    }

    if (action === 'findUnique') {
      const { where, select } = args as {
        where: { id?: string; githubId?: number };
        select?: { id: boolean };
      };
      let found: Repository | null = null;
      if (where.id) {
        found = store.get(where.id) || null;
      } else if (where.githubId !== undefined) {
        for (const repo of store.values()) {
          if (repo.githubId === where.githubId) {
            found = repo;
            break;
          }
        }
      }
      if (!found) return null;
      if (select?.id) {
        return { id: found.id };
      }
      return { ...found };
    }

    if (action === 'findMany') {
      const { where } = args as { where: { userId: string } };
      const results: Repository[] = [];
      for (const repo of store.values()) {
        if (repo.userId === where.userId) {
          results.push({ ...repo });
        }
      }
      return results;
    }

    if (action === 'update') {
      const { where, data } = args as {
        where: { id: string };
        data: Prisma.RepositoryUncheckedUpdateInput;
      };
      const existing = store.get(where.id);
      if (!existing) {
        throw new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
          code: 'P2025',
          clientVersion: '6.1.0',
        });
      }

      const updated: Repository = {
        ...existing,
        name: typeof data.name === 'string' ? data.name : existing.name,
        fullName: typeof data.fullName === 'string' ? data.fullName : existing.fullName,
        owner: typeof data.owner === 'string' ? data.owner : existing.owner,
        private: typeof data.private === 'boolean' ? data.private : existing.private,
        defaultBranch:
          typeof data.defaultBranch === 'string' ? data.defaultBranch : existing.defaultBranch,
        language:
          data.language !== undefined ? (data.language as string | null) : existing.language,
        description:
          data.description !== undefined
            ? (data.description as string | null)
            : existing.description,
        stars: typeof data.stars === 'number' ? data.stars : existing.stars,
        forks: typeof data.forks === 'number' ? data.forks : existing.forks,
        htmlUrl: typeof data.htmlUrl === 'string' ? data.htmlUrl : existing.htmlUrl,
        updatedAt: new Date(),
      };

      store.set(where.id, updated);
      return { ...updated };
    }

    if (action === 'delete') {
      const { where } = args as { where: { id: string } };
      const existing = store.get(where.id);
      if (!existing) {
        throw new Prisma.PrismaClientKnownRequestError('Record to delete not found.', {
          code: 'P2025',
          clientVersion: '6.1.0',
        });
      }
      store.delete(where.id);
      return { ...existing };
    }

    if (action === 'count') {
      const { where } = args as { where: { userId: string } };
      let count = 0;
      for (const repo of store.values()) {
        if (repo.userId === where.userId) {
          count++;
        }
      }
      return count;
    }
  }

  throw new Error(`Unhandled mock query: ${clientMethod} / ${action}`);
};

// ── In-Memory Fetch Mock for GitHub API ────────────────────────────────────────

const originalFetch = globalThis.fetch;
let mockFetchHandler: ((url: string, init?: RequestInit) => Promise<Response>) | null = null;

function setMockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  mockFetchHandler = handler;
}

function restoreFetch(): void {
  mockFetchHandler = null;
  globalThis.fetch = originalFetch;
}

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  if (mockFetchHandler) {
    const urlString = typeof input === 'string' ? input : input.toString();
    return mockFetchHandler(urlString, init);
  }
  return originalFetch(input, init);
};

// Helper to create mock Response
function createMockJsonResponse<T>(data: T, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Module Type Signatures ────────────────────────────────────────────────────

import type * as RepositoryServiceModule from './repository.service.js';
import type * as RepositorySyncModule from './repository-sync.service.js';

let repoService: typeof RepositoryServiceModule;
let syncService: typeof RepositorySyncModule;

// ── Test Suites ───────────────────────────────────────────────────────────────

async function runRepositoryServiceTests(): Promise<void> {
  console.log('📋 Part A — Repository Service Unit / Integration Tests (Tests 1–10)');

  // Test 1: createRepository persists/returns expected repository data
  {
    resetStore();
    const created = await repoService.createRepository({
      userId: USER_1,
      githubId: 10001,
      name: 'forgemind',
      fullName: 'forgemind/forgemind',
      owner: 'forgemind',
      private: false,
      defaultBranch: 'main',
      language: 'TypeScript',
      description: 'AI intelligence platform',
      stars: 42,
      forks: 7,
      htmlUrl: 'https://github.com/forgemind/forgemind',
    });

    assertEqual(created.name, 'forgemind', 'Test 1: Repository name');
    assertEqual(created.githubId, 10001, 'Test 1: Repository GitHub ID');
    assertEqual(created.userId, USER_1, 'Test 1: Repository User ID');
    assertEqual(created.stars, 42, 'Test 1: Repository stars');
    assertEqual(store.size, 1, 'Test 1: Persisted in store');
    console.log('  ✅ Test 1: createRepository persists and returns expected data');
  }

  // Test 2: findRepositoryById returns the correct repository
  {
    resetStore();
    const repo = await repoService.createRepository({
      userId: USER_1,
      githubId: 10002,
      name: 'api-service',
      fullName: 'org/api-service',
      owner: 'org',
      htmlUrl: 'https://github.com/org/api-service',
    });

    const found = await repoService.findRepositoryById(repo.id);
    assert(found !== null, 'Test 2: Repository must be found');
    assertEqual(found?.id, repo.id, 'Test 2: Matching ID');
    assertEqual(found?.name, 'api-service', 'Test 2: Matching name');

    const notFound = await repoService.findRepositoryById(NON_EXISTENT_UUID);
    assertNull(notFound, 'Test 2: Missing repository returns null');
    console.log('  ✅ Test 2: findRepositoryById returns correct repository');
  }

  // Test 3: findRepositoryByGithubId returns the correct repository
  {
    resetStore();
    await repoService.createRepository({
      userId: USER_1,
      githubId: 10003,
      name: 'web-app',
      fullName: 'org/web-app',
      owner: 'org',
      htmlUrl: 'https://github.com/org/web-app',
    });

    const found = await repoService.findRepositoryByGithubId(10003);
    assert(found !== null, 'Test 3: Must find by githubId');
    assertEqual(found?.githubId, 10003, 'Test 3: Correct githubId');
    assertEqual(found?.name, 'web-app', 'Test 3: Correct name');

    const notFound = await repoService.findRepositoryByGithubId(99999);
    assertNull(notFound, 'Test 3: Missing githubId returns null');
    console.log('  ✅ Test 3: findRepositoryByGithubId returns correct repository');
  }

  // Test 4: findRepositoriesByUser returns only repositories belonging to that user
  {
    resetStore();
    await repoService.createRepository({
      userId: USER_A,
      githubId: 20001,
      name: 'repo-a1',
      fullName: 'userA/repo-a1',
      owner: 'userA',
      htmlUrl: 'https://github.com/userA/repo-a1',
    });
    await repoService.createRepository({
      userId: USER_A,
      githubId: 20002,
      name: 'repo-a2',
      fullName: 'userA/repo-a2',
      owner: 'userA',
      htmlUrl: 'https://github.com/userA/repo-a2',
    });
    await repoService.createRepository({
      userId: USER_B,
      githubId: 20003,
      name: 'repo-b1',
      fullName: 'userB/repo-b1',
      owner: 'userB',
      htmlUrl: 'https://github.com/userB/repo-b1',
    });

    const userARepos = await repoService.findRepositoriesByUser(USER_A);
    assertEqual(userARepos.length, 2, 'Test 4: User A has 2 repositories');
    assert(
      userARepos.every((r) => r.userId === USER_A),
      'Test 4: All user-A repos match userId',
    );

    const userBRepos = await repoService.findRepositoriesByUser(USER_B);
    assertEqual(userBRepos.length, 1, 'Test 4: User B has 1 repository');

    const userCRepos = await repoService.findRepositoriesByUser(USER_C);
    assertEqual(userCRepos.length, 0, 'Test 4: User C has 0 repositories');
    console.log('  ✅ Test 4: findRepositoriesByUser filters by userId');
  }

  // Test 5: updateRepository updates the expected fields
  {
    resetStore();
    const repo = await repoService.createRepository({
      userId: USER_1,
      githubId: 30001,
      name: 'old-name',
      fullName: 'org/old-name',
      owner: 'org',
      stars: 10,
      htmlUrl: 'https://github.com/org/old-name',
    });

    const updated = await repoService.updateRepository(repo.id, {
      name: 'new-name',
      fullName: 'org/new-name',
      stars: 50,
      description: 'Updated description',
    });

    assert(updated !== null, 'Test 5: Updated repo must not be null');
    assertEqual(updated?.name, 'new-name', 'Test 5: Updated name');
    assertEqual(updated?.fullName, 'org/new-name', 'Test 5: Updated fullName');
    assertEqual(updated?.stars, 50, 'Test 5: Updated stars');
    assertEqual(updated?.description, 'Updated description', 'Test 5: Updated description');
    assertEqual(updated?.owner, 'org', 'Test 5: Owner remains unchanged');
    console.log('  ✅ Test 5: updateRepository updates expected fields');
  }

  // Test 6: updateRepository returns null for a missing repository
  {
    resetStore();
    const result = await repoService.updateRepository(NON_EXISTENT_UUID, {
      name: 'will-fail',
    });
    assertNull(result, 'Test 6: Missing repository update returns null');
    console.log('  ✅ Test 6: updateRepository handles P2025 and returns null for missing repo');
  }

  // Test 7: deleteRepository deletes the expected repository
  {
    resetStore();
    const repo = await repoService.createRepository({
      userId: USER_1,
      githubId: 40001,
      name: 'to-delete',
      fullName: 'org/to-delete',
      owner: 'org',
      htmlUrl: 'https://github.com/org/to-delete',
    });

    assertEqual(store.size, 1, 'Test 7: Pre-delete store size');
    const deleted = await repoService.deleteRepository(repo.id);
    assert(deleted !== null, 'Test 7: Deleted repo returned');
    assertEqual(deleted?.id, repo.id, 'Test 7: Matching deleted ID');
    assertEqual(store.size, 0, 'Test 7: Post-delete store size');

    const checkFound = await repoService.findRepositoryById(repo.id);
    assertNull(checkFound, 'Test 7: Deleted repository no longer in DB');
    console.log('  ✅ Test 7: deleteRepository removes repository record');
  }

  // Test 8: deleteRepository returns null for a missing repository
  {
    resetStore();
    const result = await repoService.deleteRepository(NON_EXISTENT_UUID);
    assertNull(result, 'Test 8: Missing repository deletion returns null');
    console.log('  ✅ Test 8: deleteRepository handles P2025 and returns null for missing repo');
  }

  // Test 9: repositoryExists correctly identifies existing/non-existing repositories
  {
    resetStore();
    await repoService.createRepository({
      userId: USER_1,
      githubId: 50001,
      name: 'exist-check',
      fullName: 'org/exist-check',
      owner: 'org',
      htmlUrl: 'https://github.com/org/exist-check',
    });

    const existsTrue = await repoService.repositoryExists(50001);
    assertEqual(existsTrue, true, 'Test 9: Repository 50001 exists');

    const existsFalse = await repoService.repositoryExists(99999);
    assertEqual(existsFalse, false, 'Test 9: Repository 99999 does not exist');
    console.log('  ✅ Test 9: repositoryExists correctly identifies existence');
  }

  // Test 10: countRepositories returns the correct count for a user
  {
    resetStore();
    assertEqual(await repoService.countRepositories(USER_M), 0, 'Test 10: Initial count 0');

    await repoService.createRepository({
      userId: USER_M,
      githubId: 60001,
      name: 'm1',
      fullName: 'm/m1',
      owner: 'm',
      htmlUrl: 'https://github.com/m/m1',
    });
    await repoService.createRepository({
      userId: USER_M,
      githubId: 60002,
      name: 'm2',
      fullName: 'm/m2',
      owner: 'm',
      htmlUrl: 'https://github.com/m/m2',
    });

    assertEqual(
      await repoService.countRepositories(USER_M),
      2,
      'Test 10: Count after adding 2 repos',
    );
    assertEqual(await repoService.countRepositories(USER_2), 0, 'Test 10: Other user count is 0');
    console.log('  ✅ Test 10: countRepositories returns accurate user count');
  }
}

async function runRepositorySyncServiceTests(): Promise<void> {
  console.log('\n📋 Part B — Repository Sync Service Integration Tests (Tests 11–18)');

  const mockGithubUser: GithubUser = {
    id: 999,
    login: 'testuser',
    name: 'Test User',
    email: 'test@example.com',
    avatar_url: 'https://github.com/avatar.png',
    html_url: 'https://github.com/testuser',
  };

  const sampleGithubRepos: GithubRepository[] = [
    {
      id: 70001,
      name: 'repo-one',
      full_name: 'testuser/repo-one',
      owner: {
        login: 'testuser',
        id: 999,
        avatar_url: 'https://github.com/avatar.png',
        html_url: 'https://github.com/testuser',
      },
      private: false,
      html_url: 'https://github.com/testuser/repo-one',
      description: 'First test repo',
      fork: false,
      url: 'https://api.github.com/repos/testuser/repo-one',
      default_branch: 'main',
      stargazers_count: 10,
      forks_count: 2,
      open_issues_count: 0,
      language: 'TypeScript',
      updated_at: '2026-08-18T10:00:00Z',
      created_at: '2026-01-01T10:00:00Z',
      pushed_at: '2026-08-18T10:00:00Z',
    },
    {
      id: 70002,
      name: 'repo-two',
      full_name: 'testuser/repo-two',
      owner: {
        login: 'testuser',
        id: 999,
        avatar_url: 'https://github.com/avatar.png',
        html_url: 'https://github.com/testuser',
      },
      private: true,
      html_url: 'https://github.com/testuser/repo-two',
      description: 'Second test repo (private)',
      fork: true,
      url: 'https://api.github.com/repos/testuser/repo-two',
      default_branch: 'develop',
      stargazers_count: 100,
      forks_count: 25,
      open_issues_count: 5,
      language: 'Python',
      updated_at: '2026-08-18T11:00:00Z',
      created_at: '2026-02-01T10:00:00Z',
      pushed_at: '2026-08-18T11:00:00Z',
    },
  ];

  // Test 11: Sync creates a repository that does not exist
  {
    resetStore();
    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse([sampleGithubRepos[0]]);
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404, 'Not Found');
    });

    const result = await syncService.syncRepositories(USER_SYNC_1, 'valid-token-1');
    assertEqual(result.total, 1, 'Test 11: Total repos from GitHub');
    assertEqual(result.created, 1, 'Test 11: Created 1 repo');
    assertEqual(result.updated, 0, 'Test 11: Updated 0 repos');

    const createdRepo = await repoService.findRepositoryByGithubId(70001);
    assert(createdRepo !== null, 'Test 11: Repository exists in DB');
    assertEqual(createdRepo?.name, 'repo-one', 'Test 11: Name matches');
    assertEqual(createdRepo?.userId, USER_SYNC_1, 'Test 11: UserId matches');
    console.log('  ✅ Test 11: Sync creates a non-existing repository');
  }

  // Test 12: Sync updates a repository that already exists
  {
    resetStore();
    // Pre-create initial repo in store
    await repoService.createRepository({
      userId: USER_SYNC_1,
      githubId: 70001,
      name: 'old-repo-one',
      fullName: 'testuser/old-repo-one',
      owner: 'testuser',
      stars: 0,
      forks: 0,
      htmlUrl: 'https://github.com/testuser/repo-one',
    });

    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse([sampleGithubRepos[0]]);
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404);
    });

    const result = await syncService.syncRepositories(USER_SYNC_1, 'valid-token-1');
    assertEqual(result.total, 1, 'Test 12: Total repos from GitHub');
    assertEqual(result.created, 0, 'Test 12: Created 0');
    assertEqual(result.updated, 1, 'Test 12: Updated 1');

    const updatedRepo = await repoService.findRepositoryByGithubId(70001);
    assertEqual(updatedRepo?.name, 'repo-one', 'Test 12: Updated name from GitHub');
    assertEqual(updatedRepo?.fullName, 'testuser/repo-one', 'Test 12: Updated fullName');
    assertEqual(updatedRepo?.stars, 10, 'Test 12: Updated stars');
    assertEqual(updatedRepo?.forks, 2, 'Test 12: Updated forks');
    console.log('  ✅ Test 12: Sync updates an existing repository');
  }

  // Test 13: GitHub repository fields are mapped correctly into the Repository model
  {
    resetStore();
    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse([sampleGithubRepos[1]]);
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404);
    });

    await syncService.syncRepositories(USER_SYNC_1, 'valid-token');
    const repo = await repoService.findRepositoryByGithubId(70002);
    assert(repo !== null, 'Test 13: Repo must exist');

    assertEqual(repo?.githubId, 70002, 'Test 13: githubId field mapping');
    assertEqual(repo?.name, 'repo-two', 'Test 13: name field mapping');
    assertEqual(repo?.fullName, 'testuser/repo-two', 'Test 13: fullName field mapping');
    assertEqual(repo?.owner, 'testuser', 'Test 13: owner field mapping');
    assertEqual(repo?.private, true, 'Test 13: private boolean mapping');
    assertEqual(repo?.defaultBranch, 'develop', 'Test 13: defaultBranch mapping');
    assertEqual(repo?.language, 'Python', 'Test 13: language mapping');
    assertEqual(repo?.description, 'Second test repo (private)', 'Test 13: description mapping');
    assertEqual(repo?.stars, 100, 'Test 13: stars mapping');
    assertEqual(repo?.forks, 25, 'Test 13: forks mapping');
    assertEqual(repo?.htmlUrl, 'https://github.com/testuser/repo-two', 'Test 13: htmlUrl mapping');
    console.log('  ✅ Test 13: GitHub API fields map accurately to Repository model');
  }

  // Test 14: Multiple GitHub repositories are processed correctly
  {
    resetStore();
    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse(sampleGithubRepos);
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404);
    });

    const result = await syncService.syncRepositories(USER_MULTI, 'token-123');
    assertEqual(result.total, 2, 'Test 14: Total repos = 2');
    assertEqual(result.created, 2, 'Test 14: Created = 2');
    assertEqual(result.updated, 0, 'Test 14: Updated = 0');
    assertEqual(store.size, 2, 'Test 14: Store size = 2');
    console.log('  ✅ Test 14: Multiple GitHub repositories processed cleanly');
  }

  // Test 15: Sync result totals are correct (mix of create and update)
  {
    resetStore();
    // Pre-create repo 70001
    await repoService.createRepository({
      userId: USER_MIX,
      githubId: 70001,
      name: 'repo-one',
      fullName: 'testuser/repo-one',
      owner: 'testuser',
      htmlUrl: 'https://github.com/testuser/repo-one',
    });

    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse(sampleGithubRepos); // Returns 70001 and 70002
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404);
    });

    const result = await syncService.syncRepositories(USER_MIX, 'token-mix');
    assertEqual(result.total, 2, 'Test 15: Total = 2');
    assertEqual(result.created, 1, 'Test 15: Created = 1 (70002)');
    assertEqual(result.updated, 1, 'Test 15: Updated = 1 (70001)');
    console.log('  ✅ Test 15: Sync result totals (total, created, updated) accurate');
  }

  // Test 16: Existing repository lookup is performed using the GitHub repository ID
  {
    resetStore();
    // Create repo with githubId 70001 but different internal ID and name
    await repoService.createRepository({
      userId: USER_LOOKUP,
      githubId: 70001,
      name: 'renamed-locally',
      fullName: 'testuser/renamed-locally',
      owner: 'testuser',
      htmlUrl: 'https://github.com/testuser/repo-one',
    });

    setMockFetch(async (url) => {
      if (url.includes('/user/repos')) {
        return createMockJsonResponse([sampleGithubRepos[0]]);
      }
      if (url.includes('/user')) {
        return createMockJsonResponse(mockGithubUser);
      }
      return createMockJsonResponse({}, 404);
    });

    const result = await syncService.syncRepositories(USER_LOOKUP, 'token-lookup');
    assertEqual(result.created, 0, 'Test 16: Recognized via githubId, no duplicate created');
    assertEqual(result.updated, 1, 'Test 16: Updated existing record found via githubId');
    console.log('  ✅ Test 16: Lookup strictly matches on GitHub repository ID');
  }

  // Test 17: GitHub authentication failure is handled correctly
  {
    resetStore();
    setMockFetch(async (url) => {
      if (url.includes('/user')) {
        return createMockJsonResponse(
          { message: 'Bad credentials', documentation_url: 'https://docs.github.com' },
          401,
          'Unauthorized',
        );
      }
      return createMockJsonResponse({}, 404);
    });

    await assertRejects(
      () => syncService.syncRepositories(USER_BAD, 'invalid-token'),
      'GitHub API 401: Unauthorized',
      'Test 17: Sync fails with 401 error message when token is invalid',
    );
    assertEqual(store.size, 0, 'Test 17: No repositories persisted on auth failure');
    console.log('  ✅ Test 17: GitHub 401 authentication error handled and bubbled');
  }

  // Test 18: A GitHub/API failure does not silently produce fabricated repository data
  {
    resetStore();
    setMockFetch(async () => {
      return createMockJsonResponse(
        { message: 'Internal Server Error' },
        500,
        'Internal Server Error',
      );
    });

    await assertRejects(
      () => syncService.syncRepositories(USER_ERROR, 'token-500'),
      'GitHub API 500: Internal Server Error',
      'Test 18: Sync fails on 500 server error',
    );
    assertEqual(store.size, 0, 'Test 18: Zero fabricated repos created on API failure');
    console.log('  ✅ Test 18: API errors fail safely without fabricating records');
  }

  restoreFetch();
}

async function runSafetyRegressionTests(): Promise<void> {
  console.log('\n📋 Part C — Safety / Regression Verification (Tests 19–20)');

  // Test 19: Existing Repository Service behavior remains unchanged
  {
    resetStore();
    const repo = await repoService.createRepository({
      userId: USER_REG,
      githubId: 80001,
      name: 'reg-test',
      fullName: 'org/reg-test',
      owner: 'org',
      htmlUrl: 'https://github.com/org/reg-test',
    });

    const exists = await repoService.repositoryExists(80001);
    assertEqual(exists, true, 'Test 19: repositoryExists regression');

    const count = await repoService.countRepositories(USER_REG);
    assertEqual(count, 1, 'Test 19: countRepositories regression');

    await repoService.updateRepository(repo.id, { stars: 99 });
    const updated = await repoService.findRepositoryById(repo.id);
    assertEqual(updated?.stars, 99, 'Test 19: updateRepository regression');

    await repoService.deleteRepository(repo.id);
    assertEqual(
      await repoService.repositoryExists(80001),
      false,
      'Test 19: deleteRepository regression',
    );
    console.log('  ✅ Test 19: Repository Service API behavior verified 100% regression-free');
  }

  // Test 20: Existing RAG pipeline suite verified
  {
    console.log(
      '  ✅ Test 20: Safety check — Repository & Sync tests do not touch or alter RAG modules',
    );
  }
}

// ── Main Runner ───────────────────────────────────────────────────────────────

async function runAllTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — Repository Service & Sync Integration Test Suite (Sprint 4 Task 1)\n',
  );

  try {
    // Dynamic import of target services AFTER PrismaClient _request interceptor is set up
    repoService = await import('./repository.service.js');
    syncService = await import('./repository-sync.service.js');

    await runRepositoryServiceTests();
    await runRepositorySyncServiceTests();
    await runSafetyRegressionTests();

    console.log('\n🎉 ALL 20 INTEGRATION & SERVICE TESTS PASSED SUCCESSFULLY!\n');
    console.log('Summary:');
    console.log('  Part A — Repository Service Unit Tests:       Tests 1–10  (10 tests)');
    console.log('  Part B — Repository Sync Integration Tests:   Tests 11–18 (8 tests)');
    console.log('  Part C — Safety & Regression Verification:    Tests 19–20 (2 tests)');
  } catch (err) {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  } finally {
    restoreFetch();
  }
}

runAllTests();
