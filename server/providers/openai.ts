import OpenAI from 'openai';
import type { LlmProvider, CompletionParams, ProviderConfig } from './types.js';

export class OpenAiProvider implements LlmProvider {
  name = 'openai';
  private client: OpenAI;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    const options: any = { apiKey: config.apiKey };
    if (config.baseUrl) options.baseURL = config.baseUrl;
    this.client = new OpenAI(options);
  }

  async complete(params: CompletionParams): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: params.model || this.config.defaultModel,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 4096,
      response_format: params.jsonMode ? { type: 'json_object' } : undefined,
      tools: params.tools?.map(t => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: params.tools ? 'auto' : undefined,
    });
    return completion.choices[0]?.message?.content || '';
  }

  async *completeStream(params: CompletionParams): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: params.model || this.config.defaultModel,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.user },
      ],
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 4096,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) yield delta;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const list = await this.client.models.list();
      return list.data.map(m => m.id);
    } catch {
      return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
    }
  }
}
