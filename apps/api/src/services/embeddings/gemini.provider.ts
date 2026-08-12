// =============================================================================
// ForgeMind API — Gemini Embedding Provider
// =============================================================================

import type { EmbeddingProvider, EmbeddingProviderOptions } from './types.js';

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: EmbeddingProviderOptions = {}) {
    const key = options.apiKey || process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable or options.apiKey is required.');
    }
    this.apiKey = key;
    this.model = options.model || 'text-embedding-004';
    this.dimension = options.dimension || 768;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Embedding API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      embedding?: { values: number[] };
    };

    if (!data?.embedding?.values) {
      throw new Error('Invalid embedding response from Gemini API.');
    }

    return data.embedding.values;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const requests = texts.map((text) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text }] },
    }));

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Batch Embedding API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      embeddings?: Array<{ values: number[] }>;
    };

    if (!data?.embeddings || !Array.isArray(data.embeddings)) {
      throw new Error('Invalid batch embedding response from Gemini API.');
    }

    return data.embeddings.map((item) => item.values);
  }
}
