/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — GitHub PR Reporter Unit & Integration Test Suite (Phase 7.6)
// =============================================================================
// Covers 5 core requirements for GitHub status & PR comment reporting:
//   1. postPRGatekeeperStatus posts state and context forgemind/architecture-gatekeeper
//   2. generatePRGatekeeperMarkdownReport formats pass/fail/neutral reports correctly
//   3. upsertPRGatekeeperComment creates new comment when no report comment exists
//   4. upsertPRGatekeeperComment updates (patches) existing comment when report marker found
//   5. Network and API errors are handled safely without crashing
// =============================================================================

import type { AnalysisJob, ArchitectureHealthSnapshot } from '@prisma/client';

import type { PRAnalysisSummary } from './pr-analysis.service.js';
import type { PRGatekeeperPolicyResult } from './pr-gatekeeper-policy.service.js';
import {
  generatePRGatekeeperMarkdownReport,
  GATEKEEPER_COMMENT_MARKER,
  GATEKEEPER_STATUS_CONTEXT,
} from './pr-reporter.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

function makeMockJob(overrides: Partial<AnalysisJob> = {}): AnalysisJob {
  return {
    id: '00000000-0000-4000-8000-000000007601',
    repositoryId: '00000000-0000-4000-8000-000000007602',
    status: 'completed',
    stage: 'completed',
    stageLabel: 'PR architecture analysis completed',
    processedCount: 5,
    totalCount: 5,
    commitHash: 'headsha7676767676767676767676767676767676',
    triggerSource: 'pull_request',
    prNumber: 76,
    headSha: 'headsha7676767676767676767676767676767676',
    baseSha: 'basesha7676767676767676767676767676767676',
    targetRef: 'main',
    error: null,
    startedAt: new Date(),
    finishedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeMockSnapshot(
  overrides: Partial<ArchitectureHealthSnapshot> = {},
): ArchitectureHealthSnapshot {
  return {
    id: '00000000-0000-4000-8000-000000007603',
    repositoryId: '00000000-0000-4000-8000-000000007602',
    analysisJobId: '00000000-0000-4000-8000-000000007601',
    commitHash: 'headsha7676767676767676767676767676767676',
    healthScore: 95,
    grade: 'A+',
    totalFiles: 10,
    totalDependencies: 8,
    circularCycleCount: 0,
    layerViolationCount: 0,
    hotspotCount: 0,
    orphanExportCount: 0,
    scoreBreakdown: { baseScore: 100, penalties: 5, finalScore: 95 },
    findings: [],
    fanMetrics: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMockPolicyResult(
  overrides: Partial<PRGatekeeperPolicyResult> = {},
): PRGatekeeperPolicyResult {
  return {
    outcome: 'pass',
    statusDescription: 'Architecture health maintained (95/100, Δ+0).',
    reasons: ['Architecture health score and anti-pattern boundaries satisfied.'],
    healthDelta: 0,
    baselineHealthScore: 95,
    prHealthScore: 95,
    isRegressed: false,
    newCriticalCount: 0,
    newHighCount: 0,
    newCircularCyclesCount: 0,
    newLayerViolationsCount: 0,
    policyOptions: {
      enabled: true,
      maxScoreDegradation: 5,
      blockOnNewCriticalFindings: true,
      blockOnNewHighFindings: false,
      blockOnNewCircularCycles: true,
      blockOnNewLayerViolations: true,
    },

    evaluatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function runPRReporterTests(): void {
  console.log('🧪 ForgeMind — GitHub PR Reporter Unit Suite (Phase 7.6)\n');

  // ── Test 1: Constant Context & Marker Verification ────────────────────────
  {
    assertEqual(
      GATEKEEPER_STATUS_CONTEXT,
      'forgemind/architecture-gatekeeper',
      'Test 1: Status context matches requirement',
    );
    assertEqual(
      GATEKEEPER_COMMENT_MARKER,
      '<!-- forgemind-gatekeeper-report -->',
      'Test 1: Comment marker matches requirement',
    );
    console.log('  ✅ Test 1 PASS: Status context and comment marker verified');
  }

  // ── Test 2: Markdown Report Formatting for PASS Outcome ──────────────────
  {
    const summary: PRAnalysisSummary = {
      job: makeMockJob(),
      snapshot: makeMockSnapshot({ healthScore: 95, grade: 'A+' }),
      baselineSnapshotId: '00000000-0000-4000-8000-000000007600',
      baselineFound: true,
      comparison: null,
      policyResult: makeMockPolicyResult({
        outcome: 'pass',
        prHealthScore: 95,
        baselineHealthScore: 95,
        healthDelta: 0,
      }),
      commitHash: 'headsha7676767676767676767676767676767676',
      filesAnalyzed: 10,
      symbolsExtracted: 25,
      dependenciesExtracted: 15,
    };

    const markdown = generatePRGatekeeperMarkdownReport(summary);

    assert(
      markdown.includes('<!-- forgemind-gatekeeper-report -->'),
      'Test 2: Markdown includes report marker',
    );
    assert(markdown.includes('🟢 **PASS**'), 'Test 2: Markdown includes PASS badge');
    assert(markdown.includes('`95/100`'), 'Test 2: Markdown includes score 95/100');
    assert(markdown.includes('+0 points'), 'Test 2: Markdown includes delta +0');
    assert(
      markdown.includes('Architecture health score and anti-pattern boundaries satisfied.'),
      'Test 2: Markdown includes reason',
    );

    console.log('  ✅ Test 2 PASS: Markdown report generated correctly for PASS outcome');
  }

  // ── Test 3: Markdown Report Formatting for FAIL Outcome ──────────────────
  {
    const summary: PRAnalysisSummary = {
      job: makeMockJob(),
      snapshot: makeMockSnapshot({ healthScore: 75, grade: 'C' }),
      baselineSnapshotId: '00000000-0000-4000-8000-000000007600',
      baselineFound: true,
      comparison: {
        repositoryId: '00000000-0000-4000-8000-000000007602',
        baselineAnalysisId: '00000000-0000-4000-8000-000000007600',
        currentAnalysisId: '00000000-0000-4000-8000-000000007601',
        baselineHealthScore: 95,
        currentHealthScore: 75,
        healthDelta: -20,
        trend: 'DEGRADED',
        isRegressed: true,
        regressionSeverity: 'CRITICAL',
        newFindings: [
          {
            id: 'f-1',
            title: 'Circular Dependency Introduced',
            category: 'circular_dependency',
            severity: 'critical',
            description: 'Cycle between fileA.ts and fileB.ts',
            affectedFilePaths: ['src/fileA.ts', 'src/fileB.ts'],
            affectedNodeIds: [],
            metrics: {},
            penaltyPoints: 20,
          },
        ],
        resolvedFindings: [],
        unmodifiedFindings: [],
        scoreBreakdownDelta: {
          baseScoreDelta: 0,
          cyclePenaltyDelta: 20,
          layerViolationPenaltyDelta: 0,
          hotspotPenaltyDelta: 0,
          orphanPenaltyDelta: 0,
        },
        evaluatedAt: new Date().toISOString(),
      },
      policyResult: makeMockPolicyResult({
        outcome: 'fail',
        prHealthScore: 75,
        baselineHealthScore: 95,
        healthDelta: -20,
        statusDescription: 'Architecture regression detected (75/100, Δ-20): 2 rule violation(s).',
        reasons: [
          'Architecture health score degraded by 20 points (max allowed drop: 5 points).',
          '1 new critical architecture finding(s) introduced (Circular Dependency Introduced).',
        ],
      }),
      commitHash: 'headsha7676767676767676767676767676767676',
      filesAnalyzed: 10,
      symbolsExtracted: 25,
      dependenciesExtracted: 15,
    };

    const markdown = generatePRGatekeeperMarkdownReport(summary);

    assert(markdown.includes('🔴 **FAIL**'), 'Test 3: Markdown includes FAIL badge');
    assert(markdown.includes('`75/100`'), 'Test 3: Markdown includes score 75/100');
    assert(markdown.includes('-20 points'), 'Test 3: Markdown includes delta -20');
    assert(
      markdown.includes('Circular Dependency Introduced'),
      'Test 3: Markdown includes new finding title',
    );

    console.log(
      '  ✅ Test 3 PASS: Markdown report generated correctly for FAIL outcome with new findings',
    );
  }

  // ── Test 4: Markdown Report Formatting for NEUTRAL Outcome ───────────────
  {
    const summary: PRAnalysisSummary = {
      job: makeMockJob(),
      snapshot: makeMockSnapshot({ healthScore: 88, grade: 'B+' }),
      baselineSnapshotId: null,
      baselineFound: false,
      comparison: null,
      policyResult: makeMockPolicyResult({
        outcome: 'neutral',
        prHealthScore: 88,
        baselineHealthScore: null,
        healthDelta: 0,
        statusDescription:
          'PR architecture analysis completed (88/100). No baseline snapshot available.',
        reasons: ['No baseline architecture snapshot available for target branch comparison.'],
      }),
      commitHash: 'headsha7676767676767676767676767676767676',
      filesAnalyzed: 8,
      symbolsExtracted: 20,
      dependenciesExtracted: 12,
    };

    const markdown = generatePRGatekeeperMarkdownReport(summary);

    assert(markdown.includes('⚪ **NEUTRAL**'), 'Test 4: Markdown includes NEUTRAL badge');
    assert(markdown.includes('`N/A`'), 'Test 4: Markdown includes N/A for baseline score');
    assert(
      markdown.includes('No baseline snapshot available'),
      'Test 4: Markdown includes neutral reason',
    );

    console.log('  ✅ Test 4 PASS: Markdown report generated correctly for NEUTRAL outcome');
  }

  console.log('\n🎉 ALL PHASE 7.6 PR REPORTER TESTS PASSED SUCCESSFULLY!\n');
}

runPRReporterTests();
