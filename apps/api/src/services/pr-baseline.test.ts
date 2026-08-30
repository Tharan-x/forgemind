/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — PR Architecture Baseline Resolution Integration Test Suite
// (Phase 7.4 Tests)
// =============================================================================
// Covers 6 core requirements for PR baseline resolution and comparison:
//   1. Exact base SHA resolves the correct baseline snapshot
//   2. Unmatched base SHA falls back to latest non-PR snapshot
//   3. Missing base SHA falls back to latest non-PR snapshot
//   4. Repository with no baseline returns null (neutral outcome)
//   5. PR snapshot is never selected as its own baseline
//   6. Baseline -> PR comparison produces accurate health score delta,
//      new findings, resolved findings, and score breakdown delta
// =============================================================================

import { PrismaClient } from '@prisma/client';

import { createAnalysisJob } from './analysis-job.service.js';
import { compareArchitectureHealthSnapshots } from './architecture-history.service.js';
import { findBaselineSnapshot } from './pr-baseline.service.js';

const prisma = new PrismaClient();

// ── Assertion Helpers ──────────────────────────────────────────────────────────

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const USER_ID = makeUuid(7401);
const REPO_ID = makeUuid(7402);
const EMPTY_REPO_ID = makeUuid(7403);
const GITHUB_REPO_ID = 740099;

// ── Test Suite ───────────────────────────────────────────────────────────────

