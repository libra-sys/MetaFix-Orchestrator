import { v4 as uuidv4 } from 'uuid';
import type { AgentSession, AgentState, AgentLog, FixPlan } from './types.js';
import { perceiveIssue } from './perception.js';
import { createFixPlan } from './planner.js';
import { executePlan } from './executor.js';
import { reflectExecution } from './reflector.js';
import * as db from '../db.js';
import { syncProjectKnowledge } from '../knowledge/updater.js';
import { getRecommendedSkillSequence } from '../knowledge/skill-knowledge.js';

const sessions = new Map<string, AgentSession>();

export function getAgentSession(id: string): AgentSession | undefined {
  return sessions.get(id);
}

export function getAllAgentSessions(): AgentSession[] {
  return Array.from(sessions.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function cancelAgentSession(id: string): boolean {
  const session = sessions.get(id);
  if (!session) return false;
  session.state = 'cancelled';
  session.updatedAt = new Date().toISOString();
  return true;
}

function addLog(session: AgentSession, log: AgentLog): void {
  session.logs.push(log);
  session.updatedAt = new Date().toISOString();
}

export async function startFixFlow(issueUrl: string): Promise<string> {
  const sessionId = uuidv4();
  const now = new Date().toISOString();

  const session: AgentSession = {
    id: sessionId,
    issueUrl,
    issueId: extractIssueId(issueUrl),
    state: 'idle',
    progress: 0,
    currentStep: 0,
    totalSteps: 0,
    logs: [],
    createdAt: now,
    updatedAt: now,
  };

  sessions.set(sessionId, session);

  // 启动自主决策循环
  runAgentLoop(session).catch(error => {
    console.error(`[Orchestrator] Session ${sessionId} error:`, error);
    session.state = 'error';
    addLog(session, {
      timestamp: new Date().toISOString(),
      level: 'error',
      stage: 'orchestrator',
      message: `Agent 循环异常: ${error?.message || String(error)}`,
    });
  });

  return sessionId;
}

async function runAgentLoop(session: AgentSession): Promise<void> {
  // 0. 同步项目知识库
  try {
    await syncProjectKnowledge();
    addLog(session, { timestamp: new Date().toISOString(), level: 'info', stage: 'perception', message: '项目知识库同步完成' });
  } catch (e: any) {
    addLog(session, { timestamp: new Date().toISOString(), level: 'warn', stage: 'perception', message: `知识库同步失败: ${e?.message}` });
  }

  // 1. 感知
  session.state = 'perceiving';
  const perception = await perceiveIssue(session, (log) => addLog(session, log));

  // 2. 规划
  session.state = 'planning';
  const plan = await createFixPlan(perception, (log) => addLog(session, log));
  session.plan = plan;
  session.totalSteps = plan.steps.length;

  // 保存计划到数据库
  try {
    db.createFixPlan({
      id: plan.id,
      issue_id: perception.issueId,
      steps: JSON.stringify(plan.steps),
      estimated_tokens: plan.estimatedTokens,
      estimated_cost: plan.estimatedCost,
      risk_level: plan.riskLevel,
      requires_approval: plan.requiresApproval ? 1 : 0,
      status: plan.status,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    });
  } catch (e) {
    console.error('[Orchestrator] Failed to save plan:', e);
  }

  // 如果需要人工审批，真实等待
  if (plan.requiresApproval) {
    session.state = 'awaiting_approval';
    addLog(session, {
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage: 'planning',
      message: `计划需要人工审批: 风险等级 ${plan.riskLevel}，预估成本 $${plan.estimatedCost}`,
    });

    let approved = false;
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 5 分钟（每 5 秒轮询一次）

    while (!approved && attempts < maxAttempts && (session.state as any) !== 'cancelled') {
      await delay(5000);
      attempts++;
      const dbPlan = db.getFixPlan(plan.id);
      if (dbPlan?.status === 'approved') {
        approved = true;
        plan.status = 'approved';
        addLog(session, {
          timestamp: new Date().toISOString(),
          level: 'success',
          stage: 'planning',
          message: '计划已获人工批准，继续执行',
        });
      } else if (dbPlan?.status === 'rejected') {
        plan.status = 'rejected';
        addLog(session, {
          timestamp: new Date().toISOString(),
          level: 'error',
          stage: 'planning',
          message: '计划被人为拒绝',
        });
        session.state = 'error';
        return;
      }
    }

    if (!approved) {
      addLog(session, {
        timestamp: new Date().toISOString(),
        level: 'warn',
        stage: 'planning',
        message: '审批等待超时（5分钟），自动批准继续执行',
      });
      plan.status = 'approved';
      db.updateFixPlanStatus(plan.id, 'approved');
    }
  } else {
    plan.status = 'approved';
  }

  // 3. 执行
  if (plan.status === 'approved') {
    session.state = 'executing';
    plan.status = 'executing';
    db.updateFixPlanStatus(plan.id, 'executing');
    await executePlan(session, plan, (log) => addLog(session, log));
    db.updateFixPlanStatus(plan.id, plan.status);
  }

  // 4. 反思
  session.state = 'reflecting';
  await reflectExecution(session, plan, (log) => addLog(session, log));

  // 5. 完成
  session.state = plan.status === 'completed' ? 'completed' : 'error';
  session.progress = 100;
  session.currentStep = session.totalSteps;

  // 保存快照
  try {
    db.createAgentSnapshot({
      id: `snap-${Date.now()}`,
      session_id: session.id,
      state: session.state,
      context: JSON.stringify({ planId: plan.id, steps: plan.steps.length, success: plan.status === 'completed' }),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Orchestrator] Failed to save snapshot:', e);
  }

  addLog(session, {
    timestamp: new Date().toISOString(),
    level: 'success',
    stage: 'orchestrator',
    message: `Agent 流程结束: ${session.state === 'completed' ? '成功' : '失败'}`,
  });
}

function extractIssueId(url: string): string {
  const match = url.match(/\/issues\/(\d+)/);
  return match ? match[1] : 'unknown';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
