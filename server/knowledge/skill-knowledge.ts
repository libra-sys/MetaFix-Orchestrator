import { addChunk, searchChunks, getChunksBySource } from './vector-db.js';
import * as db from '../db.js';

export interface SkillExperience {
  skillName: string;
  issuePattern: string;
  success: boolean;
  duration: number;
  lessons: string;
  timestamp: string;
}

export function recordSkillExperience(exp: SkillExperience): void {
  addChunk({
    id: `exp-${exp.skillName}-${Date.now()}`,
    content: `技能: ${exp.skillName}\n问题模式: ${exp.issuePattern}\n结果: ${exp.success ? '成功' : '失败'}\n耗时: ${exp.duration}s\n经验: ${exp.lessons}`,
    source: exp.skillName,
    source_type: 'skill_experience',
    metadata: { success: exp.success, duration: exp.duration, timestamp: exp.timestamp },
    created_at: exp.timestamp,
  });
}

export function findRelevantSkills(issueDescription: string): { skillName: string; relevance: number; avgSuccess: number }[] {
  const experiences = searchChunks(issueDescription, 20)
    .filter(c => c.source_type === 'skill_experience');

  const grouped = new Map<string, { count: number; successes: number; totalDuration: number }>();
  for (const exp of experiences) {
    const name = exp.source;
    if (!grouped.has(name)) grouped.set(name, { count: 0, successes: 0, totalDuration: 0 });
    const g = grouped.get(name)!;
    g.count++;
    if (exp.metadata?.success) g.successes++;
    if (exp.metadata?.duration) g.totalDuration += Number(exp.metadata.duration);
  }

  return Array.from(grouped.entries()).map(([skillName, data]) => ({
    skillName,
    relevance: data.count,
    avgSuccess: data.count > 0 ? data.successes / data.count : 0,
  })).sort((a, b) => b.relevance - a.relevance);
}

export function getSkillSuccessRate(skillName: string): number {
  try {
    const skill = db.getAllSkills().find(s => s.name === skillName);
    return skill?.success_rate || 0;
  } catch {
    return 0;
  }
}

export function getRecommendedSkillSequence(issueDescription: string): string[] {
  const relevant = findRelevantSkills(issueDescription);
  // 结合数据库中的 skill_combinations
  const combos = db.getAllSkillCombinations();
  const comboScores = new Map<string, number>();

  for (const combo of combos) {
    const ids = combo.skill_ids.split(',').map(s => s.trim());
    let score = combo.success_rate * combo.usage_count;
    for (const id of ids) {
      const rel = relevant.find(r => r.skillName === id);
      if (rel) score += rel.relevance * rel.avgSuccess;
    }
    comboScores.set(combo.skill_ids, score);
  }

  const bestCombo = Array.from(comboScores.entries()).sort((a, b) => b[1] - a[1])[0];
  if (bestCombo) return bestCombo[0].split(',').map(s => s.trim());

  // fallback：返回相关性最高的前 3 个技能
  return relevant.slice(0, 3).map(r => r.skillName);
}
