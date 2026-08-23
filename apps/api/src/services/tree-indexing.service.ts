// =============================================================================
// ForgeMind API — File Metadata & Tree Indexing Service
// =============================================================================

import type { RepositoryFile } from '@prisma/client';

import type { GithubTreeItem, IndexingResult } from '@forgemind/types';

import { prisma } from '../lib/prisma.js';

// ─── 1. Extension & Language Mapping ──────────────────────────────────────────

const LANGUAGE_EXTENSION_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  jsx: 'JSX',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  py: 'Python',
  pyw: 'Python',
  java: 'Java',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  hpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  cs: 'C#',
  go: 'Go',
  rs: 'Rust',
  php: 'PHP',
  rb: 'Ruby',
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  dockerfile: 'Docker',
  xml: 'XML',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  toml: 'TOML',
};

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: 'Docker',
  makefile: 'Makefile',
  jenkinsfile: 'Groovy',
};

/**
 * Extracts normalized lower-case extension from a filename or path.
 */
export function extractExtension(filename: string): string | null {
  const parts = filename.split('.');
  if (parts.length <= 1 || (parts.length === 2 && parts[0] === '')) {
    return null;
  }
  return parts[parts.length - 1]?.toLowerCase() ?? null;
}

/**
 * Classifies programming language based on file extension and filename.
 */
export function detectLanguage(filename: string, _path: string): string | null {
  const lowerName = filename.toLowerCase();

  if (SPECIAL_FILENAMES[lowerName]) {
    return SPECIAL_FILENAMES[lowerName] ?? null;
  }

  const ext = extractExtension(filename);
  if (!ext) return null;

  return LANGUAGE_EXTENSION_MAP[ext] ?? null;
}

// ─── 2. Ignore Rule Strategy ──────────────────────────────────────────────────

const DEFAULT_IGNORE_PATTERNS = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  'coverage/',
  '.next/',
  '.turbo/',
  'vendor/',
  '.cache/',
  'tmp/',
  '.ds_store',
];

/**
 * Checks whether a given relative repository file path should be ignored.
 */
export function isIgnoredPath(path: string, customIgnorePatterns: string[] = []): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const allPatterns = [...DEFAULT_IGNORE_PATTERNS, ...customIgnorePatterns];

  for (const pattern of allPatterns) {
    const cleanPattern = pattern.toLowerCase();
    if (cleanPattern.endsWith('/')) {
      const dirPrefix = cleanPattern;
      if (normalized.startsWith(dirPrefix) || normalized.includes(`/${dirPrefix}`)) {
        return true;
      }
    } else {
      if (
        normalized === cleanPattern ||
        normalized.endsWith(`/${cleanPattern}`) ||
        normalized.includes(`/${cleanPattern}/`)
      ) {
        return true;
      }
    }
  }

  return false;
}

// ─── 3. Tree Indexing Operations ──────────────────────────────────────────────

/**
 * Indexes repository tree items into the database idempotently.
 *
 * Scoped to the given repositoryId. Uses upsert on composite unique key [repositoryId, path]
 * to prevent duplicate records on re-indexing.
 *
 * @param repositoryId The database UUID of the repository.
 * @param treeItems List of tree items acquired from GitHub Git Trees API.
 */
export async function indexRepositoryTree(
  repositoryId: string,
  treeItems: GithubTreeItem[],
): Promise<IndexingResult> {
  let filesIndexed = 0;
  let ignoredItems = 0;
  const languageDistribution: Record<string, number> = {};

  for (const item of treeItems) {
    const itemPath = item.path;

    if (isIgnoredPath(itemPath)) {
      ignoredItems += 1;
      continue;
    }

    const filename = itemPath.split('/').pop() || itemPath;
    const isDirectory = item.type === 'tree';
    const fileType = isDirectory ? 'directory' : 'file';
    const extension = isDirectory ? null : extractExtension(filename);
    const language = isDirectory ? null : detectLanguage(filename, itemPath);

    if (language) {
      languageDistribution[language] = (languageDistribution[language] || 0) + 1;
    }

    await prisma.repositoryFile.upsert({
      where: {
        repositoryId_path: {
          repositoryId,
          path: itemPath,
        },
      },
      update: {
        name: filename,
        extension,
        language,
        type: fileType,
        size: item.size ?? null,
        sha: item.sha ?? null,
      },
      create: {
        repositoryId,
        path: itemPath,
        name: filename,
        extension,
        language,
        type: fileType,
        size: item.size ?? null,
        sha: item.sha ?? null,
      },
    });

    filesIndexed += 1;
  }

  return {
    totalItemsProcessed: treeItems.length,
    filesIndexed,
    ignoredItems,
    languageDistribution,
  };
}

/**
 * Lists indexed files for a repository with optional filtering.
 */
export async function findRepositoryFiles(
  repositoryId: string,
  options: { language?: string; limit?: number; offset?: number } = {},
): Promise<{ files: RepositoryFile[]; total: number }> {
  const where = {
    repositoryId,
    ...(options.language ? { language: options.language } : {}),
  };

  const [files, total] = await Promise.all([
    prisma.repositoryFile.findMany({
      where,
      orderBy: { path: 'asc' },
      take: options.limit,
      skip: options.offset,
    }),
    prisma.repositoryFile.count({ where }),
  ]);

  return { files, total };
}

/**
 * Finds a single indexed repository file by repository ID and path.
 */
export async function findRepositoryFileByPath(
  repositoryId: string,
  path: string,
): Promise<RepositoryFile | null> {
  return prisma.repositoryFile.findUnique({
    where: {
      repositoryId_path: {
        repositoryId,
        path,
      },
    },
  });
}
