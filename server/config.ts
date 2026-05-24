import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从环境变量读取配置，提供默认值
export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  // 数据库配置
  databasePath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'chat.db'),
  vectorDbPath: process.env.VECTOR_DB_PATH || path.join(__dirname, '..', 'data', 'vectors.db'),

  // CodeBuddy API 配置
  codebuddyApiKey: process.env.CODEBUDDY_API_KEY || '',
  codebuddyBaseUrl: process.env.CODEBUDDY_BASE_URL || 'https://api.codebuddy.cn',

  // GitHub 配置
  githubToken: process.env.GITHUB_TOKEN || '',
  githubOwner: process.env.GITHUB_OWNER || 'libra-sys',
  githubRepo: process.env.GITHUB_REPO || 'MetaFix-Orchestrator',

  // 技能配置
  skillRegistryUrl: process.env.SKILL_REGISTRY_URL || 'https://api.codebuddy.cn/skills',
  skillCacheDir: process.env.SKILL_CACHE_DIR || path.join(__dirname, '..', 'data', 'skills'),

  // 成本控制
  maxTokensPerSession: parseInt(process.env.MAX_TOKENS_PER_SESSION || '100000'),
  maxCostPerSession: parseFloat(process.env.MAX_COST_PER_SESSION || '1.00'),

  // 日志配置
  logLevel: process.env.LOG_LEVEL || 'info',
  logDir: process.env.LOG_DIR || path.join(__dirname, '..', 'data', 'logs'),

  // MCP 配置
  mcpFilesystemEnabled: process.env.MCP_FILESYSTEM_ENABLED === 'true',
  mcpGitEnabled: process.env.MCP_GIT_ENABLED === 'true',
  mcpGithubEnabled: process.env.MCP_GITHUB_ENABLED === 'true',
  mcpLoggingEnabled: process.env.MCP_LOGGING_ENABLED === 'true',

  // Agent 配置
  agentMaxTurns: parseInt(process.env.AGENT_MAX_TURNS || '30'),
  agentDefaultModel: process.env.AGENT_DEFAULT_MODEL || 'claude-sonnet-4',
  agentReflectionEnabled: process.env.AGENT_REFLECTION_ENABLED !== 'false',
};

export default config;
