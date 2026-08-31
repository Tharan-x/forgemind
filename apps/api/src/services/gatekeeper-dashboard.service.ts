// =============================================================================
// ForgeMind API — PR Gatekeeper & Webhook Intelligence Dashboard Service
// =============================================================================

import type {
  RepositoryPRGatekeeperOverview,
  PRGatekeeperHistoryItem,
  PRGatekeeperHistoryResponse,
  PRGatekeeperDetailResponse,
  WebhookDeliveryLogItem,
  WebhookDeliveryLogResponse,
} from '@forgemind/types';

import { prisma } from '../lib/prisma.js';
import { compareArchitectureHealthSnapshots } from './architecture-history.service.js';
import { findBaselineSnapshot } from './pr-baseline.service.js';
import { evaluatePRGatekeeperPolicy } from './pr-gatekeeper-policy.service.js';
import { findRepositoryById } from './repository.service.js';

/**
 * Returns summary metrics for the PR Architecture Gatekeeper dashboard.
 */
export async function getGatekeeperOverview(
  repositoryId: string,
): Promise<RepositoryPRGatekeeperOverview> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // 1. Fetch all PR analysis jobs for repository
  const prJobs = await prisma.analysisJob.findMany({
    where: {
      repositoryId,
      OR: [{ triggerSource: 'pull_request' }, { prNumber: { not: null } }],
    },
    include: {
      healthSnapshot: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalPRAnalyses = prJobs.length;

  let passedCount = 0;
  let failedCount = 0;
  let neutralCount = 0;
  let activeRegressionsCount = 0;

  let latestItem: PRGatekeeperHistoryItem | null = null;
  let latestHealthScore: number | null = null;
  let latestHealthDelta: number | null = null;

  for (let i = 0; i < prJobs.length; i++) {
    const job = prJobs[i];
    if (!job) continue;

    let outcome: 'pass' | 'fail' | 'neutral' = 'neutral';
    let delta: number | null = null;
    const score = job.healthSnapshot?.healthScore ?? null;

    if (job.healthSnapshot) {
      const baseline = await findBaselineSnapshot(repositoryId, job.baseSha);
      if (baseline) {
        const comparison = await compareArchitectureHealthSnapshots(
          repositoryId,
          repo.userId,
          baseline.analysisJobId,
          job.id,
        );
        const policy = evaluatePRGatekeeperPolicy(comparison, job.healthSnapshot);
        outcome = policy.outcome;
        delta = policy.healthDelta;
        if (policy.isRegressed || policy.outcome === 'fail') {
          activeRegressionsCount++;
        }
      } else {
        outcome = 'neutral';
      }
    }

    if (outcome === 'pass') passedCount++;
    else if (outcome === 'fail') failedCount++;
    else neutralCount++;

    if (i === 0) {
      latestHealthScore = score;
      latestHealthDelta = delta;
      latestItem = {
        id: job.id,
        prNumber: job.prNumber,
        title: job.prNumber ? `PR #${job.prNumber}` : null,
        headSha: job.headSha || job.commitHash,
        baseSha: job.baseSha,
        targetRef: job.targetRef,
        status: job.status,
        outcome,
        healthScore: score,
        scoreDelta: delta,
        commitHash: job.commitHash,
        createdAt: job.createdAt.toISOString(),
        finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
      };
    }
  }

  const passRate = totalPRAnalyses > 0 ? Math.round((passedCount / totalPRAnalyses) * 100) : 100;

  return {
    repositoryId,
    totalPRAnalyses,
    passedCount,
    failedCount,
    neutralCount,
    passRate,
    latestAnalysis: latestItem,
    activeRegressionsCount,
    latestHealthScore,
    latestHealthDelta,
  };
}

/**
 * Returns paginated PR gatekeeper analysis history.
 */
export async function getGatekeeperPRs(
  repositoryId: string,
  page = 1,
  limit = 10,
): Promise<PRGatekeeperHistoryResponse> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const validPage = Math.max(1, page);
  const validLimit = Math.min(50, Math.max(1, limit));
  const skip = (validPage - 1) * validLimit;

  const whereClause = {
    repositoryId,
    OR: [{ triggerSource: 'pull_request' }, { prNumber: { not: null } }],
  };

  const total = await prisma.analysisJob.count({ where: whereClause });
  const totalPages = Math.ceil(total / validLimit) || 1;

  const prJobs = await prisma.analysisJob.findMany({
    where: whereClause,
    include: {
      healthSnapshot: true,
    },
    orderBy: { createdAt: 'desc' },
    skip,
    take: validLimit,
  });

  const items: PRGatekeeperHistoryItem[] = [];

  for (const job of prJobs) {
    let outcome: 'pass' | 'fail' | 'neutral' = 'neutral';
    let delta: number | null = null;
    const score = job.healthSnapshot?.healthScore ?? null;

    if (job.healthSnapshot) {
      const baseline = await findBaselineSnapshot(repositoryId, job.baseSha);
      if (baseline) {
        const comparison = await compareArchitectureHealthSnapshots(
          repositoryId,
          repo.userId,
          baseline.analysisJobId,
          job.id,
        );
        const policy = evaluatePRGatekeeperPolicy(comparison, job.healthSnapshot);
        outcome = policy.outcome;
        delta = policy.healthDelta;
      } else {
        outcome = 'neutral';
      }
    }

    items.push({
      id: job.id,
      prNumber: job.prNumber,
      title: job.prNumber ? `PR #${job.prNumber}` : null,
      headSha: job.headSha || job.commitHash,
      baseSha: job.baseSha,
      targetRef: job.targetRef,
      status: job.status,
      outcome,
      healthScore: score,
      scoreDelta: delta,
      commitHash: job.commitHash,
      createdAt: job.createdAt.toISOString(),
      finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    });
  }

  return {
    items,
    total,
    page: validPage,
    limit: validLimit,
    totalPages,
  };
}

/**
 * Returns detailed PR analysis, comparison, and gatekeeper policy results for a specific PR number.
 */
export async function getGatekeeperPRDetail(
  repositoryId: string,
  prNumber: number,
): Promise<PRGatekeeperDetailResponse> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // Find latest PR analysis job for target PR number
  const job = await prisma.analysisJob.findFirst({
    where: {
      repositoryId,
      prNumber,
    },
    include: {
      healthSnapshot: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!job) {
    throw new Error(`No PR analysis found for PR #${prNumber}`);
  }

  const snapshot = job.healthSnapshot
    ? {
        healthScore: job.healthSnapshot.healthScore,
        grade: job.healthSnapshot.grade,
        totalFiles: job.healthSnapshot.totalFiles,
        totalDependencies: job.healthSnapshot.totalDependencies,
        circularCycleCount: job.healthSnapshot.circularCycleCount,
        layerViolationCount: job.healthSnapshot.layerViolationCount,
        hotspotCount: job.healthSnapshot.hotspotCount,
        orphanExportCount: job.healthSnapshot.orphanExportCount,
      }
    : null;

  let baselineInfo: {
    analysisJobId: string;
    commitHash: string | null;
    healthScore: number;
    grade: string;
  } | null = null;

  let comparison = null;
  let policyResult;

  if (job.healthSnapshot) {
    const baseline = await findBaselineSnapshot(repositoryId, job.baseSha);
    if (baseline) {
      baselineInfo = {
        analysisJobId: baseline.analysisJobId,
        commitHash: baseline.commitHash,
        healthScore: baseline.healthScore,
        grade: baseline.grade,
      };

      comparison = await compareArchitectureHealthSnapshots(
        repositoryId,
        repo.userId,
        baseline.analysisJobId,
        job.id,
      );

      policyResult = evaluatePRGatekeeperPolicy(comparison, job.healthSnapshot);
    } else {
      policyResult = evaluatePRGatekeeperPolicy(null, job.healthSnapshot);
    }
  } else {
    policyResult = {
      outcome: 'neutral' as const,
      statusDescription: 'PR analysis incomplete or failed.',
      reasons: ['No architecture health snapshot calculated for PR.'],
      healthDelta: 0,
      baselineHealthScore: null,
      prHealthScore: 0,
      isRegressed: false,
      newCriticalCount: 0,
      newHighCount: 0,
      newCircularCyclesCount: 0,
      newLayerViolationsCount: 0,
      policyOptions: {
        maxScoreDegradation: 5,
        blockOnNewCriticalFindings: true,
        blockOnNewHighFindings: false,
        blockOnNewCircularCycles: true,
        blockOnNewLayerViolations: true,
      },
      evaluatedAt: new Date().toISOString(),
    };
  }

  return {
    prNumber,
    jobId: job.id,
    headSha: job.headSha || job.commitHash,
    baseSha: job.baseSha,
    status: job.status,
    snapshot,
    baseline: baselineInfo,
    comparison,
    policyResult,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Returns paginated webhook delivery execution logs for a repository.
 */
export async function getGatekeeperWebhooks(
  repositoryId: string,
  page = 1,
  limit = 10,
): Promise<WebhookDeliveryLogResponse> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const validPage = Math.max(1, page);
  const validLimit = Math.min(50, Math.max(1, limit));
  const skip = (validPage - 1) * validLimit;

  const whereClause = {
    OR: [{ repositoryId }, { githubRepoId: repo.githubId }],
  };

  const total = await prisma.webhookDelivery.count({ where: whereClause });
  const totalPages = Math.ceil(total / validLimit) || 1;

  const deliveries = await prisma.webhookDelivery.findMany({
    where: whereClause,
    orderBy: { receivedAt: 'desc' },
    skip,
    take: validLimit,
  });

  const items: WebhookDeliveryLogItem[] = deliveries.map((d) => ({
    id: d.id,
    deliveryId: d.deliveryId,
    eventType: d.eventType,
    action: d.action,
    repositoryId: d.repositoryId,
    githubRepoId: d.githubRepoId,
    prNumber: d.prNumber,
    headSha: d.headSha,
    baseSha: d.baseSha,
    sender: d.sender,
    status: d.status,
    ignoredReason: d.ignoredReason,
    receivedAt: d.receivedAt.toISOString(),
    processedAt: d.processedAt ? d.processedAt.toISOString() : null,
  }));

  return {
    items,
    total,
    page: validPage,
    limit: validLimit,
    totalPages,
  };
}
