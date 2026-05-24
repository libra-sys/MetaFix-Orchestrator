import { useState, useEffect, useCallback } from 'react';

interface Skill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  required_mcps: string;
  success_rate: number;
  avg_duration: number;
  created_at: string;
  updated_at: string;
}

interface SkillCombination {
  id: string;
  skill_ids: string;
  success_rate: number;
  usage_count: number;
  created_at: string;
}

interface SkillsState {
  skills: Skill[];
  combinations: SkillCombination[];
  loading: boolean;
  error: string | null;
}

/**
 * 技能管理 Hook
 */
export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [combinations, setCombinations] = useState<SkillCombination[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 获取所有技能
   */
  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/skills');

      if (!response.ok) {
        throw new Error(`获取技能失败: ${response.statusText}`);
      }

      const data = await response.json();
      setSkills(data.skills || []);
    } catch (err: any) {
      setError(err.message || '获取技能失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 创建技能
   */
  const createSkill = useCallback(async (skill: {
    name: string;
    version?: string;
    description?: string;
    author?: string;
    source?: string;
    required_mcps?: string[];
  }): Promise<Skill | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      });

      if (!response.ok) {
        throw new Error(`创建技能失败: ${response.statusText}`);
      }

      const data = await response.json();
      await fetchSkills(); // 刷新列表
      return data.skill;
    } catch (err: any) {
      setError(err.message || '创建技能失败');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchSkills]);

  /**
   * 获取技能组合
   */
  const fetchCombinations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/skill-combinations');

      if (!response.ok) {
        throw new Error(`获取技能组合失败: ${response.statusText}`);
      }

      const data = await response.json();
      setCombinations(data.combinations || []);
    } catch (err: any) {
      setError(err.message || '获取技能组合失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 搜索技能
   */
  const searchSkills = useCallback(async (query: string): Promise<Skill[]> => {
    try {
      const response = await fetch(`/api/skills/search?q=${encodeURIComponent(query)}`);

      if (!response.ok) {
        throw new Error(`搜索技能失败: ${response.statusText}`);
      }

      const data = await response.json();
      return data.skills || [];
    } catch (err: any) {
      setError(err.message || '搜索技能失败');
      return [];
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchSkills();
    fetchCombinations();
  }, [fetchSkills, fetchCombinations]);

  return {
    skills,
    combinations,
    loading,
    error,
    fetchSkills,
    createSkill,
    fetchCombinations,
    searchSkills,
  };
}
