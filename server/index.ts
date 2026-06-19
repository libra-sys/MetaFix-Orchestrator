import express from "express";
import { query, unstable_v2_createSession, unstable_v2_authenticate, PermissionResult, CanUseTool } from "@tencent-ai/agent-sdk";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import { fileURLToPath } from "url";
import * as db from "./db.js";
import { getMcpServerStatuses, startMcpServer, stopMcpServer } from "./mcp/manager.js";
import { startFixFlow, getAgentSession, getAllAgentSessions, cancelAgentSession } from "./agents/controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json());

let cachedModels: Array<{ modelId: string; name: string; description?: string }> = [];
const defaultModel = "claude-sonnet-4";

// ============ 权限请求管理 ============
interface PendingPermission {
  resolve: (result: PermissionResult) => void;
  reject: (error: Error) => void;
  toolName: string;
  input: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
}
const pendingPermissions = new Map<string, PendingPermission>();
const PERMISSION_TIMEOUT = 5 * 60 * 1000;

// ============ 健康检查 ============
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============ 登录状态 ============
app.get("/api/check-login", async (_req, res) => {
  const response: any = { isLoggedIn: false, envConfigured: false, cliConfigured: false, envVars: {} };
  const apiKey = process.env.CODEBUDDY_API_KEY;
  const authToken = process.env.CODEBUDDY_AUTH_TOKEN;
  if (apiKey || authToken) {
    response.envConfigured = true;
    if (apiKey) { response.envVars.apiKey = apiKey.slice(0, 8) + '****' + apiKey.slice(-4); response.apiKey = response.envVars.apiKey; }
    if (authToken) response.envVars.authToken = authToken.slice(0, 8) + '****' + authToken.slice(-4);
  }
  try {
    let needsLogin = false;
    const result = await unstable_v2_authenticate({
      environment: 'external',
      onAuthUrl: async () => { needsLogin = true; response.error = '未登录，请先登录 CodeBuddy CLI'; }
    });
    if (!needsLogin && result?.userinfo) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    } else if (!needsLogin) {
      response.isLoggedIn = true;
      response.cliConfigured = true;
      response.method = response.envConfigured ? 'env' : 'cli';
    }
  } catch (error: any) {
    if (response.envConfigured) { response.isLoggedIn = true; response.method = 'env'; }
    else { response.error = error?.message || String(error); response.method = 'none'; }
  }
  res.json(response);
});

app.post("/api/save-env-config", (req, res) => {
  const { apiKey, authToken, internetEnv, baseUrl } = req.body;
  if (!apiKey && !authToken) return res.status(400).json({ error: '请至少配置 API Key 或 Auth Token' });
  if (apiKey) process.env.CODEBUDDY_API_KEY = apiKey;
  if (authToken) process.env.CODEBUDDY_AUTH_TOKEN = authToken;
  if (internetEnv) process.env.CODEBUDDY_INTERNET_ENVIRONMENT = internetEnv;
  if (baseUrl) process.env.CODEBUDDY_BASE_URL = baseUrl;
  cachedModels = [];
  res.json({ success: true, message: '环境变量已设置', note: '仅在当前服务器进程有效' });
});

// ============ 模型列表 ============
app.get("/api/models", async (_req, res) => {
  try {
    let codebuddyModels = cachedModels;
    if (cachedModels.length === 0) {
      try {
        const session = await unstable_v2_createSession({ cwd: process.cwd() });
        const models = await session.getAvailableModels();
        if (models && Array.isArray(models)) cachedModels = models;
      } catch (e: any) { console.error("[Models] fetch error:", e?.message); }
    }
    if (cachedModels.length === 0) codebuddyModels = [{ modelId: "claude-sonnet-4", name: "Claude Sonnet 4" }];
    const userModels = db.getEnabledUserModels();
    const unified = [
      ...codebuddyModels.map(m => ({ modelId: m.modelId, name: m.name, provider: 'codebuddy', description: m.description || 'CodeBuddy 平台模型' })),
      ...userModels.map(m => ({ modelId: m.model_id, name: m.name, provider: m.provider, description: `自定义 ${m.provider} 模型`, isUserConfigured: true, userModelId: m.id, baseUrl: m.base_url, apiKey: m.api_key })),
    ];
    res.json({ models: unified, defaultModel });
  } catch (error: any) {
    res.json({ models: [{ modelId: defaultModel, name: "Claude Sonnet 4", provider: 'codebuddy' }], defaultModel, error: error?.message });
  }
});

