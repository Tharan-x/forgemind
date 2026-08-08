// =============================================================================
// ForgeMind Web — Repository Analysis API Client
// =============================================================================

import type { AnalysisJob, RepositoryAcquisitionResult, RepositoryFile } from '@forgemind/types';

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

/**
 * POST /api/v1/repositories/:repositoryId/analyze
 *
 * Triggers repository acquisition and analysis job execution.
 */
export async function triggerRepositoryAnalysis(
  repositoryId: string,
): Promise<RepositoryAcquisitionResult> {
  const data = await request<{ success: boolean; result: RepositoryAcquisitionResult }>(
    `/repositories/${encodeURIComponent(repositoryId)}/analyze`,
    { method: 'POST' },
  );
  return data.result;
}

/**
 * GET /api/v1/repositories/:repositoryId/analysis
 *
 * Returns the latest analysis job for the given repository.
 */
export async function getLatestAnalysisJob(repositoryId: string): Promise<AnalysisJob | null> {
  const data = await request<{ success: boolean; job: AnalysisJob | null }>(
    `/repositories/${encodeURIComponent(repositoryId)}/analysis`,
  );
  return data.job;
}

/**
 * GET /api/v1/repositories/:repositoryId/analysis/history
 *
 * Returns all past analysis jobs for the given repository.
 */
export async function getAnalysisHistory(repositoryId: string): Promise<AnalysisJob[]> {
  const data = await request<{ success: boolean; jobs: AnalysisJob[] }>(
    `/repositories/${encodeURIComponent(repositoryId)}/analysis/history`,
  );
  return data.jobs;
}

/**
 * GET /api/v1/repositories/:repositoryId/files
 *
 * Returns indexed files for the given repository.
 */
export async function getRepositoryFiles(
  repositoryId: string,
  options?: { language?: string; limit?: number; offset?: number },
): Promise<{ files: RepositoryFile[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.language) params.set('language', options.language);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ success: boolean; files: RepositoryFile[]; total: number }>(
    `/repositories/${encodeURIComponent(repositoryId)}/files${query}`,
  );
  return { files: data.files, total: data.total };
}
