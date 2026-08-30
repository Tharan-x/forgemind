// =============================================================================
// ForgeMind API — Non-Destructive PR Architecture Analysis Service
// =============================================================================
//
// Analyzes a GitHub Pull Request head commit SHA without mutating or replacing
// default-branch repository graph tables (RepositoryFile, RepositorySymbol,
// FileDependency, CodeChunk).
//
// Operations are performed in-memory using pure stateless AST parsing and rule-based
// architecture scoring. Persists ONLY the resulting ArchitectureHealthSnapshot
// and updates the PR AnalysisJob metadata.
// =============================================================================

import path from 'node:path';
import type { Prisma, AnalysisJob, ArchitectureHealthSnapshot } from '@prisma/client';

import { createGithubClient } from '../github/index.js';
import { prisma } from '../lib/prisma.js';

import { updateAnalysisJobStatus } from './analysis-job.service.js';
import {
  analyzeArchitectureHealthSync,
  type RawDependency,
  type RawSymbol,
} from './architecture-health.service.js';
import { parseSourceFile } from './ast-parser.service.js';
import { findRepositoryById } from './repository.service.js';

export interface PRAnalysisSummary {
  job: AnalysisJob;
  snapshot: ArchitectureHealthSnapshot;
  commitHash: string;
  filesAnalyzed: number;
  symbolsExtracted: number;
  dependenciesExtracted: number;
}

function detectLanguageFromPath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'TypeScript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'JavaScript';
    case '.py':
      return 'Python';
    case '.go':
      return 'Go';
    case '.java':
      return 'Java';
    case '.rs':
      return 'Rust';
    case '.c':
    case '.h':
      return 'C';
    case '.cpp':
    case '.hpp':
      return 'C++';
    default:
      return null;
  }
}

/**
 * Executes a non-destructive architecture health snapshot computation for a PR AnalysisJob.
 */
