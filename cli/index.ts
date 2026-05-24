#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建主命令
const program = new Command();

program
  .name('metafix')
  .description('MetaFix Orchestrator - 自主决策型 AI Agent 企业级智能缺陷修复系统')
  .version('1.0.0');

// ============= 命令注册 =============

// /fix 命令：修复 Issue
program
  .command('fix <issueUrl>')
  .description('修复指定的 Issue（支持 GitHub Issue URL 或 Issue 编号）')
  .option('-m, --model <model>', '使用的 AI 模型', 'claude-sonnet-4')
  .option('-y, --yes', '自动确认所有提示')
  .action(async (issueUrl: string, options: any) => {
    const { fixCommand } = await import('./commands/fix.js');
    await fixCommand(issueUrl, options);
  });

// /analyze 命令：分析 Issue
program
  .command('analyze <issueUrl>')
  .description('分析指定的 Issue，输出根因和修复建议')
  .option('-m, --model <model>', '使用的 AI 模型', 'claude-sonnet-4')
  .action(async (issueUrl: string, options: any) => {
    const { analyzeCommand } = await import('./commands/analyze.js');
    await analyzeCommand(issueUrl, options);
  });

// /history 命令：查看修复历史
program
  .command('history')
  .description('查看修复历史记录')
  .option('-n, --limit <number>', '显示条数', '10')
  .option('-s, --status <status>', '按状态过滤')
  .action(async (options: any) => {
    const { historyCommand } = await import('./commands/history.js');
    await historyCommand(options);
  });

// /skills 命令：管理技能
program
  .command('skills')
  .description('查看和管理技能库')
  .option('-a, --add <name>', '添加新技能')
  .option('-r, --remove <name>', '删除技能')
  .option('-l, --list', '列出所有技能')
  .action(async (options: any) => {
    const { skillsCommand } = await import('./commands/skills.js');
    await skillsCommand(options);
  });

// /config 命令：配置管理
program
  .command('config')
  .description('查看或更新配置')
  .option('-s, --set <key=value>', '设置配置项')
  .option('-g, --get [key]', '获取配置项')
  .option('-l, --list', '列出所有配置')
  .action(async (options: any) => {
    const { configCommand } = await import('./commands/config.js');
    await configCommand(options);
  });

// 默认命令：显示帮助
program
  .action(() => {
    program.outputHelp();
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有提供任何命令，显示帮助
if (process.argv.length <= 2) {
  program.outputHelp();
}
