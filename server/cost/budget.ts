import { getSessionCost, estimateTokens } from './token-tracker.js';

interface BudgetConfig {
  maxTokensPerSession: number;
  maxCostPerSession: number;
}

function getConfig(): BudgetConfig {
  return {
    maxTokensPerSession: parseInt(process.env.MAX_TOKENS_PER_SESSION || '100000'),
    maxCostPerSession: parseFloat(process.env.MAX_COST_PER_SESSION || '1.00'),
  };
}

export function checkBudget(sessionId: string, estimatedInputTokens: number, estimatedOutputTokens: number): { allowed: boolean; reason?: string } {
  const config = getConfig();
  const current = getSessionCost(sessionId);
  const estimatedNewTokens = estimatedInputTokens + estimatedOutputTokens;

  if (current.totalTokens + estimatedNewTokens > config.maxTokensPerSession) {
    return {
      allowed: false,
      reason: `Token 预算超限: 当前 ${current.totalTokens} + 预估 ${estimatedNewTokens} > 限制 ${config.maxTokensPerSession}`,
    };
  }

  // 粗略预估新增成本
  const estimatedNewCost = (estimatedNewTokens / 1000) * 0.002;
  if (current.totalCost + estimatedNewCost > config.maxCostPerSession) {
    return {
      allowed: false,
      reason: `成本预算超限: 当前 $${current.totalCost.toFixed(4)} + 预估 $${estimatedNewCost.toFixed(4)} > 限制 $${config.maxCostPerSession}`,
    };
  }

  return { allowed: true };
}

export function checkBudgetForText(sessionId: string, text: string): { allowed: boolean; reason?: string } {
  const tokens = estimateTokens(text);
  return checkBudget(sessionId, tokens, Math.ceil(tokens * 0.5));
}
