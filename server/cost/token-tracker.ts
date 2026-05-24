/**
 * Token 追踪器：追踪每次 LLM 调用的 Token 消耗
 */

interface TokenUsage {
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: number;
}

interface SessionTokenSummary {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
  callCount: number;
  startTime: number;
  lastUpdateTime: number;
}

// 全局 Token 使用记录
const tokenUsages: TokenUsage[] = [];

// 会话 Token 汇总
const sessionSummaries = new Map<string, SessionTokenSummary>();

// Token 价格表（每 1K tokens）
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4': { input: 0.003, output: 0.015 },
  'claude-opus-4': { input: 0.015, output: 0.075 },
  'claude-haiku-4': { input: 0.00025, output: 0.00125 },
  'default': { input: 0.003, output: 0.015 },
};

/**
 * 记录 Token 使用
 */
export function trackTokenUsage(
  sessionId: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): { totalTokens: number; cost: number } {
  const price = TOKEN_PRICES[model] || TOKEN_PRICES['default'];
  const cost = (inputTokens / 1000) * price.input + (outputTokens / 1000) * price.output;

  const usage: TokenUsage = {
    sessionId,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    timestamp: Date.now(),
  };

  tokenUsages.push(usage);

  // 更新会话汇总
  let summary = sessionSummaries.get(sessionId);
  if (!summary) {
    summary = {
      sessionId,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      callCount: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
    };
    sessionSummaries.set(sessionId, summary);
  }

  summary.totalInputTokens += inputTokens;
  summary.totalOutputTokens += outputTokens;
  summary.totalTokens += usage.totalTokens;
  summary.totalCost += cost;
  summary.callCount += 1;
  summary.lastUpdateTime = Date.now();

  console.log(`[TokenTracker] 会话 ${sessionId}: +${inputTokens + outputTokens} tokens, +$${cost.toFixed(4)}`);
  console.log(`[TokenTracker] 累计: ${summary.totalTokens} tokens, $${summary.totalCost.toFixed(4)}`);

  return {
    totalTokens: summary.totalTokens,
    cost: summary.totalCost,
  };
}

/**
 * 获取会话 Token 使用摘要
 */
export function getSessionTokenSummary(
  sessionId: string
): SessionTokenSummary | null {
  return sessionSummaries.get(sessionId) || null;
}

/**
 * 获取所有会话的 Token 使用摘要
 */
export function getAllSessionTokenSummaries(): SessionTokenSummary[] {
  return Array.from(sessionSummaries.values());
}

/**
 * 检查是否超出预算
 */
export function checkBudget(
  sessionId: string,
  maxTokens?: number,
  maxCost?: number
): { withinBudget: boolean; reason?: string } {
  const summary = sessionSummaries.get(sessionId);
  if (!summary) {
    return { withinBudget: true };
  }

  const maxTokensLimit = maxTokens || 100000; // 默认 100K tokens
  const maxCostLimit = maxCost || 1.00; // 默认 $1.00

  if (summary.totalTokens > maxTokensLimit) {
    return {
      withinBudget: false,
      reason: `超出 Token 预算: ${summary.totalTokens} > ${maxTokensLimit}`,
    };
  }

  if (summary.totalCost > maxCostLimit) {
    return {
      withinBudget: false,
      reason: `超出成本预算: $${summary.totalCost.toFixed(4)} > $${maxCostLimit.toFixed(2)}`,
    };
  }

  return { withinBudget: true };
}

/**
 * 估算提示词的 Token 数量
 * （简化实现：1 token ≈ 4 字符）
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * 在 LLM 调用前检查预算
 */
export function preCheckBudget(
  sessionId: string,
  estimatedInputTokens: number,
  model: string,
  maxTokens?: number,
  maxCost?: number
): { canProceed: boolean; reason?: string; estimatedCost?: number } {
  const summary = sessionSummaries.get(sessionId) || {
    totalTokens: 0,
    totalCost: 0,
  };

  const price = TOKEN_PRICES[model] || TOKEN_PRICES['default'];
  const estimatedCost = (estimatedInputTokens / 1000) * price.input;

  const maxTokensLimit = maxTokens || 100000;
  const maxCostLimit = maxCost || 1.00;

  if (summary.totalTokens + estimatedInputTokens > maxTokensLimit) {
    return {
      canProceed: false,
      reason: `预估将超出 Token 预算: ${summary.totalTokens + estimatedInputTokens} > ${maxTokensLimit}`,
      estimatedCost,
    };
  }

  if (summary.totalCost + estimatedCost > maxCostLimit) {
    return {
      canProceed: false,
      reason: `预估将超出成本预算: $${(summary.totalCost + estimatedCost).toFixed(4)} > $${maxCostLimit.toFixed(2)}`,
      estimatedCost,
    };
  }

  return {
    canProceed: true,
    estimatedCost,
  };
}

/**
 * 重置会话的 Token 计数
 */
export function resetSessionTokens(sessionId: string): void {
  sessionSummaries.delete(sessionId);
  console.log(`[TokenTracker] 已重置会话 ${sessionId} 的 Token 计数`);
}

/**
 * 获取全局 Token 统计
 */
export function getGlobalTokenStats(): {
  totalSessions: number;
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
} {
  let totalTokens = 0;
  let totalCost = 0;
  let totalCalls = 0;

  for (const summary of sessionSummaries.values()) {
    totalTokens += summary.totalTokens;
    totalCost += summary.totalCost;
    totalCalls += summary.callCount;
  }

  return {
    totalSessions: sessionSummaries.size,
    totalTokens,
    totalCost,
    totalCalls,
  };
}
