export interface Session {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
  messageCount?: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: any;
}

export interface UnifiedModel {
  modelId: string;
  name: string;
  provider: string;
  description?: string;
  isUserConfigured?: boolean;
  userModelId?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface UserModel {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  api_key: string;
  base_url: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  required_mcps: string;
  success_rate: number;
  avg_duration: number;
  created_at: string;
  updated_at: string;
}

export interface SubAgent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface McpServer {
  name: string;
  running: boolean;
  pid: number | null;
  error: string | null;
}

export interface FixPlan {
  id: string;
  issue_id: string;
  steps: string;
  estimated_tokens: number;
  estimated_cost: number;
  risk_level: string;
  requires_approval: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AgentSession {
  id: string;
  issueUrl: string;
  issueId: string;
  state: string;
  progress: number;
  currentStep: number;
  totalSteps: number;
  plan?: any;
  logs: AgentLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  details?: any;
}

export interface PermissionRequest {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: any;
  sessionId: string;
  timestamp: number;
}
