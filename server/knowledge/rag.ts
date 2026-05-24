import { initVectorDb, addDocument, searchSimilar } from './vector-db.js';
import { query } from '@tencent-ai/agent-sdk';
import config from '../config.js';

/**
 * RAG（检索增强生成）模块
 * 用于从知识库检索相关信息，增强 Agent 决策
 */

interface RAGResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * 添加文档到 RAG 知识库
 * @param content - 文档内容
 * @param metadata - 元数据
 * @returns 文档 ID
 */
export async function addToKnowledgeBase(
  content: string,
  metadata?: Record<string, any>
): Promise<string> {
  const id = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[RAG] 添加文档到知识库: ${id}`);

  // 添加到向量数据库
  addDocument(id, content, metadata);

  // 生成并存储向量（简化：使用模拟向量）
  const embedding = await generateEmbedding(content);
  addEmbedding(id, content, embedding);

  console.log(`[RAG] 文档已添加: ${id}`);
  return id;
}

/**
 * 从知识库检索相关信息
 * @param queryText - 查询文本
 * @param limit - 返回结果数量
 * @returns 相关文档列表
 */
export async function retrieveFromKnowledgeBase(
  queryText: string,
  limit: number = 5
): Promise<RAGResult[]> {
  console.log(`[RAG] 检索知识库: ${queryText.slice(0, 50)}...`);

  // 生成查询向量
  const queryEmbedding = await generateEmbedding(queryText);

  // 搜索相似文档
  const results = searchSimilar(queryEmbedding, limit);

  console.log(`[RAG] 找到 ${results.length} 个相关文档`);

  return results.map(r => ({
    id: r.id,
    content: r.content,
    score: r.score,
    metadata: undefined,
  }));
}

/**
 * 使用 RAG 增强提示词
 * @param basePrompt - 基础提示词
 * @param queryText - 查询文本（用于检索）
 * @returns 增强后的提示词
 */
export async function augmentPrompt(
  basePrompt: string,
  queryText: string
): Promise<string> {
  console.log(`[RAG] 增强提示词...`);

  // 检索相关文档
  const relevantDocs = await retrieveFromKnowledgeBase(queryText, 3);

  if (relevantDocs.length === 0) {
    return basePrompt;
  }

  // 构建增强提示词
  const augmented = `
${basePrompt}

## 相关知识（从知识库检索）

${relevantDocs.map((doc, i) => `### 文档 ${i + 1} (相关度: ${(doc.score * 100).toFixed(1)}%)
${doc.content}
`).join('\n')}

请参考以上知识库内容回答问题。
`;

  console.log(`[RAG] 提示词已增强，添加了 ${relevantDocs.length} 个相关文档`);
  return augmented;
}

/**
 * 生成文本向量（简化实现）
 * 实际应调用 Embedding API
 */
async function generateEmbedding(text: string): Promise<number[]> {
  // 简化：返回随机向量
  // 实际应调用：OpenAI / CodeBuddy Embedding API
  console.log(`[RAG] 生成向量: ${text.slice(0, 30)}...`);

  try {
    // 尝试使用 CodeBuddy SDK 生成向量（如果支持）
    // 当前使用模拟实现
    return mockEmbedding(text);
  } catch (error) {
    console.error('[RAG] 生成向量失败，使用模拟向量:', error);
    return mockEmbedding(text);
  }
}

/**
 * 模拟向量生成
 */
function mockEmbedding(text: string): number[] {
  // 生成确定性的模拟向量（基于文本哈希）
  const vector = new Array(768).fill(0);
  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;

    const idx = Math.abs(hash) % 768;
    vector[idx] = (Math.sin(hash) + 1) / 2;
  }

  // 归一化
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => v / norm);
}

/**
 * 添加向量到数据库
 */
function addEmbedding(id: string, content: string, embedding: number[]): void {
  try {
    const db = initVectorDb();
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, content, embedding)
      VALUES (?, ?, ?)
    `);

    // 将向量序列化为 JSON 字符串存储
    stmt.run(id, content, JSON.stringify(embedding));
  } catch (error) {
    console.error('[RAG] 存储向量失败:', error);
  }
}

/**
 * 初始化知识库（添加默认文档）
 */
export async function initializeKnowledgeBase(): Promise<void> {
  console.log('[RAG] 初始化知识库...');

  const defaultDocs = [
    {
      content: 'C++ 空指针解引用会导致未定义行为，应使用断言或可选类型处理。',
      metadata: { type: 'best-practice', language: 'cpp' },
    },
    {
      content: 'FP16 精度有限，进行累加操作时应使用 FP32 或更高精度。',
      metadata: { type: 'best-practice', topic: 'numerical-stability' },
    },
    {
      content: 'Attention 计算应注意 Mask 处理，避免注意力分数泄漏到 Padding 位置。',
      metadata: { type: 'best-practice', topic: 'attention' },
    },
  ];

  for (const doc of defaultDocs) {
    await addToKnowledgeBase(doc.content, doc.metadata);
  }

  console.log('[RAG] 知识库初始化完成');
}

/**
 * 搜索相似文档（包装 vector-db 的搜索功能）
 */
function searchSimilar(
  queryEmbedding: number[],
  limit: number
): Array<{ id: string; content: string; score: number }> {
  try {
    const db = initVectorDb();

    // 简化：返回所有文档并计算模拟相似度
    const stmt = db.prepare('SELECT * FROM embeddings ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(limit) as Array<{ id: string; content: string; embedding: string }>;

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      score: Math.random() * 0.5 + 0.5, // 模拟相似度分数
    }));
  } catch (error) {
    console.error('[RAG] 搜索失败:', error);
    return [];
  }
}
