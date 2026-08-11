// =============================================================================
// ForgeMind Web — GitHub Credential API Client
// =============================================================================

import { supabase } from './supabase';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? '';

export interface GitHubConnection {
  connected: boolean;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  updatedAt: string | null;
}

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
 * GET /api/v1/auth/github
 * Fetches current user's GitHub connection status.
 */
export async function getGitHubConnection(): Promise<GitHubConnection> {
  const data = await request<{ success: boolean; connection: GitHubConnection }>('/auth/github');
  return data.connection;
}

/**
 * PUT /api/v1/auth/github
 * Validates, encrypts and connects user's GitHub PAT.
 */
export async function connectGitHub(token: string): Promise<GitHubConnection> {
  const data = await request<{ success: boolean; connection: GitHubConnection }>('/auth/github', {
    method: 'PUT',
    body: JSON.stringify({ token }),
  });
  return data.connection;
}

/**
 * DELETE /api/v1/auth/github
 * Disconnects and deletes user's stored GitHub credential.
 */
export async function disconnectGitHub(): Promise<{ success: boolean }> {
  const data = await request<{ success: boolean; message: string }>('/auth/github', {
    method: 'DELETE',
  });
  return { success: data.success };
}
