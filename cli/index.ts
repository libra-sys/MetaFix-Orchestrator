#!/usr/bin/env node
import { Command } from 'commander';

const API_BASE = process.env.METAFIX_API_URL || 'http://localhost:3000/api';
const program = new Command();

program
  .name('metafix')
  .description('MetaFix Orchestrator CLI — 自主修复缺陷的 AI Agent')
  .version('1.0.0');

program
  .command('fix <issue-url>')
  .description('启动修复流程，传入 GitHub Issue URL')
  .option('-m, --model <model>', '指定模型', 'claude-sonnet-4')
  .action(async (issueUrl: string, options: { model: string }) => {
    console.log(`🚀 启动修复流程: ${issueUrl}`);
    try {
      const res = await fetch(`${API_BASE}/agent/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueUrl, model: options.model }),
      });
      const data = await res.json() as any;
      if (data.success) {
        console.log(`✅ 修复流程已启动`);
        console.log(`   Session ID: ${data.sessionId}`);
        console.log(`   State: ${data.state}`);
        // 轮询状态
        await pollSession(data.sessionId);
      } else {
        console.error(`❌ 启动失败: ${data.error}`);
        process.exit(1);
      }
    } catch (e: any) {
      console.error(`❌ 请求失败: ${e?.message}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('查看所有 Agent 修复会话状态')
  .action(async () => {
    try {
      const res = await fetch(`${API_BASE}/agent/sessions`);
      const data = await res.json() as any;
      const sessions = data.sessions || [];
      if (sessions.length === 0) {
        console.log('暂无活跃的修复会话');
        return;
      }
      console.log('\n📋 Agent 修复会话\n');
      for (const s of sessions) {
        const icon = s.state === 'completed' ? '✅' : s.state === 'error' ? '❌' : s.state === 'idle' ? '⏸️' : '🔄';
        console.log(`${icon} [${s.state.toUpperCase().padEnd(10)}] #${s.issueId} — 进度 ${s.progress}%`);
        if (s.logs?.length > 0) {
          const lastLog = s.logs[s.logs.length - 1];
          console.log(`   └─ ${lastLog.stage}: ${lastLog.message}`);
        }
      }
      console.log('');
    } catch (e: any) {
      console.error(`❌ 请求失败: ${e?.message}`);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('检查服务健康状态')
  .action(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json() as any;
      console.log(`🟢 服务状态: ${data.status}`);
      console.log(`🕐 时间: ${data.timestamp}`);
    } catch (e: any) {
      console.error(`🔴 服务不可用: ${e?.message}`);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('查看当前配置')
  .action(() => {
    console.log('\n⚙️  MetaFix Orchestrator 配置\n');
    console.log(`API 地址: ${API_BASE}`);
    console.log(`模型: claude-sonnet-4 (默认)`);
    console.log('');
  });

async function pollSession(sessionId: string) {
  let completed = false;
  while (!completed) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const res = await fetch(`${API_BASE}/agent/sessions/${sessionId}`);
      const data = await res.json() as any;
      const session = data.session;
      if (!session) { console.log('❌ 会话不存在'); break; }
      // 打印新日志
      const logs = session.logs || [];
      const lastLog = logs[logs.length - 1];
      if (lastLog) {
        process.stdout.write(`\r🔄 [${session.state}] 进度 ${session.progress}% — ${lastLog.stage}: ${lastLog.message}`);
      }
      if (session.state === 'completed' || session.state === 'error') {
        completed = true;
        console.log('');
        if (session.state === 'completed') console.log('✅ 修复流程已完成');
        else console.log('❌ 修复流程出错');
      }
    } catch { /* ignore polling errors */ }
  }
}

program.parse();
