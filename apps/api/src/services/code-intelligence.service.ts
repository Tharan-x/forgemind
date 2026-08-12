// =============================================================================
// ForgeMind API — Code Intelligence & Explainability Service
// =============================================================================
//
// Provides structured code understanding on top of existing indexed data:
//  • File/symbol explanation via RAG pipeline
//  • Dependency intelligence (imports / imported-by)
//  • Impact analysis (affected files & symbols)
//  • Architecture overview (language distribution, directories, packages)
//
// IMPORTANT: This service ONLY uses existing indexed data and existing services.
// It does NOT introduce new database models, duplicate RAG logic, or bypass auth.
// =============================================================================

import { PrismaClient } from '@prisma/client';
import type {
  ArchitectureOverviewResponse,
  CodeExplainRequest,
  CodeExplainResponse,
  FileDependencyIntelligence,
  ImpactAnalysisResult,
} from '@forgemind/types';

import { findRepositoryById } from './repository.service.js';
import { findRepositorySymbols, findRepositoryDependencies } from './symbol-extraction.service.js';
import { findRepositoryFiles } from './tree-indexing.service.js';
import { retrieveRepositoryContext } from './context-retrieval.service.js';
import { getLLMProvider } from './llm/factory.js';
import { buildRAGPrompt } from './rag-prompt.service.js';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Verifies repository existence and user ownership.
 * Throws with descriptive message if checks fail.
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

// ---------------------------------------------------------------------------
// 1. Code Explanation
// ---------------------------------------------------------------------------

/**
 * Explains a file or specific symbol using RAG over existing indexed code chunks.
 * Returns a structured AI explanation with source citations and related symbols.
 */
