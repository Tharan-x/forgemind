// =============================================================================
// ForgeMind API — Automated Onboarding Blueprint & Guided Tour Service
// =============================================================================
//
// Synthesizes deep AST indices, file structure, dependencies, and RAG context
// to generate an interactive, step-by-step onboarding walkthrough blueprint
// tailored for newly onboarded developers.
// =============================================================================

import crypto from 'node:crypto';

import type {
  BlueprintEntryPoint,
  BlueprintQuickstart,
  BlueprintSection,
  BlueprintShareRequest,
  BlueprintShareResponse,
  BlueprintStepQARequest,
  BlueprintStepQAResponse,
  BlueprintTourStep,
  OnboardingBlueprint,
  RAGSourceCitation,
  SharedBlueprintView,
} from '@forgemind/types';

import { retrieveRepositoryContext } from './context-retrieval.service.js';
import { getLLMProvider } from './llm/factory.js';
import { buildRAGPrompt } from './rag-prompt.service.js';
import { findRepositoryById } from './repository.service.js';
import { findRepositoryDependencies, findRepositorySymbols } from './symbol-extraction.service.js';
import { findRepositoryFiles } from './tree-indexing.service.js';

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

/**
 * Answers a developer's question grounded in a specific onboarding tour step and target file.
 */
export async function askOnboardingStepQuestion(
  repositoryId: string,
  userId: string,
  request: BlueprintStepQARequest,
): Promise<BlueprintStepQAResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const { stepNumber, targetFile, query, symbolName } = request;

  if (typeof stepNumber !== 'number' || stepNumber < 1 || stepNumber > 10) {
    throw new Error('Invalid step number');
  }

  if (
    !targetFile ||
    typeof targetFile !== 'string' ||
    targetFile.trim().length === 0 ||
    targetFile.length > 500
  ) {
    throw new Error('Invalid target file path');
  }

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query is required');
  }

  if (query.length > 2000) {
    throw new Error('Query exceeds maximum length of 2000 characters');
  }

  if (symbolName && (typeof symbolName !== 'string' || symbolName.length > 200)) {
    throw new Error('Invalid symbol name');
  }

  const retrievalQuery = symbolName
    ? `${query} regarding symbol "${symbolName}" in file ${targetFile}`
    : `${query} regarding file ${targetFile}`;

  const contextChunks = await retrieveRepositoryContext(repositoryId, userId, retrievalQuery, {
    topK: 6,
    threshold: 0.0,
  });

  const promptQuery = `[Onboarding Step ${stepNumber}: File ${targetFile}${symbolName ? `, Symbol ${symbolName}` : ''}]\nDeveloper Question: ${query}`;
  const { systemPrompt, userPrompt } = buildRAGPrompt(contextChunks, promptQuery);

  const llmProvider = getLLMProvider();
  let answer = '';
  let providerUsed = llmProvider.name;

  try {
    answer = await llmProvider.generateAnswer(systemPrompt, userPrompt);
  } catch {
    providerUsed = 'deterministic-ast-analysis';
    answer = `Step ${stepNumber} (${targetFile}) context retrieved successfully. LLM generation is currently unavailable — please inspect ${targetFile}${symbolName ? ` symbol "${symbolName}"` : ''} directly for detailed source logic.`;
  }

  const sources: RAGSourceCitation[] = contextChunks.map((chunk) => ({
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    score: chunk.similarity,
    symbolName:
      typeof chunk.metadata?.['symbolName'] === 'string' ? chunk.metadata['symbolName'] : undefined,
    symbolKind:
      typeof chunk.metadata?.['symbolKind'] === 'string' ? chunk.metadata['symbolKind'] : undefined,
    language: chunk.language,
    content: chunk.content,
  }));

  return {
    stepNumber,
    targetFile,
    query,
    answer,
    sources,
    providerUsed,
  };
}

// =============================================================================
// Sprint 7 Task 3 — Onboarding Blueprint Share Engine
// =============================================================================

interface ShareTokenPayload {
  repositoryId: string;
  repositoryName: string;
  expiresAt: string;
  includeQAHistory: boolean;
  customNotes: string;
}

