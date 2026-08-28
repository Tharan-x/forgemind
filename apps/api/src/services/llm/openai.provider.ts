// =============================================================================
// ForgeMind API — OpenAI LLM Provider
// =============================================================================

import type { ConversationalMessage, LLMProvider, LLMProviderOptions } from './types.js';

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

  /**
   * Sends a native multi-turn conversation to OpenAI using the messages[] array.
   *
   * systemInstructions is sent as a single `system` role message.
   * conversationTurns are sent as alternating `user`/`assistant` messages.
   * The final entry in conversationTurns must be the current user question (role='user').
   *
   * This gives the model proper conversational state tracking for follow-up questions.
   */
  async generateConversationalAnswer(
    systemInstructions: string,
    conversationTurns: ConversationalMessage[],
  ): Promise<string> {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemInstructions },
    ];

    for (const turn of conversationTurns) {
      // Map 'assistant' → 'assistant', 'user' → 'user', skip 'system' (already set)
      if (turn.role === 'system') continue;
      messages.push({ role: turn.role, content: turn.content });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
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
