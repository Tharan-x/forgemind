// =============================================================================
// ForgeMind Web — RAG Query & Chat History API Client
// =============================================================================

import type { ChatMessage, ChatSession, RAGQueryResponse } from '@forgemind/types';
import { getDeviceId } from './device.api';
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

// ---------------------------------------------------------------------------
// POST /api/v1/repositories/:repositoryId/chat
// ---------------------------------------------------------------------------

/**
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
        'X-Device-Id': getDeviceId(),
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

// ---------------------------------------------------------------------------
// GET /api/v1/repositories/:repositoryId/chat/history
// ---------------------------------------------------------------------------

export interface ChatHistoryResponse {
  session: ChatSession | null;
  messages: ChatMessage[];
}

/**
 * Returns the most recent chat session and its ordered messages for the given repository.
 */
export async function getRepositoryChatHistory(repositoryId: string): Promise<ChatHistoryResponse> {
  const token = await getAccessToken();

  const response = await fetch(
    `${API_BASE}/api/v1/repositories/${encodeURIComponent(repositoryId)}/chat/history`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': getDeviceId(),
      },
    },
  );

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof (body['error'] as Record<string, unknown> | undefined)?.['message'] === 'string'
        ? ((body['error'] as Record<string, unknown>)['message'] as string)
        : `API error ${response.status}`,
    );
  }

  return {
    session: (body['session'] as ChatSession) || null,
    messages: (body['messages'] as ChatMessage[]) || [],
  };
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/repositories/:repositoryId/chat/history
// ---------------------------------------------------------------------------

/**
 * Clears all chat sessions and messages for the given repository.
 * Returns the number of deleted sessions.
 */
export async function clearRepositoryChatHistory(
  repositoryId: string,
): Promise<{ deletedSessions: number }> {
  const token = await getAccessToken();

  const response = await fetch(
    `${API_BASE}/api/v1/repositories/${encodeURIComponent(repositoryId)}/chat/history`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Device-Id': getDeviceId(),
      },
    },
  );

  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    throw new Error(
      typeof (body['error'] as Record<string, unknown> | undefined)?.['message'] === 'string'
        ? ((body['error'] as Record<string, unknown>)['message'] as string)
        : `API error ${response.status}`,
    );
  }

  return {
    deletedSessions: (body['deletedSessions'] as number) || 0,
  };
}
