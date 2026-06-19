import { complete } from '../../llm/client.js';
import { writeFileSafe, readFileSafe } from '../../utils/file-utils.js';
import fs from 'fs';
import path from 'path';

export interface WriterInput {
  topic: string;
  outline?: string[];
  references?: string[];
  outputPath?: string;
  format?: 'markdown' | 'html' | 'plain';
}

export interface WriterResult {
  success: boolean;
  content?: string;
  outputPath?: string;
  citations?: string[];
  error?: string;
}

export async function execute(input: WriterInput): Promise<WriterResult> {
  const format = input.format || 'markdown';
  const outputPath = input.outputPath || path.join(process.cwd(), 'output', `${sanitizeFilename(input.topic)}.md`);

  // 1. 研究阶段
  const researchPrompt = `研究主题: ${input.topic}\n请提供 5-10 个关键要点和相关引用。输出 JSON：{"points": ["要点1"], "citations": ["来源1"]}`;
  let citations: string[] = input.references || [];
  let researchPoints: string[] = [];

  try {
    const researchResult = await complete({ system: '你是一个研究助手。', user: researchPrompt, jsonMode: true, temperature: 0.3 });
    const parsed = JSON.parse(researchResult);
    researchPoints = Array.isArray(parsed.points) ? parsed.points : [];
    if (Array.isArray(parsed.citations)) citations.push(...parsed.citations);
  } catch { /* ignore research failure */ }

  // 2. 写作阶段
  const outline = input.outline && input.outline.length > 0 ? input.outline.join('\n') : researchPoints.join('\n');
  const writePrompt = `根据以下大纲和要点，撰写一篇关于 "${input.topic}" 的完整文章。
大纲:
${outline}

引用:
${citations.join('\n')}

请生成 ${format === 'html' ? 'HTML' : format === 'markdown' ? 'Markdown' : '纯文本'} 格式的文章。`;

  let content = '';
  try {
    content = await complete({ system: '你是一个专业的技术写作专家。', user: writePrompt, temperature: 0.4 });
  } catch (e: any) {
    return { success: false, error: `写作失败: ${e?.message}` };
  }

  // 3. 保存
  writeFileSafe(outputPath, content);

  return {
    success: true,
    content,
    outputPath,
    citations: citations.filter((c, i) => citations.indexOf(c) === i),
  };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').slice(0, 50);
}
