// =============================================================================
// ForgeMind API — Chat History Service
// =============================================================================

import type { ChatMessage, ChatSession } from '@forgemind/types';

import { prisma } from '../lib/prisma.js';

export interface ChatHistoryResult {
  session: ChatSession | null;
  messages: ChatMessage[];
}

/**
 * Loads the most recent chat session and its messages for a repository/user pair.
 *
 * @param repositoryId Target repository UUID
 * @param userId Authenticated user UUID
 * @returns Session and ordered messages, or null session with empty messages if none exists
 */
export async function getRepositoryChatHistory(
  repositoryId: string,
  userId: string,
): Promise<ChatHistoryResult> {
  const session = await prisma.chatSession.findFirst({
    where: { repositoryId, userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!session) {
    return { session: null, messages: [] };
  }

  const typedSession: ChatSession = {
    id: session.id,
    repositoryId: session.repositoryId,
    userId: session.userId,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };

  const typedMessages: ChatMessage[] = session.messages.map((m) => ({
    id: m.id,
    sessionId: m.sessionId,
    sender: m.sender as ChatMessage['sender'],
    content: m.content,
    metadata: (m.metadata as Record<string, unknown>) || null,
    createdAt: m.createdAt.toISOString(),
  }));

  return { session: typedSession, messages: typedMessages };
}

/**
 * Loads the most recent N chat messages for a repository/user pair,
 * ordered chronologically (oldest first) for RAG context prompt assembly.
 *
 * Enforces:
 * - Strict repositoryId + userId isolation
 * - Database-level limit (take: limit, default 10)
 * - Descending query for efficiency, reversed to ascending (oldest -> newest) in memory
 *
 * @param repositoryId Target repository UUID
 * @param userId Authenticated user UUID
 * @param limit Maximum number of recent messages to retrieve (default 10)
 */
export async function getRecentRepositoryChatHistory(
  repositoryId: string,
  userId: string,
  limit: number = 10,
): Promise<ChatMessage[]> {
  const session = await prisma.chatSession.findFirst({
    where: { repositoryId, userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
    },
  });

  if (!session) {
    return [];
  }

  const rawMessages = await prisma.chatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  if (rawMessages.length === 0) {
    return [];
  }

  // Convert to ChatMessage format and reverse to chronological order (oldest -> newest)
  const typedMessages: ChatMessage[] = rawMessages.map((m) => ({
    id: m.id,
    sessionId: m.sessionId,
    sender: m.sender as ChatMessage['sender'],
    content: m.content,
    metadata: (m.metadata as Record<string, unknown>) || null,
    createdAt: m.createdAt.toISOString(),
  }));

  typedMessages.reverse();

  return typedMessages;
}

/**
 * Clears all chat sessions and messages for a repository/user pair.
 * Returns the count of sessions deleted.
 *
 * @param repositoryId Target repository UUID
 * @param userId Authenticated user UUID
 */
export async function clearRepositoryChatHistory(
  repositoryId: string,
  userId: string,
): Promise<{ deletedSessions: number }> {
  const result = await prisma.chatSession.deleteMany({
    where: { repositoryId, userId },
  });

  return { deletedSessions: result.count };
}
