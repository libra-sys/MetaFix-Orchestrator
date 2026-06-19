import * as db from '../../db.js';

export interface FindSkillsInput {
  query: string;
  source?: 'local' | 'remote' | 'all';
}

export interface FindSkillsResult {
  success: boolean;
  skills: Array<{ name: string; version: string; description: string; source: string }>;
  error?: string;
}

export async function execute(input: FindSkillsInput): Promise<FindSkillsResult> {
  const query = input.query.toLowerCase();
  const source = input.source || 'all';
  const results: FindSkillsResult['skills'] = [];

  if (source === 'local' || source === 'all') {
    const localSkills = db.getAllSkills();
    for (const skill of localSkills) {
      if (skill.name.toLowerCase().includes(query) || (skill.description || '').toLowerCase().includes(query)) {
        results.push({ name: skill.name, version: skill.version, description: skill.description, source: 'local' });
      }
    }
  }

  if (source === 'remote' || source === 'all') {
    const remoteSkills = await fetchRemoteSkills(query);
    results.push(...remoteSkills);
  }

  return { success: results.length > 0, skills: results };
}

async function fetchRemoteSkills(query: string): Promise<FindSkillsResult['skills']> {
  const registryUrl = process.env.SKILL_REGISTRY_URL;
  if (!registryUrl) return [];

  try {
    const resp = await fetch(`${registryUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return (data.skills || []).map((s: any) => ({
      name: s.name,
      version: s.version || '1.0.0',
      description: s.description || '',
      source: 'remote',
    }));
  } catch {
    return [];
  }
}
