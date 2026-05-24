import { useState, useEffect, useCallback } from 'react';

interface KnowledgeItem {
  id: string;
  content: string;
  metadata?: Record<string, any>;
  score?: number;
}

interface RAGResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

interface KnowledgeState {
  items: KnowledgeItem[];
  loading: boolean;
  error: string | null;
}

/**
 * 知识库管理 Hook
 */
export function useKnowledge() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取所有知识库条目
   */
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/knowledge');

      if (!response.ok) {
        throw new Error(`获取知识库失败: ${response.statusText}`);
      }

      const data = await response.json();
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || '获取知识库失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 添加文档到知识库
   */
  const addDocument = useCallback(async (
    content: string,
    metadata?: Record<string, any>
  ): Promise<string | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, metadata }),
      });

      if (!response.ok) {
        throw new Error(`添加文档失败: ${response.statusText}`);
      }

      const data = await response.json();
      await fetchItems(); // 刷新列表
      return data.id;
    } catch (err: any) {
      setError(err.message || '添加文档失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  /**
   * 从知识库检索相关信息（RAG）
   */
  const retrieve = useCallback(async (
    queryText: string,
    limit: number = 5
  ): Promise<RAGResult[]> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/knowledge/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText, limit }),
      });

      if (!response.ok) {
        throw new Error(`检索失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.results || [];
    } catch (err: any) {
      setError(err.message || '检索失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 删除知识库条目
   */
  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`删除失败: ${response.statusText}`);
      }

      await fetchItems(); // 刷新列表
      return true;
    } catch (err: any) {
      setError(err.message || '删除失败');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  // 初始加载
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return {
    items,
    loading,
    error,
    fetchItems,
    addDocument,
    retrieve,
    deleteItem,
  };
}
