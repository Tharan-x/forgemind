// =============================================================================
// ForgeMind API — LLM Provider Abstraction Types
// =============================================================================

export interface LLMProvider {
  /**
   * The identifier name of the provider (e.g., 'openai', 'gemini', 'local-deterministic').
   */
  readonly name: string;

  /**
   * Generates a text response from system instructions and user query prompt.
   */
  generateAnswer(systemPrompt: string, userPrompt: string): Promise<string>;
}

export type LLMProviderType = 'openai' | 'gemini' | 'local-deterministic';

export interface LLMProviderOptions {
  apiKey?: string;
  model?: string;
}