function getHmacKey(): string {
  const secret = process.env['ENCRYPTION_SECRET'];
  if (!secret) {
    if (process.env['NODE_ENV'] === 'test') {
      return 'forgemind-test-secret-key-for-hmac-signing';
    }
    throw new Error('ENCRYPTION_SECRET environment variable is required for share token signing.');
  }
  return secret;
}

function signPayload(payload: string): string {
  return crypto.createHmac('sha256', getHmacKey()).update(payload).digest('hex');
}

/**
 * Creates a stateless HMAC-SHA256 signed share token for an onboarding blueprint.
 * No database writes — token encodes payload + signature as base64url.
 */
export async function createBlueprintShareToken(
  repositoryId: string,
  userId: string,
  request: BlueprintShareRequest,
): Promise<BlueprintShareResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) throw new Error(`Repository not found: ${repositoryId}`);

  const expiresInDays = Math.min(Math.max(request.expiresInDays ?? 7, 1), 30);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const customNotes = (request.customNotes ?? '').substring(0, 2000);
  const includeQAHistory = request.includeQAHistory ?? false;

  const payload: ShareTokenPayload = {
    repositoryId,
    repositoryName: repo.name,
    expiresAt,
    includeQAHistory,
    customNotes,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadJson).toString('base64url');
  const signature = signPayload(payloadB64);
  const shareToken = `${payloadB64}.${signature}`;

  const apiBase = process.env['API_PUBLIC_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? '';
  const shareUrl = `${apiBase}/api/v1/onboarding/share/${encodeURIComponent(shareToken)}`;

  return { shareToken, shareUrl, expiresAt };
}

/**
 * Resolves and verifies a share token, generating a sanitised SharedBlueprintView.
 * Raises an error if the token is invalid, expired, or tampered.
 */
export async function resolveSharedBlueprint(
  shareToken: string,
  qaThreadsFromClient?: Record<number, Array<{ query: string; answer: string; timestamp: string }>>,
): Promise<SharedBlueprintView> {
  const dotIndex = shareToken.lastIndexOf('.');
  if (dotIndex === -1) {
    throw new Error('Invalid share token format.');
  }

  const payloadB64 = shareToken.substring(0, dotIndex);
  const receivedSignature = shareToken.substring(dotIndex + 1);

  const expectedSignature = signPayload(payloadB64);
  if (
    !crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    )
  ) {
    throw new Error('Share token signature verification failed.');
  }

  let payload: ShareTokenPayload;
  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    payload = JSON.parse(payloadJson) as ShareTokenPayload;
  } catch {
    throw new Error('Share token payload is malformed.');
  }

  if (new Date(payload.expiresAt) < new Date()) {
    throw new Error('Share token has expired.');
  }

  const repo = await findRepositoryById(payload.repositoryId);
  if (!repo) {
    throw new Error('Repository no longer exists.');
  }

  // Generate a fresh blueprint — repository ownership is embedded in the signed token,
  // no userId available on public share access.
  const blueprint = await generateOnboardingBlueprint(payload.repositoryId, repo.userId);

  // Strip repositoryId from returned view (internal UUID not needed by consumers)
  const view: SharedBlueprintView = {
    repositoryName: blueprint.repositoryName,
    generatedAt: blueprint.generatedAt,
    expiresAt: payload.expiresAt,
    summary: blueprint.summary,
    entryPoints: blueprint.entryPoints,
    guidedTour: blueprint.guidedTour,
    architecturalSections: blueprint.architecturalSections,
    quickstart: {
      prerequisites: blueprint.quickstart.prerequisites,
      setupCommands: blueprint.quickstart.setupCommands,
      // Strip environment variable values — expose only names for team safety
      keyEnvironmentVars: blueprint.quickstart.keyEnvironmentVars.map((v) => {
        const key = v.includes('=') ? (v.split('=')[0] ?? v) : v;
        return `${key}=<REDACTED>`;
      }),
      devServerCommand: blueprint.quickstart.devServerCommand,
    },
  };

  if (payload.customNotes) {
    view.customNotes = payload.customNotes;
  }

  if (payload.includeQAHistory && qaThreadsFromClient) {
    // Accept Q&A threads from the client-supplied body only if the token permits it.
    // Never re-run LLM on behalf of the share viewer.
    view.qaThreads = qaThreadsFromClient;
  }

  return view;
}
