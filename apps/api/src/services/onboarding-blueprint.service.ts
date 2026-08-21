// =============================================================================
// ForgeMind API — Automated Onboarding Blueprint & Guided Tour Service
// =============================================================================
//
// Synthesizes deep AST indices, file structure, dependencies, and RAG context
// to generate an interactive, step-by-step onboarding walkthrough blueprint
// tailored for newly onboarded developers.
// =============================================================================

import type {
  BlueprintEntryPoint,
  BlueprintQuickstart,
  BlueprintSection,
  BlueprintTourStep,
  OnboardingBlueprint,
} from '@forgemind/types';

import { findRepositoryById } from './repository.service.js';
import { findRepositoryDependencies, findRepositorySymbols } from './symbol-extraction.service.js';
import { findRepositoryFiles } from './tree-indexing.service.js';
import { getLLMProvider } from './llm/factory.js';

/**
 * Verifies repository existence and user ownership.
 */
async function assertRepositoryOwnership(repositoryId: string, userId: string): Promise<void> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }
  if (repo.userId !== userId) {
    throw new Error(`Access denied for repository: ${repositoryId}`);
  }
}

/**
 * Detects key entry points in the repository based on file paths and conventions.
 */
function detectEntryPoints(files: Array<{ path: string; name: string }>): BlueprintEntryPoint[] {
  const entryPoints: BlueprintEntryPoint[] = [];

  const patterns = [
    {
      regex: /(^|\/)index\.(ts|tsx|js|jsx)$/i,
      name: 'Application Index',
      type: 'entry_point' as const,
      desc: 'Main application export and bootstrap entry point.',
    },
    {
      regex: /(^|\/)main\.(ts|tsx|js|jsx)$/i,
      name: 'Main Entry Point',
      type: 'entry_point' as const,
      desc: 'Primary runtime initialization and server bootstrap.',
    },
    {
      regex: /(^|\/)server\.(ts|js)$/i,
      name: 'Server Entry Point',
      type: 'entry_point' as const,
      desc: 'Backend HTTP server listener and middleware initialization.',
    },
    {
      regex: /(^|\/)app\/page\.(tsx|jsx|ts|js)$/i,
      name: 'Web App Root Page',
      type: 'entry_point' as const,
      desc: 'Next.js App Router root landing page component.',
    },
    {
      regex: /schema\.prisma$/i,
      name: 'Database Schema',
      type: 'schema' as const,
      desc: 'Prisma ORM data models, relationships, and PostgreSQL schema definitions.',
    },
    {
      regex: /package\.json$/i,
      name: 'Package Manifest',
      type: 'configuration' as const,
      desc: 'Project metadata, npm dependencies, and workspace script definitions.',
    },
    {
      regex: /(docker-compose\.yml|Dockerfile)$/i,
      name: 'Container Configuration',
      type: 'configuration' as const,
      desc: 'Docker infrastructure runtime stack and container configuration.',
    },
    {
      regex: /(^|\/)routes?\/(index|repository\.routes)\.(ts|js)$/i,
      name: 'API Router',
      type: 'core_logic' as const,
      desc: 'Central REST API endpoint router definitions and controller bindings.',
    },
  ];

  for (const p of patterns) {
    const matched = files.find((f) => p.regex.test(f.path));
    if (matched) {
      entryPoints.push({
        path: matched.path,
        name: p.name,
        type: p.type,
        description: p.desc,
      });
    }
  }

  // Fallback if no specific entry points detected
  if (entryPoints.length === 0 && files.length > 0 && files[0]) {
    entryPoints.push({
      path: files[0].path,
      name: files[0].name,
      type: 'entry_point',
      description: 'Primary repository source file.',
    });
  }

  return entryPoints;
}

/**
 * Categorizes files into architectural sections.
 */
