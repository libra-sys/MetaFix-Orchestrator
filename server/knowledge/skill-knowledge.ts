import * as db from '../db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 技能知识库：管理技能组合和成功经验
 */

interface SkillCombinationRecord {
  id: string;
  skill_ids: string;
  success_rate: number;
  usage_count: number;
  created_at: string;
}

/**
 * 查找最佳技能组合
 * @param issueType - Issue 类型
 * @returns 技能 ID 列表
 */
export async function findBestSkillCombination(
  issueType: string
): Promise<string[]> {
  console.log(`[SkillKnowledge] 查找最佳技能组合，类型: ${issueType}`);

  // 从数据库查询成功率最高的组合
  const combos = db.getAllSkillCombinations();
  
  if (combos.length === 0) {
    console.log('[SkillKnowledge] 无历史组合，使用默认技能');
    return getDefaultSkillsForType(issueType);
  }

  // 按成功率排序，返回最佳组合
  const best = combos.sort(
    (a: any, b: any) => b.success_rate - a.success_rate
  )[0];

  console.log(`[SkillKnowledge] 找到最佳组合: ${best.skill_ids} (成功率: ${(best.success_rate * 100).toFixed(1)}%)`);
  return best.skill_ids.split(',');
}

/**
 * 记录技能组合使用结果
 */
export async function recordSkillCombinationUsage(
  skillIds: string[],
  success: boolean
): Promise<void> {
  const id = `combo-${skillIds.join('-')}`;
  const existing = db.getAllSkillCombinations().find((c: any) => c.id === id);

  if (existing) {
    // 更新现有组合
    const newSuccessRate = 
      existing.success_rate * 0.9 + (success ? 0.1 : 0);
    db.updateSkillCombinationUsage(id, success);
    console.log(`[SkillKnowledge] 更新组合 ${id}: 新成功率 ${(newSuccessRate * 100).toFixed(1)}%`);
  } else {
    // 创建新组合
    db.createSkillCombination({
      id,
      skill_ids: skillIds.join(','),
      success_rate: success ? 1.0 : 0.0,
      usage_count: 1,
      created_at: new Date().toISOString(),
    });
    console.log(`[SkillKnowledge] 创建新组合: ${id}`);
  }
}

/**
 * 获取技能历史表现
 */
export async function getSkillPerformance(skillId: string): Promise<{
  success_rate: number;
  avg_duration: number;
  usage_count: number;
}> {
  const skill = db.getSkill(skillId);
  
  if (!skill) {
    return { success_rate: 0, avg_duration: 0, usage_count: 0 };
  }

  return {
    success_rate: skill.success_rate,
    avg_duration: skill.avg_duration,
    usage_count: 0, // 需要从执行日志中统计
  };
}

/**
 * 根据 Issue 类型获取默认技能
 */
function getDefaultSkillsForType(issueType: string): string[] {
  const defaultMap: Record<string, string[]> = {
    'cpp-nullptr': ['cpp-debug-skill', 'cpp-fix-skill', 'test-writer'],
    'cpp-nan': ['cpp-debug-skill', 'cpp-fix-skill', 'regression-guard'],
    'python-exception': ['python-debug-skill', 'python-fix-skill', 'test-writer'],
    'build-error': ['build-diagnostic-skill', 'fix-builder', 'test-writer'],
    default: ['code-analyzer', 'code-fixer', 'test-writer'],
  };

  return defaultMap[issueType] || defaultMap['default'];
}

/**
 * 从技能描述推断 Issue 类型
 */
export function inferIssueType(description: string): string {
  const lowerDesc = description.toLowerCase();
  
  if (lowerDesc.includes('null') || lowerDesc.includes('pointer') || lowerDesc.includes('段错误')) {
    return 'cpp-nullptr';
  }
  if (lowerDesc.includes('nan') || lowerDesc.includes('inf') || lowerDesc.includes('溢出')) {
    return 'cpp-nan';
  }
  if (lowerDesc.includes('exception') || lowerDesc.includes('traceback') || lowerDesc.includes('python')) {
    return 'python-exception';
  }
  if (lowerDesc.includes('build') || lowerDesc.includes('compile') || lowerDesc.includes('cmake')) {
    return 'build-error';
  }

  return 'default';
}
