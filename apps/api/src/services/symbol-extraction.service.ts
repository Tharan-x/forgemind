// =============================================================================
// ForgeMind API — Symbol & Dependency Extraction Database Service
// =============================================================================

import type { FileDependency, RepositorySymbol, Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

import { parseSourceFile } from './ast-parser.service.js';
import type { CodeSymbolInfo } from './code-chunker.service.js';

const prisma = new PrismaClient();

export interface SymbolExtractionSummary {
  symbolCount: number;
  dependencyCount: number;
  symbols: CodeSymbolInfo[];
}

/**
 * Extracts symbols and dependencies from a source file's content and persists them in the database.
 *
 * Idempotent per file: Removes existing symbols and dependencies for the file before inserting new ones.
 *
 * @param repositoryId Database UUID of the repository.
 * @param fileId Database UUID of the repository_files record.
 * @param filePath Relative path of the repository file.
 * @param content Raw file text content.
 * @param language Language classification (e.g., 'TypeScript', 'Python').
 */
export async function extractAndIndexFileSymbols(
  repositoryId: string,
  fileId: string,
  filePath: string,
  content: string,
  language: string | null,
): Promise<SymbolExtractionSummary> {
  const { symbols, dependencies } = parseSourceFile(content, language, filePath);

  // 1. Delete previous symbols and dependencies for this file
  await prisma.$transaction([
    prisma.repositorySymbol.deleteMany({ where: { fileId } }),
    prisma.fileDependency.deleteMany({ where: { sourceFileId: fileId } }),
  ]);

  // 2. Batch insert extracted symbols
  let symbolCount = 0;
  if (symbols.length > 0) {
    const symbolData: Prisma.RepositorySymbolCreateManyInput[] = symbols.map((sym) => ({
      repositoryId,
      fileId,
      name: sym.name,
      kind: sym.kind,
      filePath,
      startLine: sym.startLine,
      endLine: sym.endLine,
      exported: sym.exported,
    }));

    const result = await prisma.repositorySymbol.createMany({
      data: symbolData,
    });
    symbolCount = result.count;
  }

  // 3. Batch insert extracted file dependencies
  let dependencyCount = 0;
  if (dependencies.length > 0) {
    const dependencyData: Prisma.FileDependencyCreateManyInput[] = dependencies.map((dep) => ({
      repositoryId,
      sourceFileId: fileId,
      sourcePath: filePath,
      targetPath: dep.targetPath,
      isExternal: dep.isExternal,
      importedSymbols: dep.importedSymbols,
    }));

    const result = await prisma.fileDependency.createMany({
      data: dependencyData,
    });
    dependencyCount = result.count;
  }

  return {
    symbolCount,
    dependencyCount,
    symbols: symbols.map((s) => ({
      name: s.name,
      kind: s.kind,
      startLine: s.startLine,
      endLine: s.endLine,
    })),
  };
}

/**
 * Queries indexed symbols for a repository with optional filtering.
 */
export async function findRepositorySymbols(
  repositoryId: string,
  options: { kind?: string; query?: string; limit?: number; offset?: number } = {},
): Promise<{ symbols: RepositorySymbol[]; total: number }> {
  const where: Prisma.RepositorySymbolWhereInput = {
    repositoryId,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.query
      ? {
          name: {
            contains: options.query,
            mode: 'insensitive',
          },
        }
      : {}),
  };

  const [symbols, total] = await Promise.all([
    prisma.repositorySymbol.findMany({
      where,
      orderBy: { name: 'asc' },
      take: options.limit,
      skip: options.offset,
    }),
    prisma.repositorySymbol.count({ where }),
  ]);

  return { symbols, total };
}

/**
 * Queries file dependencies for a repository with optional filtering.
 */
export async function findRepositoryDependencies(
  repositoryId: string,
  options: { isExternal?: boolean; limit?: number; offset?: number } = {},
): Promise<{ dependencies: FileDependency[]; total: number }> {
  const where: Prisma.FileDependencyWhereInput = {
    repositoryId,
    ...(options.isExternal !== undefined ? { isExternal: options.isExternal } : {}),
  };

  const [dependencies, total] = await Promise.all([
    prisma.fileDependency.findMany({
      where,
      orderBy: { sourcePath: 'asc' },
      take: options.limit,
      skip: options.offset,
    }),
    prisma.fileDependency.count({ where }),
  ]);

  return { dependencies, total };
}
