/**
 * MCP 管理器：启动/停止 MCP 服务器
 */

import { spawn, ChildProcess } from 'child_process';
import config from '../config.js';

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

interface McpServerStatus {
  name: string;
  running: boolean;
  pid?: number;
  error?: string;
}

// MCP 服务器配置
const MCP_SERVERS: Record<string, McpServerConfig> = {
  filesystem: {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    enabled: config.mcpFilesystemEnabled,
  },
  git: {
    name: 'git',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    enabled: config.mcpGitEnabled,
  },
  github: {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: config.githubToken,
    },
    enabled: config.mcpGithubEnabled,
  },
  logging: {
    name: 'logging',
    command: 'node',
    args: [path.join(__dirname, 'servers', 'logging-server.js')],
    enabled: config.mcpLoggingEnabled,
  },
};

// 运行中的 MCP 进程
const runningServers = new Map<string, ChildProcess>();

/**
 * 启动所有启用的 MCP 服务器
 */
export async function startAllMcpServers(): Promise<McpServerStatus[]> {
  const results: McpServerStatus[] = [];

  for (const [name, cfg] of Object.entries(MCP_SERVERS)) {
    if (!cfg.enabled) {
      console.log(`[MCP] ${name} 已禁用，跳过`);
      results.push({ name, running: false });
      continue;
    }

    try {
      const status = await startMcpServer(name);
      results.push(status);
    } catch (error: any) {
      console.error(`[MCP] 启动 ${name} 失败:`, error);
      results.push({ name, running: false, error: error?.message || String(error) });
    }
  }

  return results;
}

/**
 * 启动单个 MCP 服务器
 */
export async function startMcpServer(name: string): Promise<McpServerStatus> {
  const cfg = MCP_SERVERS[name];
  if (!cfg) {
    throw new Error(`未知 MCP 服务器: ${name}`);
  }

  if (!cfg.enabled) {
    return { name, running: false };
  }

  // 如果已运行，先停止
  if (runningServers.has(name)) {
    console.log(`[MCP] ${name} 已在运行，重启...`);
    stopMcpServer(name);
  }

  console.log(`[MCP] 启动 ${name}...`);

  const env = {
    ...process.env,
    ...cfg.env,
  };

  const proc = spawn(cfg.command, cfg.args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  runningServers.set(name, proc);

  // 监听输出
  proc.stdout?.on('data', (data: Buffer) => {
    console.log(`[MCP:${name}] ${data.toString().trim()}`);
  });

  proc.stderr?.on('data', (data: Buffer) => {
    console.error(`[MCP:${name}] ${data.toString().trim()}`);
  });

  proc.on('error', (error) => {
    console.error(`[MCP] ${name} 错误:`, error);
    runningServers.delete(name);
  });

  proc.on('exit', (code) => {
    console.log(`[MCP] ${name} 退出，代码: ${code}`);
    runningServers.delete(name);
  });

  // 等待启动（简化：等待 2 秒）
  await new Promise(resolve => setTimeout(resolve, 2000));

  return {
    name,
    running: proc.killed !== true,
    pid: proc.pid,
  };
}

/**
 * 停止单个 MCP 服务器
 */
export function stopMcpServer(name: string): boolean {
  const proc = runningServers.get(name);
  if (!proc) {
    console.log(`[MCP] ${name} 未运行`);
    return false;
  }

  console.log(`[MCP] 停止 ${name}...`);
  proc.kill('SIGTERM');
  runningServers.delete(name);

  return true;
}

/**
 * 停止所有 MCP 服务器
 */
export function stopAllMcpServers(): void {
  console.log('[MCP] 停止所有服务器...');
  for (const name of runningServers.keys()) {
    stopMcpServer(name);
  }
}

/**
 * 获取所有 MCP 服务器状态
 */
export function getMcpServerStatuses(): McpServerStatus[] {
  return Array.from(runningServers.entries()).map(([name, proc]) => ({
    name,
    running: proc.killed !== true,
    pid: proc.pid,
  }));
}

/**
 * 检查 MCP 服务器是否可用
 */
export function isMcpServerAvailable(name: string): boolean {
  return runningServers.has(name) && runningServers.get(name)?.killed !== true;
}

// 导出配置供外部使用
export function getMcpServerConfig(name: string): McpServerConfig | null {
  return MCP_SERVERS[name] || null;
}

export function updateMcpServerConfig(name: string, updates: Partial<McpServerConfig>): void {
  if (MCP_SERVERS[name]) {
    MCP_SERVERS[name] = { ...MCP_SERVERS[name], ...updates };
    console.log(`[MCP] 配置已更新: ${name}`);
  }
}

// 进程退出时清理
process.on('exit', () => {
  stopAllMcpServers();
});

process.on('SIGINT', () => {
  stopAllMcpServers();
  process.exit(0);
});

// 导入 path（用于 logging 服务器路径）
import path from 'path';