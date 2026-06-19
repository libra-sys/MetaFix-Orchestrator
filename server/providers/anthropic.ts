import type { LlmProvider, CompletionParams, ProviderConfig } from './types.js';

export class AnthropicProvider implements LlmProvider {
  name = 'anthropic';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async complete(params: CompletionParams): Promise<string> {
    const url = `${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const body: any = {
      model: params.model || this.config.defaultModel,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    };
    if (params.jsonMode) body.response_format = { type: 'json_object' };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.content?.[0]?.text || '';
  }

  async *completeStream(params: CompletionParams): AsyncIterable<string> {
    const url = `${this.config.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const body: any = {
      model: params.model || this.config.defaultModel,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.3,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
      stream: true,
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Anthropic API ${resp.status}: ${await resp.text()}`);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.replace('data:', '').trim();
        if (data === '[DONE]') return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.delta?.text || '';
          if (delta) yield delta;
        } catch { /* ignore */ }
      }
    }
  }

  async getModels(): Promise<string[]> {
    return ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
  }
}
