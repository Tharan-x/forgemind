// =============================================================================
// ForgeMind Web — Vector Embeddings & Semantic Search API Client
// =============================================================================

import type { CodeChunk, VectorPipelineStatus, VectorSearchResult } from '@forgemind/types';

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
 * GET /api/v1/repositories/:repositoryId/chunks
 *
 * Returns indexed code chunks for a repository.
 */
export async function getRepositoryChunks(
  repositoryId: string,
  options?: { fileId?: string; limit?: number; offset?: number },
): Promise<{ chunks: CodeChunk[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.fileId) params.set('fileId', options.fileId);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const query = params.toString() ? `?${params.toString()}` : '';
  const data = await request<{ success: boolean; chunks: CodeChunk[]; total: number }>(
    `/repositories/${encodeURIComponent(repositoryId)}/chunks${query}`,
  );
  return { chunks: data.chunks, total: data.total };
}

/**
 * POST /api/v1/repositories/:repositoryId/search/semantic
 *
 * Performs a vector semantic search over repository code chunks.
 */
export async function searchSemanticCode(
  repositoryId: string,
  query: string,
  options?: { limit?: number; threshold?: number },
): Promise<VectorSearchResult[]> {
  const data = await request<{ success: boolean; results: VectorSearchResult[] }>(
    `/repositories/${encodeURIComponent(repositoryId)}/search/semantic`,
    {
      method: 'POST',
      body: JSON.stringify({
        query,
        limit: options?.limit,
        threshold: options?.threshold,
      }),
    },
  );
  return data.results;
}

/**
 * GET /api/v1/repositories/:repositoryId/vector-status
 *
 * Returns vector pipeline indexing coverage and provider details.
 */
export async function getVectorPipelineStatus(repositoryId: string): Promise<VectorPipelineStatus> {
  const data = await request<{ success: boolean; status: VectorPipelineStatus }>(
    `/repositories/${encodeURIComponent(repositoryId)}/vector-status`,
  );
  return data.status;
}
