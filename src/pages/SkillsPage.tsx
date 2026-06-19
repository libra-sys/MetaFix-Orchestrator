import React, { useState, useEffect } from 'react';
import type { Skill } from '../types';
import { API } from '../hooks/useApi';

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { fetch(`${API}/skills`).then(r => r.json()).then(d => setSkills(d.skills || [])); }, []);

  const filtered = skills.filter(s => s.name.toLowerCase().includes(q.toLowerCase()) || s.description.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索技能..." className="flex-1 max-w-md px-4 py-2.5 rounded-xl bg-white border border-[var(--td-border-level-1-color)] text-sm outline-none focus:border-[var(--accent-primary)] transition-colors" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(skill => (
          <div key={skill.id} className="dashboard-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{skill.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-field)] text-[var(--text-secondary)]">{skill.version}</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-3 line-clamp-2">{skill.description}</p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-tertiary)]">成功率: {(skill.success_rate * 100).toFixed(0)}%</span>
              <span className="text-[var(--text-tertiary)]">{skill.source}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
