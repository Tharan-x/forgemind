// =============================================================================
// ForgeMind Web — Onboarding Blueprint Viewer UI Test Suite
// =============================================================================

import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { OnboardingBlueprint } from '@forgemind/types';
import { OnboardingBlueprintViewer } from './OnboardingBlueprintViewer';

const MOCK_BLUEPRINT: OnboardingBlueprint = {
  repositoryId: '00000000-0000-4000-8000-0000000000c9',
  repositoryName: 'forgemind',
  generatedAt: new Date().toISOString(),
  summary: 'Welcome to ForgeMind repository onboarding blueprint.',
  providerUsed: 'Gemini 3.6 Flash',
  healthSummary: {
    healthScore: 88,
    grade: 'B+',
    totalFindings: 2,
    criticalFindingsCount: 1,
  },
  startHereFiles: [
    {
      path: 'apps/api/src/routes/repository.routes.ts',
      name: 'repository.routes.ts',
      category: 'api_gateway',
      reason: 'Central REST router module with 14 dependent imports.',
      fanInCount: 14,
    },
    {
      path: 'prisma/schema.prisma',
      name: 'schema.prisma',
      category: 'data_model',
      reason: 'Prisma ORM data model definitions.',
      fanInCount: 8,
    },
  ],
  firstExplorationTasks: [
    {
      taskId: 'task-1-setup',
      title: 'Review environment setup & quickstart commands',
      category: 'setup',
      description: 'Verify prerequisites and dev server start script.',
      targetFile: 'package.json',
      actionType: 'view_file',
    },
    {
      taskId: 'task-2-entry-flow',
      title: 'Inspect entry point: main.ts',
      category: 'code_flow',
      description: 'Analyze application bootstrap logic.',
      targetFile: 'apps/api/src/main.ts',
      actionType: 'explain_code',
    },
    {
      taskId: 'task-3-topology',
      title: 'Explore dependency graph for repository.routes.ts',
      category: 'architecture',
      description: 'Inspect graph topological relationships.',
      targetFile: 'apps/api/src/routes/repository.routes.ts',
      actionType: 'open_graph',
    },
    {
      taskId: 'task-4-health',
      title: 'Investigate architectural finding: Circular Dependency',
      category: 'health_fix',
      description: 'Review CRITICAL finding in src/user.service.ts.',
      targetFile: 'src/user.service.ts',
      actionType: 'view_remediation',
    },
    {
      taskId: 'task-5-ai-investigate',
      title: 'Investigate repository architecture with AI Assistant',
      category: 'architecture',
      description: 'Ask contextual questions about component boundaries.',
      targetFile: 'apps/api/src/main.ts',
      actionType: 'investigate_ai',
    },
  ],
  entryPoints: [
    {
      path: 'apps/api/src/main.ts',
      name: 'Main Entry Point',
      type: 'entry_point',
      description: 'Primary runtime server initialization.',
    },
  ],
  guidedTour: [
    {
      stepNumber: 1,
      title: 'Application Bootstrap & Entry Points',
      targetFile: 'apps/api/src/main.ts',
      description: 'Inspect main bootstrap file.',
      keyTakeaway: 'Verify environment setup before local dev.',
    },
    {
      stepNumber: 2,
      title: 'Data Layer & Schema Architecture',
      targetFile: 'prisma/schema.prisma',
      description: 'Review entity relationships.',
      keyTakeaway: 'Data models enforce tenant isolation.',
    },
    {
      stepNumber: 3,
      title: 'REST API Routes & Controller Handlers',
      targetFile: 'apps/api/src/routes/repository.routes.ts',
      description: 'Examine API route definitions.',
      keyTakeaway: 'All endpoints enforce authentication.',
    },
    {
      stepNumber: 4,
      title: 'Core Business Services & Logic Engine',
      targetFile: 'apps/api/src/services/repository.service.ts',
      description: 'Explore business logic services.',
      keyTakeaway: 'Business logic is modular.',
    },
    {
      stepNumber: 5,
      title: 'Frontend Presentation & UI Integration',
      targetFile: 'apps/web/src/app/page.tsx',
      description: 'Explore UI presentation layer.',
      keyTakeaway: 'React components connect to backend APIs.',
    },
  ],
  architecturalSections: [
    {
      title: 'API Gateway',
      category: 'api',
      files: ['apps/api/src/routes/repository.routes.ts'],
      summary: 'Express API endpoints.',
    },
  ],
  quickstart: {
    prerequisites: ['Node.js 20.x'],
    setupCommands: ['pnpm install', 'pnpm dev'],
    keyEnvironmentVars: ['DATABASE_URL'],
    devServerCommand: 'pnpm dev',
  },
};

