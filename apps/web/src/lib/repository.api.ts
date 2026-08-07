// =============================================================================
// ForgeMind Web — Repository API Client
// =============================================================================

import { supabase } from './supabase';

// ─── Base URL ─────────────────────────────────────────────────────────────────

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

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
 */
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

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * POST /api/v1/repositories/sync
 *
 * Triggers a full GitHub → database repository sync for the authenticated user.
 * Requires the user to have a GitHub token stored on their session.
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
 * Returns all repositories owned by the authenticated user.
 */
export async function getRepositories(): Promise<Repository[]> {
  const data = await request<{ success: boolean; repositories: Repository[] }>('/repositories');
  return data.repositories;
}

/**
 * GET /api/v1/repositories/:id
 *
 * Returns a single repository by its database UUID.
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
 * Returns the deleted repository.
 */
export async function deleteRepository(id: string): Promise<Repository> {
  const data = await request<{ success: boolean; repository: Repository }>(
    `/repositories/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return data.repository;
}
