import { v4 as uuidv4 } from 'uuid';
import config from '../config.js';
import { query, unstable_v2_createSession } from '@tencent-ai/agent-sdk';
import * as db from '../db.js';

/**
 * 技能执行器：在临时子智能体中执行技能
 */

export interface SkillExecutionResult {
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}

/**
 * 执行单个技能
 * @param skill - 技能定义
 * @param context - 执行上下文
 * @returns 执行结果
 */
export async function executeSkill(
  skill: { name: string; definition: string; requiredMcps: string[] },
  context: Record<string, any>
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  console.log(`[Skill Executor] 执行技能: ${skill.name}`);

  try {
    // 创建临时子智能体 session
    const session = await unstable_v2_createSession({
      cwd: config.defaultCwd || process.cwd(),
    });

    // 构建执行提示词
    const prompt = buildExecutionPrompt(skill, context);

    // 调用 CodeBuddy SDK 执行
    let output = '';
    const stream = query({
      prompt,
      options: {
        model: config.agentDefaultModel,
        maxTurns: 10,
        systemPrompt: buildSystemPrompt(skill),
        cwd: config.defaultCwd || process.cwd(),
      },
    });

    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        const content = msg.message.content;
        if (typeof content === 'string') {
          output += content + '\n';
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              output += block.text + '\n';
            }
          }
        }
      }
    }

    const duration = Date.now() - startTime;

    // 更新技能成功率
    updateSkillStats(skill.name, true, duration);

    console.log(`[Skill Executor] 技能 ${skill.name} 执行完成 (${duration}ms)`);

    return {
      success: true,
      output,
      duration,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    const errorMessage = error?.message || String(error);

    // 更新技能成功率
    updateSkillStats(skill.name, false, duration);

    console.error(`[Skill Executor] 技能 ${skill.name} 执行失败:`, errorMessage);

    return {
      success: false,
      output: '',
      duration,
      error: errorMessage,
    };
  }
}

/**
 * 批量执行技能
 */
export async function executeSkills(
  skills: Array<{ name: string; definition: string; requiredMcps: string[] }>,
  context: Record<string, any>
): Promise<SkillExecutionResult[]> {
  const results: SkillExecutionResult[] = [];

  for (const skill of skills) {
    const result = await executeSkill(skill, context);
    results.push(result);

    // 如果技能失败且是关键的，停止执行
    if (!result.success) {
      console.log(`[Skill Executor] 技能 ${skill.name} 失败，停止执行`);
      break;
    }
  }

  return results;
}

// ============= 辅助函数 =============

function buildExecutionPrompt(
  skill: { name: string; definition: string; requiredMcps: string[] },
  context: Record<string, any>
): string {
  return `
你是一个技能执行器。请执行以下技能：

## 技能名称
${skill.name}

## 技能定义
${skill.definition}

## 执行上下文
${JSON.stringify(context, null, 2)}

## 要求
1. 按照技能定义执行操作
2. 使用提供的 MCP 工具（${skill.requiredMcps.join(', ') || '无'}）
3. 输出详细的执行日志
4. 不要询问确认，直接执行

请开始执行。
`;
}

function buildSystemPrompt(skill: { name: string; definition: string; requiredMcps: string[] }): string {
  return `你是技能执行器，正在执行 ${skill.name} 技能。

你的任务：
1. 理解技能定义
2. 使用可用的工具执行操作
3. 输出详细的执行日志
4. 如果失败，输出详细的错误信息

可用 MCP：${skill.requiredMcps.join(', ') || '基础文件系统'}
`;
}

function updateSkillStats(skillName: string, success: boolean, duration: number): void {
  const skill = db.getSkill(skillName);

  if (skill) {
    // 更新成功率（移动平均）
    const oldRate = skill.success_rate;
    const newRate = oldRate * 0.9 + (success ? 0.1 : 0);

    // 更新平均耗时
    const oldDuration = skill.avg_duration;
    const newDuration = Math.round(oldDuration * 0.9 + duration * 0.1);

    db.updateSkill(skillName, {
      success_rate: newRate,
      avg_duration: newDuration,
    });
  }
}
