/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — PR Gatekeeper & Webhook Dashboard Service Integration Tests
// =============================================================================

import { PrismaClient } from '@prisma/client';

import {
  getGatekeeperOverview,
  getGatekeeperPRs,
  getGatekeeperPRDetail,
  getGatekeeperWebhooks,
} from './gatekeeper-dashboard.service.js';

const prisma = new PrismaClient();

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
  return `00000000-0000-4000-9000-${hex}`;
}

const USER_ID = makeUuid(8101);
const OTHER_USER_ID = makeUuid(8102);
const REPO_ID = makeUuid(8103);
const GITHUB_REPO_ID = 810099;

export async function runGatekeeperDashboardTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — PR Gatekeeper & Webhook Intelligence Dashboard Integration Test Suite\n',
  );

  try {
    // ── Setup Initial Database State ─────────────────────────────────────────
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: {
        id: USER_ID,
        email: 'gatekeeper-dashboard@forgemind.ai',
        name: 'Gatekeeper Tester',
      },
      update: {},
    });

    await prisma.user.upsert({
      where: { id: OTHER_USER_ID },
      create: { id: OTHER_USER_ID, email: 'other-user@forgemind.ai', name: 'Other User' },
      update: {},
    });

    await prisma.repository.upsert({
      where: { id: REPO_ID },
      create: {
        id: REPO_ID,
        userId: USER_ID,
        githubId: GITHUB_REPO_ID,
        name: 'gatekeeper-dashboard-repo',
        fullName: 'forgemind/gatekeeper-dashboard-repo',
        owner: 'forgemind',
        htmlUrl: 'https://github.com/forgemind/gatekeeper-dashboard-repo',
      },
      update: {},
    });

    // 1. Create Baseline Analysis Job & Snapshot
    const baselineJobId = makeUuid(8201);
    await prisma.analysisJob.upsert({
      where: { id: baselineJobId },
      create: {
        id: baselineJobId,
        repositoryId: REPO_ID,
        status: 'completed',
        triggerSource: 'manual',
        commitHash: 'base111111111111111111111111111111111111',
      },
      update: {},
    });

    await prisma.architectureHealthSnapshot.upsert({
      where: { analysisJobId: baselineJobId },
      create: {
        repositoryId: REPO_ID,
        analysisJobId: baselineJobId,
        commitHash: 'base111111111111111111111111111111111111',
        healthScore: 90,
        grade: 'A',
        totalFiles: 10,
        totalDependencies: 15,
        circularCycleCount: 0,
        layerViolationCount: 0,
        hotspotCount: 0,
        orphanExportCount: 0,
        scoreBreakdown: {},
        findings: [],
      },
      update: {},
    });

    // 2. Create PR Analysis Job 1 (PR #101 - Passed)
    const prJob1Id = makeUuid(8202);
    await prisma.analysisJob.upsert({
      where: { id: prJob1Id },
      create: {
        id: prJob1Id,
        repositoryId: REPO_ID,
        status: 'completed',
        triggerSource: 'pull_request',
        prNumber: 101,
        headSha: 'head222222222222222222222222222222222222',
        baseSha: 'base111111111111111111111111111111111111',
        commitHash: 'head222222222222222222222222222222222222',
      },
      update: {},
    });

    await prisma.architectureHealthSnapshot.upsert({
      where: { analysisJobId: prJob1Id },
      create: {
        repositoryId: REPO_ID,
        analysisJobId: prJob1Id,
        commitHash: 'head222222222222222222222222222222222222',
        healthScore: 92,
        grade: 'A+',
        totalFiles: 11,
        totalDependencies: 16,
        circularCycleCount: 0,
        layerViolationCount: 0,
        hotspotCount: 0,
        orphanExportCount: 0,
        scoreBreakdown: {},
        findings: [],
      },
      update: {},
    });

    // 3. Create Webhook Delivery records
    await prisma.webhookDelivery.upsert({
      where: { deliveryId: 'dash-del-001' },
      create: {
        deliveryId: 'dash-del-001',
        eventType: 'pull_request',
        action: 'opened',
        repositoryId: REPO_ID,
        githubRepoId: GITHUB_REPO_ID,
        prNumber: 101,
        headSha: 'head222222222222222222222222222222222222',
        baseSha: 'base111111111111111111111111111111111111',
        sender: 'developer1',
        status: 'processed',
      },
      update: {},
    });

    await prisma.webhookDelivery.upsert({
      where: { deliveryId: 'dash-del-002' },
      create: {
        deliveryId: 'dash-del-002',
        eventType: 'pull_request',
        action: 'closed',
        repositoryId: REPO_ID,
        githubRepoId: GITHUB_REPO_ID,
        prNumber: 101,
        sender: 'developer1',
        status: 'ignored',
        ignoredReason: 'Unsupported action closed',
      },
      update: {},
    });

    // ── Test 1: Overview Aggregation ──────────────────────────────────────────
    const overview = await getGatekeeperOverview(REPO_ID);
    assertEqual(overview.repositoryId, REPO_ID, 'Overview repositoryId matches');
    assert(overview.totalPRAnalyses >= 1, 'Total PR analyses >= 1');
    assert(overview.passedCount >= 1, 'Passed PR count >= 1');
    assertEqual(overview.latestHealthScore, 92, 'Latest health score is 92');

    console.log('  ✅ Test 1 PASS: Overview aggregation metrics calculated');

    // ── Test 2: Paginated PR History ──────────────────────────────────────────
    const prsResult = await getGatekeeperPRs(REPO_ID, 1, 10);
    assert(prsResult.items.length >= 1, 'PR history items returned');
    assertEqual(prsResult.items[0]?.prNumber, 101, 'PR #101 present in history');
    assertEqual(prsResult.items[0]?.outcome, 'pass', 'PR #101 outcome is pass');

    console.log('  ✅ Test 2 PASS: Paginated PR gatekeeper history returned');

    // ── Test 3: PR Detail View ───────────────────────────────────────────────
    const detail = await getGatekeeperPRDetail(REPO_ID, 101);
    assertEqual(detail.prNumber, 101, 'Detail prNumber matches');
    assertEqual(detail.jobId, prJob1Id, 'Detail jobId matches');
    assertEqual(detail.policyResult.outcome, 'pass', 'Policy decision is pass');
    assert(detail.snapshot !== null, 'Snapshot information present');
    assertEqual(detail.snapshot?.healthScore, 92, 'Snapshot score is 92');

    console.log('  ✅ Test 3 PASS: Detailed PR analysis and policy decision retrieved');

    // ── Test 4: Webhook Delivery Log History ──────────────────────────────────
    const webhooksResult = await getGatekeeperWebhooks(REPO_ID, 1, 10);
    assert(webhooksResult.items.length >= 2, 'Webhook delivery items returned');
    const processed = webhooksResult.items.find((w) => w.deliveryId === 'dash-del-001');
    const ignored = webhooksResult.items.find((w) => w.deliveryId === 'dash-del-002');
    assert(processed !== undefined, 'Processed webhook delivery present');
    assert(ignored !== undefined, 'Ignored webhook delivery present');
    assertEqual(ignored?.ignoredReason, 'Unsupported action closed', 'Ignored reason captured');

    console.log('  ✅ Test 4 PASS: Webhook delivery execution logs retrieved');

    // ── Test 5: Invalid Input & Error Guards ──────────────────────────────────
    try {
      await getGatekeeperPRDetail(REPO_ID, 9999);
      assert(false, 'Should throw for non-existent PR number');
    } catch (err) {
      assert(
        err instanceof Error && err.message.includes('No PR analysis found'),
        'Handled missing PR gracefully',
      );
    }

    console.log('  ✅ Test 5 PASS: Missing PR analysis error handling verified');

    console.log('\n🎉 ALL PR GATEKEEPER DASHBOARD INTEGRATION TESTS PASSED!\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes('gatekeeper-dashboard.test.ts')) {
  runGatekeeperDashboardTests().catch((err) => {
    console.error('❌ PR Gatekeeper Dashboard Integration Tests Failed:', err);
    process.exit(1);
  });
}
