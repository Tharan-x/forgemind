// =============================================================================
// ForgeMind API — Embedding Provider Factory
// =============================================================================

import { LocalDeterministicEmbeddingProvider } from './deterministic-mock.provider.js';
import { GeminiEmbeddingProvider } from './gemini.provider.js';
import { OpenAIEmbeddingProvider } from './openai.provider.js';
import type { EmbeddingProvider, EmbeddingProviderOptions } from './types.js';

let cachedProvider: EmbeddingProvider | null = null;

/**
 * Creates or retrieves the active embedding provider based on environment configuration.
 *
 * Selection priority:
 * 1. Explicit `EMBEDDING_PROVIDER` environment setting ('openai' | 'gemini' | 'local-deterministic')
 * 2. Presence of `OPENAI_API_KEY`
 * 3. Presence of `GEMINI_API_KEY`
 * 4. Fallback to `LocalDeterministicEmbeddingProvider`
 */
export function getEmbeddingProvider(options: EmbeddingProviderOptions = {}): EmbeddingProvider {
  if (cachedProvider && !options.apiKey) {
    return cachedProvider;
  }

  const requestedProvider = process.env['EMBEDDING_PROVIDER']?.toLowerCase();

  if (requestedProvider === 'openai' || (!requestedProvider && process.env['OPENAI_API_KEY'])) {
    try {
      const provider = new OpenAIEmbeddingProvider(options);
      if (!options.apiKey) cachedProvider = provider;
      return provider;
    } catch {
      // Fallback if key initialization fails
    }
  }

  if (requestedProvider === 'gemini' || (!requestedProvider && process.env['GEMINI_API_KEY'])) {
    try {
      const provider = new GeminiEmbeddingProvider(options);
      if (!options.apiKey) cachedProvider = provider;
      return provider;
    } catch {
      // Fallback if key initialization fails
    }
  }

  const fallback = new LocalDeterministicEmbeddingProvider();
  if (!options.apiKey) cachedProvider = fallback;
  return fallback;
}

/**
 * Resets the cached embedding provider instance (useful for testing).
 */
export function resetEmbeddingProvider(): void {
  cachedProvider = null;
}
