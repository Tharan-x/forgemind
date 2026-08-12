// =============================================================================
// ForgeMind API — OpenAI LLM Provider
// =============================================================================

import type { LLMProvider, LLMProviderOptions } from './types.js';

export class OpenAILLMProvider implements LLMProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: LLMProviderOptions = {}) {
    const key = options.apiKey || process.env['OPENAI_API_KEY'];
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable or options.apiKey is required.');
    }
    this.apiKey = key;
    this.model = options.model || 'gpt-4o-mini';
  }

  async generateAnswer(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Chat API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response content from OpenAI Chat API.');
    }

    return content;
  }
}
