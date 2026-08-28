// =============================================================================
// ForgeMind API — LLM Provider Factory
// =============================================================================

import { LocalDeterministicLLMProvider } from './deterministic-mock.provider.js';
import { GeminiLLMProvider } from './gemini.provider.js';
import { OpenAILLMProvider } from './openai.provider.js';
import type { LLMProvider, LLMProviderOptions } from './types.js';

let cachedLLMProvider: LLMProvider | null = null;

/**
 * Creates or retrieves the active LLM provider based on environment configuration.
 *
 * Selection priority:
 * 1. Explicit `LLM_PROVIDER` environment variable ('openai' | 'gemini' | 'local-deterministic')
 * 2. Presence of `OPENAI_API_KEY`
 * 3. Presence of `GEMINI_API_KEY`
 * 4. Fallback to `LocalDeterministicLLMProvider`
 */
export function getLLMProvider(options: LLMProviderOptions = {}): LLMProvider {
  if (cachedLLMProvider && !options.apiKey) {
    return cachedLLMProvider;
  }

  const requested = process.env['LLM_PROVIDER']?.toLowerCase();

  if (requested === 'gemini' || (!requested && process.env['GEMINI_API_KEY'])) {
    try {
      const provider = new GeminiLLMProvider(options);
      if (!options.apiKey) cachedLLMProvider = provider;
      return provider;
    } catch {
      // Fallback if key initialization fails
    }
  }

  if (requested === 'openai' || (!requested && process.env['OPENAI_API_KEY'])) {
    try {
      const provider = new OpenAILLMProvider(options);
      if (!options.apiKey) cachedLLMProvider = provider;
      return provider;
    } catch {
      // Fallback if key initialization fails
    }
  }

  const fallback = new LocalDeterministicLLMProvider();
  if (!options.apiKey) cachedLLMProvider = fallback;
  return fallback;
}

/**
 * Resets cached provider instance.
 */
export function resetLLMProvider(): void {
  cachedLLMProvider = null;
}
