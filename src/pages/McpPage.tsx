import React, { useState, useEffect } from 'react';
import type { McpServer } from '../types';
import { API } from '../hooks/useApi';

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const refresh = () => fetch(`${API}/mcp/status`).then(r => r.json()).then(d => setServers(d.servers || []));
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);

  const toggle = async (name: string, action: string) => {
    await fetch(`${API}/mcp/toggle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, action }) });
    refresh();
  };

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="grid grid-cols-4 gap-4">
        {servers.map(s => (
          <div key={s.name} className={`dashboard-card p-5 border-2 ${s.running ? 'border-[var(--success)]' : 'border-transparent'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] capitalize">{s.name}</h3>
              <span className={`w-2.5 h-2.5 rounded-full ${s.running ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">{s.running ? `PID: ${s.pid}` : '未运行'}</p>
            <button onClick={() => toggle(s.name, s.running ? 'stop' : 'start')} className={`w-full py-2 rounded-xl text-xs font-medium transition-colors ${s.running ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-[var(--accent-primary)] text-white hover:opacity-90'}`}>
              {s.running ? '停止' : '启动'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