export async function computePRArchitectureSnapshot(
  job: AnalysisJob,
  githubToken: string,
): Promise<PRAnalysisSummary> {
  const repositoryId = job.repositoryId;
  const repo = await findRepositoryById(repositoryId);

  if (!repo) {
    await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: `Repository not found: ${repositoryId}`,
      finishedAt: new Date(),
    });
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const headSha = job.headSha || job.commitHash;

  if (!headSha) {
    await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      error: `PR AnalysisJob missing head SHA: ${job.id}`,
      finishedAt: new Date(),
    });
    throw new Error(`PR AnalysisJob missing head SHA: ${job.id}`);
  }

  const startedAt = job.startedAt ?? new Date();
  await updateAnalysisJobStatus(job.id, {
    status: 'in_progress',
    stage: 'fetching_pr_tree',
    stageLabel: `Fetching PR tree for commit ${headSha.slice(0, 7)}`,
    startedAt,
  });

  const github = createGithubClient(githubToken);

  try {
    // 1. Fetch PR git tree from GitHub API for head SHA
    const treeResponse = await github.getTree(repo.owner, repo.name, headSha, true);
    const treeItems = treeResponse.tree || [];

    const blobItems = treeItems.filter((item) => item.type === 'blob');
    const codeBlobItems = blobItems
      .filter((item) => {
        const lang = detectLanguageFromPath(item.path);
        return lang !== null && (item.size ?? 0) < 500000;
      })
      .slice(0, 500); // Cap at 500 files max to prevent execution timeouts

    await updateAnalysisJobStatus(job.id, {
      stage: 'parsing_pr_code',
      stageLabel: 'Parsing PR AST symbols & dependencies in-memory',
      processedCount: 0,
      totalCount: codeBlobItems.length,
    });

    const inMemorySymbols: RawSymbol[] = [];
    const inMemoryDependencies: RawDependency[] = [];
    let filesParsed = 0;

    // 2. Fetch file content and parse AST in-memory (0 DB writes to RepositoryFile/Symbol/Dependency!)
    for (let i = 0; i < codeBlobItems.length; i++) {
      const item = codeBlobItems[i];
      if (!item || !item.path) continue;

      const language = detectLanguageFromPath(item.path);

      try {
        const content = await github.getFileContent(repo.owner, repo.name, item.path, headSha);
        if (content) {
          const { symbols, dependencies } = parseSourceFile(content, language, item.path);

          for (const s of symbols) {
            inMemorySymbols.push({
              name: s.name,
              kind: s.kind,
              filePath: item.path,
            });
          }

          for (const d of dependencies) {
            inMemoryDependencies.push({
              sourcePath: item.path,
              targetPath: d.targetPath,
              isExternal: d.isExternal,
            });
          }

          filesParsed++;
        }
      } catch (fileErr) {
        // eslint-disable-next-line no-console
        console.warn(`[PR Analysis] Skipping PR file ${item.path}:`, fileErr);
      }

      if ((i + 1) % 10 === 0 || i === codeBlobItems.length - 1) {
        await updateAnalysisJobStatus(job.id, {
          processedCount: i + 1,
          totalCount: codeBlobItems.length,
        });
      }
    }

    // 3. Assemble in-memory file structure for pure deterministic health analysis
    const fileEntries = blobItems.map((item) => ({
      path: item.path,
      name: path.basename(item.path),
    }));

    // 4. Compute deterministic architecture report (pure function, no DB writes!)
    const healthReport = analyzeArchitectureHealthSync({
      repositoryId,
      files: fileEntries,
      dependencies: inMemoryDependencies,
      symbols: inMemorySymbols,
    });

    // 5. Persist ONLY ArchitectureHealthSnapshot linked to this PR AnalysisJob
    const snapshot = await prisma.architectureHealthSnapshot.upsert({
      where: { analysisJobId: job.id },
      create: {
        repositoryId,
        analysisJobId: job.id,
        commitHash: headSha,
        healthScore: healthReport.healthScore,
        grade: healthReport.grade,
        totalFiles: healthReport.metrics.totalFiles,
        totalDependencies: healthReport.metrics.totalDependencies,
        circularCycleCount: healthReport.metrics.circularCycleCount,
        layerViolationCount: healthReport.metrics.layerViolationCount,
        hotspotCount: healthReport.metrics.hotspotCount,
        orphanExportCount: healthReport.metrics.orphanExportCount,
        scoreBreakdown: healthReport.scoreBreakdown as unknown as Prisma.InputJsonValue,
        findings: healthReport.findings as unknown as Prisma.InputJsonValue,
        fanMetrics: healthReport.fanMetrics as unknown as Prisma.InputJsonValue,
      },
      update: {
        commitHash: headSha,
        healthScore: healthReport.healthScore,
        grade: healthReport.grade,
        totalFiles: healthReport.metrics.totalFiles,
        totalDependencies: healthReport.metrics.totalDependencies,
        circularCycleCount: healthReport.metrics.circularCycleCount,
        layerViolationCount: healthReport.metrics.layerViolationCount,
        hotspotCount: healthReport.metrics.hotspotCount,
        orphanExportCount: healthReport.metrics.orphanExportCount,
        scoreBreakdown: healthReport.scoreBreakdown as unknown as Prisma.InputJsonValue,
        findings: healthReport.findings as unknown as Prisma.InputJsonValue,
        fanMetrics: healthReport.fanMetrics as unknown as Prisma.InputJsonValue,
      },
    });

    const finishedAt = new Date();
    const completedJob = await updateAnalysisJobStatus(job.id, {
      status: 'completed',
      stage: 'completed',
      stageLabel: 'PR architecture analysis completed',
      processedCount: codeBlobItems.length,
      totalCount: codeBlobItems.length,
      commitHash: headSha,
      finishedAt,
    });

    return {
      job: completedJob || {
        ...job,
        status: 'completed',
        stage: 'completed',
        stageLabel: 'PR architecture analysis completed',
        commitHash: headSha,
        finishedAt,
      },
      snapshot,
      commitHash: headSha,
      filesAnalyzed: filesParsed,
      symbolsExtracted: inMemorySymbols.length,
      dependenciesExtracted: inMemoryDependencies.length,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'PR architecture analysis error';
    const finishedAt = new Date();

    const failedJob = await updateAnalysisJobStatus(job.id, {
      status: 'failed',
      stage: 'failed',
      stageLabel: 'PR architecture analysis failed',
      error: errorMessage,
      finishedAt,
    });

    throw new Error(
      `PR architecture analysis failed for job ${job.id}: ${failedJob?.error || errorMessage}`,
    );
  }
}
