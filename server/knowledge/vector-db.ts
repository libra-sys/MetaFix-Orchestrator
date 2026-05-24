import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 向量数据库路径
const vectorDbPath = config.vectorDbPath;

// 数据库连接
let vectorDb: Database.Database | null = null;

/**
 * 初始化向量数据库
 */
export function initVectorDb(): Database.Database {
  if (vectorDb) return vectorDb;

  // 确保目录存在
  const dataDir = path.dirname(vectorDbPath);
  if (!require('fs').existsSync(dataDir)) {
    require('fs').mkdirSync(dataDir, { recursive: true });
  }

  vectorDb = new Database(vectorDbPath);
  vectorDb.pragma('journal_mode = WAL');

  // 创建向量表（使用 sqlite-vec 扩展，如果可用）
  try {
    vectorDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec(
        id TEXT PRIMARY KEY,
        content TEXT,
        embedding FLOAT[768]
      )
    `);
  } catch (e) {
    // 如果 vec 扩展不可用，使用普通表
    console.log('[VectorDB] vec 扩展不可用，使用普通表');
    vectorDb.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding TEXT
      )
    `);
  }

  // 创建文档表
  vectorDb.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    )
  `);

  return vectorDb;
}

/**
 * 添加文档到知识库
 */
export function addDocument(
  id: string,
  content: string,
  metadata?: Record<string, any>
): void {
  const db = initVectorDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO documents (id, content, metadata, created_at)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(
    id,
    content,
    metadata ? JSON.stringify(metadata) : null,
    new Date().toISOString()
  );

  console.log(`[VectorDB] 文档已添加: ${id}`);
}

/**
 * 添加向量到数据库
 */
export function addEmbedding(
  id: string,
  content: string,
  embedding: number[]
): void {
  const db = initVectorDb();

  try {
    // 尝试使用 vec 扩展
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, content, embedding)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, content, new Float32Array(embedding));
  } catch (e) {
    // 回退到普通表
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO embeddings (id, content, embedding)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, content, JSON.stringify(embedding));
  }

  console.log(`[VectorDB] 向量已添加: ${id}`);
}

/**
 * 搜索相似文档（简化实现）
 */
export function searchSimilar(
  queryEmbedding: number[],
  limit: number = 5
): Array<{ id: string; content: string; score: number }> {
  const db = initVectorDb();

  // 简化实现：返回所有文档（实际应使用向量相似度搜索）
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC LIMIT ?');
  const docs = stmt.all(limit) as Array<{ id: string; content: string; metadata: string }>;

  return docs.map(doc => ({
    id: doc.id,
    content: doc.content,
    score: Math.random(), // 模拟相似度分数
  }));
}

/**
 * 获取文档 by ID
 */
export function getDocument(id: string): { id: string; content: string; metadata: any } | null {
  const db = initVectorDb();
  const stmt = db.prepare('SELECT * FROM documents WHERE id = ?');
  const doc = stmt.get(id) as any;

  if (!doc) return null;

  return {
    id: doc.id,
    content: doc.content,
    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
  };
}

/**
 * 删除文档
 */
export function deleteDocument(id: string): boolean {
  const db = initVectorDb();
  const stmt = db.prepare('DELETE FROM documents WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * 获取所有文档
 */
export function getAllDocuments(): Array<{ id: string; content: string; metadata: any }> {
  const db = initVectorDb();
  const stmt = db.prepare('SELECT * FROM documents ORDER BY created_at DESC');
  const docs = stmt.all() as Array<any>;

  return docs.map(doc => ({
    id: doc.id,
    content: doc.content,
    metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
  }));
}

/**
 * 关闭数据库
 */
export function closeVectorDb(): void {
  if (vectorDb) {
    vectorDb.close();
    vectorDb = null;
  }
}
