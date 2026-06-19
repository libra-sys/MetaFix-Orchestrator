import { searchChunks, addChunk, getChunksBySource, deleteChunksBySource } from './vector-db.js';
import type { KnowledgeChunk } from './vector-db.js';
import { complete } from '../llm/client.js';

export async function ingestDocument(source: string, content: string, metadata: Record<string, unknown> = {}): Promise<void> {
  // 将长文档分块
  const chunks = chunkText(content, 1000, 200);
  deleteChunksBySource('document', source);
  for (let i = 0; i < chunks.length; i++) {
    addChunk({
      id: `doc-${source}-${i}`,
      content: chunks[i],
      source,
      source_type: 'document',
      metadata: { ...metadata, chunkIndex: i, totalChunks: chunks.length },
      created_at: new Date().toISOString(),
    });
  }
}

export async function ingestWiki(wikiPath: string, content: string): Promise<void> {
  deleteChunksBySource('wiki', wikiPath);
  const chunks = chunkText(content, 1500, 300);
  for (let i = 0; i < chunks.length; i++) {
    addChunk({
      id: `wiki-${wikiPath}-${i}`,
      content: chunks[i],
      source: wikiPath,
      source_type: 'wiki',
      metadata: { chunkIndex: i },
      created_at: new Date().toISOString(),
    });
  }
}

export async function ingestRules(rules: string): Promise<void> {
  deleteChunksBySource('rules', 'project-rules');
  addChunk({
    id: 'rules-project',
    content: rules,
    source: 'project-rules',
    source_type: 'rules',
    metadata: {},
    created_at: new Date().toISOString(),
  });
}

export async function queryRag(question: string, contextLimit = 2000): Promise<{ answer: string; sources: string[] }> {
  // 1. 检索相关 chunks
  const chunks = searchChunks(question, 10);

  // 2. 去重并按相关性排序（简单策略：包含更多关键词的排前面）
  const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = chunks.map(c => ({
    chunk: c,
    score: keywords.filter(kw => c.content.toLowerCase().includes(kw)).length,
  })).sort((a, b) => b.score - a.score);

  const context = scored.slice(0, 5).map(s => s.chunk.content).join('\n---\n').slice(0, contextLimit);
  const sources = [...new Set(scored.slice(0, 5).map(s => s.chunk.source))];

  if (!context.trim()) {
    return { answer: '未找到相关知识库内容。', sources: [] };
  }

  // 3. 用 LLM 生成回答
  const systemPrompt = '你是一个知识库问答助手。根据提供的上下文，准确回答用户问题。如果上下文不足以回答，请明确说明。';
  const userPrompt = `上下文:\n${context}\n\n问题: ${question}\n\n请基于上下文回答。`;

  try {
    const answer = await complete({ system: systemPrompt, user: userPrompt, temperature: 0.2 });
    return { answer, sources };
  } catch (e: any) {
    return { answer: `检索失败: ${e?.message}`, sources: [] };
  }
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= end) start = end;
  }
  return chunks;
}

export { searchChunks, getChunksBySource };
