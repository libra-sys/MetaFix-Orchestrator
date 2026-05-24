import { v4 as uuidv4 } from 'uuid';
import * as db from '../db.js';
import config from '../config.js';
import { query } from '@tencent-ai/agent-sdk';

/**
 * 反思模块：评估执行结果、更新知识库
 * @param session - Agent 会话
 * @param plan - 修复计划
 * @param executionResult - 执行结果
 * @returns 反思结果
 */
export async function reflect(
  session: any,
  plan: any,
  executionResult: any
): Promise<{
  success: boolean;
  skillPerformance: Array<{
    skillId: string;
    success: boolean;
    duration: number;
    errorMessage?: string;
  }>;
  lessonsLearned: string[];
  knowledgeUpdates: Array<{
    type: string;
    data: any;
  }>;
}> {
  console.log(`[Reflector] 开始反思...`);
  console.log(`[Reflector] 计划 ID: ${plan.id}`);
  console.log(`[Reflector] 执行成功: ${executionResult.success}`);

  const skillPerformance: Array<{
    skillId: string;
    success: boolean;
    duration: number;
    errorMessage?: string;
  }> = [];

  // 1. 分析每个步骤的技能表现
  for (const stepResult of executionResult.stepResults) {
    const step = plan.steps.find((s: any) => s.id === stepResult.stepId);
    const skillId = step?.requiredSkills?.[0] || 'unknown';

    const perf = {
      skillId,
      success: stepResult.success,
      duration: stepResult.duration,
      errorMessage: stepResult.success ? undefined : stepResult.output,
    };

    skillPerformance.push(perf);

    // 2. 更新技能成功率
    await updateSkillSuccessRate(skillId, stepResult.success, stepResult.duration);
  }

  // 3. 生成经验教训
  const lessonsLearned = await generateLessonsLearned(plan, executionResult);

  // 4. 更新知识库
  const knowledgeUpdates = await updateKnowledgeBase(plan, executionResult, skillPerformance);

  // 5. 如果成功，记录技能组合
  if (executionResult.success) {
    await recordSkillCombination(plan.steps);
  }

  console.log(`[Reflector] 反思完成:`);
  console.log(`[Reflector] - 技能表现: ${skillPerformance.length} 个`);
  console.log(`[Reflector] - 经验教训: ${lessonsLearned.length} 条`);
  console.log(`[Reflector] - 知识更新: ${knowledgeUpdates.length} 项`);

  return {
    success: executionResult.success,
    skillPerformance,
    lessonsLearned,
    knowledgeUpdates,
  };
}

/**
 * 更新技能成功率
 */
