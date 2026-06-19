import type { PerceptionResult, FixPlan, PlanStep, AgentLog } from './types.js';
import { v4 as uuidv4 } from 'uuid';
import { complete, hasLlmConfig } from '../llm/client.js';

export async function createFixPlan(
  perception: PerceptionResult,
  addLog: (log: AgentLog) => void
): Promise<FixPlan> {
  addLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    stage: 'planning',
    message: '开始生成修复计划...',
    details: { rootCause: perception.rootCause, severity: perception.severity },
  });

  if (!hasLlmConfig()) {
    addLog({ timestamp: new Date().toISOString(), level: 'warn', stage: 'planning', message: '未配置 LLM，使用规则生成计划' });
    return ruleBasedPlan(perception);
  }

  const systemPrompt = `你是一个资深软件修复规划专家。根据缺陷分析结果，制定详细、可执行的修复计划。

每个步骤必须包含：
- description: 步骤描述（具体、可验证）
- skillName: 使用的技能名称（可选）
- subAgentName: 子智能体名称（可选：codebase-navigator / issue-analyzer / test-writer / regression-guard / quality-gate / pr-creator）
- requiredMcps: 需要的 MCP 服务器列表（如 filesystem, git, github）
- estimatedDuration: 预估耗时（秒）

输出严格 JSON 格式：
{
  "steps": [{ "description": "...", "skillName": "...", "subAgentName": "...", "requiredMcps": ["..."], "estimatedDuration": 120 }],
  "estimatedTokens": 1000,
  "estimatedCost": 0.01,
  "riskLevel": "low|medium|high|critical",
  "requiresApproval": false
}`;

  const userPrompt = `缺陷分析结果：
- Issue: #${perception.issueId} — ${perception.title}
- 根因: ${perception.rootCause}
- 影响模块: ${perception.affectedModules.join(', ')}
- 严重程度: ${perception.severity}
- 描述: ${perception.description.slice(0, 2000)}

请生成修复计划。`;

  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.3 });
    const planData = JSON.parse(response);
    if (!Array.isArray(planData.steps) || planData.steps.length === 0) throw new Error('LLM 返回的计划为空');

    const steps: PlanStep[] = planData.steps.map((s: any, i: number) => ({
      id: uuidv4(),
      order: i + 1,
      description: s.description || '未命名步骤',
      skillName: s.skillName,
      subAgentName: s.subAgentName,
      requiredMcps: Array.isArray(s.requiredMcps) ? s.requiredMcps : ['filesystem'],
      estimatedDuration: typeof s.estimatedDuration === 'number' ? s.estimatedDuration : 120,
      status: 'pending',
    }));

    const riskLevel = ['low', 'medium', 'high', 'critical'].includes(planData.riskLevel) ? planData.riskLevel : perception.severity;
    const requiresApproval = riskLevel === 'high' || riskLevel === 'critical';

    const plan: FixPlan = {
      id: `plan-${Date.now()}`,
      issueId: perception.issueId,
      steps,
      estimatedTokens: planData.estimatedTokens || steps.length * 300,
      estimatedCost: planData.estimatedCost || steps.length * 0.001,
      riskLevel,
      requiresApproval,
      status: 'pending',
    };

    addLog({
      timestamp: new Date().toISOString(),
      level: 'success',
      stage: 'planning',
      message: `计划生成完成: ${steps.length} 个步骤, 风险等级 ${riskLevel}`,
      details: { planId: plan.id, requiresApproval },
    });
    return plan;
  } catch (error: any) {
    addLog({ timestamp: new Date().toISOString(), level: 'warn', stage: 'planning', message: `LLM 规划失败，回退到规则: ${error.message}` });
    return ruleBasedPlan(perception);
  }
}

function ruleBasedPlan(perception: PerceptionResult): FixPlan {
  const steps: PlanStep[] = [];
  let order = 1;

  steps.push({ id: uuidv4(), order: order++, description: `定位问题代码: ${perception.affectedModules.join(', ')}`, subAgentName: 'codebase-navigator', requiredMcps: ['filesystem'], estimatedDuration: 60, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: `深度分析根因: ${perception.rootCause}`, subAgentName: 'issue-analyzer', requiredMcps: ['filesystem'], estimatedDuration: 120, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: `实施修复: ${perception.rootCause}`, requiredMcps: ['filesystem', 'git'], estimatedDuration: 180, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: '编写回归测试验证修复', subAgentName: 'test-writer', requiredMcps: ['filesystem'], estimatedDuration: 150, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: '运行回归测试', subAgentName: 'regression-guard', requiredMcps: ['filesystem'], estimatedDuration: 300, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: '代码规范与安全扫描', subAgentName: 'quality-gate', requiredMcps: ['filesystem'], estimatedDuration: 120, status: 'pending' });
  steps.push({ id: uuidv4(), order: order++, description: '创建 GitHub PR', subAgentName: 'pr-creator', requiredMcps: ['github', 'git'], estimatedDuration: 60, status: 'pending' });

  const riskLevel = perception.severity === 'critical' ? 'critical' : perception.affectedModules.length > 2 ? 'high' : 'medium';
  return {
    id: `plan-${Date.now()}`,
    issueId: perception.issueId,
    steps,
    estimatedTokens: steps.length * 300,
    estimatedCost: parseFloat((steps.length * 0.001).toFixed(4)),
    riskLevel,
    requiresApproval: riskLevel === 'high' || riskLevel === 'critical',
    status: 'pending',
  };
}
