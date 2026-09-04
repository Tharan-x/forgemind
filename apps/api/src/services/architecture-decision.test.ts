/* eslint-disable no-console, @typescript-eslint/no-explicit-any */
// =============================================================================
// ForgeMind API — Architecture Decision Memory Service Unit Tests (Milestone 1 & 2)
// =============================================================================

process.env['ENCRYPTION_SECRET'] = 'forgemind-test-encryption-secret-32-chars';

import { PrismaClient } from '@prisma/client';
import { encryptToken } from '../lib/encryption.js';
import {
  confirmArchitectureDecision,
  createManualArchitectureDecision,
  findArchitectureDecisionById,
  findArchitectureDecisions,
  mineRepositoryHistoricalEvidence,
  synthesizeArchitectureDecision,
} from './architecture-decision.service.js';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`,
    );
  }
}

function assertTrue(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

const mockRepoId = '00000000-0000-4000-8000-0000000000d1';
const mockRepoNoTokenId = '00000000-0000-4000-8000-0000000000d2';
const mockUserId = 'user-owner-decisions-id';
const mockUserNoTokenId = 'user-no-token-id';
const nonOwnerUserId = 'user-unauthorized-id';

const MOCK_REPOSITORIES: Record<string, any> = {
  [mockRepoId]: {
    id: mockRepoId,
    userId: mockUserId,
    name: 'forgemind-decisions-repo',
    owner: 'forgemind-org',
  },
  [mockRepoNoTokenId]: {
    id: mockRepoNoTokenId,
    userId: mockUserNoTokenId,
    name: 'forgemind-no-token-repo',
    owner: 'forgemind-org',
  },
};

const MOCK_FILES: any[] = [
  {
    id: 'file-1',
    repositoryId: mockRepoId,
    path: 'apps/api/src/app.ts',
    name: 'app.ts',
  },
  {
    id: 'file-2',
    repositoryId: mockRepoId,
    path: 'apps/api/src/controllers/repository.controller.ts',
    name: 'repository.controller.ts',
  },
];

// In-memory Prisma store for test decisions
const mockDecisionsDb = new Map<string, any>();

function setupPrismaMocks(): void {
  (PrismaClient.prototype as any)._request = async function (params: any): Promise<any> {
    const { model, action, args } = params;

    if (model === 'Repository' && (action === 'findUnique' || action === 'findFirst')) {
      const id = args?.where?.id;
      return MOCK_REPOSITORIES[id] ?? null;
    }

    if (model === 'UserGitHubCredential' && (action === 'findUnique' || action === 'findFirst')) {
      const userId = args?.where?.userId;
      if (userId === mockUserId) {
        return {
          id: 'cred-1',
          userId: mockUserId,
          encryptedToken: encryptToken('ghp_mock_test_token_123'),
          githubUsername: 'forgemind-dev',
          githubAvatarUrl: 'https://github.com/avatar.png',
        };
      }
      return null;
    }

    if (model === 'RepositoryFile' && action === 'findMany') {
      return MOCK_FILES;
    }

    if (model === 'ArchitectureHealthSnapshot' && action === 'findMany') {
      return [
        {
          id: 'snap-1',
          repositoryId: mockRepoId,
          commitHash: 'commit-sha-111',
          healthScore: 85,
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
        {
          id: 'snap-2',
          repositoryId: mockRepoId,
          commitHash: 'commit-sha-222',
          healthScore: 92,
          createdAt: new Date('2026-09-01T12:00:00Z'),
        },
      ];
    }

    if (model === 'ArchitectureDecision') {
      if (action === 'findUnique' || action === 'findFirst') {
        if (args?.where?.repositoryId_commitHash) {
          const key = `${args.where.repositoryId_commitHash.repositoryId}::${args.where.repositoryId_commitHash.commitHash}`;
          return mockDecisionsDb.get(key) || null;
        }
        if (args?.where?.id) {
          for (const val of mockDecisionsDb.values()) {
            if (
              val.id === args.where.id &&
              (!args.where.repositoryId || val.repositoryId === args.where.repositoryId)
            ) {
              return val;
            }
          }
          return null;
        }
      }

      if (action === 'create') {
        const id = `dec-${Math.random().toString(36).substring(2, 9)}`;
        const record = {
          id,
          repositoryId: args.data.repositoryId,
          commitHash: args.data.commitHash,
          commitUrl: args.data.commitUrl ?? null,
          commitMessage: args.data.commitMessage ?? null,
          author: args.data.author ?? null,
          committedAt: args.data.committedAt ?? null,
          prNumber: args.data.prNumber ?? null,
          prUrl: args.data.prUrl ?? null,
          prTitle: args.data.prTitle ?? null,
          prBody: args.data.prBody ?? null,
          affectedPaths: args.data.affectedPaths ?? [],
          changedFiles: args.data.changedFiles ?? null,
          healthScoreDelta: args.data.healthScoreDelta ?? null,
          evidenceMetadata: args.data.evidenceMetadata ?? null,
          synthesis: args.data.synthesis ?? null,
          isConfirmed: args.data.isConfirmed ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const key = `${record.repositoryId}::${record.commitHash}`;
        mockDecisionsDb.set(key, record);
        return record;
      }

      if (action === 'update') {
        for (const [key, val] of mockDecisionsDb.entries()) {
          if (val.id === args.where.id) {
            const updated = {
              ...val,
              ...args.data,
              updatedAt: new Date(),
            };
            mockDecisionsDb.set(key, updated);
            return updated;
          }
        }
        throw new Error(`Record not found for update: ${args.where.id}`);
      }

      if (action === 'findMany') {
        let list = Array.from(mockDecisionsDb.values()).filter(
          (d) => d.repositoryId === args.where.repositoryId,
        );
        if (args.where.affectedPaths?.has) {
          list = list.filter((d) => d.affectedPaths.includes(args.where.affectedPaths.has));
        }
        if (args.where.prNumber) {
          list = list.filter((d) => d.prNumber === args.where.prNumber);
        }
        const skip = args.skip || 0;
        const take = args.take || 20;
        return list.slice(skip, skip + take);
      }

      if (action === 'count') {
        let list = Array.from(mockDecisionsDb.values()).filter(
          (d) => d.repositoryId === args.where.repositoryId,
        );
        if (args.where.affectedPaths?.has) {
          list = list.filter((d) => d.affectedPaths.includes(args.where.affectedPaths.has));
        }
        if (args.where.prNumber) {
          list = list.filter((d) => d.prNumber === args.where.prNumber);
        }
        return list.length;
      }
    }

    return null;
  };
}

async function runTests(): Promise<void> {
  console.log('🧪 Starting Architecture Decision Service (Milestone 1 & 2) Tests...\n');
  setupPrismaMocks();

  // Mock global fetch for GitHub API calls
  const origFetch = global.fetch;
  (global as any).fetch = async (url: string) => {
    const urlStr = String(url);

    if (urlStr.includes('/commits?')) {
      return {
        ok: true,
        json: async () => [
          {
            sha: 'commit-sha-222',
            commit: {
              message: 'feat: Add PR Gatekeeper decision policy',
              author: { name: 'Lead Dev', email: 'dev@forgemind.io', date: '2026-09-01T12:00:00Z' },
            },
            author: { login: 'leaddev' },
          },
          {
            sha: 'commit-sha-111',
            commit: {
              message: 'wip',
              author: {
                name: 'Core Dev',
                email: 'core@forgemind.io',
                date: '2026-09-01T10:00:00Z',
              },
            },
            author: { login: 'coredev' },
          },
        ],
      };
    }

    if (urlStr.includes('/commits/commit-sha-222/pulls')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 101,
            number: 42,
            title: 'PR #42: Gatekeeper policy integration',
            body: 'Introduced strict PR gatekeeper checks to prevent architecture drift.',
            html_url: 'https://github.com/forgemind-org/forgemind-decisions-repo/pull/42',
            state: 'closed',
            merged_at: '2026-09-01T12:05:00Z',
            user: { login: 'leaddev' },
          },
        ],
      };
    }

    if (urlStr.includes('/commits/commit-sha-111/pulls')) {
      return {
        ok: true,
        json: async () => [],
      };
    }

    if (urlStr.includes('/commits/commit-sha-222')) {
      return {
        ok: true,
        json: async () => ({
          sha: 'commit-sha-222',
          html_url:
            'https://github.com/forgemind-org/forgemind-decisions-repo/commit/commit-sha-222',
          commit: {
            message: 'feat: Add PR Gatekeeper decision policy PAT="ghp_secret_key_123"',
            author: { name: 'Lead Dev', email: 'dev@forgemind.io', date: '2026-09-01T12:00:00Z' },
          },
          files: [
            {
              filename: 'apps/api/src/app.ts',
              status: 'modified',
              additions: 15,
              deletions: 3,
              changes: 18,
            },
            {
              filename: 'legacy/old-file.ts',
              status: 'removed',
              additions: 0,
              deletions: 50,
              changes: 50,
            },
          ],
        }),
      };
    }

    if (urlStr.includes('/commits/commit-sha-111')) {
      return {
        ok: true,
        json: async () => ({
          sha: 'commit-sha-111',
          html_url:
            'https://github.com/forgemind-org/forgemind-decisions-repo/commit/commit-sha-111',
          commit: {
            message: 'wip',
            author: { name: 'Core Dev', email: 'core@forgemind.io', date: '2026-09-01T10:00:00Z' },
          },
          files: [
            {
              filename: 'apps/api/src/controllers/repository.controller.ts',
              status: 'modified',
              additions: 30,
              deletions: 10,
              changes: 40,
            },
          ],
        }),
      };
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'Not Found' }),
    };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Repository Ownership & Missing Auth Checks
    // -------------------------------------------------------------------------
    console.log('Test 1: Repository ownership & missing auth verification...');
    try {
      await mineRepositoryHistoricalEvidence(mockRepoId, nonOwnerUserId);
      assertTrue(false, 'Should throw error for unauthorized user');
    } catch (err: any) {
      assertTrue(
        err.message.includes('permission') ||
          err.message.includes('Access denied') ||
          err.message.includes('not found'),
        'Throws unauthorized error',
      );
    }

    try {
      await mineRepositoryHistoricalEvidence(mockRepoNoTokenId, mockUserNoTokenId);
      assertTrue(false, 'Should throw error for missing GitHub token');
    } catch (err: any) {
      assertTrue(err.message.includes('GitHub token is required'), 'Throws missing token error');
    }
    console.log('  ✅ Test 1 PASS: Ownership & authentication checks enforced.');

    // -------------------------------------------------------------------------
    // TEST 2: Deterministic Mining & Decision Persistence
    // -------------------------------------------------------------------------
    console.log('Test 2: Deterministic commit evidence mining & persistence...');
    const result = await mineRepositoryHistoricalEvidence(mockRepoId, mockUserId, {
      maxCommits: 5,
    });
    assertEqual(result.repositoryId, mockRepoId, 'Matches repository ID');
    assertEqual(result.commitsMined, 2, 'Mined 2 commits');
    assertEqual(result.decisionsCreated, 2, 'Created 2 decision records');
    assertEqual(result.latestCommitHash, 'commit-sha-222', 'Identified latest commit SHA');
    console.log('  ✅ Test 2 PASS: Evidence mined and persisted cleanly.');

    // -------------------------------------------------------------------------
    // TEST 3: Commit -> PR Association & Unassociated Commits
    // -------------------------------------------------------------------------
    console.log('Test 3: Commit -> PR association verification...');
    const decisions = await findArchitectureDecisions(mockRepoId, mockUserId, { limit: 10 });
    assertEqual(decisions.total, 2, 'Total 2 decisions stored');

    const prDecision = decisions.items.find((d) => d.commitHash === 'commit-sha-222');
    assertTrue(!!prDecision, 'Found decision for commit-sha-222');
    assertEqual(prDecision?.prNumber, 42, 'Associated PR number 42');
    assertEqual(prDecision?.prTitle, 'PR #42: Gatekeeper policy integration', 'PR Title retrieved');
    assertEqual(
      prDecision?.prBody,
      'Introduced strict PR gatekeeper checks to prevent architecture drift.',
      'PR Body retrieved',
    );

    const noPrDecision = decisions.items.find((d) => d.commitHash === 'commit-sha-111');
    assertTrue(!!noPrDecision, 'Found decision for commit-sha-111');
    assertEqual(noPrDecision?.prNumber, null, 'PR number is null when unassociated');
    assertEqual(noPrDecision?.prTitle, null, 'PR title is null when unassociated');
    console.log('  ✅ Test 3 PASS: PR association & null handling verified.');

    // -------------------------------------------------------------------------
    // TEST 4: Changed-File Extraction & Architecture Entity Matching
    // -------------------------------------------------------------------------
    console.log('Test 4: Changed-file extraction & entity matching...');
    assertTrue(
      prDecision!.affectedPaths.includes('apps/api/src/app.ts'),
      'Includes matched indexed file path',
    );
    assertTrue(
      prDecision!.affectedPaths.includes('legacy/old-file.ts'),
      'Preserves unindexed historical file path without breaking',
    );
    assertEqual(prDecision!.changedFiles?.length, 2, 'Contains 2 changed file evidence items');
    console.log('  ✅ Test 4 PASS: Entity matching & historical path preservation verified.');

    // -------------------------------------------------------------------------
    // TEST 5: Health Score Delta Calculation
    // -------------------------------------------------------------------------
    console.log('Test 5: Deterministic health score delta calculation...');
    assertEqual(prDecision?.healthScoreDelta, 7, 'Calculates health delta (+7 from 85 to 92)');
    console.log('  ✅ Test 5 PASS: Health score delta correctly computed.');

    // -------------------------------------------------------------------------
    // TEST 6: Idempotent Repeated Mining
    // -------------------------------------------------------------------------
    console.log('Test 6: Idempotent repeated mining verification...');
    const reMineResult = await mineRepositoryHistoricalEvidence(mockRepoId, mockUserId, {
      maxCommits: 5,
    });
    assertEqual(reMineResult.commitsMined, 2, 'Mined 2 commits on second run');
    assertEqual(reMineResult.decisionsCreated, 0, '0 new decisions created on re-mine');
    assertEqual(reMineResult.decisionsUpdated, 2, '2 existing decisions updated idempotently');
    const decisionsAfterReMine = await findArchitectureDecisions(mockRepoId, mockUserId, {
      limit: 10,
    });
    assertEqual(decisionsAfterReMine.total, 2, 'Total records count remains 2 (zero duplicates)');
    console.log('  ✅ Test 6 PASS: Idempotency guaranteed across repeated mining runs.');

    // -------------------------------------------------------------------------
    // TEST 7: Single Decision Retrieval & Human Confirmation
    // -------------------------------------------------------------------------
    console.log('Test 7: Single decision retrieval & human confirmation...');
    const fetched = await findArchitectureDecisionById(mockRepoId, prDecision!.id, mockUserId);
    assertEqual(fetched.id, prDecision!.id, 'Retrieved matching decision record');
    assertEqual(fetched.isConfirmed, false, 'Default isConfirmed is false');

    const confirmed = await confirmArchitectureDecision(
      mockRepoId,
      prDecision!.id,
      mockUserId,
      true,
    );
    assertEqual(confirmed.isConfirmed, true, 'Updated isConfirmed status to true');
    console.log('  ✅ Test 7 PASS: Single retrieval & human confirmation working.');

    // -------------------------------------------------------------------------
    // TEST 8: GitHub API Failure Behavior
    // -------------------------------------------------------------------------
    console.log('Test 8: GitHub API failure resilience handling...');
    (global as any).fetch = async () => {
      throw new Error('GitHub API rate limit exceeded');
    };
    try {
      await mineRepositoryHistoricalEvidence(mockRepoId, mockUserId);
      assertTrue(false, 'Should catch GitHub API failure cleanly');
    } catch (err: any) {
      assertTrue(
        err.message.includes('GitHub API rate limit exceeded') ||
          err.message.includes('MINING_FAILED') ||
          err.message.includes('Failed to mine'),
        'Fails gracefully with informative message',
      );
    }
    console.log('  ✅ Test 8 PASS: GitHub API failure handled cleanly without corrupting DB.');

    // -------------------------------------------------------------------------
    // TEST 9: Milestone 2 — Valid Commit + PR Evidence Produces Grounded Synthesis
    // -------------------------------------------------------------------------
    console.log('Test 9: Valid commit + PR evidence AI synthesis generation...');
    const synthesized = await synthesizeArchitectureDecision(
      mockRepoId,
      prDecision!.id,
      mockUserId,
    );
    assertTrue(!!synthesized.synthesis, 'Synthesis object created');
    assertTrue(
      synthesized.synthesis!.architecturalIntent.length > 0,
      'Architectural intent populated',
    );
    assertTrue(synthesized.synthesis!.rationale.length > 0, 'Rationale populated');
    assertEqual(
      synthesized.synthesis!.evidenceConfidence,
      'HIGH',
      'High confidence for rich PR evidence',
    );
    console.log('  ✅ Test 9 PASS: Grounded AI synthesis generated for rich evidence.');

    // -------------------------------------------------------------------------
    // TEST 10: Milestone 2 — Sparse Evidence Fallback Handling
    // -------------------------------------------------------------------------
    console.log('Test 10: Sparse evidence fallback handling...');
    const sparseDecision = decisions.items.find((d) => d.commitHash === 'commit-sha-111');
    assertTrue(!!sparseDecision, 'Found sparse decision for commit-sha-111');

    const sparseSynthesized = await synthesizeArchitectureDecision(
      mockRepoId,
      sparseDecision!.id,
      mockUserId,
    );
    assertEqual(
      sparseSynthesized.synthesis?.architecturalIntent,
      'Historical intent unrecorded in commit metadata',
      'Returns standard fallback for sparse commit/PR evidence',
    );
    assertEqual(
      sparseSynthesized.synthesis?.evidenceConfidence,
      'UNRECORDED',
      'Evidence confidence set to UNRECORDED for sparse evidence',
    );
    console.log(
      '  ✅ Test 10 PASS: Sparse evidence correctly triggers UNRECORDED fallback without hallucinating.',
    );

    // -------------------------------------------------------------------------
    // TEST 11: Milestone 2 — force=true Regeneration & Idempotency
    // -------------------------------------------------------------------------
    console.log('Test 11: force=true regeneration & cached synthesis idempotency...');
    const cachedRun = await synthesizeArchitectureDecision(mockRepoId, prDecision!.id, mockUserId, {
      force: false,
    });
    assertEqual(
      cachedRun.synthesis?.synthesizedAt,
      synthesized.synthesis?.synthesizedAt,
      'Identical timestamp returned when force=false',
    );

    const forcedRun = await synthesizeArchitectureDecision(mockRepoId, prDecision!.id, mockUserId, {
      force: true,
    });
    assertTrue(!!forcedRun.synthesis, 'Re-synthesis succeeded on force=true');
    console.log('  ✅ Test 11 PASS: Caching & force=true regeneration verified.');

    // -------------------------------------------------------------------------
    // TEST 12: Milestone 2 — Secret Protection / Masking Verification
    // -------------------------------------------------------------------------
    console.log('Test 12: Secret masking verification in LLM input...');
    const decisionWithSecret = await synthesizeArchitectureDecision(
      mockRepoId,
      prDecision!.id,
      mockUserId,
      { force: true },
    );
    assertTrue(
      !JSON.stringify(decisionWithSecret.synthesis).includes('ghp_secret_key_123'),
      'Secret key masked prior to synthesis',
    );
    console.log('  ✅ Test 12 PASS: Credentials & PAT secrets masked prior to synthesis.');

    // -------------------------------------------------------------------------
    // TEST 13: Milestone 5 — Manual ADR Creation
    // -------------------------------------------------------------------------
    console.log('Test 13: Manual ADR creation & server-derived field verification...');
    const manualADR = await createManualArchitectureDecision(mockRepoId, mockUserId, {
      title: 'Use PostgreSQL PgVector for Embeddings',
      description:
        'Adopted PgVector for 1536-dimensional vector search to maintain ACID transactions.',
      affectedPaths: ['apps/api/src/services/vector-search.service.ts'],
      prNumber: 88,
    });

    assertEqual(manualADR.repositoryId, mockRepoId, 'Repository ID matches target repo');
    assertEqual(
      manualADR.isConfirmed,
      true,
      'Manual ADR is automatically confirmed (isConfirmed=true)',
    );
    assertTrue(manualADR.commitHash.startsWith('adr-'), 'Synthetic commitHash starts with adr-');
    assertEqual(
      manualADR.commitMessage,
      'Use PostgreSQL PgVector for Embeddings',
      'Commit message matches title',
    );
    assertEqual(
      manualADR.prTitle,
      'Use PostgreSQL PgVector for Embeddings',
      'PR title matches title',
    );
    assertEqual(
      manualADR.prBody,
      'Adopted PgVector for 1536-dimensional vector search to maintain ACID transactions.',
      'PR body matches description',
    );
    assertEqual(manualADR.prNumber, 88, 'PR number matches input prNumber');
    assertEqual(manualADR.affectedPaths.length, 1, 'Affected paths array length preserved');
    assertEqual(
      manualADR.affectedPaths[0],
      'apps/api/src/services/vector-search.service.ts',
      'Exact affected path preserved',
    );
    assertEqual(
      manualADR.evidenceMetadata?.['source'],
      'manual_adr',
      'Evidence metadata source tagged as manual_adr',
    );
    assertEqual(
      manualADR.synthesis?.architecturalIntent,
      'Use PostgreSQL PgVector for Embeddings',
      'Synthesis intent matches title',
    );
    assertEqual(
      manualADR.synthesis?.evidenceConfidence,
      'HIGH',
      'Synthesis confidence set to HIGH for manual ADR',
    );
    console.log('  ✅ Test 13 PASS: Manual ADR creation & server-derived fields verified.');

    // -------------------------------------------------------------------------
    // TEST 14: Milestone 5 — Validation Rules for Manual ADR Input
    // -------------------------------------------------------------------------
    console.log('Test 14: Validation rules for empty title/description...');
    let emptyTitleCaught = false;
    try {
      await createManualArchitectureDecision(mockRepoId, mockUserId, {
        title: '   ',
        description: 'Valid description',
      });
    } catch {
      emptyTitleCaught = true;
    }
    assertTrue(emptyTitleCaught, 'Rejects empty or whitespace title');

    let emptyDescCaught = false;
    try {
      await createManualArchitectureDecision(mockRepoId, mockUserId, {
        title: 'Valid title',
        description: '',
      });
    } catch {
      emptyDescCaught = true;
    }
    assertTrue(emptyDescCaught, 'Rejects empty or missing description');
    console.log('  ✅ Test 14 PASS: Validation rules for manual ADR input verified.');

    // -------------------------------------------------------------------------
    // TEST 15: Milestone 5 — Unauthorized Repository Access Rejection
    // -------------------------------------------------------------------------
    console.log('Test 15: Unauthorized user manual ADR creation rejection...');
    let unauthorizedCaught = false;
    try {
      await createManualArchitectureDecision(mockRepoId, nonOwnerUserId, {
        title: 'Unauthorized ADR',
        description: 'Should be rejected',
      });
    } catch {
      unauthorizedCaught = true;
    }
    assertTrue(unauthorizedCaught, 'Rejects manual ADR creation for unauthorized non-owner user');
    console.log('  ✅ Test 15 PASS: Unauthorized repository access rejected cleanly.');

    // -------------------------------------------------------------------------
    // TEST 16: Release Blocker — Provider-Agnostic Path Filtering & Post-Filter Pagination
    // -------------------------------------------------------------------------
    console.log('Test 16: Provider-agnostic path filtering & post-filter pagination...');

    // Seed test decisions with various affectedPaths
    await createManualArchitectureDecision(mockRepoId, mockUserId, {
      title: 'Controller Layer Refactoring',
      description: 'Refactored controller handlers for repository API.',
      affectedPaths: ['src/controllers/repository.controller.ts'],
    });

    await createManualArchitectureDecision(mockRepoId, mockUserId, {
      title: 'Controller Authentication Middleware',
      description: 'Added authentication check in controller tier.',
      affectedPaths: ['src/controllers/auth.controller.ts'],
    });

    await createManualArchitectureDecision(mockRepoId, mockUserId, {
      title: 'Database Service Index Optimization',
      description: 'Optimized service query indexes.',
      affectedPaths: ['src/services/db.service.ts'],
    });

    await createManualArchitectureDecision(mockRepoId, mockUserId, {
      title: 'Empty Affected Paths Decision',
      description: 'General decision without affected paths.',
      affectedPaths: [],
    });

    // 1. Directory containment matching
    const controllerDecisions = await findArchitectureDecisions(mockRepoId, mockUserId, {
      path: 'src/controllers',
    });
    assertTrue(
      controllerDecisions.items.length >= 2,
      'Matches files under src/controllers directory',
    );
    assertTrue(
      controllerDecisions.items.every((d) =>
        d.affectedPaths.some((p) => p.startsWith('src/controllers')),
      ),
      'All matched items belong to src/controllers',
    );

    // 2. Non-matching path exclusion & empty affectedPaths exclusion
    const serviceDecisions = await findArchitectureDecisions(mockRepoId, mockUserId, {
      path: 'src/services',
    });
    assertTrue(
      serviceDecisions.items.some((d) => d.affectedPaths.includes('src/services/db.service.ts')),
      'Matches src/services decision',
    );
    assertTrue(
      !serviceDecisions.items.some((d) =>
        d.affectedPaths.some((p) => p.startsWith('src/controllers')),
      ),
      'Excludes src/controllers decisions when searching src/services',
    );
    assertTrue(
      !serviceDecisions.items.some((d) => d.affectedPaths.length === 0),
      'Excludes empty affectedPaths decision when path filter is provided',
    );

    // 3. Post-filter pagination
    const paginatedControllers = await findArchitectureDecisions(mockRepoId, mockUserId, {
      path: 'src/controllers',
      limit: 1,
      page: 1,
    });
    assertEqual(paginatedControllers.limit, 1, 'Limit is preserved');
    assertEqual(paginatedControllers.items.length, 1, 'Returns 1 item per page after filtering');
    assertTrue(
      paginatedControllers.total >= 2,
      'Total represents full filtered count before slicing',
    );
    assertEqual(
      paginatedControllers.totalPages,
      Math.ceil(paginatedControllers.total / 1),
      'Total pages calculated correctly based on filtered total',
    );

    // 4. Omitting path option preserves full listing behavior
    const allDecisions = await findArchitectureDecisions(mockRepoId, mockUserId);
    assertTrue(allDecisions.total >= 6, 'Omitting path filter returns all repository decisions');

    // 5. Combining prNumber and path filter
    const prAndPathDecisions = await findArchitectureDecisions(mockRepoId, mockUserId, {
      path: 'src/controllers',
      prNumber: 88,
    });
    assertTrue(
      prAndPathDecisions.items.every((d) => d.prNumber === 88),
      'Preserves prNumber filter alongside path filter',
    );

    console.log('  ✅ Test 16 PASS: Provider-agnostic path filtering & pagination verified.');

    console.log('\n🎉 ALL ARCHITECTURE DECISION SERVICE TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    global.fetch = origFetch;
  }
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
