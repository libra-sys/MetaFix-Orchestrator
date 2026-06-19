import type { FixPlan, PlanStep, AgentLog, ExecutionResult, AgentSession } from './types.js';
import { complete, getDefaultModel } from '../llm/client.js';
import { executeSkill } from '../skills/resolver.js';
import { callMcpTool } from '../mcp/manager.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { checkCommandRisk, checkFileWriteRisk } from '../security/approval.js';
import { trackTokenUsage, estimateTokens } from '../cost/token-tracker.js';
import { checkBudgetForText } from '../cost/budget.js';

export async function executePlan(
  session: AgentSession,
  plan: FixPlan,
  addLog: (log: AgentLog) => void
): Promise<void> {
  addLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    stage: 'executing',
    message: `开始执行计划: ${plan.steps.length} 个步骤`,
  });

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (session.state === 'cancelled') {
      addLog({ timestamp: new Date().toISOString(), level: 'warn', stage: 'executing', message: '执行已取消' });
      break;
    }

    session.currentStep = i + 1;
    step.status = 'running';

    addLog({
      timestamp: new Date().toISOString(),
      level: 'info',
      stage: 'executing',
      message: `执行步骤 ${i + 1}/${plan.steps.length}: ${step.description}`,
      details: { skill: step.skillName, subAgent: step.subAgentName, mcps: step.requiredMcps },
    });

    try {
      const result = await executeStep(session, step, addLog);
      step.status = result.success ? 'completed' : 'failed';
      step.result = result.output;
      if (!result.success) step.error = result.output;

      addLog({
        timestamp: new Date().toISOString(),
        level: result.success ? 'success' : 'error',
        stage: 'executing',
        message: `步骤 ${i + 1} ${result.success ? '完成' : '失败'}`,
        details: { duration: result.duration },
      });

      if (!result.success) {
        let retries = 0;
        while (retries < 2 && step.status === 'failed') {
          retries++;
          addLog({ timestamp: new Date().toISOString(), level: 'warn', stage: 'executing', message: `步骤 ${i + 1} 重试 ${retries}/2...` });
          const retryResult = await executeStep(session, step, addLog);
          step.status = retryResult.success ? 'completed' : 'failed';
          step.result = retryResult.output;
          if (!retryResult.success) step.error = retryResult.output;
        }
        if (step.status === 'failed') {
          addLog({ timestamp: new Date().toISOString(), level: 'error', stage: 'executing', message: `步骤 ${i + 1} 最终失败` });
          plan.status = 'failed';
          return;
        }
      }
    } catch (error: any) {
      step.status = 'failed';
      step.error = error?.message || String(error);
      addLog({ timestamp: new Date().toISOString(), level: 'error', stage: 'executing', message: `步骤 ${i + 1} 异常: ${step.error}` });
      plan.status = 'failed';
      return;
    }

    session.progress = Math.round(((i + 1) / plan.steps.length) * 100);
  }

  plan.status = 'completed';
  addLog({ timestamp: new Date().toISOString(), level: 'success', stage: 'executing', message: '计划执行完成' });
}

async function executeStep(session: AgentSession, step: PlanStep, addLog: (log: AgentLog) => void): Promise<ExecutionResult> {
  const startTime = Date.now();

  // 1. 优先调用子智能体
  if (step.subAgentName) {
    const result = await executeSubAgent(step.subAgentName, step.description, session);
    return {
      stepId: step.id,
      success: result.success,
      output: result.output,
      duration: Math.round((Date.now() - startTime) / 1000),
      toolCalls: result.toolCalls || [],
    };
  }

  // 2. 其次调用技能系统
  if (step.skillName) {
    try {
      const skillResult = await executeSkill(step.skillName, { description: step.description, cwd: process.cwd() });
      return {
        stepId: step.id,
        success: skillResult.success !== false,
        output: JSON.stringify(skillResult, null, 2).slice(0, 5000),
        duration: Math.round((Date.now() - startTime) / 1000),
        toolCalls: [{ toolName: step.skillName, input: { description: step.description }, output: JSON.stringify(skillResult), duration: 0 }],
      };
    } catch (e: any) {
      return {
        stepId: step.id,
        success: false,
        output: `技能执行失败: ${e?.message}`,
        duration: Math.round((Date.now() - startTime) / 1000),
        toolCalls: [],
      };
    }
  }

  // 3. 回退：LLM 驱动生成具体操作指令
  return executeStepByLLM(step, session, addLog);
}

