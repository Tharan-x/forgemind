// =============================================================================
// ForgeMind API — Embedding Provider Abstraction Types
// =============================================================================

export interface EmbeddingProvider {
  /**
   * The identifier name of the provider (e.g., 'openai', 'gemini', 'local-deterministic').
   */
  readonly name: string;

  /**
   * Vector dimensions produced by this provider (e.g. 1536).
   */
  readonly dimension: number;

  /**
   * Generates a vector embedding array for a single text string.
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generates vector embeddings for a batch of text strings.
   */
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

export type EmbeddingProviderType = 'openai' | 'gemini' | 'local-deterministic';

export interface EmbeddingProviderOptions {
  apiKey?: string;
  model?: string;
  dimension?: number;
}
