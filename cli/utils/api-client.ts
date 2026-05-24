/**
 * API 客户端：与后端通信
 */

import fetch from 'node-fetch';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001/api';

/**
 * 发送 API 请求
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const result: ApiResponse<T> = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `HTTP ${response.status}`);
  }

  return result.data as T;
}

/**
 * 启动修复流程
 */
export async function startFixFlow(issueUrl: string): Promise<{ sessionId: string }> {
  return apiRequest<{ sessionId: string }>('/agent/fix', {
    method: 'POST',
    body: { issueUrl },
  });
}

/**
 * 获取 Agent 会话状态
 */
export async function getAgentSession(sessionId: string): Promise<any> {
  return apiRequest<any>(`/agent/sessions/${sessionId}`);
}

/**
 * 获取所有修复计划
 */
export async function getFixPlans(): Promise<any[]> {
  const result = await apiRequest<{ plans: any[] }>('/plans');
  return result.plans || [];
}

/**
 * 获取所有技能
 */
export async function getSkills(): Promise<any[]> {
  const result = await apiRequest<{ skills: any[] }>('/skills');
  return result.skills || [];
}

/**
 * 获取反思日志
 */
export async function getReflectionLogs(sessionId?: string): Promise<any[]> {
  const endpoint = sessionId 
    ? `/reflections?sessionId=${encodeURIComponent(sessionId)}`
    : '/reflections';
  const result = await apiRequest<{ logs: any[] }>(endpoint);
  return result.logs || [];
}

/**
 * 检查 Agent 健康状态
 */
export async function checkAgentHealth(): Promise<{
  status: string;
  activeAgents: number;
  totalSessions: number;
}> {
  return apiRequest<any>('/agent/health');
}
