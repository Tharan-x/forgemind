// =============================================================================
// ForgeMind API — RAG Pipeline Orchestrator
// =============================================================================

import { PrismaClient } from '@prisma/client';
import type { RAGQueryResponse, RAGSourceCitation } from '@forgemind/types';

import { retrieveRepositoryContext } from './context-retrieval.service.js';
import { getLLMProvider } from './llm/factory.js';
import { buildRAGPrompt } from './rag-prompt.service.js';

const prisma = new PrismaClient();

export interface RAGPipelineOptions {
  topK?: number;
  threshold?: number;
}

/**
 * End-to-end RAG query orchestrator.
 *
 * 1. Retrieves relevant codebase context via pgvector semantic search.
 * 2. Assembles structured, injection-resistant LLM prompt.
 * 3. Synthesizes answer using server-side LLM provider (OpenAI, Gemini, or Local Fallback).
 * 4. Persists chat session and messages to database.
 * 5. Returns answer with source citations.
 *
 * @param repositoryId Target database repository UUID
 * @param userId Authenticated user UUID
 * @param query User's natural language question
 * @param options Pipeline options
 */
export async function executeRAGQuery(
  repositoryId: string,
  userId: string,
  query: string,
  options: RAGPipelineOptions = {},
): Promise<RAGQueryResponse> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error('Query string cannot be empty.');
  }

  // 1. Context Retrieval
  const contextChunks = await retrieveRepositoryContext(repositoryId, userId, trimmedQuery, {
    topK: options.topK || 5,
    threshold: options.threshold || 0.0,
  });

  // 2. Prompt Assembly
  const { systemPrompt, userPrompt } = buildRAGPrompt(contextChunks, trimmedQuery);

  // 3. LLM Answer Synthesis
  const llmProvider = getLLMProvider();
  let answer = '';
  try {
    answer = await llmProvider.generateAnswer(systemPrompt, userPrompt);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[RAG Pipeline] LLM generation warning:', err);
    answer = `An error occurred while generating the AI answer. Context snippets were retrieved successfully. Please check provider logs.`;
  }

  // 4. Source Citation Formatting
  const sources: RAGSourceCitation[] = contextChunks.map((chunk) => ({
    filePath: chunk.filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    score: chunk.similarity,
    symbolName:
      typeof chunk.metadata?.['symbolName'] === 'string' ? chunk.metadata['symbolName'] : undefined,
    symbolKind:
      typeof chunk.metadata?.['symbolKind'] === 'string' ? chunk.metadata['symbolKind'] : undefined,
    language: chunk.language,
    content: chunk.content,
  }));

  // 5. Database Chat Session & Message Persistence
  try {
    let session = await prisma.chatSession.findFirst({
      where: { repositoryId, userId },
      orderBy: { updatedAt: 'desc' },
    });

    if (!session) {
      session = await prisma.chatSession.create({
        data: {
          repositoryId,
          userId,
          title: trimmedQuery.substring(0, 50),
        },
      });
    }

    await prisma.chatMessage.createMany({
      data: [
        {
          sessionId: session.id,
          sender: 'user',
          content: trimmedQuery,
        },
        {
          sessionId: session.id,
          sender: 'assistant',
          content: answer,
          metadata: {
            sourcesCount: sources.length,
            provider: llmProvider.name,
          },
        },
      ],
    });
  } catch (dbErr) {
    // eslint-disable-next-line no-console
    console.warn('[RAG Pipeline] Failed recording chat session in database:', dbErr);
  }

  return {
    answer,
    sources,
    repositoryId,
    query: trimmedQuery,
    providerUsed: llmProvider.name,
  };
}
