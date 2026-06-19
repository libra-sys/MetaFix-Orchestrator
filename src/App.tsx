import React, { useState, useEffect, useCallback } from 'react';
import { Layout, MessageCircle, Zap, Server, Users, Settings, Home, Plus, ChevronLeft, ChevronRight, Bot, CheckCircle, AlertTriangle } from 'lucide-react';
import type { Session, UnifiedModel, PermissionRequest } from './types';
import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import SkillsPage from './pages/SkillsPage';
import McpPage from './pages/McpPage';
import SubAgentsPage from './pages/SubAgentsPage';
import FixFlowPage from './pages/FixFlowPage';
import SettingsPage from './pages/SettingsPage';

export const API = 'http://localhost:3000/api';

type Page = 'dashboard' | 'chat' | 'skills' | 'mcp' | 'agents' | 'settings' | 'fix';

export default function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [models, setModels] = useState<UnifiedModel[]>([]);
  const [currentModel, setCurrentModel] = useState<UnifiedModel | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);

  useEffect(() => { fetchSessions(); fetchModels(); }, []);

  const fetchSessions = async () => {
    try { const r = await fetch(`${API}/sessions`); const d = await r.json(); setSessions(d.sessions || []); } catch {}
  };
  const fetchModels = async () => {
    try { const r = await fetch(`${API}/models`); const d = await r.json(); setModels(d.models || []); if (d.models?.[0]) setCurrentModel(d.models[0]); } catch {}
  };

  const createSession = async () => {
    try {
      const r = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel?.modelId || 'claude-sonnet-4', title: '新对话' }) });
      const d = await r.json();
      if (d.session) { setSessions(prev => [d.session, ...prev]); setCurrentSessionId(d.session.id); setPage('chat'); }
    } catch {}
  };

  const respondPermission = async (requestId: string, behavior: 'allow' | 'deny') => {
    try { await fetch(`${API}/permission-response`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId, behavior }) }); setPermissions(prev => prev.filter(p => p.requestId !== requestId)); } catch {}
  };

  const navItems: { key: Page; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: '概览', icon: <Home size={20} /> },
    { key: 'chat', label: '对话', icon: <MessageCircle size={20} /> },
    { key: 'skills', label: '技能', icon: <Zap size={20} /> },
    { key: 'mcp', label: 'MCP', icon: <Server size={20} /> },
    { key: 'agents', label: '子智能体', icon: <Bot size={20} /> },
    { key: 'fix', label: '修复流程', icon: <CheckCircle size={20} /> },
    { key: 'settings', label: '设置', icon: <Settings size={20} /> },
  ];

  const pageTitles: Record<Page, string> = {
    dashboard: 'Dashboard',
    chat: '对话',
    skills: '技能管理',
    mcp: 'MCP 服务器',
    agents: '子智能体',
    fix: '修复流程',
    settings: '系统设置',
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-root)]">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} flex-shrink-0 transition-all duration-300 flex flex-col p-4`}>
        <div className="dashboard-card flex flex-col h-full p-4">
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[#8B5CF6] flex items-center justify-center text-white font-bold text-sm">M</div>
            {sidebarOpen && <span className="font-semibold text-[var(--text-primary)] text-sm tracking-tight">MetaFix</span>}
          </div>
          <nav className="flex-1 space-y-1">
            {navItems.map(item => (
              <button key={item.key} onClick={() => setPage(item.key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${page === item.key ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/20' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}>
                {item.icon}
                {sidebarOpen && <span>{item.label}</span>}
              </button>
            ))}
          </nav>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="mt-auto mx-auto p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors">
            {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0 p-4 pl-0">
        <div className="dashboard-card flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--td-border-level-1-color)]">
            <div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">{pageTitles[page]}</h1>
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">MetaFix Orchestrator — 自主决策型 AI Agent</p>
            </div>
            <div className="flex items-center gap-3">
              {page === 'chat' && (
                <button onClick={createSession} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-primary)]/20">
                  <Plus size={16} /> 新对话
                </button>
              )}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-xs font-bold">U</div>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {page === 'dashboard' && <DashboardPage onNavigate={setPage} sessions={sessions} />}
            {page === 'chat' && <ChatPage sessions={sessions} currentSessionId={currentSessionId} setCurrentSessionId={setCurrentSessionId} models={models} currentModel={currentModel} />}
            {page === 'skills' && <SkillsPage />}
            {page === 'mcp' && <McpPage />}
            {page === 'agents' && <SubAgentsPage />}
            {page === 'fix' && <FixFlowPage />}
            {page === 'settings' && <SettingsPage models={models} onModelsChange={fetchModels} />}
          </div>
        </div>
      </main>

      {/* Permission toasts */}
      {permissions.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 space-y-3 w-80">
          {permissions.map(p => (
            <div key={p.requestId} className="dashboard-card p-4 border-l-4 border-[var(--warning)]">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-[var(--warning)] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)]">工具调用请求</p>
                  <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{p.toolName}</p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => respondPermission(p.requestId, 'allow')} className="flex-1 py-1.5 rounded-lg bg-[var(--success)] text-white text-xs font-medium hover:opacity-90">允许</button>
                    <button onClick={() => respondPermission(p.requestId, 'deny')} className="flex-1 py-1.5 rounded-lg bg-[var(--error)] text-white text-xs font-medium hover:opacity-90">拒绝</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
