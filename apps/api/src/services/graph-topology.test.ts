/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
// =============================================================================
// ForgeMind API — Graph Topology & Visual Dependency Engine Integration Test Suite
// (Sprint 6)
// =============================================================================

import type { Repository, RepositoryFile, RepositorySymbol, FileDependency } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import {
  generateRepositoryGraphTopology,
  detectCircularDependencies,
} from './graph-topology.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function makeUuid(num: number): string {
  const hex = num.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

const REPO_ID_1 = makeUuid(8001);
const REPO_ID_OTHER = makeUuid(8002);
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
    let results = Array.from(fileStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((f) => f.repositoryId === args.where.repositoryId);
    if (args?.take) results = results.slice(0, args.take);
    return results;
  }
  if (clientMethod === 'repositoryFile.count') {
    return fileStore.size;
  }
  if (clientMethod === 'repositorySymbol.findMany') {
    let results = Array.from(symbolStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((s) => s.repositoryId === args.where.repositoryId);
    if (args?.take) results = results.slice(0, args.take);
    return results;
  }
  if (clientMethod === 'repositorySymbol.count') {
    return symbolStore.size;
  }
  if (clientMethod === 'fileDependency.findMany') {
    let results = Array.from(depStore.values());
    if (args?.where?.repositoryId)
      results = results.filter((d) => d.repositoryId === args.where.repositoryId);
    if (args?.take) results = results.slice(0, args.take);
    return results;
  }
  if (clientMethod === 'fileDependency.count') {
    return depStore.size;
  }

  return null;
};