// ============ 用户自定义模型 ============
app.get("/api/user-models", (_req, res) => {
  try { res.json({ models: db.getAllUserModels() }); } catch (e: any) { res.status(500).json({ error: e?.message }); }
});
app.post("/api/user-models", (req, res) => {
  const { name, provider, modelId, apiKey, baseUrl } = req.body;
  if (!name || !provider || !modelId) return res.status(400).json({ error: "名称、供应商和模型ID不能为空" });
  const now = new Date().toISOString();
  const model = db.createUserModel({ id: `um-${Date.now()}`, name, provider, model_id: modelId, api_key: apiKey || '', base_url: baseUrl || '', enabled: 1, created_at: now, updated_at: now });
  cachedModels = [];
  res.json({ success: true, model });
});
app.patch("/api/user-models/:id", (req, res) => {
  const { id } = req.params;
  const updates: any = {};
  const b = req.body;
  if (b.name !== undefined) updates.name = b.name;
  if (b.provider !== undefined) updates.provider = b.provider;
  if (b.modelId !== undefined) updates.model_id = b.modelId;
  if (b.apiKey !== undefined) updates.api_key = b.apiKey;
  if (b.baseUrl !== undefined) updates.base_url = b.baseUrl;
  if (b.enabled !== undefined) updates.enabled = b.enabled ? 1 : 0;
  const ok = db.updateUserModel(id, updates);
  if (!ok) return res.status(404).json({ error: "不存在" });
  cachedModels = [];
  res.json({ success: true });
});
app.delete("/api/user-models/:id", (req, res) => {
  const ok = db.deleteUserModel(req.params.id);
  if (!ok) return res.status(404).json({ error: "不存在" });
  cachedModels = [];
  res.json({ success: true });
});

// ============ Ollama ============
app.get("/api/ollama/models", async (req, res) => {
  try {
    const baseUrl = (req.query.baseUrl as string) || 'http://localhost:11434';
    const resp = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return res.json({ models: [] });
    const data = await resp.json() as any;
    const models = (data.models || []).map((m: any) => ({ modelId: m.name, name: m.name }));
    res.json({ models });
  } catch (e: any) { res.json({ models: [], error: e?.message }); }
});

// ============ 会话 ============
app.get("/api/sessions", (_req, res) => {
  try {
    const sessions = db.getAllSessions().map(s => ({ ...s, messageCount: db.getMessagesBySession(s.id).length }));
    res.json({ sessions });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});
app.get("/api/sessions/:sessionId", (req, res) => {
  const session = db.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "不存在" });
  const messages = db.getMessagesBySession(session.id).map(m => ({ ...m, tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : null }));
  res.json({ session, messages });
});
app.post("/api/sessions", (req, res) => {
  const { model = defaultModel, title = "新对话" } = req.body;
  const now = new Date().toISOString();
  const session = db.createSession({ id: uuidv4(), title, model, sdk_session_id: '', created_at: now, updated_at: now });
  res.json({ session });
});
app.patch("/api/sessions/:sessionId", (req, res) => {
  const ok = db.updateSession(req.params.sessionId, req.body);
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true });
});
app.delete("/api/sessions/:sessionId", (req, res) => {
  const ok = db.deleteSession(req.params.sessionId);
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true });
});

