import { useState, useEffect, useCallback, useRef } from 'react';

interface AgentSession {
  id: string;
  issueId: string;
  issueUrl: string;
  state: 'idle' | 'perceiving' | 'planning' | 'executing' | 'reflecting' | 'delivering' | 'error';
  currentPlanId: string | null;
  context: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface AgentState {
  session: AgentSession | null;
  loading: boolean;
  error: string | null;
}

/**
 * Agent 控制 Hook
 */
export function useAgent() {
  const [activeSessions, setActiveSessions] = useState<AgentSession[]>([]);
  const [currentSession, setCurrentSession] = useState<AgentSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * 启动修复流程
   */
  const startFix = useCallback(async (issueUrl: string): Promise<string> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/agent/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueUrl }),
      });

      if (!response.ok) {
        throw new Error(`启动失败: ${response.statusText}`);
      }

      const data = await response.json();
      setLoading(false);
      return data.sessionId;
    } catch (err: any) {
      setError(err.message || '启动修复流程失败');
      setLoading(false);
      throw err;
    }
  }, []);

  /**
   * 获取 Agent 会话状态
   */
  const fetchSession = useCallback(async (sessionId: string): Promise<AgentSession | null> => {
    try {
      const response = await fetch(`/api/agent/sessions/${sessionId}`);

      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`获取会话失败: ${response.statusText}`);
      }

      const data = await response.json();
      setCurrentSession(data.session);
      return data.session;
    } catch (err: any) {
      setError(err.message || '获取会话失败');
      return null;
    }
  }, []);

  /**
   * 获取所有活跃会话
   */
  const fetchActiveSessions = useCallback(async (): Promise<AgentSession[]> => {
    try {
      const response = await fetch('/api/agent/sessions');

      if (!response.ok) {
        throw new Error(`获取会话列表失败: ${response.statusText}`);
      }

      const data = await response.json();
      setActiveSessions(data.sessions || []);
      return data.sessions || [];
    } catch (err: any) {
      setError(err.message || '获取会话列表失败');
      return [];
    }
  }, []);

  /**
   * 取消 Agent 执行
   */
  const cancelSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/agent/sessions/${sessionId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(`取消失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.success;
    } catch (err: any) {
      setError(err.message || '取消会话失败');
      return false;
    }
  }, []);

  /**
   * 订阅 Agent 状态更新（SSE）
   */
  const subscribeToUpdates = useCallback((sessionId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/agent/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update') {
          setCurrentSession(prev => prev ? { ...prev, state: data.state } : null);
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, []);

  /**
   * 清理事件源
   */
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    activeSessions,
    currentSession,
    loading,
    error,
    startFix,
    fetchSession,
    fetchActiveSessions,
    cancelSession,
    subscribeToUpdates,
  };
}
