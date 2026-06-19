import React, { useState, useEffect } from 'react';
import { MessageCircle, Zap, Server, Users } from 'lucide-react';
import type { Session, UnifiedModel } from '../types';
import { API } from '../hooks/useApi';

type Page = 'dashboard' | 'chat' | 'skills' | 'mcp' | 'agents' | 'settings' | 'fix';

export default function DashboardPage({ onNavigate, sessions }: { onNavigate: (p: Page) => void; sessions: Session[] }) {
  const [stats, setStats] = useState({ sessions: 0, skills: 0, mcp: 0, agents: 0 });
  useEffect(() => {
    Promise.all([
      fetch(`${API}/skills`).then(r => r.json()),
      fetch(`${API}/mcp/status`).then(r => r.json()),
      fetch(`${API}/agents`).then(r => r.json()),
    ]).then(([s, m, a]) => setStats({
      sessions: sessions.length,
      skills: (s.skills || []).length,
      mcp: (m.servers || []).filter((x: any) => x.running).length,
      agents: (a.agents || []).length,
    }));
  }, [sessions.length]);

  const cards = [
    { label: '活跃会话', value: stats.sessions, icon: <MessageCircle size={20} />, color: 'from-[#6C5DD3] to-[#8B5CF6]', page: 'chat' as Page },
    { label: '技能总数', value: stats.skills, icon: <Zap size={20} />, color: 'from-[#FF8FBA] to-[#F472B6]', page: 'skills' as Page },
    { label: 'MCP 在线', value: stats.mcp, icon: <Server size={20} />, color: 'from-[#22C55E] to-[#4ADE80]', page: 'mcp' as Page },
    { label: '子智能体', value: stats.agents, icon: <Users size={20} />, color: 'from-[#3B82F6] to-[#60A5FA]', page: 'agents' as Page },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Hello, Developer</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">MetaFix Orchestrator 已就绪，随时准备修复缺陷</p>
        </div>
        <button onClick={() => onNavigate('fix')} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[#8B5CF6] text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-lg shadow-[var(--accent-primary)]/20">
          启动修复流程
        </button>
      </div>

      <div className="grid grid-cols-4 gap-5">
        {cards.map((c, i) => (
          <div key={i} onClick={() => onNavigate(c.page)} className="dashboard-card p-5 cursor-pointer">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center text-white mb-4`}>{c.icon}</div>
            <p className="text-2xl font-bold text-[var(--text-primary)]">{c.value}</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="dashboard-card p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">快捷入口</h3>
          <div className="space-y-2">
            <button onClick={() => onNavigate('chat')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-hover)] transition-colors text-left">
              <MessageCircle size={18} className="text-[var(--accent-primary)]" /><span className="text-sm text-[var(--text-primary)]">新建对话</span>
            </button>
            <button onClick={() => onNavigate('skills')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-hover)] transition-colors text-left">
              <Zap size={18} className="text-[var(--accent-secondary)]" /><span className="text-sm text-[var(--text-primary)]">查看技能</span>
            </button>
            <button onClick={() => onNavigate('settings')} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-hover)] transition-colors text-left">
              <span className="text-sm text-[var(--text-primary)]">系统设置</span>
            </button>
          </div>
        </div>
        <div className="dashboard-card p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">最近会话</h3>
          {sessions.slice(0, 5).length === 0 ? <p className="text-sm text-[var(--text-tertiary)]">暂无会话</p> :
            <div className="space-y-2">
              {sessions.slice(0, 5).map(s => (
                <div key={s.id} onClick={() => onNavigate('chat')} className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer transition-colors">
                  <span className="text-sm text-[var(--text-primary)] truncate max-w-[70%]">{s.title}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{s.messageCount || 0} 条</span>
                </div>
              ))}
            </div>
          }
        </div>
      </div>
    </div>
  );
}
