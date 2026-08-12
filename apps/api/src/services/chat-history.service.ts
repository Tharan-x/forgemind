// =============================================================================
// ForgeMind API — Chat History Service
// =============================================================================

import { PrismaClient } from '@prisma/client';
import type { ChatMessage, ChatSession } from '@forgemind/types';

const prisma = new PrismaClient();

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
