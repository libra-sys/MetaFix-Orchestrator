import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HistoryOptions {
  limit?: string;
  status?: string;
}

interface FixHistoryItem {
  id: string;
  issueId: string;
  issueUrl: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * /history 命令：查看修复历史
 */
export async function historyCommand(options: HistoryOptions): Promise<void> {
  console.log(chalk.cyan('\n=== MetaFix Orchestrator：修复历史 ===\n'));

  const limit = parseInt(options.limit || '10');
  const statusFilter = options.status;

  const spinner = ora('正在获取修复历史...').start();

  try {
    // 调用后端 API
    const result = await callHistoryApi(limit, statusFilter);

    spinner.succeed(chalk.green('获取完成'));

    // 显示结果
    displayHistory(result.history || []);

  } catch (error: any) {
    spinner.fail(chalk.red(`获取失败: ${error?.message || error}`));
    process.exit(1);
  }
}

/**
 * 调用后端 History API
 */
async function callHistoryApi(
  limit: number,
  status?: string
): Promise<{ history: FixHistoryItem[] }> {
  let apiUrl = `http://localhost:3001/api/agent/sessions?limit=${limit}`;
  if (status) {
    apiUrl += `&status=${encodeURIComponent(status)}`;
  }

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    history: data.sessions || [],
  };
}

/**
 * 显示修复历史
 */
function displayHistory(history: FixHistoryItem[]): void {
  if (history.length === 0) {
    console.log(chalk.yellow('暂无修复历史'));
    return;
  }

  console.log(chalk.cyan(`\n共 ${history.length} 条记录：\n`));

  for (let i = 0; i < history.length; i++) {
    const item = history[i];
    const statusColor =
      item.state === 'completed' ? chalk.green :
      item.state === 'error' ? chalk.red :
      item.state === 'running' ? chalk.yellow :
      chalk.white;

    console.log(chalk.white(`${i + 1}. ${item.issueId || '未知 Issue'}`));
    console.log(chalk.gray(`   URL: ${item.issueUrl || '无'}`));
    console.log(`   状态: ${statusColor(item.state)}`);
    console.log(chalk.gray(`   创建时间: ${item.createdAt || '未知'}`));
    console.log('');
  }
}

/**
 * 验证 Issue URL
 */
function isValidIssueUrl(url: string): boolean {
  // 支持格式：
  // 1. https://github.com/owner/repo/issues/999
  // 2. 999（纯数字，使用默认仓库）
  return /^https?:\/\/github\.com\/[^\/]+\/[^\/]+\/issues\/\d+$/.test(url) ||
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