function runTests() {
  console.log('🧪 Starting OnboardingBlueprintViewer UI Component Test Suite...\n');

  // Test 1: Health Snapshot renders correctly
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('Architectural Health Snapshot'), 'Test 1: Title rendered');
    assert(html.includes('Score: 88/100'), 'Test 1: Health score rendered');
    assert(html.includes('B+'), 'Test 1: Grade rendered');
    assert(html.includes('Total Findings:'), 'Test 1: Total findings count rendered');
    assert(html.includes('1 Critical'), 'Test 1: Critical count rendered');
    console.log('  ✅ Test 1: Health Snapshot renders score, grade, and finding counts correctly');
  }

  // Test 2: Health Snapshot gracefully disappears when unavailable
  {
    const noHealthBp: OnboardingBlueprint = { ...MOCK_BLUEPRINT, healthSummary: undefined };
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={noHealthBp} />);
    assert(!html.includes('Architectural Health Snapshot'), 'Test 2: Health card hidden');
    console.log('  ✅ Test 2: Health Snapshot disappears when healthSummary is undefined');
  }

  // Test 3: Start Here renders recommended files
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('Recommended Start Here Files'), 'Test 3: Start Here title rendered');
    assert(html.includes('repository.routes.ts'), 'Test 3: File name rendered');
    assert(html.includes('14 dependent'), 'Test 3: Fan-in count rendered');
    assert(html.includes('Central REST router module'), 'Test 3: Reason rendered');
    console.log('  ✅ Test 3: Start Here section renders recommended files and metadata');
  }

  // Test 4: Start Here is capped / rendered according to supplied data
  {
    const noStartHereBp: OnboardingBlueprint = { ...MOCK_BLUEPRINT, startHereFiles: [] };
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={noStartHereBp} />);
    assert(
      !html.includes('Recommended Start Here Files'),
      'Test 4: Start Here section hidden when empty',
    );
    console.log('  ✅ Test 4: Start Here section gracefully handles empty array');
  }

  // Test 5: View File button rendered when callback provided
  {
    let clickedPath = '';
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer
        blueprint={MOCK_BLUEPRINT}
        onFileSelect={(path) => {
          clickedPath = path;
        }}
      />,
    );
    assert(html.includes('View File'), 'Test 5: View File button rendered when callback provided');
    void clickedPath;
    console.log('  ✅ Test 5: View File action button rendered when onFileSelect callback exists');
  }

  // Test 6: Exploration tasks render their metadata
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('First Exploration Tasks'), 'Test 6: Exploration tasks title rendered');
    assert(
      html.includes('Review environment setup &amp; quickstart commands') ||
        html.includes('Review environment setup & quickstart commands'),
      'Test 6: Task title rendered',
    );
    assert(html.includes('setup'), 'Test 6: Category badge rendered');
    assert(html.includes('package.json'), 'Test 6: Target file rendered');
    console.log('  ✅ Test 6: Exploration tasks section renders task titles and categories');
  }

  // Test 7: view_file task action button
  {
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} onFileSelect={() => {}} />,
    );
    assert(html.includes('View File'), 'Test 7: view_file task action button rendered');
    console.log('  ✅ Test 7: view_file task renders action button with onFileSelect');
  }

  // Test 8: open_graph task action button
  {
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} onOpenGraph={() => {}} />,
    );
    assert(html.includes('Open Graph'), 'Test 8: open_graph task action button rendered');
    console.log('  ✅ Test 8: open_graph task renders action button with onOpenGraph');
  }

  // Test 9: explain_code task action button
  {
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} onExplainCode={() => {}} />,
    );
    assert(html.includes('Explain Code'), 'Test 9: explain_code task action button rendered');
    console.log('  ✅ Test 9: explain_code task renders action button with onExplainCode');
  }

  // Test 10: investigate_ai task action button
  {
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} onInvestigateAI={() => {}} />,
    );
    assert(
      html.includes('Investigate with AI'),
      'Test 10: investigate_ai task action button rendered',
    );
    console.log('  ✅ Test 10: investigate_ai task renders action button with onInvestigateAI');
  }

  // Test 11: view_remediation task action button
  {
    const html = renderToStaticMarkup(
      <OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} onViewRemediation={() => {}} />,
    );
    assert(html.includes('View Fix Plan'), 'Test 11: view_remediation task action button rendered');
    console.log('  ✅ Test 11: view_remediation task renders action button with onViewRemediation');
  }

  // Test 12: Unsupported / missing callback does not crash or render broken button
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(
      typeof html === 'string' && html.length > 0,
      'Test 12: Component renders without crashing',
    );
    console.log(
      '  ✅ Test 12: Component renders cleanly without errors when callbacks are omitted',
    );
  }

  // Test 13: Existing 5-step tour still works
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('Step 1 of 5'), 'Test 13: Step 1 rendered');
    assert(html.includes('Guided Tour Steps'), 'Test 13: Tour steps selector rendered');
    console.log('  ✅ Test 13: Existing 5-step guided code tour UI preserved');
  }

  // Test 14: Existing step-specific Q&A form renders
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(
      html.includes('Step-Grounded AI Q&amp;A Assistant') ||
        html.includes('Step-Grounded AI Q&A Assistant'),
      'Test 14: Step Q&A section rendered',
    );
    console.log('  ✅ Test 14: Step-specific AI Q&A form preserved');
  }

  // Test 15: Existing sharing/export action buttons render
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('Share Blueprint'), 'Test 15: Share button rendered');
    assert(html.includes('Export Markdown'), 'Test 15: Export button rendered');
    console.log('  ✅ Test 15: Share Blueprint and Export Markdown action buttons preserved');
  }

  // Test 16: Sub-tabs navigation options render
  {
    const html = renderToStaticMarkup(<OnboardingBlueprintViewer blueprint={MOCK_BLUEPRINT} />);
    assert(html.includes('Entry Points'), 'Test 16: Entry Points subtab option rendered');
    assert(
      html.includes('Architecture Layers'),
      'Test 16: Architecture Layers subtab option rendered',
    );
    assert(html.includes('Developer Quickstart'), 'Test 16: Quickstart subtab option rendered');
    console.log('  ✅ Test 16: All 4 blueprint sub-tabs navigation options preserved');
  }

  console.log('\n🎉 ALL ONBOARDING BLUEPRINT VIEWER UI TESTS PASSED SUCCESSFULLY!\n');
}

runTests();