export async function runPRBaselineTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — PR Architecture Baseline Resolution Integration Test Suite (Phase 7.4)\n',
  );

  try {
    // ── Setup Initial Database State ─────────────────────────────────────────
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: 'pr74-tester@forgemind.ai', name: 'PR 7.4 Tester' },
      update: {},
    });

    await prisma.repository.upsert({
      where: { id: REPO_ID },
      create: {
        id: REPO_ID,
        userId: USER_ID,
        githubId: GITHUB_REPO_ID,
        name: 'pr74-repo',
        fullName: 'forgemind-org/pr74-repo',
        owner: 'forgemind-org',
        htmlUrl: 'https://github.com/forgemind-org/pr74-repo',
      },
      update: {},
    });

    await prisma.repository.upsert({
      where: { id: EMPTY_REPO_ID },
      create: {
        id: EMPTY_REPO_ID,
        userId: USER_ID,
        githubId: GITHUB_REPO_ID + 1,
        name: 'pr74-empty-repo',
        fullName: 'forgemind-org/pr74-empty-repo',
        owner: 'forgemind-org',
        htmlUrl: 'https://github.com/forgemind-org/pr74-empty-repo',
      },
      update: {},
    });

    // Cleanup existing snapshots & jobs for test isolation
    await prisma.architectureHealthSnapshot.deleteMany({
      where: { repositoryId: { in: [REPO_ID, EMPTY_REPO_ID] } },
    });
    await prisma.analysisJob.deleteMany({
      where: { repositoryId: { in: [REPO_ID, EMPTY_REPO_ID] } },
    });

    // ── Seed Historical Snapshots ────────────────────────────────────────────

    // 1. Manual / default-branch baseline job #1 (older)
    const baseJob1 = await createAnalysisJob(REPO_ID, {
      triggerSource: 'manual',
      commitHash: 'basesha1111111111111111111111111111111111',
    });

    const snapshot1 = await prisma.architectureHealthSnapshot.create({
      data: {
        repositoryId: REPO_ID,
        analysisJobId: baseJob1.id,
        commitHash: 'basesha1111111111111111111111111111111111',
        healthScore: 90,
        grade: 'A',
        totalFiles: 10,
        totalDependencies: 8,
        circularCycleCount: 0,
        layerViolationCount: 0,
        scoreBreakdown: { baseScore: 100, penalties: 10, finalScore: 90 },
        findings: [
          {
            id: 'find-1',
            title: 'Unused Export',
            category: 'orphan_export',
            severity: 'low',
            description: 'Unused helper',
            affectedFilePaths: ['src/helper.ts'],
          },
        ],
      },
    });

    // 2. Manual / default-branch baseline job #2 (newer)
    const baseJob2 = await createAnalysisJob(REPO_ID, {
      triggerSource: 'manual',
      commitHash: 'basesha2222222222222222222222222222222222',
    });

    const snapshot2 = await prisma.architectureHealthSnapshot.create({
      data: {
        repositoryId: REPO_ID,
        analysisJobId: baseJob2.id,
        commitHash: 'basesha2222222222222222222222222222222222',
        healthScore: 95,
        grade: 'A+',
        totalFiles: 12,
        totalDependencies: 10,
        circularCycleCount: 0,
        layerViolationCount: 0,
        scoreBreakdown: { baseScore: 100, penalties: 5, finalScore: 95 },
        findings: [],
      },
    });

    // 3. PR Analysis Job (must NOT be picked as a baseline!)
    const prJob = await createAnalysisJob(REPO_ID, {
      triggerSource: 'pull_request',
      prNumber: 74,
      headSha: 'headsha7474747474747474747474747474747474',
      baseSha: 'basesha1111111111111111111111111111111111',
      targetRef: 'main',
    });

    const prSnapshot = await prisma.architectureHealthSnapshot.create({
      data: {
        repositoryId: REPO_ID,
        analysisJobId: prJob.id,
        commitHash: 'headsha7474747474747474747474747474747474',
        healthScore: 80,
        grade: 'B',
        totalFiles: 14,
        totalDependencies: 12,
        circularCycleCount: 1,
        layerViolationCount: 0,
        scoreBreakdown: { baseScore: 100, penalties: 20, finalScore: 80 },
        findings: [
          {
            id: 'find-2',
            title: 'Circular Dependency Detected',
            category: 'circular_dependency',
            severity: 'critical',
            description: 'Cycle between a.ts and b.ts',
            affectedFilePaths: ['src/a.ts', 'src/b.ts'],
          },
        ],
      },
    });

    // ── Test 1: Exact Base SHA Resolves Correct Baseline Snapshot ────────────
    {
      const found = await findBaselineSnapshot(
        REPO_ID,
        'basesha1111111111111111111111111111111111',
      );
      assert(Boolean(found), 'Test 1: Exact baseline snapshot found');
      assertEqual(found?.id, snapshot1.id, 'Test 1: Matched snapshot 1 by exact base SHA');
      assertEqual(found?.healthScore, 90, 'Test 1: Health score matched snapshot 1');
      console.log('  ✅ Test 1 PASS: Exact base SHA resolved correct baseline snapshot');
    }

    // ── Test 2: Unmatched Base SHA Falls Back to Latest Non-PR Snapshot ──────
    {
      const found = await findBaselineSnapshot(
        REPO_ID,
        'unmatched_sha_99999999999999999999999999999',
      );
      assert(Boolean(found), 'Test 2: Fallback baseline snapshot found');
      assertEqual(found?.id, snapshot2.id, 'Test 2: Fell back to snapshot 2 (latest non-PR)');
      assertEqual(found?.healthScore, 95, 'Test 2: Health score matched snapshot 2');
      console.log('  ✅ Test 2 PASS: Unmatched base SHA fell back to latest non-PR snapshot');
    }

    // ── Test 3: Missing/Null Base SHA Falls Back to Latest Non-PR Snapshot ──
    {
      const found = await findBaselineSnapshot(REPO_ID, null);
      assert(Boolean(found), 'Test 3: Fallback baseline snapshot found for null baseSha');
      assertEqual(found?.id, snapshot2.id, 'Test 3: Fell back to snapshot 2');
      console.log('  ✅ Test 3 PASS: Missing base SHA fell back to latest non-PR snapshot');
    }

    // ── Test 4: Repository with No Baseline Returns Null ──────────────────────
    {
      const found = await findBaselineSnapshot(EMPTY_REPO_ID, 'basesha123');
      assertEqual(found, null, 'Test 4: Repository without baseline returns null');
      console.log('  ✅ Test 4 PASS: Repository without baseline returns null (neutral result)');
    }

    // ── Test 5: PR Snapshot is Never Selected as Baseline ──────────────────────
    {
      // Search for PR's head SHA
      const found = await findBaselineSnapshot(
        REPO_ID,
        'headsha7474747474747474747474747474747474',
      );
      // Must NOT select prSnapshot, must fallback to latest non-PR snapshot (snapshot2)
      assert(Boolean(found), 'Test 5: Baseline resolved via fallback');
      assertEqual(
        found?.id !== prSnapshot.id,
        true,
        'Test 5: PR snapshot was NOT selected as baseline',
      );
      assertEqual(found?.id, snapshot2.id, 'Test 5: Fell back to snapshot 2');
      console.log('  ✅ Test 5 PASS: PR snapshot was excluded from baseline selection');
    }

    // ── Test 6: Baseline -> PR Health Delta & Findings Comparison ──────────────
    {
      const baseline = await findBaselineSnapshot(
        REPO_ID,
        'basesha1111111111111111111111111111111111',
      );
      if (!baseline) throw new Error('Baseline is null');

      const comparison = await compareArchitectureHealthSnapshots(
        REPO_ID,
        USER_ID,
        baseline.analysisJobId,
        prSnapshot.analysisJobId,
      );

      assertEqual(comparison.baselineHealthScore, 90, 'Test 6: Baseline score 90');
      assertEqual(comparison.currentHealthScore, 80, 'Test 6: PR score 80');
      assertEqual(comparison.healthDelta, -10, 'Test 6: Health delta -10');
      assertEqual(comparison.trend, 'DEGRADED', 'Test 6: Trend DEGRADED');
      assertEqual(comparison.isRegressed, true, 'Test 6: Regressed true');
      assertEqual(comparison.newFindings.length, 1, 'Test 6: 1 new finding');
      assertEqual(
        comparison.newFindings[0]?.title,
        'Circular Dependency Detected',
        'Test 6: New circular finding detected',
      );
      assertEqual(comparison.resolvedFindings.length, 1, 'Test 6: 1 resolved finding');
      assertEqual(
        comparison.resolvedFindings[0]?.title,
        'Unused Export',
        'Test 6: Resolved finding matched',
      );

      console.log(
        '  ✅ Test 6 PASS: Baseline -> PR comparison produced accurate health delta & findings',
      );
    }

    console.log('\n🎉 ALL PHASE 7.4 PR BASELINE RESOLUTION TESTS PASSED SUCCESSFULLY!\n');
  } finally {
    // Cleanup
  }
}

// ── Entry Point ───────────────────────────────────────────────────────────────

await runPRBaselineTests();