function categorizeArchitecturalSections(files: Array<{ path: string }>): BlueprintSection[] {
  const sections = {
    frontend: [] as string[],
    api: [] as string[],
    domain_logic: [] as string[],
    data_layer: [] as string[],
    configuration: [] as string[],
  };

  for (const f of files) {
    const p = f.path.toLowerCase();
    if (
      p.includes('web') ||
      p.includes('app/') ||
      p.includes('components') ||
      p.includes('pages')
    ) {
      sections.frontend.push(f.path);
    } else if (p.includes('routes') || p.includes('controllers') || p.includes('handlers')) {
      sections.api.push(f.path);
    } else if (
      p.includes('prisma') ||
      p.includes('db') ||
      p.includes('models') ||
      p.includes('schema')
    ) {
      sections.data_layer.push(f.path);
    } else if (
      p.endsWith('.json') ||
      p.endsWith('.yml') ||
      p.endsWith('.yaml') ||
      p.endsWith('.config.ts') ||
      p.includes('.env')
    ) {
      sections.configuration.push(f.path);
    } else {
      sections.domain_logic.push(f.path);
    }
  }

  const result: BlueprintSection[] = [];

  if (sections.frontend.length > 0) {
    result.push({
      title: 'Frontend Presentation & Application UI',
      category: 'frontend',
      files: sections.frontend.slice(0, 10),
      summary: 'React/Next.js pages, user interface components, routing guards, and client state.',
    });
  }

  if (sections.api.length > 0) {
    result.push({
      title: 'REST API & Controller HTTP Gateway',
      category: 'api',
      files: sections.api.slice(0, 10),
      summary:
        'Express router endpoints, request validation, authentication guards, and response handlers.',
    });
  }

  if (sections.domain_logic.length > 0) {
    result.push({
      title: 'Domain Services & Core Business Logic',
      category: 'domain_logic',
      files: sections.domain_logic.slice(0, 10),
      summary:
        'Core intelligence services, AST parsers, RAG retrieval pipelines, and graph engines.',
    });
  }

  if (sections.data_layer.length > 0) {
    result.push({
      title: 'Data Layer & Persistence Models',
      category: 'data_layer',
      files: sections.data_layer.slice(0, 10),
      summary: 'Database ORM schemas, vector chunk indices, and database transaction utilities.',
    });
  }

  if (sections.configuration.length > 0) {
    result.push({
      title: 'Environment & Build Configuration',
      category: 'configuration',
      files: sections.configuration.slice(0, 10),
      summary:
        'Workspace package manifests, build pipeline configs, and environment variable specifications.',
    });
  }

  return result;
}

/**
 * Builds a 5-step guided code tour.
 */
function buildGuidedTour(
  entryPoints: BlueprintEntryPoint[],
  files: Array<{ path: string }>,
  symbols: Array<{ name: string; filePath: string; kind: string }>,
): BlueprintTourStep[] {
  const tour: BlueprintTourStep[] = [];

  // Step 1: Application Entry & Setup
  const firstEntry = entryPoints[0]?.path || files[0]?.path || 'package.json';
  tour.push({
    stepNumber: 1,
    title: 'Application Bootstrap & Entry Points',
    targetFile: firstEntry,
    description:
      'Inspect the primary bootstrap file to understand initialization routines, server configuration, and environment setup.',
    keyTakeaway:
      'Always verify environment variables and dependency setup before initiating local development.',
  });

  // Step 2: Database Schema & Data Models
  const schemaFile =
    files.find((f) => f.path.includes('schema.prisma') || f.path.includes('models'))?.path ||
    'prisma/schema.prisma';
  tour.push({
    stepNumber: 2,
    title: 'Data Layer & Schema Architecture',
    targetFile: schemaFile,
    description:
      'Review the persistence model definitions to grasp entity relationships, primary keys, and index configurations.',
    keyTakeaway:
      'Data models enforce strict tenant isolation and relational constraints across all services.',
  });

  // Step 3: API Gateway & HTTP Routing
  const routerFile =
    files.find((f) => f.path.includes('routes') || f.path.includes('controller'))?.path ||
    'src/routes/index.ts';
  tour.push({
    stepNumber: 3,
    title: 'REST API Routes & Controller Handlers',
    targetFile: routerFile,
    description:
      'Examine API route definitions to trace incoming HTTP requests from middleware authentication guards to controller handlers.',
    keyTakeaway:
      'All endpoints enforce authentication and rate limiting to maintain service integrity.',
  });

  // Step 4: Business Services & Core Engines
  const serviceSymbol = symbols.find(
    (s) => s.kind.toLowerCase() === 'function' || s.kind.toLowerCase() === 'class',
  );
  const serviceFile =
    serviceSymbol?.filePath ||
    files.find((f) => f.path.includes('service'))?.path ||
    'src/services/index.ts';
  tour.push({
    stepNumber: 4,
    title: 'Core Business Services & Logic Engine',
    targetFile: serviceFile,
    symbolName: serviceSymbol?.name,
    description:
      'Dive into core business services where data transformations, AI reasoning, and graph algorithms operate.',
    keyTakeaway:
      'Business logic is encapsulated in modular services decoupled from HTTP controllers.',
  });

  // Step 5: Frontend Experience & UI Components
  const uiFile =
    files.find(
      (f) =>
        f.path.includes('page.tsx') || f.path.includes('App.tsx') || f.path.includes('components'),
    )?.path || 'apps/web/src/app/page.tsx';
  tour.push({
    stepNumber: 5,
    title: 'Frontend Presentation & UI Integration',
    targetFile: uiFile,
    description:
      'Explore the user interface layer to see how React context guards, dashboard widgets, and visualizations connect to backend APIs.',
    keyTakeaway: 'Client state management integrates toast feedback and clean layout boundaries.',
  });

  return tour;
}