async function updateSkillSuccessRate(
  skillId: string,
  success: boolean,
  duration: number
): Promise<void> {
  const skill = db.getSkill(skillId);

  if (skill) {
    // 更新成功率（简单移动平均）
    const oldRate = skill.success_rate;
    const newRate = oldRate * 0.9 + (success ? 0.1 : 0);

    // 更新平均耗时
    const oldDuration = skill.avg_duration;
    const newDuration = Math.round(oldDuration * 0.9 + duration * 0.1);

    db.updateSkill(skillId, {
      success_rate: newRate,
      avg_duration: newDuration,
    });

    console.log(`[Reflector] 更新技能 ${skillId}: 成功率 ${(newRate * 100).toFixed(1)}%`);
  } else {
    // 创建新技能记录
    db.createSkill({
      id: skillId,
      name: skillId,
      version: '1.0.0',
      description: '',
      author: 'system',
      source: 'auto-created',
      required_mcps: '',
      success_rate: success ? 1.0 : 0.0,
      avg_duration: duration,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    console.log(`[Reflector] 创建新技能记录: ${skillId}`);
  }
}

/**
 * 生成经验教训
 */
async function generateLessonsLearned(plan: any, executionResult: any): Promise<string[]> {
  const lessons: string[] = [];

  // 分析失败的步骤
  const failedSteps = executionResult.stepResults.filter((r: any) => !r.success);
  if (failedSteps.length > 0) {
    lessons.push(`有 ${failedSteps.length} 个步骤失败，需要改进`);
    for (const failed of failedSteps) {
      lessons.push(`步骤 ${failed.stepId} 失败原因: ${failed.output.slice(0, 100)}`);
    }
  }

  // 分析耗时的步骤
  const slowSteps = executionResult.stepResults.filter((r: any) => r.duration > 60000);
  if (slowSteps.length > 0) {
    lessons.push(`有 ${slowSteps.length} 个步骤执行超时（>60s）`);
  }

  // 使用 CodeBuddy SDK 生成更深入的反思
  try {
    const prompt = `
你是一个软件工程反思专家。请根据以下信息，生成经验教训。

## 修复计划
${JSON.stringify(plan, null, 2)}

## 执行结果
成功: ${executionResult.success}
步骤数: ${executionResult.stepResults.length}

请生成 3-5 条具体的经验教训，帮助未来的修复任务做得更好。
每条约 50 字，具体且可操作。
`;

    let result = '';
    const stream = query({
      prompt,
      options: {
        model: config.agentDefaultModel,
        maxTurns: 5,
        systemPrompt: '你是一个专业的软件工程反思专家。',
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

    if (result) {
      const aiLessons = result.split('\n').filter((l: string) => l.trim().length > 0);
      lessons.push(...aiLessons);
    }
  } catch (error: any) {
    console.error('[Reflector] 生成 AI 反思失败:', error);
  }

  return lessons;
}

/**
 * 更新知识库
 */
async function updateKnowledgeBase(
  plan: any,
  executionResult: any,
  skillPerformance: any[]
): Promise<Array<{ type: string; data: any }>> {
  const updates: Array<{ type: string; data: any }> = [];

  // 1. 更新技能组合知识库
  if (executionResult.success) {
    const skillIds = plan.steps
      .map((s: any) => s.requiredSkills?.[0])
      .filter((id: string) => id)
      .join(',');

    const existingCombo = db.getAllSkillCombinations().find((c: any) => c.skill_ids === skillIds);

    if (existingCombo) {
      db.updateSkillCombinationUsage(existingCombo.id, true);
      updates.push({ type: 'skill_combination', data: existingCombo });
    } else {
      const newCombo = {
        id: uuidv4(),
        skill_ids: skillIds,
        success_rate: 1.0,
        usage_count: 1,
        created_at: new Date().toISOString(),
      };
      db.createSkillCombination(newCombo);
      updates.push({ type: 'skill_combination', data: newCombo });
    }
  }

  // 2. 记录执行模式
  const pattern = {
    type: 'execution_pattern',
    plan_steps: plan.steps.length,
    success: executionResult.success,
    total_duration: executionResult.stepResults.reduce((sum: number, r: any) => sum + r.duration, 0),
  };
  updates.push({ type: 'execution_pattern', data: pattern });

  return updates;
}

/**
 * 记录技能组合
 */
async function recordSkillCombination(steps: any[]): Promise<void> {
  const skillIds = steps
    .map((s: any) => s.requiredSkills?.[0])
    .filter((id: string) => id)
    .join(',');

  if (!skillIds) return;

  const existing = db.getAllSkillCombinations().find((c: any) => c.skill_ids === skillIds);

  if (existing) {
    db.updateSkillCombinationUsage(existing.id, true);
  } else {
    db.createSkillCombination({
      id: uuidv4(),
      skill_ids: skillIds,
      success_rate: 1.0,
      usage_count: 1,
      created_at: new Date().toISOString(),
    });
    console.log(`[Reflector] 记录新技能组合: ${skillIds}`);
  }
}

/**
 * 生成反思报告（用于展示给用户）
 */
export function generateReflectionReport(reflectionLog: any): string {
  const lines: string[] = [];

  lines.push('# 反思报告');
  lines.push('');
  lines.push(`- **会话 ID**: ${reflectionLog.session_id}`);
  lines.push(`- **计划 ID**: ${reflectionLog.plan_id || 'N/A'}`);
  lines.push(`- **时间**: ${reflectionLog.created_at}`);
  lines.push('');

  // 技能表现
  if (reflectionLog.skill_performance) {
    const perf = JSON.parse(reflectionLog.skill_performance);
    lines.push('## 技能表现');
    lines.push('');
    for (const p of perf) {
      const status = p.success ? '✅' : '❌';
      lines.push(`- ${status} **${p.skillId}**: ${p.duration}ms`);
      if (p.errorMessage) {
        lines.push(`  - 错误: ${p.errorMessage}`);
      }
    }
    lines.push('');
  }

  // 经验教训
  if (reflectionLog.lessons_learned) {
    const lessons = JSON.parse(reflectionLog.lessons_learned);
    lines.push('## 经验教训');
    lines.push('');
    for (let i = 0; i < lessons.length; i++) {
      lines.push(`${i + 1}. ${lessons[i]}`);
    }
    lines.push('');
  }

  // 知识更新
  if (reflectionLog.knowledge_updates) {
    const updates = JSON.parse(reflectionLog.knowledge_updates);
    lines.push('## 知识库更新');
    lines.push('');
    for (const update of updates) {
      lines.push(`- **${update.type}**: ${JSON.stringify(update.data).slice(0, 100)}`);
    }
  }

  return lines.join('\n');
}
