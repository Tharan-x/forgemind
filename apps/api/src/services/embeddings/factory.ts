// =============================================================================
// ForgeMind API — Embedding Provider Factory
// =============================================================================

import { DisabledEmbeddingProvider } from './disabled.provider.js';
import { LocalDeterministicEmbeddingProvider } from './deterministic-mock.provider.js';
import { GeminiEmbeddingProvider } from './gemini.provider.js';
import { OpenAIEmbeddingProvider } from './openai.provider.js';
import type { EmbeddingProvider, EmbeddingProviderOptions } from './types.js';

let cachedProvider: EmbeddingProvider | null = null;

/**
 * Creates or retrieves the active embedding provider based on environment configuration.
 *
 * Selection priority:
 * 1. Explicit `EMBEDDING_PROVIDER` environment setting ('openai' | 'gemini' | 'mock' | 'local-deterministic' | 'none')
 * 2. Presence of `OPENAI_API_KEY` -> OpenAIEmbeddingProvider
 * 3. Presence of `GEMINI_API_KEY` -> GeminiEmbeddingProvider
 * 4. Unconfigured -> DisabledEmbeddingProvider ('none'), preventing silent random vector generation
 */
export function getEmbeddingProvider(options: EmbeddingProviderOptions = {}): EmbeddingProvider {
  if (cachedProvider && !options.apiKey) {
    return cachedProvider;
  }

  const requestedProvider = process.env['EMBEDDING_PROVIDER']?.toLowerCase();

  if (requestedProvider === 'none' || requestedProvider === 'disabled') {
    const provider = new DisabledEmbeddingProvider();
    if (!options.apiKey) cachedProvider = provider;
    return provider;
  }

  if (requestedProvider === 'mock' || requestedProvider === 'local-deterministic') {
    const provider = new LocalDeterministicEmbeddingProvider();
    if (!options.apiKey) cachedProvider = provider;
    return provider;
  }

  if (requestedProvider === 'openai') {
    const provider = new OpenAIEmbeddingProvider(options);
    if (!options.apiKey) cachedProvider = provider;
    return provider;
  }

  if (requestedProvider === 'gemini') {
    const provider = new GeminiEmbeddingProvider(options);
    if (!options.apiKey) cachedProvider = provider;
    return provider;
  }

  // Auto-detection when no explicit provider setting is present
  if (options.apiKey || process.env['GEMINI_API_KEY']) {
    try {
      const provider = new GeminiEmbeddingProvider(options);
      if (!options.apiKey) cachedProvider = provider;
      return provider;
    } catch {
      // Key missing or initialization failed
    }
  }

  if (options.apiKey || process.env['OPENAI_API_KEY']) {
    try {
      const provider = new OpenAIEmbeddingProvider(options);
      if (!options.apiKey) cachedProvider = provider;
      return provider;
    } catch {
      // Key missing or initialization failed
    }
  }

  const disabled = new DisabledEmbeddingProvider();
  if (!options.apiKey) cachedProvider = disabled;
  return disabled;
}

/**
 * Resets the cached embedding provider instance (useful for testing).
 */
export function resetEmbeddingProvider(): void {
  cachedProvider = null;
}
