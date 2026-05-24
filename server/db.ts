import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '..', 'data', 'chat.db');

// 确保 data 目录存在
import fs from 'fs';
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接
const db = new Database(dbPath);

// 启用 WAL 模式以提高性能
db.pragma('journal_mode = WAL');

// 初始化数据库表
db.exec(`
  -- 会话表
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sdk_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- 消息表
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

  -- 为会话 ID 创建索引
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

  -- 技能表
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

  -- 技能知识库（组合）
  CREATE TABLE IF NOT EXISTS skill_combinations (
    id TEXT PRIMARY KEY,
    skill_ids TEXT NOT NULL,
    success_rate REAL DEFAULT 0.0,
    usage_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- 反思日志表
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

  -- 修复计划表
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

  -- Agent 状态快照表
  CREATE TABLE IF NOT EXISTS agent_snapshots (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    state TEXT NOT NULL,
    context TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );
`);

// 数据库迁移：添加 sdk_session_id 列（如果不存在）
try {
  const tableInfo = db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  const hasColumn = tableInfo.some(col => col.name === 'sdk_session_id');
  if (!hasColumn) {
    db.exec("ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT");
    console.log("[DB] Added sdk_session_id column to sessions table");
  }
} catch (e) {
  // 忽略错误（列可能已存在）
}

// 类型定义
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

// ============= 会话操作 =============

// 获取所有会话
export function getAllSessions(): DbSession[] {
  const stmt = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC');
  return stmt.all() as DbSession[];
}

// 获取单个会话
export function getSession(id: string): DbSession | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  return stmt.get(id) as DbSession | undefined;
}

// 创建会话
export function createSession(session: DbSession): DbSession {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.title, session.model, session.sdk_session_id, session.created_at, session.updated_at);
  return session;
}

