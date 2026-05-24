import { v4 as uuidv4 } from 'uuid';
import * as db from '../db.js';
import config from '../config.js';
import { query, unstable_v2_createSession } from '@tencent-ai/agent-sdk';

/**
 * 执行模块：按步骤执行修复计划
 * @param session - Agent 会话
 * @param plan - 修复计划
 * @returns 执行结果
 */
export async function execute(session: any, plan: any): Promise<{
  success: boolean;
  stepResults: Array<{
    stepId: string;
    success: boolean;
    output: string;
    duration: number;
  }>;
  prUrl: string | null;
}> {
  const { steps } = plan;
  const stepResults: Array<{
    stepId: string;
    success: boolean;
    output: string;
    duration: number;
  }> = [];
  
  console.log(`[Executor] 开始执行计划，共 ${steps.length} 个步骤`);
  
  for (const step of steps) {
    const startTime = Date.now();
    console.log(`[Executor] 执行步骤: ${step.description}`);
    
    let retryCount = 0;
    const maxRetries = 3;
    let stepSuccess = false;
    let stepOutput = '';
    
    while (retryCount <= maxRetries && !stepSuccess) {
      try {
        if (retryCount > 0) {
          console.log(`[Executor] 重试 ${retryCount}/${maxRetries}...`);
        }
        
        // 1. 获取所需技能（五级优先级）
        const skills = await resolveSkills(step.requiredSkills, session);
        
        // 2. 安全校验技能
        const validatedSkills = await validateSkills(skills);
        
        // 3. 创建临时子智能体运行技能
        stepOutput = await executeStepWithSkills(step, validatedSkills, session);
        
        stepSuccess = true;
        console.log(`[Executor] 步骤完成: ${step.description}`);
        
      } catch (error: any) {
        retryCount++;
        console.error(`[Executor] 步骤失败 (尝试 ${retryCount}/${maxRetries}):`, error?.message || error);
        
        if (retryCount > maxRetries) {
          // 达到最大重试次数，尝试回滚
          console.log(`[Executor] 达到最大重试次数，尝试回滚...`);
          await rollbackStep(step, stepResults);
          
          stepResults.push({
            stepId: step.id,
            success: false,
            output: `失败: ${error?.message || String(error)}`,
            duration: Date.now() - startTime,
          });
          
          // 触发重新规划
          console.log(`[Executor] 触发重新规划...`);
          // 这里可以调用规划模块重新生成计划
          throw new Error(`步骤执行失败: ${step.description}`);
        }
      }
    }
    
    stepResults.push({
      stepId: step.id,
      success: stepSuccess,
      output: stepOutput,
      duration: Date.now() - startTime,
    });
    
    // 更新步骤状态
    step.status = stepSuccess ? 'completed' : 'failed';
  }
  
  // 创建 PR（如果所有步骤成功）
  let prUrl: string | null = null;
  const allSuccess = stepResults.every(r => r.success);
  
  if (allSuccess) {
    console.log(`[Executor] 所有步骤成功，创建 PR...`);
    prUrl = await createPullRequest(session, plan);
  }
  
  return {
    success: allSuccess,
    stepResults,
    prUrl,
  };
}

/**
 * 五级优先级解析技能
 * 1. 预制子智能体
 * 2. 本地缓存
 * 3. 远程拉取
 * 4. 自动创建
 * 5. 组合
 */
async function resolveSkills(requiredSkills: string[], session: any): Promise<string[]> {
  const resolved: string[] = [];
  
  for (const skillName of requiredSkills) {
    console.log(`[Skills] 解析技能: ${skillName}`);
    
    // 1. 检查预制子智能体
    if (await isPresetAgent(skillName)) {
      console.log(`[Skills] [1/5] 找到预制子智能体: ${skillName}`);
      resolved.push(skillName);
      continue;
    }
    
    // 2. 检查本地缓存
    if (await isLocalCached(skillName)) {
      console.log(`[Skills] [2/5] 找到本地缓存: ${skillName}`);
      resolved.push(skillName);
      continue;
    }
    
    // 3. 远程拉取
    try {
      if (await fetchRemoteSkill(skillName)) {
        console.log(`[Skills] [3/5] 远程拉取成功: ${skillName}`);
        resolved.push(skillName);
        continue;
      }
    } catch (e) {
      console.log(`[Skills] [3/5] 远程拉取失败: ${skillName}`);
    }
    
    // 4. 自动创建
    try {
      if (await autoCreateSkill(skillName, session)) {
        console.log(`[Skills] [4/5] 自动创建成功: ${skillName}`);
        resolved.push(skillName);
        continue;
      }
    } catch (e) {
      console.log(`[Skills] [4/5] 自动创建失败: ${skillName}`);
    }
    
    // 5. 组合现有技能
    const combo = await findSkillCombination(skillName);
    if (combo) {
      console.log(`[Skills] [5/5] 找到技能组合: ${combo}`);
      resolved.push(...combo.split(','));
      continue;
    }
    
    console.log(`[Skills] 无法解析技能: ${skillName}，使用默认实现`);
    resolved.push(skillName);
  }
  
  return resolved;
}

