// =============================================================================
// ForgeMind API — Repository Gatekeeper Policy Configuration & Webhook Status Service
// =============================================================================

import type {
  RepositoryGatekeeperConfig as RepositoryGatekeeperConfigType,
  UpdateGatekeeperConfigInput,
  WebhookStatusResponse,
} from '@forgemind/types';

import { prisma } from '../lib/prisma.js';
import { findRepositoryById } from './repository.service.js';

export const DEFAULT_GATEKEEPER_CONFIG = {
  enabled: true,
  maxScoreDegradation: 5,
  blockOnNewCriticalFindings: true,
  blockOnNewHighFindings: false,
  blockOnNewCircularCycles: true,
  blockOnNewLayerViolations: true,
};

/**
 * Finds or creates the default repository gatekeeper policy configuration.
 */
export async function getGatekeeperConfig(
  repositoryId: string,
): Promise<RepositoryGatekeeperConfigType> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  try {
    const existingConfig = await prisma.repositoryGatekeeperConfig.findUnique({
      where: { repositoryId },
    });

    if (existingConfig) {
      return {
        id: existingConfig.id,
        repositoryId: existingConfig.repositoryId,
        enabled: existingConfig.enabled,
        maxScoreDegradation: existingConfig.maxScoreDegradation,
        blockOnNewCriticalFindings: existingConfig.blockOnNewCriticalFindings,
        blockOnNewHighFindings: existingConfig.blockOnNewHighFindings,
        blockOnNewCircularCycles: existingConfig.blockOnNewCircularCycles,
        blockOnNewLayerViolations: existingConfig.blockOnNewLayerViolations,
        createdAt: existingConfig.createdAt.toISOString(),
        updatedAt: existingConfig.updatedAt.toISOString(),
      };
    }

    // Create default configuration record
    const newConfig = await prisma.repositoryGatekeeperConfig.create({
      data: {
        repositoryId,
        ...DEFAULT_GATEKEEPER_CONFIG,
      },
    });

    return {
      id: newConfig.id,
      repositoryId: newConfig.repositoryId,
      enabled: newConfig.enabled,
      maxScoreDegradation: newConfig.maxScoreDegradation,
      blockOnNewCriticalFindings: newConfig.blockOnNewCriticalFindings,
      blockOnNewHighFindings: newConfig.blockOnNewHighFindings,
      blockOnNewCircularCycles: newConfig.blockOnNewCircularCycles,
      blockOnNewLayerViolations: newConfig.blockOnNewLayerViolations,
      createdAt: newConfig.createdAt.toISOString(),
      updatedAt: newConfig.updatedAt.toISOString(),
    };
  } catch {
    return {
      id: `default-${repositoryId}`,
      repositoryId,
      ...DEFAULT_GATEKEEPER_CONFIG,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

import { z } from 'zod';

export const updateGatekeeperConfigSchema = z.object({
  enabled: z.boolean({ invalid_type_error: 'Must be a boolean value' }).optional(),
  maxScoreDegradation: z
    .number({ invalid_type_error: 'Must be a number between 0 and 100' })
    .int('Must be a number between 0 and 100')
    .min(0, 'Must be a number between 0 and 100')
    .max(100, 'Must be a number between 0 and 100')
    .optional(),
  blockOnNewCriticalFindings: z
    .boolean({ invalid_type_error: 'Must be a boolean value' })
    .optional(),
  blockOnNewHighFindings: z.boolean({ invalid_type_error: 'Must be a boolean value' }).optional(),
  blockOnNewCircularCycles: z.boolean({ invalid_type_error: 'Must be a boolean value' }).optional(),
  blockOnNewLayerViolations: z
    .boolean({ invalid_type_error: 'Must be a boolean value' })
    .optional(),
});

/**
 * Updates a repository's gatekeeper policy configuration with Zod validation.
 */
export async function updateGatekeeperConfig(
  repositoryId: string,
  input: UpdateGatekeeperConfigInput,
): Promise<RepositoryGatekeeperConfigType> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  // Validate input using Zod schema
  const parsedResult = updateGatekeeperConfigSchema.safeParse(input);
  if (!parsedResult.success) {
    const issue = parsedResult.error.issues[0];
    const fieldName = issue?.path.join('.') || 'configuration';
    throw new Error(`Invalid ${fieldName}: ${issue?.message || 'Validation failed.'}`);
  }
  const validatedInput = parsedResult.data;

  const updated = await prisma.repositoryGatekeeperConfig.upsert({
    where: { repositoryId },
    create: {
      repositoryId,
      enabled: validatedInput.enabled ?? DEFAULT_GATEKEEPER_CONFIG.enabled,
      maxScoreDegradation:
        validatedInput.maxScoreDegradation ?? DEFAULT_GATEKEEPER_CONFIG.maxScoreDegradation,
      blockOnNewCriticalFindings:
        validatedInput.blockOnNewCriticalFindings ??
        DEFAULT_GATEKEEPER_CONFIG.blockOnNewCriticalFindings,
      blockOnNewHighFindings:
        validatedInput.blockOnNewHighFindings ?? DEFAULT_GATEKEEPER_CONFIG.blockOnNewHighFindings,
      blockOnNewCircularCycles:
        validatedInput.blockOnNewCircularCycles ??
        DEFAULT_GATEKEEPER_CONFIG.blockOnNewCircularCycles,
      blockOnNewLayerViolations:
        validatedInput.blockOnNewLayerViolations ??
        DEFAULT_GATEKEEPER_CONFIG.blockOnNewLayerViolations,
    },
    update: {
      ...(validatedInput.enabled !== undefined && { enabled: validatedInput.enabled }),
      ...(validatedInput.maxScoreDegradation !== undefined && {
        maxScoreDegradation: validatedInput.maxScoreDegradation,
      }),
      ...(validatedInput.blockOnNewCriticalFindings !== undefined && {
        blockOnNewCriticalFindings: validatedInput.blockOnNewCriticalFindings,
      }),
      ...(validatedInput.blockOnNewHighFindings !== undefined && {
        blockOnNewHighFindings: validatedInput.blockOnNewHighFindings,
      }),
      ...(validatedInput.blockOnNewCircularCycles !== undefined && {
        blockOnNewCircularCycles: validatedInput.blockOnNewCircularCycles,
      }),
      ...(validatedInput.blockOnNewLayerViolations !== undefined && {
        blockOnNewLayerViolations: validatedInput.blockOnNewLayerViolations,
      }),
    },
  });

  return {
    id: updated.id,
    repositoryId: updated.repositoryId,
    enabled: updated.enabled,
    maxScoreDegradation: updated.maxScoreDegradation,
    blockOnNewCriticalFindings: updated.blockOnNewCriticalFindings,
    blockOnNewHighFindings: updated.blockOnNewHighFindings,
    blockOnNewCircularCycles: updated.blockOnNewCircularCycles,
    blockOnNewLayerViolations: updated.blockOnNewLayerViolations,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/**
 * Resets a repository's gatekeeper policy configuration to safe system defaults.
 */
export async function resetGatekeeperConfigToDefault(
  repositoryId: string,
): Promise<RepositoryGatekeeperConfigType> {
  return updateGatekeeperConfig(repositoryId, DEFAULT_GATEKEEPER_CONFIG);
}

/**
 * Returns safe webhook configuration status and setup guidance for a repository.
 * NEVER returns the raw secret string to the client.
 */
export async function getWebhookStatus(repositoryId: string): Promise<WebhookStatusResponse> {
  const repo = await findRepositoryById(repositoryId);
  if (!repo) {
    throw new Error(`Repository not found: ${repositoryId}`);
  }

  const recentDeliveries = await prisma.webhookDelivery.findMany({
    where: {
      OR: [{ repositoryId }, { githubRepoId: repo.githubId }],
    },
    orderBy: { receivedAt: 'desc' },
    take: 1,
  });

  const recentCount = await prisma.webhookDelivery.count({
    where: {
      OR: [{ repositoryId }, { githubRepoId: repo.githubId }],
    },
  });

  const lastDelivery = recentDeliveries[0];

  const secretConfigured = Boolean(
    process.env['GITHUB_WEBHOOK_SECRET'] && process.env['GITHUB_WEBHOOK_SECRET'].trim().length > 0,
  );

  const apiHost = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:4000';
  const webhookUrl = `${apiHost}/api/v1/github/webhooks`;

  return {
    repositoryId,
    isConfigured: recentCount > 0,
    webhookUrl,
    secretConfigured,
    subscribedEvents: ['pull_request (opened, synchronize, reopened)'],
    recentDeliveriesCount: recentCount,
    lastDeliveryAt: lastDelivery ? lastDelivery.receivedAt.toISOString() : null,
    setupInstructions: {
      title: 'GitHub Repository Webhook Setup',
      payloadUrl: webhookUrl,
      contentType: 'application/json',
      secretNotice: secretConfigured
        ? 'Secret is securely configured on server (HMAC-SHA256 active).'
        : 'Set GITHUB_WEBHOOK_SECRET in server environment variables.',
      eventsNotice: 'Select "Let me select individual events" and check "Pull requests".',
    },
  };
}
