import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath) as any;
db.pragma('journal_mode = WAL');

// ============ Schema ============
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL,
    tool_calls TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    author TEXT,
    source TEXT NOT NULL,
    required_mcps TEXT,
    success_rate REAL DEFAULT 0.0,
    avg_duration INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skill_combinations (
    id TEXT PRIMARY KEY,
    skill_ids TEXT NOT NULL,
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reflection_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    plan_id TEXT,
    expected_outcome TEXT,
    actual_outcome TEXT,
    skill_performance TEXT,
    lessons_learned TEXT,
    knowledge_updates TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS fix_plans (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    steps TEXT NOT NULL,
    estimated_tokens INTEGER DEFAULT 0,
    estimated_cost REAL DEFAULT 0.0,
    risk_level TEXT DEFAULT 'low',
    requires_approval INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    state TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sub_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    api_key TEXT,
    base_url TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ============ Types ============
export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  required_mcps: string;
  success_rate: number;
  avg_duration: number;
  created_at: string;
  updated_at: string;
}

export interface SubAgent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ReflectionLog {
  id: string;
  session_id: string;
  plan_id: string;
  expected_outcome: string;
  actual_outcome: string;
  skill_performance: string;
  lessons_learned: string;
  knowledge_updates: string;
  created_at: string;
}

export interface FixPlan {
  id: string;
  issue_id: string;
  steps: string;
  estimated_tokens: number;
  estimated_cost: number;
  risk_level: string;
  requires_approval: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSnapshot {
  id: string;
  session_id: string;
  state: string;
  context: string;
  created_at: string;
}

export interface DbUserModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  api_key: string;
  base_url: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface SkillCombination {
  id: string;
  skill_ids: string;
  success_rate: number;
  usage_count: number;
  created_at: string;
}

// ============ Sessions ============
export function getAllSessions(): DbSession[] {
  return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSession[];
}
export function getSession(id: string): DbSession | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSession | undefined;
}
export function createSession(session: DbSession): DbSession {
  db.prepare('INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
  return session;
}
export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
  if (updates.model !== undefined) { fields.push('model = ?'); values.push(updates.model); }
  if (updates.sdk_session_id !== undefined) { fields.push('sdk_session_id = ?'); values.push(updates.sdk_session_id); }
  if (fields.length === 0) return false;
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  return db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values).changes > 0;
}
export function deleteSession(id: string): boolean {
  return db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
}

// ============ Messages ============
export function getMessagesBySession(sessionId: string): DbMessage[] {
  return db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as DbMessage[];
}
export function createMessage(message: DbMessage): DbMessage {
  db.prepare('INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(message.id, message.session_id, message.role, message.content, message.model, message.created_at, message.tool_calls);
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), message.session_id);
  return message;
}
export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.content !== undefined) { fields.push('content = ?'); values.push(updates.content); }
  if (updates.tool_calls !== undefined) { fields.push('tool_calls = ?'); values.push(updates.tool_calls); }
  if (fields.length === 0) return false;
  values.push(id);
  return db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`).run(...values).changes > 0;
}
export function deleteMessage(id: string): boolean {
  return db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes > 0;
}

// ============ Skills ============
export function getAllSkills(): Skill[] {
  return db.prepare('SELECT * FROM skills ORDER BY updated_at DESC').all() as Skill[];
}
export function getSkill(id: string): Skill | undefined {
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Skill | undefined;
}
export function createSkill(skill: Skill): Skill {
  db.prepare(`INSERT INTO skills (id, name, version, description, author, source, required_mcps, success_rate, avg_duration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(skill.id, skill.name, skill.version, skill.description, skill.author, skill.source, skill.required_mcps, skill.success_rate, skill.avg_duration, skill.created_at, skill.updated_at);
  return skill;
}
export function updateSkill(id: string, updates: Partial<Skill>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.version !== undefined) { fields.push('version = ?'); values.push(updates.version); }
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.success_rate !== undefined) { fields.push('success_rate = ?'); values.push(updates.success_rate); }
  if (updates.avg_duration !== undefined) { fields.push('avg_duration = ?'); values.push(updates.avg_duration); }
  if (fields.length === 0) return false;
  fields.push('updated_at = ?'); values.push(new Date().toISOString()); values.push(id);
  return db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`).run(...values).changes > 0;
}
export function deleteSkill(id: string): boolean {
  return db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0;
}

// ============ SubAgents ============
export function getAllSubAgents(): SubAgent[] {
  return db.prepare('SELECT * FROM sub_agents ORDER BY type, name').all() as SubAgent[];
}
export function updateSubAgentStatus(id: string, status: string): boolean {
  return db.prepare('UPDATE sub_agents SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id).changes > 0;
}

// ============ Reflection Logs ============
export function createReflectionLog(log: ReflectionLog): ReflectionLog {
  db.prepare(`INSERT INTO reflection_logs (id, session_id, plan_id, expected_outcome, actual_outcome, skill_performance, lessons_learned, knowledge_updates, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(log.id, log.session_id, log.plan_id, log.expected_outcome, log.actual_outcome, log.skill_performance, log.lessons_learned, log.knowledge_updates, log.created_at);
  return log;
}
export function getReflectionLogsBySession(sessionId: string): ReflectionLog[] {
  return db.prepare('SELECT * FROM reflection_logs WHERE session_id = ? ORDER BY created_at DESC').all(sessionId) as ReflectionLog[];
}

