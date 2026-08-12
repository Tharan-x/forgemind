// =============================================================================
// ForgeMind API — Local Deterministic Embedding Provider (Fallback)
// =============================================================================

import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from './types.js';

/**
 * Deterministic local embedding provider that generates normalized 1536-d vectors
 * from text content without needing external API keys.
 * Used when no OPENAI_API_KEY or GEMINI_API_KEY is configured in the environment.
 */
export class LocalDeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local-deterministic';
  readonly dimension = 1536;

  async generateEmbedding(text: string): Promise<number[]> {
    return this.createVector(text);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.createVector(text));
  }

  private createVector(text: string): number[] {
    const vector: number[] = new Array(this.dimension).fill(0);
    const normalizedText = text.trim().toLowerCase();

    if (!normalizedText) {
      vector[0] = 1.0;
      return vector;
    }

    // Seed hash from SHA-256 of text
    const hash = createHash('sha256').update(normalizedText).digest();

    // Fill vector dimensions using pseudo-random hashing and character frequency features
    for (let i = 0; i < this.dimension; i++) {
      const byte = hash[i % hash.length] ?? 0;
      const charIndex = i % Math.max(1, normalizedText.length);
      const charCode = normalizedText.charCodeAt(charIndex);

      const val = Math.sin((i + 1) * byte + charCode) * Math.cos((i + 1) * 0.1);
      vector[i] = val;
    }

    // Normalize vector to unit length (L2 norm) so cosine similarity calculations work properly
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += (vector[i] ?? 0) * (vector[i] ?? 0);
    }

    const norm = Math.sqrt(sumSq) || 1.0;
    for (let i = 0; i < this.dimension; i++) {
      vector[i] = (vector[i] ?? 0) / norm;
    }

    return vector;
  }
}