function seedTestData() {
  repositoryStore.set(REPO_ID_1, {
    id: REPO_ID_1,
    userId: USER_ID_1,
    githubId: 8001,
    name: 'forgemind-app',
    owner: 'testowner',
    fullName: 'testowner/forgemind-app',
    htmlUrl: 'https://github.com/testowner/forgemind-app',
    defaultBranch: 'main',
    private: true,
    description: 'Test Repository',
    language: 'TypeScript',
    stars: 10,
    forks: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const files = [
    { id: 'f1', path: 'apps/api/src/app.ts', language: 'typescript' },
    { id: 'f2', path: 'apps/api/src/services/auth.service.ts', language: 'typescript' },
    { id: 'f3', path: 'apps/api/src/services/graph-topology.service.ts', language: 'typescript' },
    { id: 'f4', path: 'packages/shared/src/utils.ts', language: 'typescript' },
  ];

  for (const f of files) {
    fileStore.set(f.id, {
      id: f.id,
      repositoryId: REPO_ID_1,
      path: f.path,
      name: f.path.split('/').pop() || f.path,
      extension: 'ts',
      type: 'file',
      size: 1200,
      sha: 'sha123',
      language: f.language,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const symbols = [
    {
      id: 's1',
      fileId: 'f1',
      filePath: 'apps/api/src/app.ts',
      name: 'createApp',
      kind: 'function',
    },
    {
      id: 's2',
      fileId: 'f2',
      filePath: 'apps/api/src/services/auth.service.ts',
      name: 'verifyUser',
      kind: 'function',
    },
    {
      id: 's3',
      fileId: 'f3',
      filePath: 'apps/api/src/services/graph-topology.service.ts',
      name: 'generateRepositoryGraphTopology',
      kind: 'function',
    },
  ];

  for (const s of symbols) {
    symbolStore.set(s.id, {
      id: s.id,
      repositoryId: REPO_ID_1,
      fileId: s.fileId,
      filePath: s.filePath,
      name: s.name,
      kind: s.kind,
      exported: true,
      startLine: 1,
      endLine: 25,
      createdAt: new Date(),
    });
  }

  const deps = [
    {
      id: 'd1',
      sourceFileId: 'f1',
      sourcePath: 'apps/api/src/app.ts',
      targetPath: 'apps/api/src/services/auth.service.ts',
      importedSymbols: ['verifyUser'],
      isExternal: false,
    },
    {
      id: 'd2',
      sourceFileId: 'f2',
      sourcePath: 'apps/api/src/services/auth.service.ts',
      targetPath: 'packages/shared/src/utils.ts',
      importedSymbols: ['formatString'],
      isExternal: false,
    },
    {
      id: 'd3',
      sourceFileId: 'f1',
      sourcePath: 'apps/api/src/app.ts',
      targetPath: 'express',
      importedSymbols: [],
      isExternal: true,
    },
  ];

  for (const d of deps) {
    depStore.set(d.id, {
      id: d.id,
      repositoryId: REPO_ID_1,
      sourceFileId: d.sourceFileId,
      sourcePath: d.sourcePath,
      targetPath: d.targetPath,
      importedSymbols: d.importedSymbols,
      isExternal: d.isExternal,
      createdAt: new Date(),
    });
  }
}

async function runGraphTopologyTests() {
  console.log('🧪 ForgeMind — Graph Topology Engine Integration Test Suite (Sprint 6)\n');

  resetStores();
  seedTestData();

  // Test 1: Basic Graph Topology Generation
  console.log('📋 Test 1: Basic Graph Topology Generation');
  const graph1 = await generateRepositoryGraphTopology(REPO_ID_1, USER_ID_1, { depth: 5 });
  assert(graph1.repositoryId === REPO_ID_1, 'Repository ID matches');
  assert(graph1.nodes.length > 0, 'Nodes generated');
  assert(graph1.edges.length > 0, 'Edges generated');
  assert(graph1.metrics.fileNodeCount === 4, '4 file nodes found');
  assert(graph1.metrics.symbolNodeCount === 3, '3 symbol nodes found');
  assert(graph1.metrics.packageNodeCount === 1, '1 external package node (express) found');
  console.log('  ✅ Test 1 PASS');

  // Test 2: Repository Ownership Enforcement
  console.log('📋 Test 2: Repository Ownership Enforcement');
  try {
    await generateRepositoryGraphTopology(REPO_ID_1, USER_ID_2);
    assert(false, 'Should throw error for unauthorized user');
  } catch (err: any) {
    assert(
      err.message.includes('Access denied') || err.message.includes('Ownership'),
      'Cross-user request rejected',
    );
  }
  console.log('  ✅ Test 2 PASS');

  // Test 3: Node Type Filtering
  console.log('📋 Test 3: Node Type Filtering (Files Only)');
  const graphFilesOnly = await generateRepositoryGraphTopology(REPO_ID_1, USER_ID_1, {
    nodeType: 'file',
  });
  assert(
    graphFilesOnly.nodes.every((n) => n.type === 'file'),
    'All nodes are of type file',
  );
  console.log('  ✅ Test 3 PASS');

  // Test 4: Search Filter Matching
  console.log('📋 Test 4: Search Filter Matching');
  const graphFiltered = await generateRepositoryGraphTopology(REPO_ID_1, USER_ID_1, {
    depth: 5,
    filter: 'graph-topology',
  });
  assert(
    graphFiltered.nodes.some((n) => n.label.includes('graph-topology')),
    'Filtered node present',
  );
  console.log('  ✅ Test 4 PASS');

  // Test 5: Node Limit Clamping
  console.log('📋 Test 5: Node Limit Clamping');
  const graphClamped = await generateRepositoryGraphTopology(REPO_ID_1, USER_ID_1, { limit: 3 });
  assert(graphClamped.nodes.length <= 3, 'Nodes clamped to limit 3');
  console.log('  ✅ Test 5 PASS');

  // Test 6: Circular Dependency Detection Algorithm
  console.log('📋 Test 6: Circular Dependency Detection Algorithm');
  const circularDeps = [
    { sourcePath: 'fileA.ts', targetPath: 'fileB.ts', isExternal: false },
    { sourcePath: 'fileB.ts', targetPath: 'fileC.ts', isExternal: false },
    { sourcePath: 'fileC.ts', targetPath: 'fileA.ts', isExternal: false },
  ];
  const detectedCycles = detectCircularDependencies(circularDeps);
  assert(detectedCycles.length === 1, 'Exactly 1 circular cycle detected');
  assert(detectedCycles[0]?.length === 3, 'Cycle length is 3');
  console.log('  ✅ Test 6 PASS');

  console.log('\n🎉 ALL SPRINT 6 GRAPH TOPOLOGY INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
}

runGraphTopologyTests().catch((err) => {
  console.error('\n❌ Graph Topology test suite failed:', err);
  process.exit(1);
});