// 更新会话
export function updateSession(id: string, updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.model !== undefined) {
    fields.push('model = ?');
    values.push(updates.model);
  }
  if (updates.sdk_session_id !== undefined) {
    fields.push('sdk_session_id = ?');
    values.push(updates.sdk_session_id);
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  const stmt = db.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除会话
export function deleteSession(id: string): boolean {
  const stmt = db.prepare('DELETE FROM sessions WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 消息操作 =============

// 获取会话的所有消息
export function getMessagesBySession(sessionId: string): DbMessage[] {
  const stmt = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
  return stmt.all(sessionId) as DbMessage[];
}

// 创建消息
export function createMessage(message: DbMessage): DbMessage {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    message.id,
    message.session_id,
    message.role,
    message.content,
    message.model,
    message.created_at,
    message.tool_calls
  );
  
  // 更新会话的 updated_at
  const updateStmt = db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?');
  updateStmt.run(new Date().toISOString(), message.session_id);
  
  return message;
}

// 更新消息内容
export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.content !== undefined) {
    fields.push('content = ?');
    values.push(updates.content);
  }
  if (updates.tool_calls !== undefined) {
    fields.push('tool_calls = ?');
    values.push(updates.tool_calls);
  }
  
  if (fields.length === 0) return false;
  
  values.push(id);
  
  const stmt = db.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

// 删除消息
export function deleteMessage(id: string): boolean {
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// 批量创建消息（用于保存对话）
export function createMessages(messages: DbMessage[]): void {
  const stmt = db.prepare(`
    INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertMany = db.transaction((msgs: DbMessage[]) => {
    for (const msg of msgs) {
      stmt.run(msg.id, msg.session_id, msg.role, msg.content, msg.model, msg.created_at, msg.tool_calls);
    }
  });
  
  insertMany(messages);
}

// 清空所有数据
export function clearAllData(): void {
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM sessions');
}

// ============= 技能操作 =============

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

export function getAllSkills(): Skill[] {
  const stmt = db.prepare('SELECT * FROM skills ORDER BY updated_at DESC');
  return stmt.all() as Skill[];
}

export function getSkill(id: string): Skill | undefined {
  const stmt = db.prepare('SELECT * FROM skills WHERE id = ?');
  return stmt.get(id) as Skill | undefined;
}

export function createSkill(skill: Skill): Skill {
  const stmt = db.prepare(`
    INSERT INTO skills (id, name, version, description, author, source, required_mcps, success_rate, avg_duration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    skill.id, skill.name, skill.version, skill.description, skill.author,
    skill.source, skill.required_mcps, skill.success_rate, skill.avg_duration,
    skill.created_at, skill.updated_at
  );
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
  
  fields.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);
  
  const stmt = db.prepare(`UPDATE skills SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return result.changes > 0;
}

export function deleteSkill(id: string): boolean {
  const stmt = db.prepare('DELETE FROM skills WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

// ============= 技能组合操作 =============

export interface SkillCombination {
  id: string;
  skill_ids: string;
  success_rate: number;
  usage_count: number;
  created_at: string;
}

export function getAllSkillCombinations(): SkillCombination[] {
  const stmt = db.prepare('SELECT * FROM skill_combinations ORDER BY success_rate DESC');
  return stmt.all() as SkillCombination[];
}

export function createSkillCombination(combo: SkillCombination): SkillCombination {
  const stmt = db.prepare(`
    INSERT INTO skill_combinations (id, skill_ids, success_rate, usage_count, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(combo.id, combo.skill_ids, combo.success_rate, combo.usage_count, combo.created_at);
  return combo;
}

export function updateSkillCombinationUsage(id: string, success: boolean): boolean {
  const stmt = db.prepare(`
    UPDATE skill_combinations 
    SET usage_count = usage_count + 1,
        success_rate = (success_rate * (usage_count - 1) + ?) / usage_count,
        id = ?
    WHERE id = ?
  `);
  const result = stmt.run(success ? 1 : 0, id);
  return result.changes > 0;
}

// ============= 反思日志操作 =============

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

export function createReflectionLog(log: ReflectionLog): ReflectionLog {
  const stmt = db.prepare(`
    INSERT INTO reflection_logs (id, session_id, plan_id, expected_outcome, actual_outcome, skill_performance, lessons_learned, knowledge_updates, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    log.id, log.session_id, log.plan_id, log.expected_outcome, log.actual_outcome,
    log.skill_performance, log.lessons_learned, log.knowledge_updates, log.created_at
  );
  return log;
}

export function getReflectionLogsBySession(sessionId: string): ReflectionLog[] {
  const stmt = db.prepare('SELECT * FROM reflection_logs WHERE session_id = ? ORDER BY created_at DESC');
  return stmt.all(sessionId) as ReflectionLog[];
}

// ============= 修复计划操作 =============

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

export function createFixPlan(plan: FixPlan): FixPlan {
  const stmt = db.prepare(`
    INSERT INTO fix_plans (id, issue_id, steps, estimated_tokens, estimated_cost, risk_level, requires_approval, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    plan.id, plan.issue_id, plan.steps, plan.estimated_tokens, plan.estimated_cost,
    plan.risk_level, plan.requires_approval, plan.status, plan.created_at, plan.updated_at
  );
  return plan;
}

export function getFixPlan(id: string): FixPlan | undefined {
  const stmt = db.prepare('SELECT * FROM fix_plans WHERE id = ?');
  return stmt.get(id) as FixPlan | undefined;
}

export function updateFixPlanStatus(id: string, status: string): boolean {
  const stmt = db.prepare('UPDATE fix_plans SET status = ?, updated_at = ? WHERE id = ?');
  const result = stmt.run(status, new Date().toISOString(), id);
  return result.changes > 0;
}

export function getAllFixPlans(): FixPlan[] {
  const stmt = db.prepare('SELECT * FROM fix_plans ORDER BY updated_at DESC');
  return stmt.all() as FixPlan[];
}

// ============= Agent 快照操作 =============

export interface AgentSnapshot {
  id: string;
  session_id: string;
  state: string;
  context: string;
  created_at: string;
}

export function createAgentSnapshot(snapshot: AgentSnapshot): AgentSnapshot {
  const stmt = db.prepare(`
    INSERT INTO agent_snapshots (id, session_id, state, context, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(snapshot.id, snapshot.session_id, snapshot.state, snapshot.context, snapshot.created_at);
  return snapshot;
}

export function getLatestAgentSnapshot(sessionId: string): AgentSnapshot | undefined {
  const stmt = db.prepare('SELECT * FROM agent_snapshots WHERE session_id = ? ORDER BY created_at DESC LIMIT 1');
  return stmt.get(sessionId) as AgentSnapshot | undefined;
}

export default db;
