// =============================================================================
// ForgeMind Web — Code Intelligence API Client
// =============================================================================

import type {
  ArchitectureHealthReport,
  ArchitectureHealthExplainRequest,
  ArchitectureHealthExplanationResponse,
  ArchitectureOverviewResponse,
  BlueprintShareRequest,
  BlueprintShareResponse,
  BlueprintStepQARequest,
  BlueprintStepQAResponse,
  CodeExplainRequest,
  CodeExplainResponse,
  FileDependencyIntelligence,
  GraphQueryOptions,
  ImpactAnalysisResult,
  OnboardingBlueprint,
  RepositoryGraphResponse,
  SharedBlueprintView,
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

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/graph
 */
export async function getRepositoryGraphTopology(
  repositoryId: string,
  options: GraphQueryOptions = {},
): Promise<RepositoryGraphResponse> {
  const queryParts: string[] = [];
  if (options.depth !== undefined) queryParts.push(`depth=${encodeURIComponent(options.depth)}`);
  if (options.nodeType !== undefined)
    queryParts.push(`nodeType=${encodeURIComponent(options.nodeType)}`);
  if (options.limit !== undefined) queryParts.push(`limit=${encodeURIComponent(options.limit)}`);
  if (options.filter !== undefined) queryParts.push(`filter=${encodeURIComponent(options.filter)}`);

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return request<RepositoryGraphResponse>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/graph${queryString}`,
  );
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/blueprint
 */
export async function getOnboardingBlueprint(
  repositoryId: string,
): Promise<{ success: boolean; data: OnboardingBlueprint }> {
  return request<{ success: boolean; data: OnboardingBlueprint }>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/blueprint`,
  );
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/blueprint/step-ask
 */
export async function askOnboardingStepQuestion(
  repositoryId: string,
  reqData: BlueprintStepQARequest,
): Promise<{ success: boolean; data: BlueprintStepQAResponse }> {
  return request<{ success: boolean; data: BlueprintStepQAResponse }>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/blueprint/step-ask`,
    {
      method: 'POST',
      body: JSON.stringify(reqData),
    },
  );
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/blueprint/share
 * Creates a stateless HMAC-SHA256 signed share token for the onboarding blueprint.
 */
export async function shareOnboardingBlueprint(
  repositoryId: string,
  reqData: BlueprintShareRequest,
): Promise<{ success: boolean; data: BlueprintShareResponse }> {
  return request<{ success: boolean; data: BlueprintShareResponse }>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/blueprint/share`,
    {
      method: 'POST',
      body: JSON.stringify(reqData),
    },
  );
}

/**
 * GET /api/v1/onboarding/share/:shareToken
 * Retrieves a shared onboarding blueprint by share token (public, no auth required).
 */
export async function getSharedBlueprint(
  shareToken: string,
): Promise<{ success: boolean; data: SharedBlueprintView }> {
  const response = await fetch(
    `${API_BASE}/api/v1/onboarding/share/${encodeURIComponent(shareToken)}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    },
  );
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
  return body as { success: boolean; data: SharedBlueprintView };
}

/**
 * GET /api/v1/repositories/:repositoryId/intelligence/health
 */
export async function getArchitectureHealth(
  repositoryId: string,
): Promise<{ success: boolean; data: ArchitectureHealthReport }> {
  return request<{ success: boolean; data: ArchitectureHealthReport }>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/health`,
  );
}

/**
 * POST /api/v1/repositories/:repositoryId/intelligence/health/explain
 */
export async function explainArchitectureFinding(
  repositoryId: string,
  reqData: ArchitectureHealthExplainRequest,
): Promise<{ success: boolean; data: ArchitectureHealthExplanationResponse }> {
  return request<{ success: boolean; data: ArchitectureHealthExplanationResponse }>(
    `/repositories/${encodeURIComponent(repositoryId)}/intelligence/health/explain`,
    {
      method: 'POST',
      body: JSON.stringify(reqData),
    },
  );
}
