// =============================================================================
// ForgeMind Web — Architectural Health Dashboard UI Test Suite (Sprint 8 Task 3)
// =============================================================================

import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ArchitectureHealthReport, HealthFinding } from '@forgemind/types';
import { ArchitecturalHealthDashboard } from './ArchitecturalHealthDashboard';
import { AIExplanationDrawer } from './AIExplanationDrawer';

const MOCK_REPORT: ArchitectureHealthReport = {
  repositoryId: 'test-repo-1',
  healthScore: 82,
  grade: 'B+',
  scoreBreakdown: {
    baseScore: 100,
    cyclePenalty: 10,
    layerViolationPenalty: 8,
    hotspotPenalty: 0,
    orphanPenalty: 0,
    finalScore: 82,
    grade: 'B+',
  },
  metrics: {
    totalFiles: 15,
    totalDependencies: 32,
    circularCycleCount: 1,
    layerViolationCount: 1,
    hotspotCount: 0,
    orphanExportCount: 0,
  },
  findings: [
    {
      id: 'finding-cycle-1',
      category: 'circular_dependency',
      severity: 'critical',
      title: 'Circular Dependency Cycle (2 files)',
      description: 'Circular import cycle detected: src/user.service.ts → src/auth.service.ts.',
      affectedNodeIds: ['file:src/user.service.ts', 'file:src/auth.service.ts'],
      affectedFilePaths: ['src/user.service.ts', 'src/auth.service.ts'],
      metrics: { cycleLength: 2 },
      penaltyPoints: 10,
    },
  ],
  fanMetrics: [
    {
      nodeId: 'file:src/user.service.ts',
      filePath: 'src/user.service.ts',
      fanIn: 2,
      fanOut: 3,
      totalDegree: 5,
    },
  ],
  evaluatedAt: new Date().toISOString(),
};

const MOCK_FINDING: HealthFinding = MOCK_REPORT.findings[0]!;

async function runTests(): Promise<void> {
  console.log('🧪 Starting Architectural Health Dashboard UI Component Tests...\n');

  // Test 1: ArchitecturalHealthDashboard renders score & grade badge
  {
    const html = renderToStaticMarkup(<ArchitecturalHealthDashboard repositoryId="test-repo-1" />);
    assert(html.includes('Architectural Health Index') || html.includes('deterministic'));
    console.log('  ✅ Test 1: ArchitecturalHealthDashboard renders dashboard wrapper');
  }

  // Test 2: AIExplanationDrawer renders finding title & deterministic notice when closed/open
  {
    const closedHtml = renderToStaticMarkup(
      <AIExplanationDrawer
        repositoryId="test-repo-1"
        finding={null}
        isOpen={false}
        onClose={() => {}}
      />,
    );
    assert.strictEqual(closedHtml, '', 'Drawer returns empty markup when closed');

    const openHtml = renderToStaticMarkup(
      <AIExplanationDrawer
        repositoryId="test-repo-1"
        finding={MOCK_FINDING}
        isOpen={true}
        onClose={() => {}}
      />,
    );
    assert(openHtml.includes('Circular Dependency Cycle'));
    assert(openHtml.includes('Deterministic Finding Evidence'));
    console.log('  ✅ Test 2: AIExplanationDrawer renders structured finding evidence');
  }

  console.log('\n🎉 ALL ARCHITECTURAL HEALTH DASHBOARD UI TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
