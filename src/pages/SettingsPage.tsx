import React, { useState, useEffect } from 'react';
import type { UnifiedModel } from '../types';
import { API } from '../hooks/useApi';

export default function SettingsPage({ models, onModelsChange }: { models: UnifiedModel[]; onModelsChange: () => void }) {
  const [tab, setTab] = useState<'login' | 'models' | 'agents'>('login');
  const [apiKey, setApiKey] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [userModels, setUserModels] = useState<any[]>([]);
  const [newModel, setNewModel] = useState({ name: '', provider: 'openai', modelId: '', apiKey: '', baseUrl: '' });

  useEffect(() => { fetchUserModels(); }, []);

  const fetchUserModels = () => fetch(`${API}/user-models`).then(r => r.json()).then(d => setUserModels(d.models || []));

  const saveEnv = async () => {
    await fetch(`${API}/save-env-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey, authToken }) });
    alert('已保存');
  };

  const addModel = async () => {
    if (!newModel.name || !newModel.modelId) return;
    await fetch(`${API}/user-models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newModel) });
    setNewModel({ name: '', provider: 'openai', modelId: '', apiKey: '', baseUrl: '' });
    fetchUserModels(); onModelsChange();
  };

  const toggleModel = async (id: string, enabled: boolean) => {
    await fetch(`${API}/user-models/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
    fetchUserModels(); onModelsChange();
  };

  const deleteModel = async (id: string) => {
    await fetch(`${API}/user-models/${id}`, { method: 'DELETE' });
    fetchUserModels(); onModelsChange();
  };

  return (
    <div className="space-y-5 animate-fade-in-up max-w-3xl">
      <div className="flex gap-2 p-1 bg-[var(--bg-field)] rounded-xl w-fit">
        {(['login', 'models', 'agents'] as const).map((k) => {
          const labels: Record<string, string> = { login: '登录配置', models: '模型配置', agents: 'Agent 配置' };
          return (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === k ? 'bg-white text-[var(--accent-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>{labels[k]}</button>
          );
        })}
      </div>

      {tab === 'login' && (
        <div className="dashboard-card p-6 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">CodeBuddy 登录配置</h3>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">API Key</label>
            <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="输入 CodeBuddy API Key" className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">Auth Token</label>
            <input value={authToken} onChange={e => setAuthToken(e.target.value)} type="password" placeholder="输入 Auth Token" className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
          </div>
          <button onClick={saveEnv} className="px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity">保存配置</button>
        </div>
      )}

      {tab === 'models' && (
        <div className="space-y-4">
          <div className="dashboard-card p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">添加自定义模型</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={newModel.name} onChange={e => setNewModel({ ...newModel, name: e.target.value })} placeholder="显示名称" className="px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
              <select value={newModel.provider} onChange={e => setNewModel({ ...newModel, provider: e.target.value })} className="px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="ollama">Ollama</option>
                <option value="custom">Custom</option>
              </select>
              <input value={newModel.modelId} onChange={e => setNewModel({ ...newModel, modelId: e.target.value })} placeholder="模型 ID (如 gpt-4)" className="px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
              <input value={newModel.apiKey} onChange={e => setNewModel({ ...newModel, apiKey: e.target.value })} placeholder="API Key (可选)" className="px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
            </div>
            <input value={newModel.baseUrl} onChange={e => setNewModel({ ...newModel, baseUrl: e.target.value })} placeholder="Base URL (可选)" className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-field)] text-sm outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30" />
            <button onClick={addModel} className="px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity">添加模型</button>
          </div>

          <div className="dashboard-card p-6">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">已配置模型</h3>
            <div className="space-y-2">
              {userModels.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-field)]">
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{m.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{m.provider} / {m.model_id}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleModel(m.id, !m.enabled)} className={`text-xs px-3 py-1 rounded-full font-medium ${m.enabled ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{m.enabled ? '已启用' : '已禁用'}</button>
                    <button onClick={() => deleteModel(m.id)} className="text-xs text-red-400 hover:text-red-600">删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div className="dashboard-card p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Agent 配置</h3>
          <p className="text-sm text-[var(--text-secondary)]">Agent 自主决策循环已集成感知、规划、执行、反思模块。修复流程通过 /api/agent/fix 启动。</p>
          <div className="mt-4 p-4 rounded-xl bg-[var(--bg-field)] text-xs text-[var(--text-secondary)] font-mono space-y-1">
            <p>感知模块: server/agents/perception.ts</p>
            <p>规划模块: server/agents/planner.ts</p>
            <p>执行模块: server/agents/executor.ts</p>
            <p>反思模块: server/agents/reflector.ts</p>
            <p>调度器: server/agents/orchestrator.ts</p>
          </div>
        </div>
      )}
    </div>
  );
}
