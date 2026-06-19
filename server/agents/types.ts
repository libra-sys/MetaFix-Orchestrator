export type AgentState = 'idle' | 'perceiving' | 'planning' | 'awaiting_approval' | 'executing' | 'reflecting' | 'completed' | 'error' | 'cancelled';

export interface AgentSession {
  id: string;
  issueUrl: string;
  issueId: string;
  state: AgentState;
  progress: number;
  currentStep: number;
  totalSteps: number;
  plan?: FixPlan;
  logs: AgentLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stage: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface FixPlan {
  id: string;
  issueId: string;
  steps: PlanStep[];
  estimatedTokens: number;
  estimatedCost: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
}

export interface PlanStep {
  id: string;
  order: number;
  description: string;
  skillName?: string;
  subAgentName?: string;
  requiredMcps: string[];
  estimatedDuration: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
}

export interface PerceptionResult {
  issueId: string;
  title: string;
  description: string;
  rootCause: string;
  affectedModules: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedIssues: string[];
  projectContext: string;
  wikiInsights: string[];
  ruleMatches: string[];
}

export interface ExecutionResult {
  stepId: string;
  success: boolean;
  output: string;
  duration: number;
  toolCalls: ToolCallRecord[];
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  duration: number;
}

export interface ReflectionResult {
  overallSuccess: boolean;
  skillPerformance: SkillPerformance[];
  lessonsLearned: string[];
  knowledgeUpdates: KnowledgeUpdate[];
  timeDeviation: number;
  unexpectedIssues: string[];
}

export interface SkillPerformance {
  skillName: string;
  success: boolean;
  duration: number;
  expectedDuration: number;
  effectiveness: number;
}

export interface KnowledgeUpdate {
  type: 'skill_rate' | 'combination' | 'rule';
  target: string;
  value: unknown;
  reason: string;
}
