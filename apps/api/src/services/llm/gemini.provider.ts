// =============================================================================
// ForgeMind API — Gemini LLM Provider
// =============================================================================

import type { ConversationalMessage, LLMProvider, LLMProviderOptions } from './types.js';

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
    this.model = options.model || process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';
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

  /**
   * Sends a native multi-turn conversation to Gemini using the contents[] array.
   *
   * systemInstructions is sent via systemInstruction field (Gemini-specific).
   * conversationTurns are mapped to Gemini role format:
   *   - 'user' → role: 'user'
   *   - 'assistant' → role: 'model'  (Gemini uses 'model' not 'assistant')
   *   - 'system' turns are skipped (handled via systemInstruction)
   *
   * The final entry in conversationTurns must be the current user question (role='user').
   */
  async generateConversationalAnswer(
    systemInstructions: string,
    conversationTurns: ConversationalMessage[],
  ): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const turn of conversationTurns) {
      if (turn.role === 'system') continue; // systemInstruction handles this
      // Map 'assistant' → 'model' for Gemini's role naming convention
      const geminiRole = turn.role === 'assistant' ? 'model' : 'user';
      contents.push({ role: geminiRole, parts: [{ text: turn.content }] });
    }

    // Gemini requires contents to be non-empty and end with a user turn
    if (contents.length === 0 || contents[contents.length - 1]?.role !== 'user') {
      throw new Error('Gemini generateConversationalAnswer: final turn must be a user message.');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstructions }] },
        contents,
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
