import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const VECTOR_DB_PATH = process.env.VECTOR_DB_PATH || path.join(process.cwd(), 'data', 'vectors.db');
const vectorDir = path.dirname(VECTOR_DB_PATH);
if (!fs.existsSync(vectorDir)) fs.mkdirSync(vectorDir, { recursive: true });

const vdb = new Database(VECTOR_DB_PATH) as any;

// 使用 sqlite-vec 扩展
let vecLoaded = false;
try {
  vdb.loadExtension('sqlite_vec');
  vecLoaded = true;
} catch {
  try {
    // 尝试常见路径
    const possiblePaths = [
      'sqlite_vec',
      './node_modules/sqlite-vec/sqlite_vec',
      path.join(process.cwd(), 'node_modules/sqlite-vec/sqlite_vec'),
    ];
    for (const p of possiblePaths) {
      try { vdb.loadExtension(p); vecLoaded = true; break; } catch { /* continue */ }
    }
  } catch { /* ignore */ }
}

if (!vecLoaded) {
  console.warn('[VectorDB] sqlite-vec 扩展加载失败，回退到纯文本搜索');
}

vdb.exec(`
  CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL,
    embedding TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_knowledge_source ON knowledge_chunks(source_type, source);
`);

export interface KnowledgeChunk {
  id: string;
  content: string;
  source: string;
  source_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function addChunk(chunk: KnowledgeChunk): void {
  vdb.prepare(`INSERT INTO knowledge_chunks (id, content, source, source_type, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(chunk.id, chunk.content, chunk.source, chunk.source_type, JSON.stringify(chunk.metadata), chunk.created_at);
}

export function searchChunks(query: string, limit = 5): KnowledgeChunk[] {
  // 纯文本搜索（若 sqlite-vec 不可用则以此为 fallback）
  const rows = vdb.prepare(
    `SELECT * FROM knowledge_chunks WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?`
  ).all(`%${query}%`, limit) as any[];
  return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

export function getChunksBySource(sourceType: string, source?: string): KnowledgeChunk[] {
  if (source) {
    const rows = vdb.prepare('SELECT * FROM knowledge_chunks WHERE source_type = ? AND source = ? ORDER BY created_at DESC')
      .all(sourceType, source) as any[];
    return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }
  const rows = vdb.prepare('SELECT * FROM knowledge_chunks WHERE source_type = ? ORDER BY created_at DESC')
    .all(sourceType) as any[];
  return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}

export function deleteChunksBySource(sourceType: string, source: string): void {
  vdb.prepare('DELETE FROM knowledge_chunks WHERE source_type = ? AND source = ?').run(sourceType, source);
}

export function getAllChunks(limit = 100): KnowledgeChunk[] {
  const rows = vdb.prepare('SELECT * FROM knowledge_chunks ORDER BY created_at DESC LIMIT ?').all(limit) as any[];
  return rows.map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
}
