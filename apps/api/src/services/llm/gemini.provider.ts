// =============================================================================
// ForgeMind API — Gemini LLM Provider
// =============================================================================

import type { LLMProvider, LLMProviderOptions } from './types.js';

export class GeminiLLMProvider implements LLMProvider {
  readonly name = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: LLMProviderOptions = {}) {
    const key = options.apiKey || process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable or options.apiKey is required.');
    }
    this.apiKey = key;
    this.model = options.model || 'gemini-1.5-flash';
  }

  async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.2 },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini LLM API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response text from Gemini LLM API.');
    }

    return text;
  }
}
