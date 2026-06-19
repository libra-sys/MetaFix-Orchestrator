import type { FixPlan, AgentLog, AgentSession, ReflectionResult } from './types.js';
import { complete, hasLlmConfig } from '../llm/client.js';
import * as db from '../db.js';
import { updateKnowledgeFromReflection } from '../knowledge/updater.js';

export async function reflectExecution(
  session: AgentSession,
  plan: FixPlan,
  addLog: (log: AgentLog) => void
): Promise<ReflectionResult> {
  addLog({ timestamp: new Date().toISOString(), level: 'info', stage: 'reflecting', message: '开始反思与经验沉淀...' });

  const overallSuccess = plan.status === 'completed';
  const completedSteps = plan.steps.filter(s => s.status === 'completed');
  const failedSteps = plan.steps.filter(s => s.status === 'failed');

  const executionSummary = plan.steps.map((s, i) =>
    `[${i + 1}] ${s.description} → ${s.status}${s.error ? ` (错误: ${s.error})` : ''}`
  ).join('\n');

  if (!hasLlmConfig()) {
    return ruleBasedReflection(plan, overallSuccess, completedSteps, failedSteps, addLog);
  }

  const systemPrompt = `你是一个软件工程复盘专家。分析修复流程的执行结果，提取经验教训、技能表现和知识更新。

输出严格 JSON 格式：
{
  "overallSuccess": true/false,
  "lessonsLearned": ["经验1", "经验2"],
  "unexpectedIssues": ["问题1"],
  "skillPerformance": [{ "skillName": "...", "success": true, "effectiveness": 0.9 }],
  "knowledgeUpdates": [{ "type": "skill_rate|combination|rule", "target": "...", "value": "...", "reason": "..." }]
}`;

  const userPrompt = `修复计划执行结果：\nIssue: #${plan.issueId}\n整体状态: ${overallSuccess ? '成功' : '失败'}\n\n执行摘要：\n${executionSummary}\n\n请分析并提供复盘。`;

  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.3 });
    const parsed = JSON.parse(response);

    const skillPerformance = (parsed.skillPerformance || []).map((sp: any) => ({
      skillName: sp.skillName || 'unknown',
      success: sp.success ?? overallSuccess,
      duration: 120,
      expectedDuration: 120,
      effectiveness: typeof sp.effectiveness === 'number' ? sp.effectiveness : (overallSuccess ? 0.9 : 0.5),
    }));
    const lessonsLearned = Array.isArray(parsed.lessonsLearned) ? parsed.lessonsLearned : [];
    const unexpectedIssues = Array.isArray(parsed.unexpectedIssues) ? parsed.unexpectedIssues : [];
    const knowledgeUpdates = Array.isArray(parsed.knowledgeUpdates) ? parsed.knowledgeUpdates : [];

    await updateSkillPerformance(skillPerformance, addLog);
    await saveReflection(session, plan, overallSuccess, skillPerformance, lessonsLearned, knowledgeUpdates);
    await updateKnowledgeFromReflection(plan, { overallSuccess, skillPerformance, lessonsLearned, knowledgeUpdates, timeDeviation: 0, unexpectedIssues });

    addLog({
      timestamp: new Date().toISOString(),
      level: overallSuccess ? 'success' : 'warn',
      stage: 'reflecting',
      message: `反思完成: ${overallSuccess ? '修复成功' : '修复失败'}，${lessonsLearned.length} 条经验已沉淀`,
    });

    return { overallSuccess, skillPerformance, lessonsLearned, knowledgeUpdates, timeDeviation: 0, unexpectedIssues };
  } catch (error: any) {
    addLog({ timestamp: new Date().toISOString(), level: 'warn', stage: 'reflecting', message: `LLM 反思失败，回退到规则: ${error.message}` });
    return ruleBasedReflection(plan, overallSuccess, completedSteps, failedSteps, addLog);
  }
}

async function updateSkillPerformance(performance: ReflectionResult['skillPerformance'], addLog: (log: AgentLog) => void): Promise<void> {
  for (const sp of performance) {
    try {
      const skills = db.getAllSkills();
      const skill = skills.find(s => s.name === sp.skillName);
      if (skill) {
        const newRate = parseFloat(((skill.success_rate * 0.8) + ((sp.success ? 1 : 0) * 0.2)).toFixed(2));
        db.updateSkill(skill.id, { success_rate: newRate });
      }
    } catch { /* ignore */ }
  }
}

async function saveReflection(
  session: AgentSession, plan: FixPlan, overallSuccess: boolean,
  skillPerformance: ReflectionResult['skillPerformance'],
  lessonsLearned: string[], knowledgeUpdates: ReflectionResult['knowledgeUpdates']
): Promise<void> {
  try {
    db.createReflectionLog({
      id: `ref-${Date.now()}`, session_id: session.id, plan_id: plan.id,
      expected_outcome: `完成 ${plan.steps.length} 个步骤`,
      actual_outcome: overallSuccess ? '计划全部完成' : `有步骤失败`,
      skill_performance: JSON.stringify(skillPerformance),
      lessons_learned: lessonsLearned.join('; '),
      knowledge_updates: JSON.stringify(knowledgeUpdates),
      created_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }

  if (overallSuccess) {
    const skillIds = plan.steps.filter(s => s.skillName).map(s => s.skillName!).join(',');
    if (skillIds) {
      try {
        db.createSkillCombination({ id: `combo-${Date.now()}`, skill_ids: skillIds, success_rate: 0.92, usage_count: 1, created_at: new Date().toISOString() });
      } catch { /* ignore */ }
    }
  }
}

function ruleBasedReflection(plan: FixPlan, overallSuccess: boolean, completedSteps: any[], failedSteps: any[], addLog: (log: AgentLog) => void): ReflectionResult {
  const lessonsLearned: string[] = [];
  const unexpectedIssues: string[] = [];
  if (overallSuccess) lessonsLearned.push('修复流程顺利完成');
  else { lessonsLearned.push('部分步骤执行失败，需要改进执行策略'); unexpectedIssues.push('执行过程中遇到未预期错误'); }

  const skillPerformance = plan.steps.filter(s => s.skillName).map(s => ({
    skillName: s.skillName!, success: s.status === 'completed',
    duration: s.estimatedDuration, expectedDuration: s.estimatedDuration,
    effectiveness: s.status === 'completed' ? 0.9 : 0.5,
  }));

  addLog({ timestamp: new Date().toISOString(), level: overallSuccess ? 'success' : 'warn', stage: 'reflecting', message: `规则反思完成: ${overallSuccess ? '成功' : '失败'}` });
  return { overallSuccess, skillPerformance, lessonsLearned, knowledgeUpdates: [], timeDeviation: 0, unexpectedIssues };
}
