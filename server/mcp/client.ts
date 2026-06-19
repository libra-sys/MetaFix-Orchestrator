import { spawn, ChildProcess } from 'child_process';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  method: string;
}

export class McpStdioClient {
  private proc: ChildProcess;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private initialized = false;
  private buffer = '';
  private tools: any[] = [];

  constructor(command: string, args: string[], env?: Record<string, string>) {
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    this.proc.stdout?.on('data', (data: Buffer) => this.handleData(data));
    this.proc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[MCP stderr] ${msg.slice(0, 200)}`);
    });
    this.proc.on('exit', (code) => {
      console.log(`[MCP] Process exited with code ${code}`);
      for (const [id, req] of this.pending) {
        req.reject(new Error(`MCP server exited (code ${code}) during ${req.method}`));
      }
      this.pending.clear();
    });
  }

  private handleData(data: Buffer) {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try { this.handleMessage(JSON.parse(trimmed)); } catch { /* ignore non-JSON */ }
    }
  }

  private handleMessage(msg: any) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const req = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) req.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else req.resolve(msg.result);
    }
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      if (this.proc.stdin?.writable) {
        this.proc.stdin.write(JSON.stringify(request) + '\n');
      } else {
        this.pending.delete(id);
        reject(new Error('MCP stdin not writable'));
      }
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request ${method} timeout`));
        }
      }, 30000);
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'metafix-orchestrator', version: '1.0.0' },
    });
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    this.initialized = true;
    try {
      const result = await this.sendRequest('tools/list', {});
      this.tools = result.tools || [];
    } catch { this.tools = []; }
  }

  async listTools(): Promise<any[]> {
    if (!this.initialized) await this.initialize();
    const result = await this.sendRequest('tools/list', {});
    this.tools = result.tools || [];
    return this.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.initialized) await this.initialize();
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  async listResources(): Promise<any[]> {
    if (!this.initialized) await this.initialize();
    const result = await this.sendRequest('resources/list', {});
    return result.resources || [];
  }

  async readResource(uri: string): Promise<any> {
    if (!this.initialized) await this.initialize();
    return this.sendRequest('resources/read', { uri });
  }

  getCachedTools(): any[] { return this.tools; }
  isRunning(): boolean { return !this.proc.killed && this.proc.pid !== undefined; }

  close(): void {
    this.proc.stdin?.end();
    this.proc.kill('SIGTERM');
    setTimeout(() => { if (!this.proc.killed) this.proc.kill('SIGKILL'); }, 5000);
  }
}
