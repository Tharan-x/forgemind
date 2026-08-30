// =============================================================================
// ForgeMind API — GitHub Webhook Event Normalization & Ingestion Service
// =============================================================================

import { Prisma, type WebhookDelivery } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

import { createAnalysisJob, findActivePRAnalysisJob } from './analysis-job.service.js';

export interface NormalizedPREvent {
  deliveryId: string;
  eventType: 'pull_request';
  action: 'opened' | 'synchronize' | 'reopened';
  githubRepoId: number;
  repoFullName: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prUrl: string;
  headRef: string;
  headSha: string;
  baseRef: string;
  baseSha: string;
  sender: string;
  receivedAt: Date;
}

export type WebhookProcessStatus = 'processed' | 'duplicate' | 'ignored';

export interface WebhookProcessResult {
  status: WebhookProcessStatus;
  deliveryId: string;
  eventType?: string;
  action?: string;
  ignoredReason?: string;
  repositoryId?: string;
  event?: NormalizedPREvent;
  isStale?: boolean;
}

const SUPPORTED_PR_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

/**
 * Validates and extracts normalized PR event information from a raw JSON payload.
 */
export function validateAndNormalizePREvent(
  deliveryId: string,
  eventType: string,
  payload: unknown,
):
  | { valid: true; event: NormalizedPREvent }
  | { valid: false; isIgnoredAction?: boolean; action?: string; reason: string } {
  if (eventType !== 'pull_request') {
    return { valid: false, reason: 'unsupported_event_type' };
  }

  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'malformed_payload' };
  }

  const p = payload as Record<string, unknown>;
  const action = typeof p['action'] === 'string' ? p['action'] : undefined;

  if (!action) {
    return { valid: false, reason: 'missing_action' };
  }

  if (!SUPPORTED_PR_ACTIONS.has(action)) {
    return { valid: false, isIgnoredAction: true, action, reason: `unsupported_action_${action}` };
  }

  const repoObj = p['repository'] as Record<string, unknown> | undefined;
  const prObj = p['pull_request'] as Record<string, unknown> | undefined;
  const senderObj = p['sender'] as Record<string, unknown> | undefined;

  if (!repoObj || typeof repoObj !== 'object' || !prObj || typeof prObj !== 'object') {
    return { valid: false, action, reason: 'malformed_pr_payload' };
  }

  const githubRepoId = typeof repoObj['id'] === 'number' ? repoObj['id'] : undefined;
  const repoName = typeof repoObj['name'] === 'string' ? repoObj['name'] : undefined;
  const repoFullName = typeof repoObj['full_name'] === 'string' ? repoObj['full_name'] : undefined;
  const repoOwnerObj = repoObj['owner'] as Record<string, unknown> | undefined;
  const repoOwner = typeof repoOwnerObj?.['login'] === 'string' ? repoOwnerObj['login'] : undefined;

  const prNumber =
    typeof p['number'] === 'number'
      ? p['number']
      : typeof prObj['number'] === 'number'
        ? prObj['number']
        : undefined;

  const prUrl = typeof prObj['html_url'] === 'string' ? prObj['html_url'] : '';

  const headObj = prObj['head'] as Record<string, unknown> | undefined;
  const headRef = typeof headObj?.['ref'] === 'string' ? headObj['ref'] : undefined;
  const headSha = typeof headObj?.['sha'] === 'string' ? headObj['sha'] : undefined;

  const baseObj = prObj['base'] as Record<string, unknown> | undefined;
  const baseRef = typeof baseObj?.['ref'] === 'string' ? baseObj['ref'] : undefined;
  const baseSha = typeof baseObj?.['sha'] === 'string' ? baseObj['sha'] : undefined;

  const sender = typeof senderObj?.['login'] === 'string' ? senderObj['login'] : 'unknown';

  if (
    !githubRepoId ||
    !prNumber ||
    !headSha ||
    !baseSha ||
    !repoName ||
    !repoOwner ||
    !repoFullName ||
    !headRef ||
    !baseRef
  ) {
    return { valid: false, action, reason: 'malformed_pr_payload' };
  }

  return {
    valid: true,
    event: {
      deliveryId,
      eventType: 'pull_request',
      action: action as 'opened' | 'synchronize' | 'reopened',
      githubRepoId,
      repoFullName,
      repoOwner,
      repoName,
      prNumber,
      prUrl,
      headRef,
      headSha,
      baseRef,
      baseSha,
      sender,
      receivedAt: new Date(),
    },
  };
}

/**
 * Processes a GitHub webhook delivery idempotently.
 *
 * Checks for duplicate deliveryId, normalizes payload, verifies repository registration,
 * checks for stale PR deliveries, and persists the WebhookDelivery record.
 */
