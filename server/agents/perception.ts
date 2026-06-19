import type { PerceptionResult, AgentSession, AgentLog } from './types.js';
import { complete, hasLlmConfig } from '../llm/client.js';

export async function perceiveIssue(
  session: AgentSession,
  addLog: (log: AgentLog) => void
): Promise<PerceptionResult> {
  addLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    stage: 'perception',
    message: `开始感知分析: ${session.issueUrl}`,
  });

  const issueData = await fetchGitHubIssue(session.issueUrl);
  addLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    stage: 'perception',
    message: `获取 Issue #${issueData.number}: ${issueData.title.slice(0, 60)}`,
  });

  if (!hasLlmConfig()) {
    addLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage: 'perception',
      message: '未配置 LLM，使用规则分析（请在设置中配置模型）',
    });
    return ruleBasedAnalysis(issueData);
  }

  const systemPrompt = `你是一个专业的软件缺陷分析专家。分析 GitHub Issue，提取以下结构化信息：
1. rootCause — 根本原因（具体、可操作的描述）
2. affectedModules — 受影响的代码模块列表
3. severity — 严重程度：low / medium / high / critical
4. title / description — 精炼后的标题和描述
5. relatedIssues — 可能相关的其他 Issue 编号列表
6. projectContext — 项目技术栈和上下文信息
7. wikiInsights — 相关技术洞察
8. ruleMatches — 匹配的编码规则或最佳实践

严格以 JSON 格式输出，不要包含任何 markdown 代码块或其他文本。`;

  const userPrompt = `分析以下 GitHub Issue：
URL: ${session.issueUrl}
Title: ${issueData.title}
Body:\n${issueData.body.slice(0, 8000)}`;

  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.2 });
    const parsed = JSON.parse(response);

    addLog({
      timestamp: new Date().toISOString(),
      level: 'success',
      stage: 'perception',
      message: `LLM 分析完成: ${(parsed.rootCause || '').slice(0, 80)}`,
      details: { affectedModules: parsed.affectedModules, severity: parsed.severity },
    });

    return {
      issueId: String(issueData.number),
      title: parsed.title || issueData.title,
      description: parsed.description || issueData.body,
      rootCause: parsed.rootCause || '未确定根因',
      affectedModules: Array.isArray(parsed.affectedModules) ? parsed.affectedModules : [],
      severity: ['low', 'medium', 'high', 'critical'].includes(parsed.severity) ? parsed.severity : 'medium',
      relatedIssues: Array.isArray(parsed.relatedIssues) ? parsed.relatedIssues : [],
      projectContext: parsed.projectContext || '',
      wikiInsights: Array.isArray(parsed.wikiInsights) ? parsed.wikiInsights : [],
      ruleMatches: Array.isArray(parsed.ruleMatches) ? parsed.ruleMatches : [],
    };
  } catch (error: any) {
    addLog({
      timestamp: new Date().toISOString(),
      level: 'warn',
      stage: 'perception',
      message: `LLM 分析失败，回退到规则分析: ${error.message}`,
    });
    return ruleBasedAnalysis(issueData);
  }
}

async function fetchGitHubIssue(url: string): Promise<{ number: number; title: string; body: string; html_url: string }> {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
  if (!match) throw new Error(`无法解析 GitHub Issue URL: ${url}`);
  const [, owner, repo, issueNumber] = match;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'MetaFix-Orchestrator/1.0.0',
  };
  if (token) headers['Authorization'] = `token ${token}`;

  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    if (response.status === 404) throw new Error(`Issue 不存在或仓库为私有（需要 GITHUB_TOKEN）: ${url}`);
    if (response.status === 403) throw new Error('GitHub API 速率限制，请设置 GITHUB_TOKEN');
    throw new Error(`GitHub API 错误: ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as any;
  return { number: data.number, title: data.title || 'Unknown', body: data.body || '', html_url: data.html_url || url };
}

function ruleBasedAnalysis(issueData: { number: number; title: string; body: string }): PerceptionResult {
  const text = (issueData.title + ' ' + issueData.body).toLowerCase();
  const keywords: Record<string, string> = {
    nan: '数值计算中出现 NaN，可能是浮点精度或除零问题',
    overflow: '数值溢出，可能是累加器精度不足或缓冲区过小',
    null: '空指针未检查',
    nullptr: '空指针未检查',
    crash: '内存访问异常或空指针解引用',
    segfault: '段错误，内存访问越界或空指针',
    leak: '内存泄漏，对象未正确释放',
    deadlock: '并发锁竞争导致死锁',
    hang: '无限循环或阻塞等待',
    slow: '性能瓶颈或算法复杂度问题',
  };
  let rootCause = '需要深入代码分析以确定根因';
  for (const [kw, cause] of Object.entries(keywords)) {
    if (text.includes(kw)) { rootCause = cause; break; }
  }
  const modules: string[] = [];
  const modulePatterns = ['flash_attention', 'attention', 'decoder', 'encoder', 'scheduler', 'memory', 'kernel', 'optimizer', 'gradient', 'loss'];
  for (const mod of modulePatterns) { if (text.includes(mod)) modules.push(mod); }
  if (modules.length === 0) modules.push('core');

  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (text.includes('crash') || text.includes('segfault') || text.includes('security') || text.includes('cve')) severity = 'critical';
  else if (text.includes('nan') || text.includes('overflow') || text.includes('leak') || text.includes('deadlock') || text.includes('hang')) severity = 'high';
  else if (text.includes('error') || text.includes('fail') || text.includes('broken') || text.includes('bug')) severity = 'medium';

  return {
    issueId: String(issueData.number),
    title: issueData.title,
    description: issueData.body,
    rootCause,
    affectedModules: modules,
    severity,
    relatedIssues: [],
    projectContext: '',
    wikiInsights: [],
    ruleMatches: [],
  };
}
