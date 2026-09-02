// =============================================================================
// ForgeMind Web — PR Architecture Gatekeeper & Webhook API Client
// =============================================================================

import type {
  ApiResponse,
  RepositoryPRGatekeeperOverview,
  PRGatekeeperHistoryResponse,
  PRGatekeeperDetailResponse,
  WebhookDeliveryLogResponse,
  RepositoryGatekeeperConfig,
  UpdateGatekeeperConfigInput,
  WebhookStatusResponse,
  ArchitectureImpact,
  ArchitectureDrift,
} from '@forgemind/types';

import { supabase } from './supabase';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated.');
  }
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string>),
    },
  });

  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    const message = body.error?.message || `API error ${response.status}`;
    throw new Error(message);
  }

  return body.data as T;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/overview
 */
export async function getGatekeeperOverview(
  repositoryId: string,
): Promise<RepositoryPRGatekeeperOverview> {
  const data = await request<{ overview: RepositoryPRGatekeeperOverview }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/overview`,
  );
  return data.overview;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs
 */
export async function getGatekeeperPRs(
  repositoryId: string,
  page = 1,
  limit = 10,
): Promise<PRGatekeeperHistoryResponse> {
  return request<PRGatekeeperHistoryResponse>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/prs?page=${page}&limit=${limit}`,
  );
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs/:prNumber
 */
export async function getGatekeeperPRDetail(
  repositoryId: string,
  prNumber: number,
): Promise<PRGatekeeperDetailResponse> {
  const data = await request<{ detail: PRGatekeeperDetailResponse }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/prs/${prNumber}`,
  );
  return data.detail;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/webhooks
 */
export async function getGatekeeperWebhooks(
  repositoryId: string,
  page = 1,
  limit = 10,
): Promise<WebhookDeliveryLogResponse> {
  return request<WebhookDeliveryLogResponse>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/webhooks?page=${page}&limit=${limit}`,
  );
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/config
 */
export async function getGatekeeperConfig(
  repositoryId: string,
): Promise<RepositoryGatekeeperConfig> {
  const data = await request<{ config: RepositoryGatekeeperConfig }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/config`,
  );
  return data.config;
}

/**
 * PUT /api/v1/repositories/:repositoryId/gatekeeper/config
 */
export async function updateGatekeeperConfig(
  repositoryId: string,
  input: UpdateGatekeeperConfigInput,
): Promise<RepositoryGatekeeperConfig> {
  const data = await request<{ config: RepositoryGatekeeperConfig }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/config`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
  return data.config;
}

/**
 * POST /api/v1/repositories/:repositoryId/gatekeeper/config/reset
 */
export async function resetGatekeeperConfig(
  repositoryId: string,
): Promise<RepositoryGatekeeperConfig> {
  const data = await request<{ config: RepositoryGatekeeperConfig }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/config/reset`,
    {
      method: 'POST',
    },
  );
  return data.config;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/webhooks/status
 */
export async function getWebhookStatus(repositoryId: string): Promise<WebhookStatusResponse> {
  const data = await request<{ status: WebhookStatusResponse }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/webhooks/status`,
  );
  return data.status;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs/:prNumber/impact
 */
export async function getPRArchitectureImpact(
  repositoryId: string,
  prNumber: number,
): Promise<ArchitectureImpact> {
  const data = await request<{ impact: ArchitectureImpact }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/prs/${prNumber}/impact`,
  );
  return data.impact;
}

/**
 * GET /api/v1/repositories/:repositoryId/gatekeeper/prs/:prNumber/drift
 */
export async function getPRArchitectureDrift(
  repositoryId: string,
  prNumber: number,
): Promise<ArchitectureDrift> {
  const data = await request<{ drift: ArchitectureDrift }>(
    `/repositories/${encodeURIComponent(repositoryId)}/gatekeeper/prs/${prNumber}/drift`,
  );
  return data.drift;
}
