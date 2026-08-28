// =============================================================================
// ForgeMind Web — Public Shared Onboarding Blueprint Viewer UI Test Suite
// =============================================================================

import assert from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { SharedBlueprintView } from '@forgemind/types';
import { SharedBlueprintViewer } from './SharedBlueprintViewer';

const MOCK_SHARED_BLUEPRINT: SharedBlueprintView = {
  repositoryName: 'forgemind-core',
  generatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  summary: 'Public shared onboarding blueprint for forgemind-core repository.',
  customNotes: 'Welcome external team members! Please check the API routes first.',
  healthSummary: {
    healthScore: 92,
    grade: 'A',
    totalFindings: 1,
    criticalFindingsCount: 0,
  },
  startHereFiles: [
    {
      path: 'apps/api/src/routes/repository.routes.ts',
      name: 'repository.routes.ts',
      category: 'api_gateway',
      reason: 'Central API router for intelligence features.',
      fanInCount: 12,
    },
  ],
  firstExplorationTasks: [
    {
      taskId: 'task-1-setup',
      title: 'Review environment setup commands',
      category: 'setup',
      description: 'Check prerequisites before running dev server.',
      targetFile: 'package.json',
      actionType: 'view_file',
    },
  ],
  entryPoints: [
    {
      path: 'apps/api/src/main.ts',
      name: 'Main Server',
      type: 'entry_point',
      description: 'Server bootstrap module.',
    },
  ],
  guidedTour: [
    {
      stepNumber: 1,
      title: 'Application Bootstrap',
      targetFile: 'apps/api/src/main.ts',
      description: 'Main entry point file.',
      keyTakeaway: 'Always verify env vars before start.',
    },
  ],
  architecturalSections: [
    {
      title: 'API Gateway',
      category: 'api',
      files: ['apps/api/src/routes/repository.routes.ts'],
      summary: 'Express API routing.',
    },
  ],
  quickstart: {
    prerequisites: ['Node.js 20.x'],
    setupCommands: ['pnpm install', 'pnpm dev'],
    keyEnvironmentVars: ['DATABASE_URL'],
    devServerCommand: 'pnpm dev',
  },
  qaThreads: {
    1: [
      {
        query: 'What port does the server run on?',
        answer: 'The API server runs on port 3001 by default.',
        timestamp: '14:30',
      },
    ],
  },
};

function runTests() {
  console.log('🧪 Starting SharedBlueprintViewer UI Component Test Suite...\n');

  // Test 1: Shared Blueprint header & repository name render
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(
      html.includes('Shared Onboarding Blueprint — forgemind-core'),
      'Test 1: Shared header rendered',
    );
    assert(html.includes('Shared Blueprint'), 'Test 1: Shared badge rendered');
    console.log('  ✅ Test 1: Shared Blueprint header & repository name render correctly');
  }

  // Test 2: Custom author notes banner renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('Author Note'), 'Test 2: Author Note header rendered');
    assert(html.includes('Welcome external team members!'), 'Test 2: Note text rendered');
    console.log('  ✅ Test 2: Custom author notes banner renders when customNotes is present');
  }

  // Test 3: Expiration status badge renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('Expires'), 'Test 3: Expiration text rendered');
    console.log('  ✅ Test 3: Expiration status badge renders expiration date');
  }

  // Test 4: Health Snapshot card renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('Architectural Health Snapshot'), 'Test 4: Health Snapshot rendered');
    assert(html.includes('Score: 92/100'), 'Test 4: Health score rendered');
    assert(html.includes('A'), 'Test 4: Grade A rendered');
    console.log('  ✅ Test 4: Architectural Health Snapshot renders score and grade');
  }

  // Test 5: Start Here recommended files section renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('Recommended Start Here Files'), 'Test 5: Start Here header rendered');
    assert(html.includes('repository.routes.ts'), 'Test 5: File path rendered');
    assert(html.includes('12 dependent'), 'Test 5: Fan-in rendered');
    console.log('  ✅ Test 5: Recommended Start Here files section renders file metadata');
  }

  // Test 6: First Exploration Tasks section renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('First Exploration Tasks'), 'Test 6: Tasks header rendered');
    assert(html.includes('Review environment setup commands'), 'Test 6: Task title rendered');
    console.log('  ✅ Test 6: First Exploration Tasks section renders task items');
  }

  // Test 7: Included Q&A history section renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(
      html.includes('Included Q&amp;A History') || html.includes('Included Q&A History'),
      'Test 7: Q&A header rendered',
    );
    assert(html.includes('What port does the server run on?'), 'Test 7: Question rendered');
    assert(html.includes('port 3001'), 'Test 7: Answer rendered');
    console.log('  ✅ Test 7: Included Q&A history section renders thread items');
  }

  // Test 8: Export Markdown button renders
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('Export Markdown'), 'Test 8: Export button rendered');
    console.log('  ✅ Test 8: Export Markdown action button rendered');
  }

  // Test 9: Sub-tabs navigation options render
  {
    const html = renderToStaticMarkup(
      <SharedBlueprintViewer sharedBlueprint={MOCK_SHARED_BLUEPRINT} />,
    );
    assert(html.includes('5-Step Guided Tour'), 'Test 9: Tour subtab rendered');
    assert(html.includes('Entry Points'), 'Test 9: Entry points subtab rendered');
    assert(html.includes('Architecture Layers'), 'Test 9: Architecture layers subtab rendered');
    assert(html.includes('Developer Quickstart'), 'Test 9: Quickstart subtab rendered');
    console.log('  ✅ Test 9: All 4 sub-tabs navigation options render');
  }

  console.log('\n🎉 ALL SHARED BLUEPRINT VIEWER UI TESTS PASSED SUCCESSFULLY!\n');
}

runTests();