// ============ 权限响应 ============
app.post("/api/permission-response", (req, res) => {
  const { requestId, behavior, message } = req.body;
  const pending = pendingPermissions.get(requestId);
  if (!pending) return res.status(404).json({ error: "权限请求不存在或已超时" });
  pendingPermissions.delete(requestId);
  if (behavior === 'allow') pending.resolve({ behavior: 'allow', updatedInput: pending.input });
  else pending.resolve({ behavior: 'deny', message: message || '用户拒绝了此操作' });
  res.json({ success: true });
});

// ============ 聊天 ============
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, model, systemPrompt, cwd, permissionMode } = req.body;
  if (!message) return res.status(400).json({ error: "消息不能为空" });

  let session = sessionId ? db.getSession(sessionId) : null;
  const now = new Date().toISOString();
  if (!session) {
    session = db.createSession({ id: sessionId || uuidv4(), title: message.slice(0, 30) + (message.length > 30 ? '...' : ''), model: model || defaultModel, sdk_session_id: null, created_at: now, updated_at: now });
  }

  const selectedModel = model || session.model;
  const userMessageId = uuidv4();
  const assistantMessageId = uuidv4();
  db.createMessage({ id: userMessageId, session_id: session.id, role: 'user', content: message, model: null, created_at: now, tool_calls: null });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const defaultSystemPrompt = "你是一个专业的AI助手，善于帮助用户解决各种问题。请用简洁清晰的方式回答问题。";
  const workingDir = cwd || process.cwd();

  // 检查是否为用户自定义模型
  const userModel = db.getEnabledUserModels().find(m => m.model_id === selectedModel);
  if (userModel) {
    res.write(`data: ${JSON.stringify({ type: "init", sessionId: session.id, userMessageId, assistantMessageId, model: selectedModel })}

`);
    try {
      const resp = await fetch(`${userModel.base_url || 'https://api.openai.com/v1'}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userModel.api_key || 'sk-demo'}` },
        body: JSON.stringify({ model: selectedModel, messages: [{ role: 'system', content: systemPrompt || defaultSystemPrompt }, { role: 'user', content: message }], stream: true }),
      });
      if (!resp.body) throw new Error('无响应体');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));
        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) { fullResponse += delta; res.write(`data: ${JSON.stringify({ type: "text", content: delta })}

`); }
          } catch { /* ignore */ }
        }
      }
      res.write(`data: ${JSON.stringify({ type: "done", duration: 0, cost: 0 })}

`);
      db.createMessage({ id: assistantMessageId, session_id: session.id, role: 'assistant', content: fullResponse, model: selectedModel, created_at: new Date().toISOString(), tool_calls: null });
      const allMessages = db.getMessagesBySession(session.id);
      if (allMessages.length <= 2) db.updateSession(session.id, { title: message.slice(0, 30) + (message.length > 30 ? '...' : ''), model: selectedModel });
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || "请求失败" })}

`);
    }
    res.end();
    return;
  }

  // CodeBuddy SDK 路径
  try {
    const canUseTool: CanUseTool = async (toolName, input, options) => {
      if (permissionMode === 'bypassPermissions') return { behavior: 'allow', updatedInput: input };
      const requestId = uuidv4();
      res.write(`data: ${JSON.stringify({ type: "permission_request", requestId, toolUseId: options.toolUseID, toolName, input, sessionId: session.id, timestamp: Date.now() })}

`);
      return new Promise<PermissionResult>((resolve) => {
        const pending: PendingPermission = { resolve, reject: () => {}, toolName, input, sessionId: session.id, timestamp: Date.now() };
        pendingPermissions.set(requestId, pending);
        setTimeout(() => { if (pendingPermissions.has(requestId)) { pendingPermissions.delete(requestId); resolve({ behavior: 'deny', message: '权限请求超时' }); } }, PERMISSION_TIMEOUT);
      });
    };

    const stream = query({
      prompt: message,
      options: { cwd: workingDir, model: selectedModel, maxTurns: 10, systemPrompt: systemPrompt || defaultSystemPrompt, permissionMode: permissionMode || 'default', canUseTool, ...(session.sdk_session_id ? { resume: session.sdk_session_id } : {}) }
    });

    let fullResponse = "";
    const toolCalls: any[] = [];
    let newSdkSessionId: string | null = null;
    let currentToolId: string | null = null;

    res.write(`data: ${JSON.stringify({ type: "init", sessionId: session.id, userMessageId, assistantMessageId, model: selectedModel })}

