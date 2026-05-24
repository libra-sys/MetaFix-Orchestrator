/**
 * 预算管理模块：监控和控制 Token 和成本消耗
 */

import { checkBudget as checkTokenBudget, preCheckBudget } from './token-tracker.js';
import config from '../config.js';

interface BudgetAlert {
  type: 'token' | 'cost';
  current: number;
  limit: number;
  percentage: number;
}

interface BudgetConfig {
  maxTokensPerSession: number;
  maxCostPerSession: number;
  maxTokensGlobal: number;
  maxCostGlobal: number;
  alertThreshold: number; // 0-1，达到预算百分比时告警
}

// 全局预算配置
let budgetConfig: BudgetConfig = {
  maxTokensPerSession: config.maxTokensPerSession,
  maxCostPerSession: config.maxCostPerSession,
  maxTokensGlobal: 1000000, // 1M tokens
  maxCostGlobal: 10.00, // $10.00
  alertThreshold: 0.8, // 80%
};

// 全局统计
let globalTokens = 0;
let globalCost = 0;

/**
 * 检查会话预算
 * @param sessionId - 会话 ID
 * @returns 是否通过检查
 */
export function checkSessionBudget(
  sessionId: string
): { passed: boolean; alert?: BudgetAlert; reason?: string } {
  const tokenCheck = checkTokenBudget(
    sessionId,
    budgetConfig.maxTokensPerSession,
    budgetConfig.maxCostPerSession
  );

  if (!tokenCheck.withinBudget) {
    return {
      passed: false,
      reason: tokenCheck.reason,
    };
  }

  // 检查是否需要告警
  const summary = getSessionTokenSummary?.(sessionId);
  if (summary) {
    const tokenPercentage = summary.totalTokens / budgetConfig.maxTokensPerSession;
    const costPercentage = summary.totalCost / budgetConfig.maxCostPerSession;

    if (tokenPercentage >= budgetConfig.alertThreshold) {
      return {
        passed: true,
        alert: {
          type: 'token',
          current: summary.totalTokens,
          limit: budgetConfig.maxTokensPerSession,
          percentage: tokenPercentage,
        },
      };
    }

    if (costPercentage >= budgetConfig.alertThreshold) {
      return {
        passed: true,
        alert: {
          type: 'cost',
          current: summary.totalCost,
          limit: budgetConfig.maxCostPerSession,
          percentage: costPercentage,
        },
      };
    }
  }

  return { passed: true };
}

/**
 * 在 LLM 调用前预检查会话预算
 * @param sessionId - 会话 ID
 * @param estimatedTokens - 预估 Token 消耗
 * @param model - 模型名称
 * @returns 是否可以进行调用
 */
export function preCheckSessionBudget(
  sessionId: string,
  estimatedTokens: number,
  model = 'default'
): { canProceed: boolean; estimatedCost?: number; reason?: string } {
  const result = preCheckBudget(sessionId, estimatedTokens, model);

  if (!result.canProceed) {
    return {
      canProceed: false,
      estimatedCost: result.estimatedCost,
      reason: result.reason,
    };
  }

  // 更新全局统计
  globalTokens += estimatedTokens;
  globalCost += result.estimatedCost || 0;

  // 检查全局预算
  if (globalTokens > budgetConfig.maxTokensGlobal) {
    return {
      canProceed: false,
      reason: `超出全局 Token 预算: ${globalTokens} > ${budgetConfig.maxTokensGlobal}`,
    };
  }

  if (globalCost > budgetConfig.maxCostGlobal) {
    return {
      canProceed: false,
      reason: `超出全局成本预算: $${globalCost.toFixed(2)} > $${budgetConfig.maxCostGlobal.toFixed(2)}`,
    };
  }

  return {
    canProceed: true,
    estimatedCost: result.estimatedCost,
  };
}

/**
 * 更新全局统计（在实际 LLM 调用后）
 * @param tokens - 实际 Token 消耗
 * @param cost - 实际成本
 */
export function updateGlobalStats(tokens: number, cost: number): void {
  globalTokens += tokens;
  globalCost += cost;

  console.log(`[Budget] 全局统计: ${globalTokens} tokens, $${globalCost.toFixed(4)}`);
}

/**
 * 获取预算配置
 */
export function getBudgetConfig(): BudgetConfig {
  return { ...budgetConfig };
}

/**
 * 更新预算配置
 * @param updates - 要更新的配置项
 */
export function updateBudgetConfig(updates: Partial<BudgetConfig>): void {
  budgetConfig = { ...budgetConfig, ...updates };
  console.log('[Budget] 配置已更新:', budgetConfig);
}

/**
 * 获取全局预算状态
 */
export function getGlobalBudgetStatus(): {
  tokens: { used: number; limit: number; percentage: number };
  cost: { used: number; limit: number; percentage: number };
} {
  return {
    tokens: {
      used: globalTokens,
      limit: budgetConfig.maxTokensGlobal,
      percentage: globalTokens / budgetConfig.maxTokensGlobal,
    },
    cost: {
      used: globalCost,
      limit: budgetConfig.maxCostGlobal,
      percentage: globalCost / budgetConfig.maxCostGlobal,
    },
  };
}

/**
 * 重置全局统计（例如每天重置）
 */
export function resetGlobalStats(): void {
  console.log(`[Budget] 重置全局统计: ${globalTokens} tokens, $${globalCost.toFixed(4)}`);
  globalTokens = 0;
  globalCost = 0;
}

// ============= 辅助函数（延迟导入以避免循环依赖）=============

let _getSessionTokenSummary: ((sessionId: string) => any) | null = null;

function getSessionTokenSummary(sessionId: string) {
  if (!_getSessionTokenSummary) {
    // 延迟导入
    const tokenTracker = require('./token-tracker.js');
    _getSessionTokenSummary = tokenTracker.getSessionTokenSummary;
  }
  return _getSessionTokenSummary?.(sessionId);
}
