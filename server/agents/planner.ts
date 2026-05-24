import { v4 as uuidv4 } from 'uuid';
import * as db from '../db.js';
import config from '../config.js';
import { query } from '@tencent-ai/agent-sdk';

/**
 * 规划模块：生成修复计划
 * @param session - Agent 会话
 * @returns 修复计划
 */
export async function plan(session: any): Promise<{
  id: string;
  issueId: string;
  steps: Array<{
    id: string;
    description: string;
    targetFiles: string[];
    requiredSkills: string[];
    status: string;
    retryCount: number;
  }>;
  estimatedTokens: number;
  estimatedCost: number;
  riskLevel: string;
  requiresApproval: boolean;
}> {
  const { context, issueId } = session;
  const perception = context.perception;
  
  console.log(`[Planner] 开始生成修复计划...`);
  console.log(`[Planner] Issue: ${issueId}`);
  console.log(`[Planner] 根因: ${perception.rootCause.slice(0, 100)}...`);
  
  // 1. 基于感知结果和历史经验生成计划
  const planSteps = await generatePlanSteps(perception);
  
  // 2. 解析每个步骤需要的技能（五级优先级）
  for (const step of planSteps) {
    step.requiredSkills = await resolveRequiredSkills(step.description, perception);
  }
  
  // 3. 评估风险
  const riskLevel = assessRisk(planSteps, perception);
  const requiresApproval = riskLevel === 'high' || hasHighRiskOperation(planSteps);
  
  // 4. 估算成本
  const estimatedTokens = estimateTokens(planSteps);
  const estimatedCost = estimatedTokens * 0.00002; // 假设 $0.00002/token
  
  const plan = {
    id: uuidv4(),
    issueId,
    steps: planSteps,
    estimatedTokens,
    estimatedCost,
    riskLevel,
    requiresApproval,
  };
  
  console.log(`[Planner] 计划生成完成:`);
  console.log(`[Planner] - 步骤数: ${planSteps.length}`);
  console.log(`[Planner] - 预估 Token: ${estimatedTokens}`);
  console.log(`[Planner] - 预估成本: $${estimatedCost.toFixed(4)}`);
  console.log(`[Planner] - 风险等级: ${riskLevel}`);
  console.log(`[Planner] - 需要审批: ${requiresApproval}`);
  
  return plan;
}

/**
 * 生成计划步骤
 */
async function generatePlanSteps(perception: any): Promise<Array<{
  id: string;
  description: string;
  targetFiles: string[];
  requiredSkills: string[];
  status: string;
  retryCount: number;
}>> {
  try {
    const prompt = `
你是一个软件缺陷修复规划专家。请根据以下信息，生成详细的修复计划。

## Issue 描述
${perception.issueDescription}

## 根因分析
${perception.rootCause}

## 相关文件
${perception.relevantFiles.join('\n- ')}

## 项目 Wiki
${perception.projectWiki}

## 项目规则
${perception.rules}

请生成修复计划，包含 3-5 个步骤。每个步骤应该包含：
1. 步骤描述
2. 目标文件列表
3. 建议使用的技能名称

输出格式（JSON）：
[
  {
    "description": "步骤描述",
    "targetFiles": ["file1.cpp", "file2.h"],
    "suggestedSkills": ["skill-name-1", "skill-name-2"]
  }
]
`;
    
    let result = '';
    const stream = query({
      prompt,
      options: {
        model: config.agentDefaultModel,
        maxTurns: 10,
        systemPrompt: '你是一个专业的软件缺陷修复规划专家。输出有效的 JSON。',
      },
    });
    
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        const content = msg.message.content;
        if (typeof content === 'string') {
          result += content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              result += block.text;
            }
          }
        }
      }
    }
    
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        return parsed.map((step: any) => ({
          id: uuidv4(),
          description: step.description || '未知步骤',
          targetFiles: step.targetFiles || perception.relevantFiles || [],
          requiredSkills: step.suggestedSkills || [],
          status: 'pending',
          retryCount: 0,
        }));
      }
    } catch (e) {
      console.error('[Planner] JSON 解析失败:', e);
    }
  } catch (error: any) {
    console.error('[Planner] 生成计划步骤失败:', error);
  }
  
  // 默认计划
  return [
    {
      id: uuidv4(),
      description: `分析 ${perception.relevantFiles[0] || '相关文件'} 中的问题`,
      targetFiles: perception.relevantFiles || ['flash_attention.cpp'],
      requiredSkills: ['code-analyzer'],
      status: 'pending',
      retryCount: 0,
    },
    {
      id: uuidv4(),
      description: '实施修复方案',
      targetFiles: perception.relevantFiles || ['flash_attention.cpp'],
      requiredSkills: ['code-fixer'],
      status: 'pending',
      retryCount: 0,
    },
    {
      id: uuidv4(),
      description: '编写测试用例验证修复',
      targetFiles: ['test_flashattention.py'],
      requiredSkills: ['test-writer'],
      status: 'pending',
      retryCount: 0,
    },
  ];
}

/**
 * 解析步骤所需的技能（五级优先级）
 */
async function resolveRequiredSkills(stepDescription: string, perception: any): Promise<string[]> {
  // 简化实现：基于步骤描述匹配技能
  const skillMap: Record<string, string[]> = {
    '分析': ['code-analyzer', 'cpp-debug-skill'],
    '修复': ['code-fixer', 'cpp-fix-skill'],
    '测试': ['test-writer', 'test-runner'],
    '提交': ['pr-creator', 'git-operator'],
  };
  
  for (const [keyword, skills] of Object.entries(skillMap)) {
    if (stepDescription.includes(keyword)) {
      return skills;
    }
  }
  
  return ['code-analyzer'];
}

/**
 * 评估风险等级
 */
function assessRisk(steps: any[], perception: any): string {
  // 检查是否有高风险操作
  for (const step of steps) {
    for (const file of step.targetFiles) {
      if (file.includes('CMakeLists.txt') || file.includes('Makefile')) {
        return 'high';
      }
    }
  }
  
  if (steps.length > 5) return 'medium';
  return 'low';
}

/**
 * 检查是否有高风险操作
 */
function hasHighRiskOperation(steps: any[]): boolean {
  for (const step of steps) {
    const desc = step.description.toLowerCase();
    if (desc.includes('删除') || desc.includes('重构') || desc.includes('架构')) {
      return true;
    }
  }
  return false;
}

/**
 * 估算 Token 消耗
 */
function estimateTokens(steps: any[]): number {
  // 简单估算：每个步骤约 200-400 tokens
  return steps.length * 300;
}