`);

    for await (const msg of stream) {
      if (msg.type === "system" && (msg as any).subtype === "init") {
        newSdkSessionId = (msg as any).session_id;
        if (newSdkSessionId && newSdkSessionId !== session.sdk_session_id) db.updateSession(session.id, { sdk_session_id: newSdkSessionId });
      } else if (msg.type === "assistant") {
        const content = msg.message.content;
        if (typeof content === "string") { fullResponse += content; res.write(`data: ${JSON.stringify({ type: "text", content })}

`); }
        else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") { fullResponse += block.text; res.write(`data: ${JSON.stringify({ type: "text", content: block.text })}

`); }
            else if (block.type === "tool_use") {
              currentToolId = block.id || uuidv4();
              const toolCall = { id: currentToolId, name: block.name, input: (block as any).input || {}, status: "running" };
              toolCalls.push(toolCall);
              res.write(`data: ${JSON.stringify({ type: "tool", id: toolCall.id, name: toolCall.name, input: toolCall.input, status: toolCall.status })}

`);
            }
          }
        }
      } else if ((msg as any).type === "tool_result") {
        const m = msg as any;
        const toolId = m.tool_use_id || currentToolId;
        const isError = m.is_error || false;
        const tool = toolCalls.find(t => t.id === toolId) || toolCalls[toolCalls.length - 1];
        if (tool) {
          tool.status = isError ? "error" : "completed";
          tool.isError = isError;
          tool.result = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
          res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: tool.id, content: tool.result, isError })}

`);
        }
        currentToolId = null;
      } else if (msg.type === "result") {
        toolCalls.forEach(t => { if (t.status === "running") { t.status = "completed"; res.write(`data: ${JSON.stringify({ type: "tool_result", toolId: t.id, content: t.result || "已完成" })}

`); } });
        res.write(`data: ${JSON.stringify({ type: "done", duration: (msg as any).duration_ms || 0, cost: (msg as any).total_cost_usd || 0 })}

`);
      }
    }

    db.createMessage({ id: assistantMessageId, session_id: session.id, role: 'assistant', content: fullResponse, model: selectedModel, created_at: new Date().toISOString(), tool_calls: toolCalls.length > 0 ? JSON.stringify(toolCalls) : null });
    const allMessages = db.getMessagesBySession(session.id);
    if (allMessages.length <= 2) db.updateSession(session.id, { title: message.slice(0, 30) + (message.length > 30 ? '...' : ''), model: selectedModel });
  } catch (error: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: error?.message || "处理请求时发生错误" })}