/**
 * 校验技能（四阶段校验）
 */
async function validateSkills(skills: string[]): Promise<string[]> {
  const validated: string[] = [];
  
  for (const skill of skills) {
    console.log(`[Validator] 校验技能: ${skill}`);
    
    // 阶段1：静态分析（检查代码质量）
    const staticOk = await staticAnalysis(skill);
    if (!staticOk) {
      console.log(`[Validator] 静态分析失败: ${skill}`);
      continue;
    }
    
    // 阶段2：沙箱测试
    const sandboxOk = await sandboxTest(skill);
    if (!sandboxOk) {
      console.log(`[Validator] 沙箱测试失败: ${skill}`);
      continue;
    }
    
    // 阶段3：权限检查
    const permissionOk = await checkPermissions(skill);
    if (!permissionOk) {
      console.log(`[Validator] 权限检查失败: ${skill}`);
      continue;
    }
    
    // 阶段4：历史成功率检查
    const historyOk = await checkHistorySuccess(skill);
    if (!historyOk) {
      console.log(`[Validator] 历史成功率过低: ${skill}`);
      continue;
    }
    
    console.log(`[Validator] 技能校验通过: ${skill}`);
    validated.push(skill);
  }
  
  return validated;
}

/**
 * 使用技能执行步骤
 */
async function executeStepWithSkills(step: any, skills: string[], session: any): Promise<string> {
  let output = '';
  
  for (const skill of skills) {
    console.log(`[Executor] 创建临时子智能体运行技能: ${skill}`);
    
    // 创建临时 session
    const session = await unstable_v2_createSession({
      cwd: config.defaultCwd || process.cwd(),
    });
    
    // 调用技能
    const prompt = `
使用技能 ${skill} 执行以下步骤：
${step.description}

目标文件：${step.targetFiles.join(', ')}

请直接执行，不要询问确认。
`;
    
    const stream = query({
      prompt,
      options: {
        model: config.agentDefaultModel,
        maxTurns: 10,
        systemPrompt: `你是技能执行器，正在执行 ${skill} 技能。`,
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
    
    console.log(`[Executor] 技能 ${skill} 执行完成`);
  }
  
  return output;
}

// ============= 技能解析辅助函数（简化实现）=============

async function isPresetAgent(skillName: string): Promise<boolean> {
  const presets = ['code-analyzer', 'code-fixer', 'test-writer', 'pr-creator'];
  return presets.includes(skillName);
}

async function isLocalCached(skillName: string): Promise<boolean> {
  // 检查 data/skills/ 目录
  return false; // 简化实现
}

async function fetchRemoteSkill(skillName: string): Promise<boolean> {
  // 从技能注册中心拉取
  console.log(`[Skills] 从 ${config.skillRegistryUrl} 拉取 ${skillName}...`);
  return false; // 简化实现
}

async function autoCreateSkill(skillName: string, session: any): Promise<boolean> {
  // 使用 CodeBuddy SDK 自动生成技能
  console.log(`[Skills] 自动创建技能: ${skillName}...`);
  return false; // 简化实现
}

async function findSkillCombination(skillName: string): Promise<string | null> {
  // 从技能组合知识库查找
  const combos = db.getAllSkillCombinations();
  // 简化：返回第一个
  return combos.length > 0 ? combos[0].skill_ids : null;
}

// ============= 技能校验辅助函数（简化实现）=============

async function staticAnalysis(skill: string): Promise<boolean> {
  return true;
}

async function sandboxTest(skill: string): Promise<boolean> {
  return true;
}

async function checkPermissions(skill: string): Promise<boolean> {
  return true;
}

async function checkHistorySuccess(skill: string): Promise<boolean> {
  const skillRecord = db.getSkill(skill);
  if (skillRecord && skillRecord.success_rate < 0.5) {
    return false;
  }
  return true;
}

// ============= 回滚和 PR 创建（简化实现）=============

async function rollbackStep(step: any, previousResults: any[]): Promise<void> {
  console.log(`[Executor] 回滚步骤: ${step.description}`);
  // 简化：实际应使用 Git 回滚
}

async function createPullRequest(session: any, plan: any): Promise<string> {
  console.log(`[Executor] 创建 PR...`);
  // 简化：实际应调用 GitHub MCP
  return 'https://github.com/libra-sys/MetaFix-Orchestrator/pull/1';
}
