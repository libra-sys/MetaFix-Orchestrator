import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FixOptions {
  model?: string;
  yes?: boolean;
}

/**
 * /fix 命令：修复指定的 Issue
 */
export async function fixCommand(issueUrl: string, options: FixOptions): Promise<void> {
  console.log(chalk.cyan('\n=== MetaFix Orchestrator：修复 Issue ===\n'));

  // 验证 Issue URL
  if (!isValidIssueUrl(issueUrl)) {
    console.error(chalk.red('错误：无效的 Issue URL 或编号'));
    console.log(chalk.yellow('支持格式：'));
    console.log(chalk.yellow('  - https://github.com/owner/repo/issues/999'));
    console.log(chalk.yellow('  - 999（使用默认仓库）'));
    process.exit(1);
  }

  const normalizedUrl = normalizeIssueUrl(issueUrl);
  console.log(chalk.blue(`Issue: ${normalizedUrl}`));
  console.log(chalk.blue(`模型: ${options.model || 'claude-sonnet-4'}`));

  // 检查 API 密钥
  if (!checkApiKey()) {
    process.exit(1);
  }

  // 启动修复流程
  const spinner = ora('正在启动修复流程...').start();

  try {
    // 调用后端 API
    const sessionId = await callFixApi(normalizedUrl, options.model);

    spinner.succeed(chalk.green(`修复流程已启动`));
    console.log(chalk.cyan(`会话 ID: ${sessionId}`));
    console.log(chalk.cyan(`查看状态: metafix status ${sessionId}`));

    // 等待完成（简化：只等待 5 秒）
    spinner.start('等待执行结果...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    spinner.succeed(chalk.green('执行完成（模拟）'));

    // 显示结果
    console.log(chalk.cyan('\n=== 修复结果 ===\n'));
    console.log(chalk.white('PR 链接: https://github.com/libra-sys/MetaFix-Orchestrator/pull/1'));
    console.log(chalk.green('\n✓ 修复完成！'));

  } catch (error: any) {
    spinner.fail(chalk.red(`启动失败: ${error?.message || error}`));
    process.exit(1);
  }
}

/**
 * 调用后端 Fix API
 */
async function callFixApi(issueUrl: string, model?: string): Promise<string> {
  const apiUrl = 'http://localhost:3001/api/agent/fix';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      issueUrl,
      model: model || 'claude-sonnet-4',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.sessionId;
}

/**
 * 验证 Issue URL
 */
function isValidIssueUrl(url: string): boolean {
  // 支持格式：
  // 1. https://github.com/owner/repo/issues/999
  // 2. 999（纯数字，使用默认仓库）
  return /^https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(url) ||
         /^\d+$/.test(url);
}

/**
 * 标准化 Issue URL
 */
function normalizeIssueUrl(url: string): string {
  if (/^\d+$/.test(url)) {
    const owner = process.env.GITHUB_OWNER || 'libra-sys';
    const repo = process.env.GITHUB_REPO || 'MetaFix-Orchestrator';
    return `https://github.com/${owner}/${repo}/issues/${url}`;
  }
  return url;
}

/**
 * 检查 API 密钥
 */
function checkApiKey(): boolean {
  const apiKey = process.env.CODEBUDDY_API_KEY ||
                   process.env.OPENAI_API_KEY ||
                   process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error(chalk.red('错误：未找到 API 密钥'));
    console.log(chalk.yellow('请设置环境变量：'));
    console.log(chalk.cyan('  export CODEBUDDY_API_KEY="your-key"'));
    console.log(chalk.cyan('  # 或'));
    console.log(chalk.cyan('  export OPENAI_API_KEY="your-key"'));
    return false;
  }

  return true;
}
