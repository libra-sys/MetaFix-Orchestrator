import * as db from '../db.js';
import path from 'path';
import fs from 'fs';

export type SkillSource = 'preset' | 'local' | 'remote' | 'auto_created' | 'combination';

export interface ResolvedSkill {
  name: string;
  version: string;
  source: SkillSource;
  description: string;
  requiredMcps: string[];
  scriptPath?: string;
  successRate: number;
}

const PRESET_SKILL_MAP: Record<string, string> = {
  'receiving-code-review': './presets/receiving-code-review.js',
  'deep-research': './presets/deep-research.js',
  'analytics-data-analysis': './presets/analytics-data-analysis.js',
  'agent-browser': './presets/agent-browser.js',
  'find-skills': './presets/find-skills.js',
  'create-skill': './presets/create-skill.js',
  'install-skill-dependency': './presets/install-skill-dependency.js',
  'docx': './presets/docx.js',
  'pdf': './presets/pdf.js',
  'pptx': './presets/pptx.js',
  'xlsx': './presets/xlsx.js',
  'content-research-writer': './presets/content-research-writer.js',
};

/**
 * 五级优先级技能获取
 * 1. 预制子智能体
 * 2. 本地缓存
 * 3. 远程拉取
 * 4. 自动创建
 * 5. 组合技能
 */
export async function resolveSkill(skillName: string): Promise<ResolvedSkill | null> {
  // L1: 预设技能（直接映射到本地文件）
  if (PRESET_SKILL_MAP[skillName]) {
    const localSkills = db.getAllSkills();
    const preset = localSkills.find(s => s.name === skillName);
    return {
      name: skillName,
      version: preset?.version || '1.0.0',
      source: 'preset',
      description: preset?.description || `${skillName} 预设技能`,
      requiredMcps: preset ? JSON.parse(preset.required_mcps || '[]') : ['filesystem'],
      scriptPath: PRESET_SKILL_MAP[skillName],
      successRate: preset?.success_rate || 0.8,
    };
  }

  // L2: 本地数据库
  const localSkills = db.getAllSkills();
  const local = localSkills.find(s => s.name === skillName);
  if (local) {
    return {
      name: local.name,
      version: local.version,
      source: local.source as SkillSource,
      description: local.description,
      requiredMcps: JSON.parse(local.required_mcps || '[]'),
      successRate: local.success_rate,
    };
  }

  // L3: 远程拉取
  const remote = await fetchRemoteSkill(skillName);
  if (remote) {
    const now = new Date().toISOString();
    db.createSkill({
      id: `skill-${Date.now()}`,
      name: remote.name,
      version: remote.version,
      description: remote.description,
      author: 'remote',
      source: 'remote',
      required_mcps: JSON.stringify(remote.requiredMcps),
      success_rate: 0.5,
      avg_duration: 0,
      created_at: now,
      updated_at: now,
    });
    return { ...remote, source: 'remote' as SkillSource, successRate: 0.5 };
  }

  // L4: 自动创建
  const autoCreated = await autoCreateSkill(skillName);
  if (autoCreated) {
    const now = new Date().toISOString();
    db.createSkill({
      id: `skill-${Date.now()}`,
      name: autoCreated.name,
      version: '1.0.0',
      description: autoCreated.description,
      author: 'auto',
      source: 'auto_created',
      required_mcps: JSON.stringify(autoCreated.requiredMcps),
      success_rate: 0.3,
      avg_duration: 0,
      created_at: now,
      updated_at: now,
    });
    return { ...autoCreated, source: 'auto_created' as SkillSource, version: '1.0.0', successRate: 0.3 };
  }

  return null;
}

/**
 * 执行技能
 */
export async function executeSkill(skillName: string, input: any): Promise<any> {
  const skill = await resolveSkill(skillName);
  if (!skill) throw new Error(`技能未找到: ${skillName}`);

  // 预设技能：动态导入执行
  if (skill.source === 'preset' && skill.scriptPath) {
    const modulePath = new URL(skill.scriptPath, import.meta.url).href;
    const mod = await import(modulePath);
    if (typeof mod.execute === 'function') {
      return mod.execute(input);
    }
    throw new Error(`技能 ${skillName} 没有导出 execute 函数`);
  }

  // 本地技能：尝试从 skills 缓存目录加载
  if (skill.source === 'local' || skill.source === 'auto_created' || skill.source === 'remote') {
    const skillDir = path.join(process.cwd(), 'data', 'skills', skillName);
    const indexPath = path.join(skillDir, 'index.ts');
    const indexJsPath = path.join(skillDir, 'index.js');
    if (fs.existsSync(indexPath) || fs.existsSync(indexJsPath)) {
      const mod = await import(indexPath);
      if (typeof mod.execute === 'function') {
        return mod.execute(input);
      }
    }
  }

  throw new Error(`技能 ${skillName} 无法执行`);
}

async function fetchRemoteSkill(skillName: string): Promise<Omit<ResolvedSkill, 'source' | 'successRate'> | null> {
  const registryUrl = process.env.SKILL_REGISTRY_URL;
  if (!registryUrl) {
    console.log(`[SkillResolver] 未配置 SKILL_REGISTRY_URL，跳过远程拉取`);
    return null;
  }

  try {
    const url = `${registryUrl.replace(/\/$/, '')}/skills/${skillName}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const data = await response.json() as any;
    if (!data?.name) return null;
    return {
      name: data.name,
      version: data.version || '1.0.0',
      description: data.description || '',
      requiredMcps: Array.isArray(data.requiredMcps) ? data.requiredMcps : ['filesystem'],
    };
  } catch (error: any) {
    console.error(`[SkillResolver] 远程拉取失败:`, error.message);
    return null;
  }
}

async function autoCreateSkill(skillName: string): Promise<Omit<ResolvedSkill, 'source' | 'version' | 'successRate'> | null> {
  console.log(`[SkillResolver] 尝试自动创建技能: ${skillName}`);

  try {
    const { complete } = await import('../llm/client.js');
    const systemPrompt = '你是一个技能生成助手。根据技能名称，生成技能的详细描述和所需的 MCP 服务器列表。以 JSON 输出：{ "description": "...", "requiredMcps": ["filesystem"] }';
    const userPrompt = `技能名称: ${skillName}\n请生成技能描述和所需 MCP。`;
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.3 });
    const data = JSON.parse(response);
    return {
      name: skillName,
      description: data.description || `${skillName} 技能`,
      requiredMcps: Array.isArray(data.requiredMcps) ? data.requiredMcps : ['filesystem'],
    };
  } catch (error: any) {
    console.error(`[SkillResolver] 自动创建技能失败:`, error.message);
    return {
      name: skillName,
      description: `${skillName} 技能（自动创建）`,
      requiredMcps: ['filesystem'],
    };
  }
}

export function getSkillCombinations(): Array<{ skillIds: string[]; successRate: number; usageCount: number }> {
  try {
    const combos = db.getAllSkillCombinations();
    return combos.map(c => ({
      skillIds: c.skill_ids.split(','),
      successRate: c.success_rate,
      usageCount: c.usage_count,
    }));
  } catch {
    return [];
  }
}
