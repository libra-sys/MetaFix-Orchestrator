import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AnalyzeOptions {
  model?: string;
}

/**
 * /analyze 命令：分析指定的 Issue
 */
export async function analyzeCommand(
  issueUrl: string,
  options: AnalyzeOptions
): Promise<void> {
  console.log(chalk.cyan('\n=== MetaFix Orchestrator：分析 Issue ===\n'));

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

  // 启动分析流程
  const spinner = ora('正在分析 Issue...').start();

  try {
    // 调用后端 API
    const result = await callAnalyzeApi(normalizedUrl, options.model);

    spinner.succeed(chalk.green('分析完成'));

    // 显示结果
    console.log(chalk.cyan('\n=== 分析结果 ===\n'));
    console.log(chalk.white(`根因：${result.rootCause || '未能定位'}`));
    console.log(chalk.white(`相关文件：${(result.relevantFiles || []).join(', ') || '无'}`));
    console.log(chalk.white(`建议技能：${(result.suggestedSkills || []).join(', ') || '无'}`));

    // 保存到文件
    const outputPath = path.join(process.cwd(), `analysis-${Date.now()}.md`);
    const output = [
      `# Issue 分析`,
      ``,
      `## Issue`,
      `- URL: ${normalizedUrl}`,
      ``,
      `## 根因`,
      result.rootCause || '未能定位',
      ``,
      `## 相关文件`,
      ...(result.relevantFiles || []).map((f: string) => `- ${f}`),
      ``,
      `## 建议技能`,
      ...(result.suggestedSkills || []).map((s: string) => `- ${s}`),
    ].join('\n');

    fs.writeFileSync(outputPath, output);
    console.log(chalk.green(`\n✓ 分析已保存到：${outputPath}`));

  } catch (error: any) {
    spinner.fail(chalk.red(`分析失败：${error?.message || error}`));
    process.exit(1);
  }
}

/**
 * 调用后端 Analyze API
 */
async function callAnalyzeApi(issueUrl: string, model?: string): Promise<{
  rootCause: string;
  relevantFiles: string[];
  suggestedSkills: string[];
}> {
  const apiUrl = 'http://localhost:3001/api/agent/analyze';

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

  return await response.json();
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
