import * as db from '../db.js';

interface TokenUsage {
  sessionId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timestamp: string;
}

const sessionUsage = new Map<string, TokenUsage[]>();

export function trackTokenUsage(
  sessionId: string,
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number
): void {
  const costUsd = estimateCost(model, inputTokens, outputTokens);
  const usage: TokenUsage = {
    sessionId,
    model,
    provider,
    inputTokens,
    outputTokens,
    costUsd,
    timestamp: new Date().toISOString(),
  };
  if (!sessionUsage.has(sessionId)) sessionUsage.set(sessionId, []);
  sessionUsage.get(sessionId)!.push(usage);
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 5 / 1_000_000, output: 15 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
    'gpt-4-turbo': { input: 10 / 1_000_000, output: 30 / 1_000_000 },
    'claude-3-5-sonnet': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-3-opus': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-3-haiku': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
  };
  const key = Object.keys(pricing).find(k => model.toLowerCase().includes(k.toLowerCase()));
  if (!key) return 0;
  const p = pricing[key];
  return (inputTokens * p.input) + (outputTokens * p.output);
}

export function getSessionCost(sessionId: string): { totalTokens: number; totalCost: number; usages: TokenUsage[] } {
  const usages = sessionUsage.get(sessionId) || [];
  const totalTokens = usages.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0);
  const totalCost = usages.reduce((sum, u) => sum + u.costUsd, 0);
  return { totalTokens, totalCost, usages };
}

export function getAllCosts(): { sessionId: string; totalTokens: number; totalCost: number }[] {
  return Array.from(sessionUsage.entries()).map(([sessionId, usages]) => ({
    sessionId,
    totalTokens: usages.reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0),
    totalCost: usages.reduce((sum, u) => sum + u.costUsd, 0),
  }));
}

export function estimateTokens(text: string): number {
  // 粗略估计：1 token ≈ 4 个英文字符 或 1 个汉字
  let count = 0;
  for (const char of text) {
    count += char.charCodeAt(0) > 127 ? 1.5 : 0.25;
  }
  return Math.ceil(count);
}
