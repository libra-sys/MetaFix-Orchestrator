import config from '../config.js';
import * as db from '../db.js';
import { query } from '@tencent-ai/agent-sdk';

/**
 * 感知模块：分析 Issue、理解项目结构
 * @param session - Agent 会话
 * @returns 感知结果
 */
export async function perceive(session: any): Promise<{
  issueId: string;
  issueTitle: string;
  issueDescription: string;
  rootCause: string;
  relevantFiles: string[];
  similarIssues: any[];
  projectWiki: string;
  rules: string;
}> {
  const { issueUrl, issueId } = session;
  
  console.log(`[Perception] 开始分析 Issue: ${issueId}`);
  console.log(`[Perception] Issue URL: ${issueUrl}`);
  
  // 1. 获取 Issue 详情（模拟，实际应调用 GitHub API）
  const issueDetails = await fetchIssueDetails(issueUrl);
  
  // 2. 加载项目 Wiki 和规则
  const projectWiki = loadProjectWiki();
  const rules = loadProjectRules();
  
  // 3. 使用 CodeBuddy SDK 分析代码，定位根因
  console.log(`[Perception] 调用 CodeBuddy 分析代码...`);
  const rootCause = await analyzeWithCodeBuddy(issueDetails.description, projectWiki);
  
  // 4. 检索相似历史 Issue
  const similarIssues = findSimilarIssues(issueId);
  
  // 5. 确定相关文件
  const relevantFiles = extractRelevantFiles(rootCause, issueDetails.description);
  
  console.log(`[Perception] 分析完成:`);
  console.log(`[Perception] - 根因: ${rootCause.slice(0, 100)}...`);
  console.log(`[Perception] - 相关文件: ${relevantFiles.length} 个`);
  console.log(`[Perception] - 相似 Issue: ${similarIssues.length} 个`);
  
  return {
    issueId,
    issueTitle: issueDetails.title,
    issueDescription: issueDetails.description,
    rootCause,
    relevantFiles,
    similarIssues,
    projectWiki,
    rules,
  };
}

/**
 * 获取 Issue 详情（模拟实现，实际应调用 GitHub API）
 */
async function fetchIssueDetails(issueUrl: string): Promise<{ title: string; description: string }> {
  // 模拟 Issue 数据
  return {
    title: `Issue #${extractIssueId(issueUrl)}`,
    description: `模拟 Issue 描述：运行 long sequence 时随机 NaN。\n\n可能影响文件：flash_attention.cpp, attn_bias.cpp`,
  };
}

/**
 * 加载项目 Wiki
 */
function loadProjectWiki(): string {
  // 实际应从 .meta-fix/wiki/ 读取
  return `项目 Wiki：\n- 项目使用 Ascend CANN 后端\n- 主要语言：C++, Python\n- 构建系统：CMake`;
}

/**
 * 加载项目规则
 */
function loadProjectRules(): string {
  // 实际应从 .meta-fix/rules/ 读取
  return `项目规则：\n- 编码规范：Google C++ Style\n- 安全策略：禁止直接使用原始指针\n- 模块偏好：优先使用 ATen 算子`;
}

/**
 * 使用 CodeBuddy SDK 分析代码，定位根因
 */
async function analyzeWithCodeBuddy(issueDescription: string, projectWiki: string): Promise<string> {
  try {
    const prompt = `
你是一个代码分析专家。请根据以下信息，定位问题的根因。

## Issue 描述
${issueDescription}

## 项目 Wiki
${projectWiki}

请分析可能的原因，重点关注：
1. 数值稳定性问题（FP16 溢出等）
2. 内存访问问题（空指针、越界等）
3. 算法逻辑错误

输出格式：
- 根因：<详细描述>
- 可能文件：<文件列表>
- 建议修复方向：<方向描述>
`;
    
    let result = '';
    const stream = query({
      prompt,
      options: {
        model: config.agentDefaultModel,
        maxTurns: 5,
        systemPrompt: '你是一个专业的 C++ 和 Python 代码分析专家。',
      },
    });
    
    for await (const msg of stream) {
      if (msg.type === 'assistant') {
        const content = msg.message.content;
        if (typeof content === 'string') {
          result += content;
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              result += block.text;
            }
          }
        }
      }
    }
    
    return result || '未能定位根因';
  } catch (error: any) {
    console.error('[Perception] CodeBuddy 分析失败:', error);
    return '分析失败：' + (error?.message || String(error));
  }
}

/**
 * 查找相似历史 Issue
 */
function findSimilarIssues(currentIssueId: string): any[] {
  // 实际应从向量库检索
  return [
    { id: 'similar-1', title: '类似问题：FP16 溢出', successRate: 0.92 },
    { id: 'similar-2', title: '类似问题：注意力计算 NaN', successRate: 0.88 },
  ];
}

/**
 * 提取相关文件
 */
function extractRelevantFiles(rootCause: string, description: string): string[] {
  // 简单提取：从根因分析和描述中提取文件名
  const filePattern = /[\w\-]+\.(cpp|h|py|cc)/g;
  const files = new Set<string>();
  
  const rootMatches = rootCause.match(filePattern);
  const descMatches = description.match(filePattern);
  
  if (rootMatches) rootMatches.forEach(f => files.add(f));
  if (descMatches) descMatches.forEach(f => files.add(f));
  
  // 默认文件
  if (files.size === 0) {
    files.add('flash_attention.cpp');
  }
  
  return Array.from(files);
}

/**
 * 从 URL 提取 Issue ID
 */
function extractIssueId(issueUrl: string): string {
  const match = issueUrl.match(/\/issues\/(\d+)/);
  return match ? match[1] : 'unknown';
}
