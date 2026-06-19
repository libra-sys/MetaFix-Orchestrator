import React, { useState, useEffect } from 'react';
import type { SubAgent } from '../types';
import { API } from '../hooks/useApi';

export default function SubAgentsPage() {
  const [agents, setAgents] = useState<SubAgent[]>([]);
  useEffect(() => { fetch(`${API}/agents`).then(r => r.json()).then(d => setAgents(d.agents || [])); }, []);

  const toggle = async (id: string, status: string) => {
    await fetch(`${API}/agents/${id}/toggle`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    fetch(`${API}/agents`).then(r => r.json()).then(d => setAgents(d.agents || []));
  };

  const byType: Record<string, SubAgent[]> = {};
  agents.forEach(a => { if (!byType[a.type]) byType[a.type] = []; byType[a.type].push(a); });

  return (
    <div className="space-y-6 animate-fade-in-up">
      {Object.entries(byType).map(([type, list]) => (
        <div key={type}>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 capitalize">{type === 'analysis' ? '分析型' : type === 'fix' ? '修复型' : '交付型'}</h3>
          <div className="grid grid-cols-4 gap-4">
            {list.map(a => (
              <div key={a.id} className="dashboard-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-[var(--text-primary)]">{a.name}</h4>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">{a.description}</p>
                <button onClick={() => toggle(a.id, a.status === 'active' ? 'inactive' : 'active')} className="text-xs text-[var(--accent-primary)] hover:underline">{a.status === 'active' ? '停用' : '启用'}</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
