// =============================================================================
// ForgeMind API — Disabled / Unconfigured Embedding Provider
// =============================================================================

import type { EmbeddingProvider } from './types.js';

export class EmbeddingUnavailableError extends Error {
  constructor(
    message = 'No valid embedding provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or EMBEDDING_PROVIDER to enable vector embeddings.',
  ) {
    super(message);
    this.name = 'EmbeddingUnavailableError';
  }
}

/**
 * Null-object embedding provider used when no OPENAI_API_KEY or GEMINI_API_KEY is configured.
 * Replaces silent random SHA-256 vector generation with an explicit unavailable state.
 */
export class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'none';
  readonly dimension = 0;

  async generateEmbedding(_text: string): Promise<number[]> {
    throw new EmbeddingUnavailableError();
  }

  async generateBatchEmbeddings(_texts: string[]): Promise<number[][]> {
    throw new EmbeddingUnavailableError();
  }
}