async function executeSubAgent(
  subAgentName: string,
  description: string,
  session: AgentSession
): Promise<{ success: boolean; output: string; toolCalls: any[] }> {
  switch (subAgentName) {
    case 'issue-analyzer': {
      const { analyzeIssue } = await import('./issue-analyzer.js');
      // issue-analyzer 需要 issue 数据，这里简化调用
      const result = await analyzeIssue(session.issueUrl, description, '', process.cwd());
      return { success: true, output: `分析完成: ${result.rootCause}`, toolCalls: [] };
    }
    case 'codebase-navigator': {
      const { locateCode } = await import('./codebase-navigator.js');
      const results = locateCode(description, process.cwd());
      return { success: results.length > 0, output: `定位到 ${results.length} 处代码`, toolCalls: [] };
    }
    case 'test-writer': {
      const { writeTests } = await import('./test-writer.js');
      const result = await writeTests([], description, process.cwd());
      return { success: result.passed, output: result.output, toolCalls: [] };
    }
    case 'regression-guard': {
      const { runRegressionTests } = await import('./regression-guard.js');
      const result = runRegressionTests(process.cwd());
      return { success: result.passed, output: result.output, toolCalls: [] };
    }
    case 'quality-gate': {
      const { runQualityGate } = await import('./quality-gate.js');
      const result = runQualityGate(process.cwd());
      return { success: result.passed, output: `质量评分: ${result.overallScore}`, toolCalls: [] };
    }
    case 'build-system-expert': {
      const { runBuild } = await import('./build-system-expert.js');
      const result = runBuild(process.cwd());
      return { success: result.success, output: `构建${result.success ? '成功' : '失败'}: ${result.errors.join('; ')}`, toolCalls: [] };
    }
    case 'pr-creator': {
      const { createPullRequest } = await import('./pr-creator.js');
      const result = await createPullRequest(session.issueUrl, description, description, process.cwd());
      return { success: result.success, output: result.prUrl || result.error || 'PR 创建完成', toolCalls: [] };
    }
    case 'upstream-tracker': {
      const { compareWithUpstream } = await import('./upstream-tracker.js');
      const result = compareWithUpstream(process.cwd());
      return { success: !!result, output: result ? `上游差异: ${result.divergedFiles.length} 个文件` : '无上游信息', toolCalls: [] };
    }
    default:
      return { success: false, output: `未知子智能体: ${subAgentName}`, toolCalls: [] };
  }
}

