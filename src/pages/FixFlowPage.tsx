import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { AgentSession } from '../types';
import { API } from '../hooks/useApi';

export default function FixFlowPage() {
  const [url, setUrl] = useState('');
  const [agentSessions, setAgentSessions] = useState<AgentSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => { fetch(`${API}/agent/sessions`).then(r => r.json()).then(d => setAgentSessions(d.sessions || [])); }, 2000);
    fetch(`${API}/agent/sessions`).then(r => r.json()).then(d => setAgentSessions(d.sessions || []));
    return () => clearInterval(t);
  }, []);

  const start = async () => {
    if (!url.trim()) return;
    const r = await fetch(`${API}/agent/fix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issueUrl: url }) });
    const d = await r.json();
    if (d.sessionId) setActiveId(d.sessionId);
  };

  const active = agentSessions.find(s => s.id === activeId);

  return (
    <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto">
      <div className="dashboard-card p-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">启动自主修复</h3>
        <div className="flex gap-3">
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="输入 GitHub Issue URL，例如 https://github.com/owner/repo/issues/999" className="flex-1 px-4 py-3 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
          <button onClick={start} disabled={!url.trim()} className="px-6 py-3 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[#8B5CF6] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity">
            开始修复
          </button>
        </div>
      </div>

      {active && (
        <div className="dashboard-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">修复会话 #{active.issueId}</h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">状态: <span className="font-medium text-[var(--accent-primary)]">{active.state}</span></p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--text-tertiary)]">进度</p>
              <p className="text-lg font-bold text-[var(--accent-primary)]">{active.progress}%</p>
            </div>
          </div>
          <div className="w-full h-2 bg-[var(--bg-field)] rounded-full overflow-hidden mb-4">
            <div className="h-full bg-gradient-to-r from-[var(--accent-primary)] to-[#8B5CF6] transition-all duration-500" style={{ width: `${active.progress}%` }} />
          </div>
          <div className="space-y-2 max-h-80 overflow-auto">
            {active.logs.map((log, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-[var(--bg-field)]">
                {log.level === 'success' && <CheckCircle size={14} className="text-[var(--success)] mt-0.5 flex-shrink-0" />}
                {log.level === 'error' && <XCircle size={14} className="text-[var(--error)] mt-0.5 flex-shrink-0" />}
                {log.level === 'warn' && <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />}
                {log.level === 'info' && <Loader2 size={14} className="text-[var(--info)] mt-0.5 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)]">[{log.stage}] {log.message}</p>
                  {log.details && <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">{JSON.stringify(log.details)}</p>}
                </div>
              </div>
            ))}
          </div>
          {active.state !== 'completed' && active.state !== 'error' && (
            <button onClick={() => fetch(`${API}/agent/sessions/${active.id}/cancel`, { method: 'POST' }).then(() => setActiveId(null))} className="mt-4 px-4 py-2 rounded-lg bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100 transition-colors">
              取消执行
            </button>
          )}
        </div>
      )}
    </div>
  );
}
