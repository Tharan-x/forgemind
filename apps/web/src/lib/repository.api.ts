import { getDeviceId } from './device.api';
import { supabase } from './supabase';

// ─── Base URL ─────────────────────────────────────────────────────────────────

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnalysisJobInfo {
  id: string;
  repositoryId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  stage?: string | null;
  stageLabel?: string | null;
  processedCount?: number | null;
  totalCount?: number | null;
  commitHash?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface Repository {
  id: string;
  userId: string;
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  language: string | null;
  description: string | null;
  stars: number;
  forks: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  status?: 'connected' | 'queued' | 'indexing' | 'ready' | 'failed';
  latestJob?: AnalysisJobInfo | null;
  fileCount?: number;
}

export interface SyncResult {
  total: number;
  created: number;
  updated: number;
}

// ─── Internal Helper ──────────────────────────────────────────────────────────

/**
 * Returns the current Supabase session access token.
 * Throws if the user is not authenticated.
 */
async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated.');
  }
  return token;
}

/**
 * Sends an authenticated request to the ForgeMind API.
 * Includes Authorization header and X-Device-Id header for Trusted Device security.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const deviceId = getDeviceId();

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Device-Id': deviceId,
      ...(options.headers as Record<string, string>),
    },
  });

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof body['message'] === 'string'
        ? body['message']
        : typeof (body['error'] as Record<string, unknown> | undefined)?.['message'] === 'string'
          ? ((body['error'] as Record<string, unknown>)['message'] as string)
          : `API error ${response.status}`;
    throw new Error(message);
  }

  return body as T;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/repositories/sync
 *
 * Triggers a full GitHub → database repository sync for the authenticated user.
 */
export async function syncRepositories(): Promise<SyncResult> {
  const data = await request<{ success: boolean; result: SyncResult }>('/repositories/sync', {
    method: 'POST',
  });
  return data.result;
}

/**
 * GET /api/v1/repositories
 *
 * Returns all repositories owned by the authenticated user with status metadata.
 */
export async function getRepositories(): Promise<Repository[]> {
  const data = await request<{ success: boolean; repositories: Repository[] }>('/repositories');
  return data.repositories;
}

/**
 * GET /api/v1/repositories/:id
 *
 * Returns a single repository by its database UUID with status metadata.
 */
export async function getRepository(id: string): Promise<Repository> {
  const data = await request<{ success: boolean; repository: Repository }>(
    `/repositories/${encodeURIComponent(id)}`,
  );
  return data.repository;
}

/**
 * DELETE /api/v1/repositories/:id
 *
 * Deletes a repository record by its database UUID.
 */
export async function deleteRepository(id: string): Promise<Repository> {
  const data = await request<{ success: boolean; repository: Repository }>(
    `/repositories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return data.repository;
}

/**
 * POST /api/v1/repositories/:id/analyze
 *
 * Enqueues a repository acquisition & analysis job.
 */
export async function triggerAnalysis(repositoryId: string): Promise<AnalysisJobInfo> {
  const data = await request<{ success: boolean; job: AnalysisJobInfo }>(
    `/repositories/${encodeURIComponent(repositoryId)}/analyze`,
    { method: 'POST' },
  );
  return data.job;
}

/**
 * POST /api/v1/repositories/:id/retry
 *
 * Retries a failed analysis job for the repository.
 */
export async function retryAnalysis(repositoryId: string): Promise<AnalysisJobInfo> {
  const data = await request<{ success: boolean; job: AnalysisJobInfo }>(
    `/repositories/${encodeURIComponent(repositoryId)}/retry`,
    { method: 'POST' },
  );
  return data.job;
}

/**
 * GET /api/v1/repositories/:id/analysis
 *
 * Returns the latest analysis job status for the repository.
 */
export async function getLatestAnalysis(repositoryId: string): Promise<AnalysisJobInfo | null> {
  const data = await request<{ success: boolean; job: AnalysisJobInfo | null }>(
    `/repositories/${encodeURIComponent(repositoryId)}/analysis`,
  );
  return data.job;
}
