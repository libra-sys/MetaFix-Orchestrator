import { complete } from '../../llm/client.js';
import { readFileSafe, writeFileSafe } from '../../utils/file-utils.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface CodeReviewInput {
  prUrl: string;
  files: string[];
  reviewComments: string;
  cwd: string;
}

export interface CodeReviewResult {
  success: boolean;
  modifiedFiles: string[];
  summary: string;
  error?: string;
}

export async function execute(input: CodeReviewInput): Promise<CodeReviewResult> {
  const modifiedFiles: string[] = [];
  const summaries: string[] = [];

  for (const file of input.files) {
    const content = readFileSafe(path.join(input.cwd, file), 5000);
    if (content.startsWith('读取失败')) continue;

    const systemPrompt = `你是一个资深的代码审查修复专家。根据审查意见修改代码。
只输出修改后的完整文件内容，不要包含 markdown 代码块标记。`;
    const userPrompt = `文件: ${file}\n当前内容:\n${content}\n\n审查意见:\n${input.reviewComments}\n\n请修改代码以解决审查意见。`;

    try {
      const fixed = await complete({ system: systemPrompt, user: userPrompt, temperature: 0.2 });
      const cleanFixed = fixed.replace(/```[a-z]*\n?/g, '').replace(/```\n?/g, '').trim();
      writeFileSafe(path.join(input.cwd, file), cleanFixed);
      modifiedFiles.push(file);
      summaries.push(`已修改 ${file}`);
    } catch (e: any) {
      summaries.push(`修改 ${file} 失败: ${e?.message}`);
    }
  }

  if (modifiedFiles.length > 0) {
    try {
      execSync('git add -A', { encoding: 'utf-8', cwd: input.cwd });
      execSync('git commit -m "chore: address code review feedback"', { encoding: 'utf-8', cwd: input.cwd });
    } catch { /* ignore */ }
  }

  return {
    success: modifiedFiles.length > 0,
    modifiedFiles,
    summary: summaries.join('\n'),
  };
}
