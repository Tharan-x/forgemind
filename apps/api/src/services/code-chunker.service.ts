// =============================================================================
// ForgeMind API — Source Code Chunking Strategy & Service
// =============================================================================

import { createHash } from 'node:crypto';
import type { CodeChunkMetadata } from '@forgemind/types';

export interface CodeSymbolInfo {
  name: string;
  kind: string;
  startLine?: number | null;
  endLine?: number | null;
}

export interface GeneratedChunk {
  chunkIndex: number;
  content: string;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  checksum: string;
  metadata: CodeChunkMetadata;
}

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB limit for semantic chunking
const MAX_FILE_LINES = 3000;
const TARGET_CHUNK_LINES = 40;
const OVERLAP_LINES = 10;
const MIN_CHUNK_CHARS = 30;

const IGNORED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'ico',
  'svg',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'zip',
  'tar',
  'gz',
  'pdf',
  'exe',
  'bin',
  'lock',
  'map',
]);

/**
 * Computes a SHA-256 checksum hash for chunk content and metadata uniqueness.
 */
export function computeChunkChecksum(content: string, filePath: string, startLine: number): string {
  return createHash('sha256').update(`${filePath}:${startLine}:${content.trim()}`).digest('hex');
}

/**
 * Estimates token count from content length (~4 characters per token heuristic).
 */
export function estimateTokenCount(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

/**
 * Checks if a file path or extension should be skipped for chunking.
 */
export function isUnsupportedFile(filePath: string, size?: number | null): boolean {
  if (size && size > MAX_FILE_SIZE_BYTES) return true;

  const parts = filePath.split('.');
  if (parts.length > 1) {
    const ext = parts[parts.length - 1]?.toLowerCase();
    if (ext && IGNORED_EXTENSIONS.has(ext)) return true;
  }

  if (filePath.endsWith('.min.js') || filePath.endsWith('.min.css')) return true;

  return false;
}

/**
 * Chunks a source code file into structured semantic segments.
 *
 * Employs AST symbol-guided structural chunking when symbols are provided,
 * and falls back to line-window overlapping chunking for plain text/unstructured code.
 *
 * @param filePath Relative path of source file.
 * @param content Full text content of source file.
 * @param language Programming language classification.
 * @param symbols List of extracted AST symbols (optional).
 */
export function chunkSourceFile(
  filePath: string,
  content: string,
  language: string | null,
  symbols: CodeSymbolInfo[] = [],
  fileSize?: number | null,
): GeneratedChunk[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  if (isUnsupportedFile(filePath, fileSize)) {
    return [];
  }

  const lines = content.split(/\r?\n/);
  if (lines.length > MAX_FILE_LINES) {
    // Skip oversized files to preserve system performance
    return [];
  }

  const validSymbols = symbols.filter(
    (s) =>
      typeof s.startLine === 'number' &&
      typeof s.endLine === 'number' &&
      s.startLine > 0 &&
      s.endLine >= s.startLine &&
      s.endLine <= lines.length,
  );

  if (validSymbols.length > 0) {
    return chunkByASTSymbols(filePath, lines, language, validSymbols);
  }

  return chunkBySlidingWindow(filePath, lines, language);
}

/**
 * Structural AST symbol-guided chunking.
 */
function chunkByASTSymbols(
  filePath: string,
  lines: string[],
  language: string | null,
  symbols: CodeSymbolInfo[],
): GeneratedChunk[] {
  const chunks: GeneratedChunk[] = [];
  let chunkIndex = 0;

  // Sort symbols by start line
  const sortedSymbols = [...symbols].sort((a, b) => (a.startLine || 0) - (b.startLine || 0));

  let currentLine = 1;

  for (const symbol of sortedSymbols) {
    if (
      symbol.startLine === null ||
      symbol.startLine === undefined ||
      symbol.endLine === null ||
      symbol.endLine === undefined
    ) {
      continue;
    }
    const symStart = symbol.startLine;
    const symEnd = symbol.endLine;

    // 1. Process gap before symbol if large enough
    if (symStart > currentLine + 4) {
      const gapLines = lines.slice(currentLine - 1, symStart - 1);
      const gapText = gapLines.join('\n');
      if (gapText.trim().length >= MIN_CHUNK_CHARS) {
        chunks.push(
          createChunkObject(chunkIndex++, gapText, currentLine, symStart - 1, filePath, language, {
            headerContext: `File: ${filePath} (Module Setup / Imports)`,
          }),
        );
      }
    }

    // 2. Process symbol content
    const symbolLines = lines.slice(symStart - 1, symEnd);
    const symbolText = symbolLines.join('\n');

    if (symbolText.trim().length >= MIN_CHUNK_CHARS) {
      chunks.push(
        createChunkObject(chunkIndex++, symbolText, symStart, symEnd, filePath, language, {
          symbolName: symbol.name,
          symbolKind: symbol.kind,
          headerContext: `File: ${filePath} | ${symbol.kind}: ${symbol.name}`,
        }),
      );
    }

    currentLine = Math.max(currentLine, symEnd + 1);
  }

  // 3. Process trailing lines after final symbol
  if (currentLine <= lines.length) {
    const trailingLines = lines.slice(currentLine - 1);
    const trailingText = trailingLines.join('\n');
    if (trailingText.trim().length >= MIN_CHUNK_CHARS) {
      chunks.push(
        createChunkObject(
          chunkIndex++,
          trailingText,
          currentLine,
          lines.length,
          filePath,
          language,
          {
            headerContext: `File: ${filePath} (Footer)`,
          },
        ),
      );
    }
  }

  return chunks;
}

/**
 * Sliding line-window overlapping fallback chunking.
 */
function chunkBySlidingWindow(
  filePath: string,
  lines: string[],
  language: string | null,
): GeneratedChunk[] {
  const chunks: GeneratedChunk[] = [];
  let chunkIndex = 0;
  const totalLines = lines.length;

  let startLineIndex = 0;

  while (startLineIndex < totalLines) {
    const endLineIndex = Math.min(startLineIndex + TARGET_CHUNK_LINES, totalLines);
    const chunkLines = lines.slice(startLineIndex, endLineIndex);
    const chunkText = chunkLines.join('\n');

    const startLine = startLineIndex + 1;
    const endLine = endLineIndex;

    if (chunkText.trim().length >= MIN_CHUNK_CHARS) {
      chunks.push(
        createChunkObject(chunkIndex++, chunkText, startLine, endLine, filePath, language, {
          headerContext: `File: ${filePath} (Lines ${startLine}-${endLine})`,
        }),
      );
    }

    if (endLineIndex >= totalLines) {
      break;
    }

    startLineIndex += TARGET_CHUNK_LINES - OVERLAP_LINES;
  }

  return chunks;
}

function createChunkObject(
  chunkIndex: number,
  content: string,
  startLine: number,
  endLine: number,
  filePath: string,
  language: string | null,
  extraMeta: Partial<CodeChunkMetadata> = {},
): GeneratedChunk {
  const linesCount = endLine - startLine + 1;
  const tokenCount = estimateTokenCount(content);
  const checksum = computeChunkChecksum(content, filePath, startLine);

  const metadata: CodeChunkMetadata = {
    filePath,
    language: language || undefined,
    checksum,
    ...extraMeta,
  };

  return {
    chunkIndex,
    content,
    startLine,
    endLine,
    tokenCount,
    linesCount,
    checksum,
    metadata,
  };
}
