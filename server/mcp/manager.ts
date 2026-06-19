import path from 'path';
import { fileURLToPath } from 'url';
import { McpStdioClient } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

const presetConfigs: McpServerConfig[] = [
  {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', path.join(__dirname, '..', '..')],
  },
  {
    name: 'git',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
  },
  {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
  {
    name: 'logging',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
  },
];

const clients = new Map<string, McpStdioClient>();
const configs = new Map<string, McpServerConfig>();
for (const c of presetConfigs) configs.set(c.name, c);

export function getMcpServerStatuses(): Array<{ name: string; running: boolean; pid: number | null; error: string | null; toolCount: number }> {
  return presetConfigs.map(c => {
    const client = clients.get(c.name);
    return {
      name: c.name,
      running: !!client && client.isRunning(),
      pid: null,
      error: null,
      toolCount: client?.getCachedTools().length || 0,
    };
  });
}

export async function startMcpServer(name: string): Promise<{ name: string; running: boolean; error?: string; tools?: any[] }> {
  const config = configs.get(name);
  if (!config) return { name, running: false, error: `未知服务器: ${name}` };

  const existing = clients.get(name);
  if (existing) { existing.close(); clients.delete(name); }

  try {
    const client = new McpStdioClient(config.command, config.args, config.env);
    await client.initialize();
    const tools = await client.listTools();
    clients.set(name, client);
    console.log(`[MCP] ${name} started with ${tools.length} tools`);
    return { name, running: true, tools };
  } catch (error: any) {
    console.error(`[MCP] Failed to start ${name}:`, error.message);
    return { name, running: false, error: error?.message || String(error) };
  }
}

export function stopMcpServer(name: string): boolean {
  const client = clients.get(name);
  if (!client) return false;
  client.close();
  clients.delete(name);
  console.log(`[MCP] ${name} stopped`);
  return true;
}

export function getMcpClient(name: string): McpStdioClient | undefined {
  return clients.get(name);
}

export async function callMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<any> {
  let client = clients.get(serverName);
  if (!client || !client.isRunning()) {
    const result = await startMcpServer(serverName);
    if (!result.running) throw new Error(`无法启动 MCP 服务器 ${serverName}: ${result.error}`);
    client = clients.get(serverName)!;
  }
  return client.callTool(toolName, args);
}

export async function getAllAvailableTools(): Promise<Array<{ server: string; tool: any }>> {
  const all: Array<{ server: string; tool: any }> = [];
  for (const [name, client] of clients) {
    for (const tool of client.getCachedTools()) all.push({ server: name, tool });
  }
  return all;
}
