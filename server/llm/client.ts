import { createProvider, getProviderForModel } from '../providers/index.js';
import * as db from '../db.js';
import type { LlmProvider } from '../providers/types.js';

let cachedProvider: LlmProvider | null = null;
let cachedProviderKey = '';

function getProvider(): LlmProvider {
  const models = db.getEnabledUserModels();
  const model = models.find(m => m.api_key);
  const key = model?.api_key || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
  const baseUrl = model?.base_url || process.env.OPENAI_BASE_URL || process.env.ANTHROPIC_BASE_URL || '';
  const providerName = model?.provider || detectProviderFromEnv();
  const modelId = model?.model_id || process.env.DEFAULT_MODEL || 'gpt-4o-mini';

  const cacheKey = `${providerName}::${key}::${baseUrl}::${modelId}`;
  if (cachedProvider && cachedProviderKey === cacheKey) return cachedProvider;

  if (!key) {
    throw new Error('未配置 LLM API Key。请在设置页面添加自定义模型，或设置 OPENAI_API_KEY / ANTHROPIC_API_KEY 环境变量。');
  }

  cachedProvider = createProvider(providerName, { apiKey: key, baseUrl: baseUrl, defaultModel: modelId });
  cachedProviderKey = cacheKey;
  return cachedProvider;
}

function detectProviderFromEnv(): string {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'openai';
}

export function getDefaultModel(): string {
  const models = db.getEnabledUserModels();
  if (models.length > 0) return models[0].model_id;
  return process.env.DEFAULT_MODEL || 'gpt-4o-mini';
}

export function hasLlmConfig(): boolean {
  try {
    const models = db.getEnabledUserModels();
    if (models.some(m => m.api_key)) return true;
    return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
  } catch { return false; }
}

/** 非流式文本补全 */
export async function complete(params: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const provider = getProvider();
  return provider.complete({
    model: params.model || getDefaultModel(),
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 4096,
    jsonMode: params.jsonMode,
  });
}

/** 带 Function Calling 的补全 */
export async function completeWithTools(params: {
  system: string;
  user: string;
  tools: Array<{ name: string; description: string; parameters: any }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{
  content: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
}> {
  const provider = getProvider();
  const result = await provider.complete({
    model: params.model || getDefaultModel(),
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 4096,
    tools: params.tools,
  });

  // 解析可能的 tool_calls JSON（不同 provider 格式不同，这里做简单解析）
  let content = result;
  const toolCalls: Array<{ name: string; arguments: Record<string, unknown> }> = [];

  try {
    const parsed = JSON.parse(result);
    if (parsed.tool_calls || parsed.tools) {
      const calls = parsed.tool_calls || parsed.tools;
      for (const call of calls) {
        toolCalls.push({
          name: call.name || call.function?.name,
          arguments: call.arguments || call.function?.arguments || call.parameters || {},
        });
      }
      content = parsed.content || parsed.message || '';
    }
  } catch {
    // 不是 JSON，视为纯文本
  }

  return { content, toolCalls };
}

export async function *streamComplete(params: {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): AsyncIterable<string> {
  const provider = getProvider();
  if (!provider.completeStream) {
    const result = await provider.complete({
      model: params.model || getDefaultModel(),
      system: params.system,
      user: params.user,
      temperature: params.temperature ?? 0.3,
      maxTokens: params.maxTokens ?? 4096,
    });
    yield result;
    return;
  }
  for await (const chunk of provider.completeStream({
    model: params.model || getDefaultModel(),
    system: params.system,
    user: params.user,
    temperature: params.temperature ?? 0.3,
    maxTokens: params.maxTokens ?? 4096,
  })) {
    yield chunk;
  }
}
