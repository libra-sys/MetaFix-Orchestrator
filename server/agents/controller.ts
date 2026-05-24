import { v4 as uuidv4 } from 'uuid';
import * as db from '../db.js';
import config from '../config.js';
import { perceive } from './perception.js';
import { plan } from './planner.js';
import { execute } from './executor.js';
import { reflect } from './reflector.js';

// Agent 状态类型
export type AgentState = 'idle' | 'perceiving' | 'planning' | 'executing' | 'reflecting' | 'delivering' | 'error';

// Agent 会话接口
export interface AgentSession {
  id: string;
  issueId: string;
  issueUrl: string;
  state: AgentState;
  currentPlanId: string | null;
  context: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// 活跃 Agent 会话存储（内存中）
const activeSessions = new Map<string, AgentSession>();

/**
 * 启动 Agent 修复流程
 * @param issueUrl - Issue URL 或描述
 * @returns Agent 会话 ID
 */
export async function startFixFlow(issueUrl: string): Promise<string> {
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  
  const session: AgentSession = {
    id: sessionId,
    issueId: extractIssueId(issueUrl),
    issueUrl,
    state: 'perceiving',
    currentPlanId: null,
    context: {},
    createdAt: now,
    updatedAt: now,
  };
  
  activeSessions.set(sessionId, session);
  
  // 异步执行 Agent 循环（不阻塞返回）
  runAgentLoop(sessionId).catch((error) => {
    console.error(`[Agent] Loop error for session ${sessionId}:`, error);
    updateSessionState(sessionId, 'error');
  });
  
  return sessionId;
}

/**
 * Agent 主循环
 */
async function runAgentLoop(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);
  
  try {
    // 1. 感知阶段
    console.log(`[Agent ${sessionId}] ========= 感知阶段 =========`);
    updateSessionState(sessionId, 'perceiving');
    const perceptionResult = await perceive(session);
    session.context.perception = perceptionResult;
    
    // 2. 规划阶段
    console.log(`[Agent ${sessionId}] ========= 规划阶段 =========`);
    updateSessionState(sessionId, 'planning');
    const plan = await plan(session);
    session.currentPlanId = plan.id;
    session.context.plan = plan;
    
    // 保存计划到数据库
    db.createFixPlan({
      id: plan.id,
      issue_id: session.issueId,
      steps: JSON.stringify(plan.steps),
      estimated_tokens: plan.estimatedTokens,
      estimated_cost: plan.estimatedCost,
      risk_level: plan.riskLevel,
      requires_approval: plan.requiresApproval ? 1 : 0,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // 3. 等待用户确认（如果需要审批）
    if (plan.requiresApproval) {
      console.log(`[Agent ${sessionId}] 等待用户确认计划...`);
      // 这里应该等待用户通过 API 确认，暂时假设自动确认
    }
    
    // 4. 执行阶段
    console.log(`[Agent ${sessionId}] ========= 执行阶段 =========`);
    updateSessionState(sessionId, 'executing');
    const executionResult = await execute(session, plan);
    session.context.execution = executionResult;
    
    // 更新计划状态
    db.updateFixPlanStatus(plan.id, 'completed');
    
    // 5. 反思阶段
    console.log(`[Agent ${sessionId}] ========= 反思阶段 =========`);
    updateSessionState(sessionId, 'reflecting');
    const reflectionResult = await reflect(session, plan, executionResult);
    session.context.reflection = reflectionResult;
    
    // 保存反思日志
    db.createReflectionLog({
      id: uuidv4(),
      session_id: session.id,
      plan_id: plan.id,
      expected_outcome: JSON.stringify(plan.steps),
      actual_outcome: JSON.stringify(executionResult),
      skill_performance: JSON.stringify(reflectionResult.skillPerformance),
      lessons_learned: JSON.stringify(reflectionResult.lessonsLearned),
      knowledge_updates: JSON.stringify(reflectionResult.knowledgeUpdates),
      created_at: new Date().toISOString(),
    });
    
    // 6. 交付阶段
    console.log(`[Agent ${sessionId}] ========= 交付阶段 =========`);
    updateSessionState(sessionId, 'delivering');
    
    // 保存 Agent 快照
    db.createAgentSnapshot({
      id: uuidv4(),
      session_id: session.id,
      state: 'completed',
      context: JSON.stringify(session.context),
      created_at: new Date().toISOString(),
    });
    
    updateSessionState(sessionId, 'idle');
    console.log(`[Agent ${sessionId}] ========= 完成 =========`);
    
  } catch (error: any) {
    console.error(`[Agent ${sessionId}] 错误:`, error);
    updateSessionState(sessionId, 'error');
    throw error;
  }
}

/**
 * 获取 Agent 会话状态
 */
export function getAgentSession(sessionId: string): AgentSession | undefined {
  return activeSessions.get(sessionId);
}

/**
 * 获取所有活跃会话
 */
export function getAllAgentSessions(): AgentSession[] {
  return Array.from(activeSessions.values());
}

/**
 * 取消 Agent 执行
 */
export function cancelAgentSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;
  
  updateSessionState(sessionId, 'idle');
  return true;
}

// ============= 辅助函数 =============

function updateSessionState(sessionId: string, state: AgentState): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.state = state;
    session.updatedAt = new Date().toISOString();
  }
}

function extractIssueId(issueUrl: string): string {
  // 从 URL 中提取 Issue ID，例如：https://github.com/owner/repo/issues/999
  const match = issueUrl.match(/\/issues\/(\d+)/);
  return match ? match[1] : uuidv4();
}
