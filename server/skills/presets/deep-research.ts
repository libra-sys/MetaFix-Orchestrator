import { complete } from '../../llm/client.js';

export interface ResearchInput {
  topic: string;
  sources?: string[];
  depth?: 'shallow' | 'medium' | 'deep';
}

export interface ResearchResult {
  success: boolean;
  summary: string;
  keyFindings: string[];
  sources: string[];
  citations: string[];
}

export async function execute(input: ResearchInput): Promise<ResearchResult> {
  const depth = input.depth || 'medium';
  const maxIterations = depth === 'deep' ? 5 : depth === 'medium' ? 3 : 1;

  const findings: string[] = [];
  const sources: string[] = input.sources || [];

  for (let i = 0; i < maxIterations; i++) {
    const systemPrompt = `你是一个深度研究助手。对给定主题进行系统性研究，提取关键发现。
输出严格 JSON：{"findings": ["发现1", "发现2"], "followUpQuestions": ["后续问题1"], "sources": ["来源1"]}`;
    const userPrompt = `主题: ${input.topic}\n迭代: ${i + 1}/${maxIterations}\n已有发现: ${findings.join('; ')}\n\n请继续研究。`;

    try {
      const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.3 });
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed.findings)) findings.push(...parsed.findings);
      if (Array.isArray(parsed.sources)) sources.push(...parsed.sources);
    } catch (e: any) {
      findings.push(`研究迭代 ${i + 1} 失败: ${e?.message}`);
    }
  }

  // 生成综合摘要
  const summaryPrompt = `综合以下研究发现，生成一份结构化的研究报告摘要。\n\n发现:\n${findings.join('\n')}`;
  let summary = '';
  try {
    summary = await complete({ system: '你是一个研究综述撰写专家。', user: summaryPrompt, temperature: 0.3 });
  } catch {
    summary = findings.join('\n');
  }

  const citations = sources.filter((s, i) => sources.indexOf(s) === i).slice(0, 10);

  return {
    success: findings.length > 0,
    summary,
    keyFindings: findings.slice(0, 20),
    sources: sources.filter((s, i) => sources.indexOf(s) === i),
    citations,
  };
}
