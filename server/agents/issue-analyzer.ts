import { complete } from '../llm/client.js';
import { readFileSafe, searchInFiles } from '../utils/file-utils.js';
import fs from 'fs';
import path from 'path';

export interface IssueAnalysis {
  issueId: string;
  title: string;
  rootCause: string;
  affectedFiles: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedFix: string;
  relatedCode: string[];
}

export async function analyzeIssue(
  issueUrl: string,
  issueTitle: string,
  issueBody: string,
  projectCwd: string
): Promise<IssueAnalysis> {
  // 1. 获取项目结构
  const projectFiles = getProjectFiles(projectCwd);

  // 2. 搜索相关代码
  const keywords = extractKeywords(issueTitle + ' ' + issueBody);
  const relatedFiles = searchInFiles(projectCwd, keywords[0] || '', ['.ts', '.tsx', '.js', '.py', '.cpp', '.c', '.h', '.java', '.go']);

  // 3. 读取关键文件内容
  const fileContents = relatedFiles.slice(0, 5).map(f => `=== ${f} ===\n${readFileSafe(f, 2000)}`).join('\n\n');

  // 4. LLM 深度分析
  const systemPrompt = `你是一个专业的软件缺陷根因分析专家。根据 Issue 描述和项目代码，提供深度分析。
输出严格 JSON：
{
  "rootCause": "根本原因",
  "affectedFiles": ["文件路径"],
  "severity": "low|medium|high|critical",
  "suggestedFix": "建议修复方案",
  "relatedCode": ["相关代码片段"]
}`;

  const userPrompt = `Issue: ${issueTitle}\n描述: ${issueBody.slice(0, 3000)}\n\n项目文件结构:\n${projectFiles.slice(0, 50).join('\n')}\n\n相关代码:\n${fileContents}`;

  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.2 });
    const parsed = JSON.parse(response);
    return {
      issueId: extractIssueId(issueUrl),
      title: issueTitle,
      rootCause: parsed.rootCause || '未确定',
      affectedFiles: Array.isArray(parsed.affectedFiles) ? parsed.affectedFiles : [],
      severity: ['low', 'medium', 'high', 'critical'].includes(parsed.severity) ? parsed.severity : 'medium',
      suggestedFix: parsed.suggestedFix || '',
      relatedCode: Array.isArray(parsed.relatedCode) ? parsed.relatedCode : [],
    };
  } catch (e: any) {
    return {
      issueId: extractIssueId(issueUrl),
      title: issueTitle,
      rootCause: '分析失败: ' + e.message,
      affectedFiles: relatedFiles.slice(0, 5),
      severity: 'medium',
      suggestedFix: '',
      relatedCode: [],
    };
  }
}

function getProjectFiles(cwd: string): string[] {
  try {
    return fs.readdirSync(cwd, { recursive: true })
      .filter((f: any) => typeof f === 'string')
      .map((f: string) => f.replace(/\\/g, '/'));
  } catch {
    return [];
  }
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9_]+/g) || [];
  const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'her', 'way', 'many', 'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any', 'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she', 'try', 'way', 'own', 'say', 'too', 'old', 'tell', 'very', 'when', 'much', 'would', 'there', 'their', 'what', 'said', 'each', 'which', 'will', 'about', 'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where', 'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'under', 'while', 'this', 'that', 'with', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'than', 'them', 'well', 'were']);
  return [...new Set(words.filter(w => w.length > 3 && !stopWords.has(w)))];
}

function extractIssueId(url: string): string {
  const match = url.match(/\/issues\/(\d+)/);
  return match ? match[1] : 'unknown';
}