`);
  }
  res.end();
});

// ============ Agent Fix Flow ============
app.post("/api/agent/fix", async (req, res) => {
  try {
    const { issueUrl } = req.body;
    if (!issueUrl) return res.status(400).json({ error: "issueUrl 不能为空" });
    const sessionId = await startFixFlow(issueUrl);
    const session = getAgentSession(sessionId);
    res.json({ success: true, sessionId, state: session?.state || 'perceiving', message: '修复流程已启动' });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});
app.get("/api/agent/sessions", (_req, res) => {
  try { res.json({ sessions: getAllAgentSessions() }); } catch (e: any) { res.status(500).json({ error: e?.message }); }
});
app.get("/api/agent/sessions/:sessionId", (req, res) => {
  const session = getAgentSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "不存在" });
  res.json({ session });
});
app.post("/api/agent/sessions/:sessionId/cancel", (req, res) => {
  const ok = cancelAgentSession(req.params.sessionId);
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true, message: "已取消" });
});
app.get("/api/agent/health", (_req, res) => {
  const sessions = getAllAgentSessions();
  res.json({ status: 'ok', timestamp: new Date().toISOString(), activeAgents: sessions.filter(s => s.state !== 'idle' && s.state !== 'error' && s.state !== 'completed').length, totalSessions: sessions.length });
});

// ============ 修复计划 ============
app.get("/api/plans", (_req, res) => { try { res.json({ plans: db.getAllFixPlans() }); } catch (e: any) { res.status(500).json({ error: e?.message }); } });
app.get("/api/plans/:planId", (req, res) => {
  const plan = db.getFixPlan(req.params.planId);
  if (!plan) return res.status(404).json({ error: "不存在" });
  res.json({ plan });
});
app.patch("/api/plans/:planId", (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending', 'executing', 'completed', 'failed'].includes(status)) {
    return res.status(400).json({ error: "status 无效" });
  }
  const ok = db.updateFixPlanStatus(req.params.planId, status);
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true });
});

// ============ 技能 ============
app.get("/api/skills", (_req, res) => { try { res.json({ skills: db.getAllSkills() }); } catch (e: any) { res.status(500).json({ error: e?.message }); } });
app.post("/api/skills", (req, res) => {
  const { name, version, description, author, source, required_mcps } = req.body;
  if (!name) return res.status(400).json({ error: "名称不能为空" });
  const now = new Date().toISOString();
  const skill = db.createSkill({ id: `skill-${Date.now()}`, name, version: version || '1.0.0', description: description || '', author: author || 'system', source: source || 'manual', required_mcps: required_mcps ? JSON.stringify(required_mcps) : '[]', success_rate: 0.0, avg_duration: 0, created_at: now, updated_at: now });
  res.json({ success: true, skill });
});
app.delete("/api/skills/:id", (req, res) => {
  const ok = db.deleteSkill(req.params.id);
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true });
});
app.get("/api/skills/search", (req, res) => {
  const q = (req.query.q as string) || "";
  const skills = db.getAllSkills().filter((s: any) => s.name.toLowerCase().includes(q.toLowerCase()) || (s.description || "").toLowerCase().includes(q.toLowerCase()));
  res.json({ skills });
});

// ============ MCP ============
app.get("/api/mcp/status", (_req, res) => { try { res.json({ servers: getMcpServerStatuses() }); } catch (e: any) { res.status(500).json({ error: e?.message }); } });
app.post("/api/mcp/toggle", async (req, res) => {
  const { name, action } = req.body;
  if (!name || !action) return res.status(400).json({ error: "缺少参数" });
  if (action === "start") { const result = await startMcpServer(name); res.json({ success: true, server: result }); }
  else if (action === "stop") { const ok = stopMcpServer(name); res.json({ success: ok, server: { name, running: false } }); }
  else res.status(400).json({ error: "action 必须是 start 或 stop" });
});

// ============ 子智能体 ============
app.get("/api/agents", (_req, res) => { try { res.json({ agents: db.getAllSubAgents() }); } catch (e: any) { res.status(500).json({ error: e?.message }); } });
app.patch("/api/agents/:id/toggle", (req, res) => {
  const ok = db.updateSubAgentStatus(req.params.id, req.body.status || "active");
  if (!ok) return res.status(404).json({ error: "不存在" });
  res.json({ success: true });
});

// ============ 反思日志 ============
app.get("/api/reflections", (req, res) => {
  try {
    const sessionId = req.query.sessionId as string;
    if (sessionId) res.json({ logs: db.getReflectionLogsBySession(sessionId) });
    else res.json({ logs: [] });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 成本控制 ============
app.get("/api/cost", (req, res) => {
  try {
    const { getSessionCost, getAllCosts } = require('./cost/token-tracker.js');
    const sessionId = req.query.sessionId as string;
    if (sessionId) res.json(getSessionCost(sessionId));
    else res.json({ costs: getAllCosts() });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

app.post("/api/budget/check", (req, res) => {
  try {
    const { checkBudget } = require('./cost/budget.js');
    const { sessionId, estimatedTokens } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId 必填' });
    const result = checkBudget(sessionId, estimatedTokens || 1000, Math.ceil((estimatedTokens || 1000) * 0.5));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 安全检查 ============
app.post("/api/security/check", (req, res) => {
  try {
    const { checkCommandRisk, checkFileWriteRisk } = require('./security/approval.js');
    const { type, value } = req.body;
    if (type === 'command') res.json(checkCommandRisk(value));
    else if (type === 'file_write') res.json(checkFileWriteRisk(value));
    else res.status(400).json({ error: 'type 必须是 command 或 file_write' });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 知识库 RAG ============
app.get("/api/knowledge/query", async (req, res) => {
  try {
    const { queryRag } = require('./knowledge/rag.js');
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'q 必填' });
    const result = await queryRag(q);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

app.post("/api/knowledge/ingest", async (req, res) => {
  try {
    const { ingestDocument, ingestWiki, ingestRules } = require('./knowledge/rag.js');
    const { type, source, content } = req.body;
    if (type === 'wiki') await ingestWiki(source, content);
    else if (type === 'document') await ingestDocument(source, content);
    else if (type === 'rules') await ingestRules(content);
    else return res.status(400).json({ error: 'type 必须是 wiki/document/rules' });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 子智能体执行端点 ============
app.post("/api/agents/:name/execute", async (req, res) => {
  try {
    const name = req.params.name;
    const input = req.body;
    let result: any;
    switch (name) {
      case 'issue-analyzer': {
        const { analyzeIssue } = require('./agents/issue-analyzer.js');
        result = await analyzeIssue(input.issueUrl || '', input.title || '', input.body || '', process.cwd());
        break;
      }
      case 'codebase-navigator': {
        const { locateCode } = require('./agents/codebase-navigator.js');
        result = locateCode(input.pattern || '', process.cwd());
        break;
      }
      case 'test-writer': {
        const { writeTests } = require('./agents/test-writer.js');
        result = await writeTests(input.files || [], input.description || '', process.cwd());
        break;
      }
      case 'regression-guard': {
        const { runRegressionTests } = require('./agents/regression-guard.js');
        result = runRegressionTests(process.cwd());
        break;
      }
      case 'quality-gate': {
        const { runQualityGate } = require('./agents/quality-gate.js');
        result = runQualityGate(process.cwd());
        break;
      }
      case 'build-system-expert': {
        const { runBuild } = require('./agents/build-system-expert.js');
        result = runBuild(process.cwd());
        break;
      }
      case 'pr-creator': {
        const { createPullRequest } = require('./agents/pr-creator.js');
        result = await createPullRequest(input.issueUrl || '', input.title || '', input.description || '', process.cwd());
        break;
      }
      case 'upstream-tracker': {
        const { compareWithUpstream } = require('./agents/upstream-tracker.js');
        result = compareWithUpstream(process.cwd());
        break;
      }
      default:
        return res.status(404).json({ error: `未知子智能体: ${name}` });
    }
    res.json({ success: true, result });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 技能执行端点 ============
app.post("/api/skills/:name/execute", async (req, res) => {
  try {
    const { executeSkill } = require('./skills/resolver.js');
    const result = await executeSkill(req.params.name, req.body);
    res.json({ success: true, result });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ============ 静态文件 ============
if (isProduction) {
  const publicDir = path.resolve(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     MetaFix Orchestrator                   ║
║     ${isProduction ? '生产' : '开发'}模式                                   ║
║     http://localhost:${PORT}                        ║
╚════════════════════════════════════════════╝
  `);
});
