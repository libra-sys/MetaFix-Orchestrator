export interface LlmProvider {
  name: string;
  complete(params: CompletionParams): Promise<string>;
  completeStream?(params: CompletionParams): AsyncIterable<string>;
  getModels(): Promise<string[]>;
}

export interface CompletionParams {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  tools?: Array<{ name: string; description: string; parameters: any }>;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
}