export async function explainCode(
  repositoryId: string,
  userId: string,
  request: CodeExplainRequest,
): Promise<CodeExplainResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const { filePath, symbolName, symbolKind } = request;

  // 1a. Find related symbols from AST index for this file
  const symbolsResult = await findRepositorySymbols(repositoryId, { limit: 50 });
  const fileSymbols = symbolsResult.symbols.filter((s) => s.filePath === filePath);

  // 1b. Determine target symbol metadata
  const targetSymbol = symbolName
    ? fileSymbols.find(
        (s) =>
          s.name === symbolName &&
          (!symbolKind || s.kind.toLowerCase() === symbolKind.toLowerCase()),
      )
    : undefined;

  // 1c. Build a precise retrieval query
  const query = symbolName
    ? `Explain the ${symbolKind || 'code'} "${symbolName}" in ${filePath}`
    : `Explain the purpose and architecture of the file ${filePath}`;

  // 1d. Retrieve relevant code chunks (RAG retrieval)
  const contextChunks = await retrieveRepositoryContext(repositoryId, userId, query, {
    topK: 6,
    threshold: 0.0,
  });

  // 1e. Build injection-resistant prompt and call LLM
  const { systemPrompt, userPrompt } = buildRAGPrompt(contextChunks, query);
  const llmProvider = getLLMProvider();

  let explanation = '';
  try {
    explanation = await llmProvider.generateAnswer(systemPrompt, userPrompt);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Intelligence] LLM explanation warning:', err);
    explanation = `Context retrieved from ${filePath}. LLM generation unavailable — check provider configuration.`;
  }

  // 1f. Format citations
  const sources = contextChunks.map((chunk) => ({
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
    filePath,
    symbolName: targetSymbol?.name || symbolName,
    symbolKind: targetSymbol?.kind || symbolKind,
    startLine: targetSymbol?.startLine ?? undefined,
    endLine: targetSymbol?.endLine ?? undefined,
    explanation,
    sources,
    relatedSymbols: fileSymbols.slice(0, 20).map((s) => ({
      id: s.id,
      repositoryId: s.repositoryId,
      fileId: s.fileId,
      name: s.name,
      kind: s.kind,
      filePath: s.filePath,
      startLine: s.startLine,
      endLine: s.endLine,
      exported: s.exported,
      createdAt: s.createdAt.toISOString(),
    })),
    providerUsed: llmProvider.name,
  };
}

// ---------------------------------------------------------------------------
// 2. Dependency Intelligence
// ---------------------------------------------------------------------------

/**
 * Returns structured dependency information for a specific file:
 * — files it imports from (outgoing)
 * — files that import it (incoming)
 * — internal vs external counts
 */
export async function getFileDependencyIntelligence(
  repositoryId: string,
  userId: string,
  filePath: string,
): Promise<FileDependencyIntelligence> {
  await assertRepositoryOwnership(repositoryId, userId);

  // Outgoing: this file imports these
  const outgoing = await prisma.fileDependency.findMany({
    where: { repositoryId, sourcePath: filePath },
    orderBy: { targetPath: 'asc' },
  });

  // Incoming: these files import this file
  // We match on targetPath containing the filePath (handles relative imports)
  const incoming = await prisma.fileDependency.findMany({
    where: {
      repositoryId,
      targetPath: {
        contains: filePath.replace(/^\.\//, '').replace(/\.[^.]+$/, ''),
        mode: 'insensitive',
      },
    },
    orderBy: { sourcePath: 'asc' },
    take: 100,
  });

  const internalCount = outgoing.filter((d) => !d.isExternal).length;
  const externalCount = outgoing.filter((d) => d.isExternal).length;

  return {
    filePath,
    imports: outgoing.map((d) => ({
      id: d.id,
      repositoryId: d.repositoryId,
      sourceFileId: d.sourceFileId,
      sourcePath: d.sourcePath,
      targetPath: d.targetPath,
      isExternal: d.isExternal,
      importedSymbols: d.importedSymbols,
      createdAt: d.createdAt.toISOString(),
    })),
    importedBy: incoming.map((d) => ({
      id: d.id,
      repositoryId: d.repositoryId,
      sourceFileId: d.sourceFileId,
      sourcePath: d.sourcePath,
      targetPath: d.targetPath,
      isExternal: d.isExternal,
      importedSymbols: d.importedSymbols,
      createdAt: d.createdAt.toISOString(),
    })),
    internalCount,
    externalCount,
  };
}

// ---------------------------------------------------------------------------
// 3. Impact Analysis
// ---------------------------------------------------------------------------

/**
 * Determines the blast radius of changing a file or symbol.
 * Uses existing dependency and symbol data; optionally uses RAG for explanation.
 */
export async function analyzeImpact(
  repositoryId: string,
  userId: string,
  filePath: string,
  symbolName?: string,
  includeExplanation = false,
): Promise<ImpactAnalysisResult> {
  await assertRepositoryOwnership(repositoryId, userId);

  // Files that directly depend on this file
  const allDependencies = await prisma.fileDependency.findMany({
    where: {
      repositoryId,
      targetPath: {
        contains: filePath.replace(/^\.\//, '').replace(/\.[^.]+$/, ''),
        mode: 'insensitive',
      },
    },
    orderBy: { sourcePath: 'asc' },
    take: 200,
  });

  // Symbols defined in the target file (affected symbols)
  const symbolsInFile = await prisma.repositorySymbol.findMany({
    where: {
      repositoryId,
      filePath: { contains: filePath, mode: 'insensitive' },
    },
    orderBy: { startLine: 'asc' },
  });

  const affectedSymbols = symbolsInFile.map((s) => ({
    id: s.id,
    repositoryId: s.repositoryId,
    fileId: s.fileId,
    name: s.name,
    kind: s.kind,
    filePath: s.filePath,
    startLine: s.startLine,
    endLine: s.endLine,
    exported: s.exported,
    createdAt: s.createdAt.toISOString(),
  }));

  const directDependents = allDependencies.map((d) => ({
    id: d.id,
    repositoryId: d.repositoryId,
    sourceFileId: d.sourceFileId,
    sourcePath: d.sourcePath,
    targetPath: d.targetPath,
    isExternal: d.isExternal,
    importedSymbols: d.importedSymbols,
    createdAt: d.createdAt.toISOString(),
  }));

  let explanation: string | undefined;
  let sources: ImpactAnalysisResult['sources'];
  let ragExplanationUsed = false;

  if (includeExplanation) {
    const query = symbolName
      ? `What is the impact of changing "${symbolName}" in ${filePath}?`
      : `What files depend on ${filePath} and what is the impact of modifying it?`;

    try {
      const contextChunks = await retrieveRepositoryContext(repositoryId, userId, query, {
        topK: 5,
        threshold: 0.0,
      });
      const { systemPrompt, userPrompt } = buildRAGPrompt(contextChunks, query);
      const llm = getLLMProvider();
      explanation = await llm.generateAnswer(systemPrompt, userPrompt);
      sources = contextChunks.map((c) => ({
        filePath: c.filePath,
        startLine: c.startLine,
        endLine: c.endLine,
        score: c.similarity,
        symbolName:
          typeof c.metadata?.['symbolName'] === 'string' ? c.metadata['symbolName'] : undefined,
        symbolKind:
          typeof c.metadata?.['symbolKind'] === 'string' ? c.metadata['symbolKind'] : undefined,
        language: c.language,
      }));
      ragExplanationUsed = true;
    } catch {
      explanation = undefined;
      ragExplanationUsed = false;
    }
  }

  return {
    targetFilePath: filePath,
    targetSymbolName: symbolName,
    directDependents,
    affectedSymbols,
    totalAffected: directDependents.length,
    ragExplanationUsed,
    explanation,
    sources,
  };
}

// ---------------------------------------------------------------------------
// 4. Architecture Overview
// ---------------------------------------------------------------------------

/**
 * Generates a structured architecture overview of the repository using only indexed data.
 * Does NOT invoke any LLM — returns pure structured metrics.
 */
export async function getArchitectureOverview(
  repositoryId: string,
  userId: string,
): Promise<ArchitectureOverviewResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const repo = await findRepositoryById(repositoryId);
  if (!repo) throw new Error(`Repository not found: ${repositoryId}`);

  // Fetch all data needed in parallel
  const [filesResult, symbolsResult, depsResult] = await Promise.all([
    findRepositoryFiles(repositoryId, { limit: 5000 }),
    findRepositorySymbols(repositoryId, { limit: 5000 }),
    findRepositoryDependencies(repositoryId, { limit: 5000 }),
  ]);

  const files = filesResult.files;
  const symbols = symbolsResult.symbols;
  const deps = depsResult.dependencies;

  // Language distribution
  const languageDistribution: Record<string, number> = {};
  for (const f of files) {
    if (f.language) {
      languageDistribution[f.language] = (languageDistribution[f.language] ?? 0) + 1;
    }
  }

  // Symbol kind distribution
  const symbolKindDistribution: Record<string, number> = {};
  for (const s of symbols) {
    symbolKindDistribution[s.kind] = (symbolKindDistribution[s.kind] ?? 0) + 1;
  }

  // Top-level directories
  const dirCounts: Record<string, number> = {};
  for (const f of files) {
    const parts = f.path.split('/');
    const topDir = parts.length > 1 ? parts[0] : '.';
    if (topDir) {
      dirCounts[topDir] = (dirCounts[topDir] ?? 0) + 1;
    }
  }
  const topDirectories = Object.entries(dirCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([directory, fileCount]) => ({ directory, fileCount }));

  // External package frequency
  const extPackageCounts: Record<string, number> = {};
  const internalDeps = deps.filter((d) => !d.isExternal);
  const externalDeps = deps.filter((d) => d.isExternal);

  for (const dep of externalDeps) {
    // Normalise package name: strip deep paths like 'lodash/get' → 'lodash'
    const rawTarget = dep.targetPath;
    const pkgName = rawTarget.startsWith('@')
      ? rawTarget.split('/').slice(0, 2).join('/')
      : (rawTarget.split('/')[0] ?? rawTarget);
    if (pkgName) {
      extPackageCounts[pkgName] = (extPackageCounts[pkgName] ?? 0) + 1;
    }
  }
  const topExternalPackages = Object.entries(extPackageCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([pkg, count]) => ({ package: pkg, count }));

  return {
    repositoryId,
    repositoryName: repo.fullName,
    languageDistribution,
    totalFiles: filesResult.total,
    totalSymbols: symbolsResult.total,
    totalDependencies: depsResult.total,
    internalDependencyCount: internalDeps.length,
    externalDependencyCount: externalDeps.length,
    topDirectories,
    topExternalPackages,
    symbolKindDistribution,
  };
}
