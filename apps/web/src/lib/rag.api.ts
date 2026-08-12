// =============================================================================
// ForgeMind Web — RAG Query API Client
// =============================================================================

import type { RAGQueryResponse } from '@forgemind/types';
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

/**
 * POST /api/v1/repositories/:repositoryId/chat
 *
 * Sends a RAG question query to the server for codebase analysis & answer generation.
 */
export async function queryRepositoryRAG(
  repositoryId: string,
  query: string,
  topK?: number,
): Promise<RAGQueryResponse> {
  const token = await getAccessToken();

  const response = await fetch(
    `${API_BASE}/api/v1/repositories/${encodeURIComponent(repositoryId)}/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, topK }),
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

  return {
    answer: (body['answer'] as string) || 'No response generated.',
    sources: (body['sources'] as RAGQueryResponse['sources']) || [],
    repositoryId: (body['repositoryId'] as string) || repositoryId,
    query: (body['query'] as string) || query,
    providerUsed: (body['providerUsed'] as string) || 'unknown',
  };
}
