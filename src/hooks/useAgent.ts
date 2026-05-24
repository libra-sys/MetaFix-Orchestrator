import { useState, useEffect, useCallback, useMemo } from 'react';

// 会话类型
export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  icon: string;
  color: string;
  permissionMode: 'default' | 'bypass' | 'plan';
}

export function useAgent() {
  const [agents, setAgents] = useState<Agent[]>([
    {
      id: 'default',
      name: 'Default Agent',
      description: '默认 AI 助手',
      systemPrompt: '你是一个专业的AI助手。',
      icon: '🤖',
      color: 'blue',
      permissionMode: 'default' as const,
    }
  ]);

  const addAgent = useCallback((agent: Omit<Agent, 'id'>) => {
    const newAgent = { ...agent, id: `agent-${Date.now()}` };
    setAgents(prev => [...prev, newAgent]);
  }, []);

  const updateAgent = useCallback((id: string, updates: Partial<Agent>) => {
    setAgents(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  }, []);

  const deleteAgent = useCallback((id: string) => {
    setAgents(prev => prev.filter(a => a.id !== id));
  }, []);

  const getAgent = useCallback((id: string) => agents.find(a => a.id === id), [agents]);

  return { agents, addAgent, updateAgent, deleteAgent, getAgent };
}
