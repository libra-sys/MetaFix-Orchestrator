import { OpenAiProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';
import type { LlmProvider, ProviderConfig } from './types.js';

const providerCache = new Map<string, LlmProvider>();

export function createProvider(name: string, config: ProviderConfig): LlmProvider {
  const key = `${name}::${config.apiKey}::${config.baseUrl}`;
  if (providerCache.has(key)) return providerCache.get(key)!;

  let provider: LlmProvider;
  switch (name.toLowerCase()) {
    case 'anthropic':
    case 'claude':
      provider = new AnthropicProvider(config);
      break;
    case 'ollama':
      provider = new OllamaProvider(config);
      break;
    case 'openai':
    default:
      provider = new OpenAiProvider(config);
      break;
  }
  providerCache.set(key, provider);
  return provider;
}

export function getProviderForModel(modelId: string, apiKey: string, baseUrl?: string): LlmProvider {
  if (modelId.includes('claude')) {
    return createProvider('anthropic', { apiKey, baseUrl, defaultModel: modelId });
  }
  if (baseUrl?.includes('11434') || baseUrl?.includes('ollama')) {
    return createProvider('ollama', { apiKey, baseUrl, defaultModel: modelId });
  }
  return createProvider('openai', { apiKey, baseUrl, defaultModel: modelId });
}

export type { LlmProvider, ProviderConfig } from './types.js';
