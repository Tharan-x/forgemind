// =============================================================================
// ForgeMind Web — Code Intelligence API Client
// =============================================================================

import type {
  ArchitectureOverviewResponse,
  CodeExplainRequest,
  CodeExplainResponse,
  FileDependencyIntelligence,
  ImpactAnalysisResult,
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
 * POST /api/v1/repositories/:repositoryId/intelligence/explain
 */
export async function explainCode(
  repositoryId: string,
  req: CodeExplainRequest,
): Promise<CodeExplainResponse> {
  return request<CodeExplainResponse>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/explain`,
    {
      method: 'POST',
      body: JSON.stringify(req),
    },
  );
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/dependencies?filePath=...
 */
export async function getFileDependencyIntelligence(
  repositoryId: string,
  filePath: string,
): Promise<FileDependencyIntelligence> {
  const query = `?filePath=${encodeURIComponent(filePath)}`;
  return request<FileDependencyIntelligence>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/dependencies${query}`,
  );
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/impact
 */
export async function analyzeImpact(
  repositoryId: string,
  req: { filePath: string; symbolName?: string; includeExplanation?: boolean },
): Promise<ImpactAnalysisResult> {
  return request<ImpactAnalysisResult>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/impact`,
    {
      method: 'POST',
      body: JSON.stringify(req),
    },
  );
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/architecture
 */
export async function getArchitectureOverview(
  repositoryId: string,
): Promise<ArchitectureOverviewResponse> {
  return request<ArchitectureOverviewResponse>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/architecture`,
  );
}