export async function processWebhookDelivery(options: {
  deliveryId: string;
  eventType: string;
  payload: unknown;
}): Promise<WebhookProcessResult> {
  const { deliveryId, eventType, payload } = options;

  // 1. Check for duplicate deliveryId in DB
  const existingDelivery = await prisma.webhookDelivery.findUnique({
    where: { deliveryId },
  });

  if (existingDelivery) {
    return {
      status: 'duplicate',
      deliveryId,
      eventType: existingDelivery.eventType,
      action: existingDelivery.action ?? undefined,
      repositoryId: existingDelivery.repositoryId ?? undefined,
    };
  }

  // 2. Validate and normalize PR event
  const normResult = validateAndNormalizePREvent(deliveryId, eventType, payload);

  if (!normResult.valid) {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const action = normResult.action ?? (typeof p['action'] === 'string' ? p['action'] : undefined);
    const repoObj = p['repository'] as Record<string, unknown> | undefined;
    const githubRepoId = typeof repoObj?.['id'] === 'number' ? repoObj['id'] : undefined;

    await saveWebhookDeliveryRecord({
      deliveryId,
      eventType,
      action,
      githubRepoId,
      status: 'ignored',
      ignoredReason: normResult.reason,
    });

    return {
      status: 'ignored',
      deliveryId,
      eventType,
      action,
      ignoredReason: normResult.reason,
    };
  }

  const { event } = normResult;

  // 3. Lookup ForgeMind Repository by githubRepoId
  const repo = await prisma.repository.findUnique({
    where: { githubId: event.githubRepoId },
  });

  if (!repo) {
    await saveWebhookDeliveryRecord({
      deliveryId,
      eventType: event.eventType,
      action: event.action,
      githubRepoId: event.githubRepoId,
      prNumber: event.prNumber,
      headSha: event.headSha,
      baseSha: event.baseSha,
      sender: event.sender,
      status: 'ignored',
      ignoredReason: 'unregistered_repository',
    });

    return {
      status: 'ignored',
      deliveryId,
      eventType: event.eventType,
      action: event.action,
      ignoredReason: 'unregistered_repository',
    };
  }

  // 4. Stale Event Check (Check if a newer delivery for the same repo & prNumber has already been processed)
  const newerDelivery = await prisma.webhookDelivery.findFirst({
    where: {
      repositoryId: repo.id,
      prNumber: event.prNumber,
      status: 'processed',
      receivedAt: { gt: event.receivedAt },
    },
  });

  const isStale = Boolean(newerDelivery);

  // 5. Persist Processed WebhookDelivery record
  await saveWebhookDeliveryRecord({
    deliveryId,
    eventType: event.eventType,
    action: event.action,
    repositoryId: repo.id,
    githubRepoId: event.githubRepoId,
    prNumber: event.prNumber,
    headSha: event.headSha,
    baseSha: event.baseSha,
    sender: event.sender,
    status: 'processed',
    processedAt: new Date(),
  });

  // 6. Enqueue PR AnalysisJob if event is not stale and no active job exists for this PR head SHA
  if (!isStale) {
    const existingActiveJob = await findActivePRAnalysisJob(repo.id, event.prNumber, event.headSha);
    if (!existingActiveJob) {
      await createAnalysisJob(repo.id, {
        triggerSource: 'pull_request',
        prNumber: event.prNumber,
        headSha: event.headSha,
        baseSha: event.baseSha,
        targetRef: event.baseRef,
        commitHash: event.headSha,
      });
    }
  }

  return {
    status: 'processed',
    deliveryId,
    eventType: event.eventType,
    action: event.action,
    repositoryId: repo.id,
    event,
    isStale,
  };
}

/**
 * Internal helper to save a WebhookDelivery record with race-condition handling.
 */
async function saveWebhookDeliveryRecord(data: {
  deliveryId: string;
  eventType: string;
  action?: string;
  repositoryId?: string;
  githubRepoId?: number;
  prNumber?: number;
  headSha?: string;
  baseSha?: string;
  sender?: string;
  status: string;
  ignoredReason?: string;
  processedAt?: Date;
}): Promise<WebhookDelivery> {
  try {
    return await prisma.webhookDelivery.create({
      data: {
        deliveryId: data.deliveryId,
        eventType: data.eventType,
        action: data.action,
        repositoryId: data.repositoryId,
        githubRepoId: data.githubRepoId,
        prNumber: data.prNumber,
        headSha: data.headSha,
        baseSha: data.baseSha,
        sender: data.sender,
        status: data.status,
        ignoredReason: data.ignoredReason,
        processedAt: data.processedAt,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Unique constraint failed on delivery_id (concurrent duplicate delivery)
      const existing = await prisma.webhookDelivery.findUnique({
        where: { deliveryId: data.deliveryId },
      });
      if (existing) return existing;
    }
    throw err;
  }
}

/**
 * Checks if a given head SHA is the latest processed PR event for a repository and PR number.
 */
export async function isLatestPREvent(
  repositoryId: string,
  prNumber: number,
  headSha: string,
): Promise<boolean> {
  const latestProcessed = await prisma.webhookDelivery.findFirst({
    where: {
      repositoryId,
      prNumber,
      status: 'processed',
    },
    orderBy: { receivedAt: 'desc' },
  });

  if (!latestProcessed) return true;
  return latestProcessed.headSha === headSha;
}