async function executeStepByLLM(step: PlanStep, session: AgentSession, addLog: (log: AgentLog) => void): Promise<ExecutionResult> {
  const startTime = Date.now();

  // 预算检查
  const promptText = `${step.description} ${session.issueUrl}`;
  const budgetCheck = checkBudgetForText(session.id, promptText);
  if (!budgetCheck.allowed) {
    return { stepId: step.id, success: false, output: `预算检查失败: ${budgetCheck.reason}`, duration: 0, toolCalls: [] };
  }

  const systemPrompt = `你是一个精确的软件工程执行助手。根据步骤描述，生成可执行的操作指令。

可用操作类型：
- read_file: 读取文件内容（参数: path）
- write_file: 写入/修改文件（参数: path, content）
- run_command: 运行 shell 命令（参数: command）
- git_commit: git 提交（参数: message）
- search_code: 搜索代码（参数: pattern）
- mcp_tool: 调用 MCP 工具（参数: server, tool, args）
- skip: 跳过此步骤

严格以 JSON 输出，不要包含其他文本：`;

  const userPrompt = `步骤描述: ${step.description}\n子智能体: ${step.subAgentName || '无'}\n技能: ${step.skillName || '无'}\n需要 MCP: ${step.requiredMcps.join(', ')}\n工作目录: ${process.cwd()}\nIssue: ${session.issueUrl}\n\n请生成操作指令。`;

  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.2 });
    trackTokenUsage(session.id, getDefaultModel(), 'openai', estimateTokens(systemPrompt + userPrompt), estimateTokens(response));
    const action = JSON.parse(response);
    let output = '';
    let success = true;

    switch (action.action) {
      case 'read_file': output = await readFileAction(action.path); break;
      case 'write_file': output = await writeFileAction(action.path, action.content); break;
      case 'run_command': output = await runCommandAction(action.command); break;
      case 'git_commit': output = await gitCommitAction(action.message); break;
      case 'search_code': output = await searchCodeAction(action.pattern); break;
      case 'mcp_tool': output = await mcpToolAction(action.server, action.tool, action.args); break;
      case 'skip':
      default: output = '步骤跳过';
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    return { stepId: step.id, success, output, duration, toolCalls: [{ toolName: action.action, input: action, output, duration }] };
  } catch (error: any) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    return { stepId: step.id, success: false, output: error?.message || String(error), duration, toolCalls: [] };
  }
}



// === 真实操作实现 ===

async function readFileAction(filePath: string): Promise<string> {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) throw new Error(`文件不存在: ${fullPath}`);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return `文件内容 (${content.length} chars):\n${content.slice(0, 2000)}${content.length > 2000 ? '\n... (truncated)' : ''}`;
}

async function writeFileAction(filePath: string, content: string): Promise<string> {
  const risk = checkFileWriteRisk(filePath);
  if (risk.requiresApproval) {
    throw new Error(`安全拦截: ${risk.reason}`);
  }
  const fullPath = path.resolve(filePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  return `文件已写入: ${fullPath} (${content.length} bytes)`;
}

async function runCommandAction(command: string): Promise<string> {
  if (!command) throw new Error('命令为空');
  const risk = checkCommandRisk(command);
  if (risk.requiresApproval) {
    throw new Error(`安全拦截: ${risk.reason}`);
  }
  try {
    const result = execSync(command, { encoding: 'utf-8', timeout: 60000, cwd: process.cwd(), maxBuffer: 10 * 1024 * 1024 });
    return `命令执行成功:\n${result.slice(0, 2000)}`;
  } catch (e: any) {
    return `命令执行失败: ${e?.stderr || e?.message || String(e)}`;
  }
}

async function gitCommitAction(message: string): Promise<string> {
  try {
    execSync('git add -A', { encoding: 'utf-8', cwd: process.cwd() });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', cwd: process.cwd() });
    return `Git 提交成功: ${message}`;
  } catch (e: any) {
    return `Git 提交失败: ${e?.stderr || e?.message || String(e)}`;
  }
}

async function searchCodeAction(pattern: string): Promise<string> {
  try {
    const result = execSync(
      `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" --include="*.cpp" --include="*.h" --include="*.c" --include="*.java" --include="*.go" . 2>/dev/null || echo "No matches"`,
      { encoding: 'utf-8', cwd: process.cwd(), timeout: 30000 }
    );
    return `搜索结果:\n${result.slice(0, 2000)}`;
  } catch (e: any) {
    return `搜索失败: ${e?.message || String(e)}`;
  }
}

async function mcpToolAction(serverName: string, toolName: string, args: any): Promise<string> {
  const result = await callMcpTool(serverName, toolName, args || {});
  return `MCP 工具 ${serverName}/${toolName} 结果:\n${JSON.stringify(result, null, 2).slice(0, 2000)}`;
}
