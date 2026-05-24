import * as db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 知识库更新器：根据反思结果更新知识库
 */

interface ReflectionResult {
  success: boolean;
  skillPerformance: Array<{
    skillId: string;
    success: boolean;
    duration: number;
  }>;
  lessonsLearned: string[];
  knowledgeUpdates: Array<{
    type: string;
    data: any;
  }>;
}

/**
 * 根据反思结果更新知识库
 * @param sessionId - 会话 ID
 * @param reflectionResult - 反思结果
 */
export async function updateKnowledgeBase(
  sessionId: string,
  reflectionResult: ReflectionResult
): Promise<void> {
  console.log(`[KnowledgeUpdater] 更新知识库，会话: ${sessionId}`);

  try {
    // 1. 更新技能成功率
    for (const perf of reflectionResult.skillPerformance) {
      await updateSkillSuccessRate(perf.skillId, perf.success, perf.duration);
    }

    // 2. 记录技能组合
    if (reflectionResult.success) {
      await recordSuccessfulCombination(reflectionResult.skillPerformance);
    }

    // 3. 保存经验教训
    if (reflectionResult.lessonsLearned && reflectionResult.lessonsLearned.length > 0) {
      await saveLessonsLearned(sessionId, reflectionResult.lessonsLearned);
    }

    // 4. 应用知识更新
    if (reflectionResult.knowledgeUpdates) {
      for (const update of reflectionResult.knowledgeUpdates) {
        await applyKnowledgeUpdate(update);
      }
    }

    console.log(`[KnowledgeUpdater] 知识库更新完成`);
  } catch (error: any) {
    console.error('[KnowledgeUpdater] 更新失败:', error);
    throw error;
  }
}

/**
 * 更新技能成功率（指数移动平均）
 */
async function updateSkillSuccessRate(
  skillId: string,
  success: boolean,
  duration: number
): Promise<void> {
  const skill = db.getSkill(skillId);

  if (skill) {
    // 指数移动平均：new = old * 0.9 + new * 0.1
    const alpha = 0.1;
    const newSuccessRate = skill.success_rate * (1 - alpha) + (success ? 1 : 0) * alpha;

    // 更新平均耗时
    const newAvgDuration = 
      skill.avg_duration * (1 - alpha) + duration * alpha;

    db.updateSkill(skillId, {
      success_rate: newSuccessRate,
      avg_duration: Math.round(newAvgDuration),
    });

    console.log(`[KnowledgeUpdater] 技能 ${skillId} 成功率更新: ${(newSuccessRate * 100).toFixed(1)}%`);
  } else {
    // 创建新技能记录
    db.createSkill({
      id: skillId,
      name: skillId,
      version: '1.0.0',
      description: `Auto-created: ${skillId}`,
      author: 'system',
      source: 'auto-created',
      required_mcps: JSON.stringify([]),
      success_rate: success ? 1.0 : 0.0,
      avg_duration: duration,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    console.log(`[KnowledgeUpdater] 创建新技能记录: ${skillId}`);
  }
}

/**
 * 记录成功的技能组合
 */
async function recordSuccessfulCombination(
  skillPerformance: Array<{ skillId: string; success: boolean; duration: number }>
): Promise<void> {
  const skillIds = skillPerformance
    .filter(p => p.success)
    .map(p => p.skillId)
    .join(',');

  if (!skillIds) return;

  const existingCombos = db.getAllSkillCombinations();
  const existing = existingCombos.find((c: any) => c.skill_ids === skillIds);

  if (existing) {
    // 更新现有组合
    db.updateSkillCombinationUsage(existing.id, true);
    console.log(`[KnowledgeUpdater] 更新技能组合: ${skillIds}`);
  } else {
    // 创建新组合
    db.createSkillCombination({
      id: `combo-${Date.now()}`,
      skill_ids: skillIds,
      success_rate: 1.0,
      usage_count: 1,
      created_at: new Date().toISOString(),
    });
    console.log(`[KnowledgeUpdater] 创建新技能组合: ${skillIds}`);
  }
}

/**
 * 保存经验教训
 */
async function saveLessonsLearned(
  sessionId: string,
  lessons: string[]
): Promise<void> {
  // 这里可以保存到专门的经验教训表，或追加到项目 Wiki
  console.log(`[KnowledgeUpdater] 经验教训 (${lessons.length} 条):`);
  lessons.forEach((lesson, i) => {
    console.log(`  ${i + 1}. ${lesson}`);
  });

  // 可选：追加到 .meta-fix/wiki/lessons-learned.md
  // 这里简化为日志记录
}

/**
 * 应用知识更新
 */
async function applyKnowledgeUpdate(update: { type: string; data: any }): Promise<void> {
  console.log(`[KnowledgeUpdater] 应用知识更新: ${update.type}`);

  switch (update.type) {
    case 'skill_combination':
      // 已经在 recordSuccessfulCombination 中处理
      break;

    case 'execution_pattern':
      // 记录执行模式
      console.log(`[KnowledgeUpdater] 执行模式: ${JSON.stringify(update.data)}`);
      break;

    case 'code_pattern':
      // 记录代码模式
      console.log(`[KnowledgeUpdater] 代码模式: ${JSON.stringify(update.data)}`);
      break;

    default:
      console.log(`[KnowledgeUpdater] 未知更新类型: ${update.type}`);
  }
}

/**
 * 获取技能推荐（基于历史成功率）
 * @param issueType - Issue 类型
 * @returns 推荐的技能列表
 */
export async function getRecommendedSkills(issueType: string): Promise<string[]> {
  console.log(`[KnowledgeUpdater] 获取推荐技能，类型: ${issueType}`);

  // 1. 查找相似 Issue 的成功组合
  const combos = db.getAllSkillCombinations()
    .sort((a: any, b: any) => b.success_rate - a.success_rate);

  if (combos.length > 0) {
    const best = combos[0];
    console.log(`[KnowledgeUpdater] 推荐技能组合: ${best.skill_ids} (成功率: ${(best.success_rate * 100).toFixed(1)}%)`);
    return best.skill_ids.split(',');
  }

  // 2. 如果没有历史记录，返回默认技能
  console.log(`[KnowledgeUpdater] 无历史记录，使用默认技能`);
  return getDefaultSkills(issueType);
}

/**
 * 获取默认技能（按 Issue 类型）
 */
function getDefaultSkills(issueType: string): string[] {
  const defaultSkills: Record<string, string[]> = {
    'cpp-nullptr': ['cpp-debug-skill', 'cpp-fix-skill', 'test-writer'],
    'cpp-nan': ['cpp-debug-skill', 'cpp-fix-skill', 'regression-guard'],
    'python-exception': ['python-debug-skill', 'python-fix-skill', 'test-writer'],
    'build-error': ['build-diagnostic-skill', 'fix-builder', 'test-writer'],
    'default': ['code-analyzer', 'code-fixer', 'test-writer'],
  };

  return defaultSkills[issueType] || defaultSkills['default'];
}
