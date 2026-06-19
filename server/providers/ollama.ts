import type { LlmProvider, CompletionParams, ProviderConfig } from './types.js';

export class OllamaProvider implements LlmProvider {
  name = 'ollama';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async complete(params: CompletionParams): Promise<string> {
    const url = `${this.config.baseUrl || 'http://localhost:11434'}/api/chat`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model || this.config.defaultModel,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        stream: false,
        options: { temperature: params.temperature ?? 0.3, num_predict: params.maxTokens ?? 4096 },
        format: params.jsonMode ? 'json' : undefined,
      }),
    });
    if (!resp.ok) throw new Error(`Ollama API ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return data.message?.content || '';
  }

  async *completeStream(params: CompletionParams): AsyncIterable<string> {
    const url = `${this.config.baseUrl || 'http://localhost:11434'}/api/chat`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model || this.config.defaultModel,
        messages: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.user },
        ],
        stream: true,
        options: { temperature: params.temperature ?? 0.3, num_predict: params.maxTokens ?? 4096 },
      }),
    });
    if (!resp.ok) throw new Error(`Ollama API ${resp.status}: ${await resp.text()}`);
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const line of text.split('\n').filter(l => l.trim())) {
        try {
          const parsed = JSON.parse(line);
          const delta = parsed.message?.content || '';
          if (delta) yield delta;
          if (parsed.done) return;
        } catch { /* ignore */ }
      }
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const resp = await fetch(`${this.config.baseUrl || 'http://localhost:11434'}/api/tags`);
      const data = await resp.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}
