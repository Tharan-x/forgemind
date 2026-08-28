// =============================================================================
// ForgeMind API — RAG Pipeline Orchestrator
// =============================================================================

import type { ConversationalMessage } from './llm/types.js';
import type { ChatMessage, RAGQueryResponse, RAGSourceCitation } from '@forgemind/types';

import { retrieveRepositoryContext } from './context-retrieval.service.js';
import { getRecentRepositoryChatHistory } from './chat-history.service.js';
import { getLLMProvider } from './llm/factory.js';
import { buildRAGPrompt } from './rag-prompt.service.js';
import { reformulateQueryForRetrieval } from './query-reformulation.service.js';

import { analyzeQueryIntent } from './query-intent.service.js';
import { getArchitectureOverview } from './code-intelligence.service.js';

import { prisma } from '../lib/prisma.js';

export interface RAGPipelineOptions {
  topK?: number;
  threshold?: number;
}

/**
 * Resolves the appropriate topK value for retrieval based on query intent.
 *
 * Intent-aware scaling:
 *  - FLOW / ARCHITECTURE / DEPENDENCIES: 12 (cross-file questions need more sources)
 *  - General queries: 8 (up from 5; handles multi-file questions without excess cost)
 *  - Explicit caller override always wins.
 */
function resolveTopK(explicitTopK: number | undefined, intentCategory: string): number {
  if (explicitTopK !== undefined && explicitTopK > 0) {
    return explicitTopK;
  }
  if (
    intentCategory === 'FLOW' ||
    intentCategory === 'ARCHITECTURE' ||
    intentCategory === 'DEPENDENCIES'
  ) {
    return 12;
  }
  return 8;
}

/**
 * Converts a ChatMessage array (from DB) to ConversationalMessage turns for multi-turn LLM calls.
 *
 * Maps:
 *  - sender='user' → role='user'
 *  - sender='assistant' → role='assistant'
 *  - sender='system' → skipped (handled via systemInstructions)
 *
 * Bounded to the most recent MAX_TURNS turns to prevent context explosion.
 */
const MAX_CONVERSATIONAL_TURNS = 10;

function buildConversationalTurns(
  historyMessages: ChatMessage[],
  currentUserQuery: string,
): ConversationalMessage[] {
  const recent = historyMessages.slice(-MAX_CONVERSATIONAL_TURNS);
  const turns: ConversationalMessage[] = [];

  for (const msg of recent) {
    if (msg.sender === 'system') continue;
    turns.push({
      role: msg.sender === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Always append the current user question as the final turn
  turns.push({ role: 'user', content: currentUserQuery });

  return turns;
}

/**
 * End-to-end RAG query orchestrator.
 *
 * 1. Retrieves bounded recent chat history (max 10 turns) for multi-turn context.
 * 2. Reformulates retrieval query string deterministically using context history.
 * 3. Analyzes query intent; resolves intent-aware topK (8 general, 12 for FLOW/ARCH/DEPS).
 * 4. Retrieves relevant codebase context via hybrid search with reranking.
 * 5. Injects structural repository summary for architecture/module/flow questions.
 * 6. Assembles structured, injection-resistant LLM prompt.
 * 7. Prefers native multi-turn LLM call when provider supports it and history is available.
 *    Falls back to single-turn generateAnswer otherwise.
 * 8. Persists chat session, user message, and assistant message (with source citations in metadata).
 * 9. Returns answer with source citations.
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

  // 1. Bounded Conversation History Retrieval (Last 10 messages for repository/user session)
  let historyMessages: ChatMessage[] | undefined;
  try {
    historyMessages = await getRecentRepositoryChatHistory(repositoryId, userId, 10);
  } catch (histErr) {
    // Non-fatal: if history retrieval fails, proceed with single-turn RAG
    // eslint-disable-next-line no-console
    console.warn('[RAG Pipeline] Failed retrieving conversation history:', histErr);
  }

  // 2. Deterministic Contextual Query Reformulation (for retrieval only)
  const retrievalQuery = reformulateQueryForRetrieval(trimmedQuery, historyMessages);

  // 3. Intent Analysis & topK Resolution
  const intent = analyzeQueryIntent(retrievalQuery);
  const topK = resolveTopK(options.topK, intent.category);

  // 4. Context Retrieval (Hybrid Vector + Lexical Search with Reranking)
  const contextChunks = await retrieveRepositoryContext(repositoryId, userId, retrievalQuery, {
    topK,
    threshold: options.threshold,
  });

  // 5. Structural Repository Summary (for ARCHITECTURE, DEPENDENCIES, FILE_LOCATION,
  //    DB_CONFIGURATION, and FLOW intent — any query asking about relationships/structure)
  let structuralContext: string | undefined;
  if (
    intent.category === 'ARCHITECTURE' ||
    intent.category === 'DEPENDENCIES' ||
    intent.category === 'FILE_LOCATION' ||
    intent.category === 'DB_CONFIGURATION' ||
    intent.category === 'FLOW'
  ) {
    try {
      const arch = await getArchitectureOverview(repositoryId, userId);
      structuralContext = `Repository: ${arch.repositoryName} (${arch.totalFiles} files, ${arch.totalSymbols} AST symbols, ${arch.totalDependencies} dependencies)
Major Directories: ${arch.topDirectories.map((d) => `/${d.directory} (${d.fileCount} files)`).join(', ')}
Language Breakdown: ${Object.entries(arch.languageDistribution)
        .map(([l, c]) => `${l}: ${c} files`)
        .join(', ')}
Top External Packages: ${arch.topExternalPackages
        .slice(0, 10)
        .map((p) => p.package)
        .join(', ')}`;
    } catch {
      // Non-fatal if structural overview fetch fails
    }
  }

  // 6. Prompt Assembly (uses ORIGINAL user query + bounded history)
  const { systemPrompt, userPrompt } = buildRAGPrompt(contextChunks, trimmedQuery, {
    structuralContext,
    historyMessages,
  });

  // 7. LLM Answer Synthesis
  //    Prefer native multi-turn when provider supports it AND we have conversation history.
  //    This gives the model better conversational state tracking for follow-up questions.
  const llmProvider = getLLMProvider();
  let answer = '';
  try {
    const hasHistory = historyMessages && historyMessages.length > 0;

    if (hasHistory && typeof llmProvider.generateConversationalAnswer === 'function') {
      // Build structured conversation turns: history + current query
      const conversationTurns = buildConversationalTurns(historyMessages || [], trimmedQuery);
      answer = await llmProvider.generateConversationalAnswer(systemPrompt, conversationTurns);
    } else {
      // Single-turn: deterministic mock, or providers without multi-turn support
      answer = await llmProvider.generateAnswer(systemPrompt, userPrompt);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[RAG Pipeline] LLM generation warning:', err);
    answer = `An error occurred while generating the AI answer. Context snippets were retrieved successfully. Please check provider logs.`;
  }

  // 8. Source Citation Formatting
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

  // 9. Database Chat Session & Message Persistence
  //    Sources are persisted in assistant message metadata so citations survive page reload.
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

    // Persist source citations in assistant message metadata for durable citations on reload
    const sourcesForPersistence = sources.map((s) => ({
      filePath: s.filePath,
      startLine: s.startLine,
      endLine: s.endLine,
      score: s.score,
      symbolName: s.symbolName,
      symbolKind: s.symbolKind,
      language: s.language,
    }));

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
            sources: sourcesForPersistence,
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
