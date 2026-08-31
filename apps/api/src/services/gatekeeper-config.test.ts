/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

// =============================================================================
// ForgeMind API — Repository Gatekeeper Policy Config & Webhook Status Test Suite
// =============================================================================

import { PrismaClient } from '@prisma/client';

import {
  getGatekeeperConfig,
  updateGatekeeperConfig,
  resetGatekeeperConfigToDefault,
  getWebhookStatus,
} from './gatekeeper-config.service.js';
import { evaluatePRGatekeeperPolicy } from './pr-gatekeeper-policy.service.js';

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
  return `00000000-0000-4000-9500-${hex}`;
}

const USER_ID = makeUuid(9101);
const REPO_ID = makeUuid(9102);
const GITHUB_REPO_ID = 910099;

export async function runGatekeeperConfigTests(): Promise<void> {
  console.log(
    '🧪 ForgeMind — Repository Gatekeeper Custom Policy Config & Webhook Status Test Suite\n',
  );

  try {
    // ── Setup Initial Database State ─────────────────────────────────────────
    await prisma.user.upsert({
      where: { id: USER_ID },
      create: {
        id: USER_ID,
        email: 'gatekeeper-config@forgemind.ai',
        name: 'Policy Config Tester',
      },
      update: {},
    });

    await prisma.repository.upsert({
      where: { id: REPO_ID },
      create: {
        id: REPO_ID,
        userId: USER_ID,
        githubId: GITHUB_REPO_ID,
        name: 'gatekeeper-config-repo',
        fullName: 'forgemind/gatekeeper-config-repo',
        owner: 'forgemind',
        htmlUrl: 'https://github.com/forgemind/gatekeeper-config-repo',
      },
      update: {},
    });

    await prisma.repositoryGatekeeperConfig.deleteMany({
      where: { repositoryId: REPO_ID },
    });

    // ── Test 1: Default Config Creation & Fallback ───────────────────────────

    const defaultConfig = await getGatekeeperConfig(REPO_ID);
    assertEqual(defaultConfig.repositoryId, REPO_ID, 'Config repositoryId matches');
    assertEqual(defaultConfig.enabled, true, 'Default enabled is true');
    assertEqual(defaultConfig.maxScoreDegradation, 5, 'Default maxScoreDegradation is 5');
    assertEqual(
      defaultConfig.blockOnNewCriticalFindings,
      true,
      'Default blockOnNewCriticalFindings is true',
    );

    console.log('  ✅ Test 1 PASS: Default policy config created with safe defaults');

    // ── Test 2: Update Repository Policy Config ──────────────────────────────
    const updatedConfig = await updateGatekeeperConfig(REPO_ID, {
      maxScoreDegradation: 10,
      blockOnNewCircularCycles: false,
      blockOnNewCriticalFindings: false,
    });

    assertEqual(updatedConfig.maxScoreDegradation, 10, 'Custom maxScoreDegradation saved');
    assertEqual(
      updatedConfig.blockOnNewCircularCycles,
      false,
      'Custom blockOnNewCircularCycles saved',
    );
    assertEqual(
      updatedConfig.blockOnNewCriticalFindings,
      false,
      'Custom blockOnNewCriticalFindings saved',
    );

    console.log('  ✅ Test 2 PASS: Custom policy configuration persisted and retrieved');

    // ── Test 3: Gatekeeper Execution Uses Custom Policy ──────────────────────
    const mockSnapshot = {
      id: makeUuid(9110),
      repositoryId: REPO_ID,
      analysisJobId: makeUuid(9111),
      commitHash: 'head111111111111111111111111111111111111',
      healthScore: 82,
      grade: 'B',
      totalFiles: 10,
      totalDependencies: 12,
      circularCycleCount: 1,
      layerViolationCount: 0,
      hotspotCount: 0,
      orphanExportCount: 0,
      scoreBreakdown: {},
      findings: [],
      fanMetrics: [],
      createdAt: new Date(),
    };

    const mockComparison: any = {
      repositoryId: REPO_ID,
      baselineAnalysisId: makeUuid(9112),
      currentAnalysisId: makeUuid(9111),
      baselineHealthScore: 90,
      currentHealthScore: 82,
      healthDelta: -8,
      trend: 'DEGRADED',
      isRegressed: true,
      regressionSeverity: 'WARNING',
      newFindings: [
        {
          id: 'f1',
          category: 'circular_dependency',
          severity: 'critical',
          title: 'Circular dependency cycle',
          description: 'Cycle fileA -> fileB -> fileA',
          affectedNodeIds: [],
          affectedFilePaths: ['fileA.ts', 'fileB.ts'],
          metrics: {},
          penaltyPoints: 10,
        },
      ],
      resolvedFindings: [],
      unmodifiedFindings: [],
      scoreBreakdownDelta: {},
      evaluatedAt: new Date().toISOString(),
    };

    // Under updatedConfig (maxScoreDegradation: 10, blockOnNewCircularCycles: false)
    const policyResultCustom = evaluatePRGatekeeperPolicy(
      mockComparison,
      mockSnapshot,
      updatedConfig,
    );
    assertEqual(
      policyResultCustom.outcome,
      'pass',
      'Custom policy allows score drop of 8 (threshold 10) and unblocked circular cycle',
    );

    console.log('  ✅ Test 3 PASS: Gatekeeper evaluation uses repository custom policy');

    // ── Test 4: Disabled Gatekeeper State ────────────────────────────────────
    const disabledConfig = await updateGatekeeperConfig(REPO_ID, { enabled: false });
    const policyResultDisabled = evaluatePRGatekeeperPolicy(
      mockComparison,
      mockSnapshot,
      disabledConfig,
    );
    assertEqual(
      policyResultDisabled.outcome,
      'neutral',
      'Disabled gatekeeper evaluates to neutral outcome',
    );
    assertEqual(
      policyResultDisabled.statusDescription,
      'PR Architecture Gatekeeper disabled in repository configuration.',
      'Disabled status description verified',
    );

    console.log('  ✅ Test 4 PASS: Disabled Gatekeeper evaluates to neutral outcome');

    // ── Test 5: Reset Config to Default ──────────────────────────────────────
    const resetConfig = await resetGatekeeperConfigToDefault(REPO_ID);
    assertEqual(resetConfig.enabled, true, 'Reset config enabled is true');
    assertEqual(resetConfig.maxScoreDegradation, 5, 'Reset config maxScoreDegradation is 5');
    assertEqual(
      resetConfig.blockOnNewCircularCycles,
      true,
      'Reset config blockOnNewCircularCycles is true',
    );

    console.log('  ✅ Test 5 PASS: Gatekeeper config reset to default verified');

    // ── Test 6: Invalid Config Input Validation ──────────────────────────────
    try {
      await updateGatekeeperConfig(REPO_ID, { maxScoreDegradation: -5 });
      assert(false, 'Should reject negative maxScoreDegradation');
    } catch (err) {
      assert(
        err instanceof Error && err.message.includes('Must be a number between 0 and 100'),
        'Rejected invalid numeric threshold',
      );
    }

    console.log('  ✅ Test 6 PASS: Invalid policy configuration parameters rejected');

    // ── Test 7: Webhook Status & Secret Confidentiality ──────────────────────
    const whStatus = await getWebhookStatus(REPO_ID);
    assertEqual(whStatus.repositoryId, REPO_ID, 'Webhook status repositoryId matches');
    assert(typeof whStatus.secretConfigured === 'boolean', 'secretConfigured is boolean');
    assert(
      !('secret' in whStatus) && !('webhookSecret' in whStatus),
      'Raw secret NEVER exposed in payload',
    );

    console.log('  ✅ Test 7 PASS: Webhook status retrieved without secret exposure');

    console.log('\n🎉 ALL REPOSITORY GATEKEEPER CONFIG & WEBHOOK STATUS TESTS PASSED!\n');
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes('gatekeeper-config.test.ts')) {
  runGatekeeperConfigTests().catch((err) => {
    console.error('❌ Gatekeeper Config Tests Failed:', err);
    process.exit(1);
  });
}