/**
 * Builds developer quickstart commands and prerequisites.
 */
function buildQuickstart(files: Array<{ path: string }>): BlueprintQuickstart {
  const hasDocker = files.some(
    (f) => f.path.includes('docker-compose.yml') || f.path.includes('Dockerfile'),
  );
  const hasPnpm = files.some(
    (f) => f.path.includes('pnpm-workspace.yaml') || f.path.includes('pnpm-lock.yaml'),
  );

  const packageManager = hasPnpm ? 'pnpm' : 'npm';

  const setupCommands = [
    `git clone <repository-url>`,
    `${packageManager} install`,
    `cp .env.example .env`,
  ];

  if (files.some((f) => f.path.includes('prisma'))) {
    setupCommands.push(`${packageManager} db:generate`);
  }

  setupCommands.push(`${packageManager} dev`);

  const prerequisites = ['Node.js 20.x or higher', `${packageManager} package manager`].concat(
    hasDocker ? ['Docker 24.x & Docker Compose'] : [],
  );

  return {
    prerequisites,
    setupCommands,
    keyEnvironmentVars: [
      'DATABASE_URL',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_API_URL',
    ],
    devServerCommand: `${packageManager} dev`,
  };
}

/**
 * Generates an automated onboarding blueprint for a given repository.
 */
export async function generateOnboardingBlueprint(
  repositoryId: string,
  userId: string,
): Promise<OnboardingBlueprint> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);

  // Fetch repository metadata
  const filesResult = await findRepositoryFiles(repositoryId, { limit: 200 });
  const symbolsResult = await findRepositorySymbols(repositoryId, { limit: 100 });
  await findRepositoryDependencies(repositoryId, { limit: 100 });

  const files = filesResult.files.map((f) => ({ path: f.path, name: f.name }));
  const symbols = symbolsResult.symbols.map((s) => ({
    name: s.name,
    filePath: s.filePath,
    kind: s.kind,
  }));

  const entryPoints = detectEntryPoints(files);
  const sections = categorizeArchitecturalSections(files);
  const guidedTour = buildGuidedTour(entryPoints, files, symbols);
  const quickstart = buildQuickstart(files);

  // Generate high-level summary narrative via LLM or deterministic fallback
  let summary = `Welcome to **${repo?.name || 'this repository'}**! This repository is organized as a ${files.length > 50 ? 'multi-package modular' : 'streamlined'} application containing ${files.length} indexed source files, ${symbols.length} code symbols, and ${sections.length} main architectural layers. Follow this 5-step guided tour to quickly onboard into the codebase and run your local environment.`;

  let providerUsed = 'deterministic-ast-analysis';

  try {
    const llmProvider = getLLMProvider();
    const prompt = `Provide a 2-paragraph professional onboarding overview for the GitHub repository "${repo?.fullName || repo?.name}". Key files include: ${entryPoints.map((e) => e.path).join(', ')}. Language: ${repo?.language || 'TypeScript'}.`;
    const aiSummary = await llmProvider.generateAnswer(
      'You are a senior staff software engineer writing onboarding documentation for new developers.',
      prompt,
    );
    if (aiSummary && aiSummary.trim().length > 50) {
      summary = aiSummary.trim();
      providerUsed = llmProvider.name;
    }
  } catch {
    // Graceful fallback to deterministic summary
  }

  return {
    repositoryId,
    repositoryName: repo?.name || 'repository',
    generatedAt: new Date().toISOString(),
    summary,
    entryPoints,
    guidedTour,
    architecturalSections: sections,
    quickstart,
    providerUsed,
  };
}