// ============ Fix Plans ============
export function createFixPlan(plan: FixPlan): FixPlan {
  db.prepare(`INSERT INTO fix_plans (id, issue_id, steps, estimated_tokens, estimated_cost, risk_level, requires_approval, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(plan.id, plan.issue_id, plan.steps, plan.estimated_tokens, plan.estimated_cost, plan.risk_level, plan.requires_approval, plan.status, plan.created_at, plan.updated_at);
  return plan;
}
export function getFixPlan(id: string): FixPlan | undefined {
  return db.prepare('SELECT * FROM fix_plans WHERE id = ?').get(id) as FixPlan | undefined;
}
export function updateFixPlanStatus(id: string, status: string): boolean {
  return db.prepare('UPDATE fix_plans SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id).changes > 0;
}
export function getAllFixPlans(): FixPlan[] {
  return db.prepare('SELECT * FROM fix_plans ORDER BY updated_at DESC').all() as FixPlan[];
}

// ============ Agent Snapshots ============
export function createAgentSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
  db.prepare('INSERT INTO agent_snapshots (id, session_id, state, context, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(snapshot.id, snapshot.session_id, snapshot.state, snapshot.context, snapshot.created_at);
  return snapshot;
}
export function getLatestAgentSnapshot(sessionId: string): AgentSnapshot | undefined {
  return db.prepare('SELECT * FROM agent_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(sessionId) as AgentSnapshot | undefined;
}

// ============ User Models ============
export function getAllUserModels(): DbUserModel[] {
  return db.prepare('SELECT * FROM user_models ORDER BY created_at DESC').all() as DbUserModel[];
}
export function getEnabledUserModels(): DbUserModel[] {
  return db.prepare('SELECT * FROM user_models WHERE enabled = 1 ORDER BY created_at DESC').all() as DbUserModel[];
}
export function getUserModel(id: string): DbUserModel | undefined {
  return db.prepare('SELECT * FROM user_models WHERE id = ?').get(id) as DbUserModel | undefined;
}
export function createUserModel(model: DbUserModel): DbUserModel {
  db.prepare('INSERT INTO user_models (id, name, provider, model_id, api_key, base_url, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(model.id, model.name, model.provider, model.model_id, model.api_key, model.base_url, model.enabled, model.created_at, model.updated_at);
  return model;
}
export function updateUserModel(id: string, updates: Partial<Omit<DbUserModel, 'id' | 'created_at'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
  if (updates.provider !== undefined) { fields.push('provider = ?'); values.push(updates.provider); }
  if (updates.model_id !== undefined) { fields.push('model_id = ?'); values.push(updates.model_id); }
  if (updates.api_key !== undefined) { fields.push('api_key = ?'); values.push(updates.api_key); }
  if (updates.base_url !== undefined) { fields.push('base_url = ?'); values.push(updates.base_url); }
  if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled); }
  if (fields.length === 0) return false;
  fields.push('updated_at = ?'); values.push(new Date().toISOString()); values.push(id);
  return db.prepare(`UPDATE user_models SET ${fields.join(', ')} WHERE id = ?`).run(...values).changes > 0;
}
export function deleteUserModel(id: string): boolean {
  return db.prepare('DELETE FROM user_models WHERE id = ?').run(id).changes > 0;
}

// ============ Skill Combinations ============
export function createSkillCombination(combo: SkillCombination): SkillCombination {
  db.prepare(`INSERT INTO skill_combinations (id, skill_ids, success_rate, usage_count, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(combo.id, combo.skill_ids, combo.success_rate, combo.usage_count, combo.created_at);
  return combo;
}
export function getAllSkillCombinations(): SkillCombination[] {
  return db.prepare('SELECT * FROM skill_combinations ORDER BY created_at DESC').all() as SkillCombination[];
}

// ============ Initialization ============
const presetSkills = [
  { name: 'receiving-code-review', version: '1.0.0', description: '接收 PR 审查意见并实施修改', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['github', 'filesystem']) },
  { name: 'deep-research', version: '1.0.0', description: '多源信息综合、引用、分析', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem', 'web-search']) },
  { name: 'analytics-data-analysis', version: '1.0.0', description: '数据可视化、Jupyter、Python 数据分析', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'agent-browser', version: '1.0.0', description: '网页操作、GitHub 信息抓取、表单填写', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'find-skills', version: '1.0.0', description: '搜索和安装新技能（从社区）', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'create-skill', version: '1.0.0', description: '创建新技能、编写 SKILL.md', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'install-skill-dependency', version: '1.0.0', description: '修复技能缺失的依赖项', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'docx', version: '1.0.0', description: 'Word 文档创建、修改、检查', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'pdf', version: '1.0.0', description: 'PDF 读取、合并、拆分、创建', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'pptx', version: '1.0.0', description: 'PPT 幻灯片创建与解析', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'xlsx', version: '1.0.0', description: 'Excel 表格读写与处理', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
  { name: 'content-research-writer', version: '1.0.0', description: '协作写作、研究、引用管理', author: 'MetaFix Team', source: 'preset', required_mcps: JSON.stringify(['filesystem']) },
];

export function initializePresetSkills(): void {
  for (const skill of presetSkills) {
    try {
      const existing = db.prepare('SELECT id FROM skills WHERE name = ?').get(skill.name);
      if (!existing) {
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO skills (id, name, version, description, author, source, required_mcps, success_rate, avg_duration, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(`skill-${Date.now()}-${Math.random().toString(36).substr(1, 9)}`, skill.name, skill.version, skill.description, skill.author, skill.source, skill.required_mcps, 0.0, 0, now, now);
        console.log(`[DB] 初始化预制技能: ${skill.name}`);
      }
    } catch (error) {
      console.error(`[DB] 初始化技能失败 ${skill.name}:`, error);
    }
  }
}

const presetAgents = [
  { name: 'issue-analyzer', type: 'analysis', description: '深度分析 Issue，结合 Wiki/规则确定根因、影响模块、严重程度' },
  { name: 'codebase-navigator', type: 'analysis', description: '快速定位代码位置、理解项目结构、分析依赖关系' },
  { name: 'upstream-tracker', type: 'analysis', description: '对比项目与上游仓库的差异，追踪 API 变更' },
  { name: 'test-writer', type: 'fix', description: '根据修复内容编写单元测试、集成测试、回归测试' },
  { name: 'regression-guard', type: 'fix', description: '运行全量或增量回归测试，验证修复不引入新问题' },
  { name: 'quality-gate', type: 'fix', description: '执行最终检查（代码规范、安全扫描、测试覆盖率）' },
  { name: 'build-system-expert', type: 'fix', description: '处理 CMake、Makefile 等构建系统配置及依赖问题' },
  { name: 'pr-creator', type: 'delivery', description: '自动创建 GitHub PR，生成描述、标签、关联 Issue' },
];

export function initializePresetAgents(): void {
  for (const agent of presetAgents) {
    try {
      const existing = db.prepare('SELECT id FROM sub_agents WHERE name = ?').get(agent.name);
      if (!existing) {
        const now = new Date().toISOString();
        db.prepare(`INSERT INTO sub_agents (id, name, type, description, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(`agent-${Date.now()}-${Math.random().toString(36).substr(1, 9)}`, agent.name, agent.type, agent.description, 'active', now, now);
        console.log(`[DB] 初始化预制子智能体: ${agent.name}`);
      }
    } catch (error) {
      console.error(`[DB] 初始化子智能体失败 ${agent.name}:`, error);
    }
  }
}

initializePresetSkills();
initializePresetAgents();

export default db;
