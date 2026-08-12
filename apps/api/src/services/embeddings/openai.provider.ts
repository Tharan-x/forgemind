// =============================================================================
// ForgeMind API — OpenAI Embedding Provider
// =============================================================================

import type { EmbeddingProvider, EmbeddingProviderOptions } from './types.js';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimension: number;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: EmbeddingProviderOptions = {}) {
    const key = options.apiKey || process.env['OPENAI_API_KEY'];
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable or options.apiKey is required.');
    }
    this.apiKey = key;
    this.model = options.model || 'text-embedding-3-small';
    this.dimension = options.dimension || 1536;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const results = await this.generateBatchEmbeddings([text]);
    const first = results[0];
    if (!first) {
      throw new Error('Failed to generate embedding vector from OpenAI response.');
    }
    return first;
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimension,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Embedding API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    if (!data || !Array.isArray(data.data)) {
      throw new Error('Invalid response structure from OpenAI Embedding API');
    }

    // Sort by input index to preserve order
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}
