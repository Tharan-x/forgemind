// =============================================================================
// ForgeMind API — LLM Provider Abstraction Types
// =============================================================================

/**
 * A single conversational turn for multi-turn LLM calls.
 * Maps to OpenAI `messages[]` and Gemini `contents[]` formats.
 */
export interface ConversationalMessage {
  /**
   * 'user' — a human turn (question, follow-up)
   * 'assistant' — a prior model response
   * 'system' — a system instruction (only supported as first message by some providers)
   */
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMProvider {
  /**
   * The identifier name of the provider (e.g., 'openai', 'gemini', 'local-deterministic').
   */
  readonly name: string;

  /**
   * Generates a text response from system instructions and user query prompt.
   * Used for single-turn requests (no conversation history).
   */
  generateAnswer(systemPrompt: string, userPrompt: string): Promise<string>;

  /**
   * Generates a text response using native multi-turn message format.
   * The systemInstructions string provides context/grounding (code snippets, repo info, rules).
   * The conversationTurns array provides the structured conversation history followed by
   * the current user message as the final entry.
   *
   * Falls back to generateAnswer(systemInstructions, last user message) if not implemented.
   */
  generateConversationalAnswer?(
    systemInstructions: string,
    conversationTurns: ConversationalMessage[],
  ): Promise<string>;
}

export type LLMProviderType = 'openai' | 'gemini' | 'local-deterministic';

export interface LLMProviderOptions {
  apiKey?: string;
  model?: string;
}
