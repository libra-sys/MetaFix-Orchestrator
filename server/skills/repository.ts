import * as db from '../db.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 技能仓库：管理技能的本地缓存和远程拉取
 */

// ============= 本地缓存操作 =============

/**
 * 保存技能到本地缓存
 */
export function saveToLocalCache(skillName: string, definition: string): void {
  const cacheDir = config.skillCacheDir;
  
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const filePath = path.join(cacheDir, `${skillName}.js`);
  fs.writeFileSync(filePath, definition, 'utf-8');
  
  console.log(`[Repository] 技能已保存到本地缓存: ${filePath}`);
}

/**
 * 从本地缓存读取技能
 */
export function loadFromLocalCache(skillName: string): string | null {
  const filePath = path.join(config.skillCacheDir, `${skillName}.js`);
  
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  
  return null;
}

/**
 * 检查技能是否在本地缓存中
 */
export function isInLocalCache(skillName: string): boolean {
  return fs.existsSync(path.join(config.skillCacheDir, `${skillName}.js`));
}

/**
 * 从本地缓存删除技能
 */
export function removeFromLocalCache(skillName: string): boolean {
  const filePath = path.join(config.skillCacheDir, `${skillName}.js`);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log(`[Repository] 技能已从本地缓存删除: ${skillName}`);
    return true;
  }
  
  return false;
}

/**
 * 列出本地缓存中的所有技能
 */
export function listLocalCache(): string[] {
  const cacheDir = config.skillCacheDir;
  
  if (!fs.existsSync(cacheDir)) {
    return [];
  }
  
  return fs.readdirSync(cacheDir)
    .filter(file => file.endsWith('.js'))
    .map(file => file.slice(0, -3));
}

// ============= 远程仓库操作 =============

/**
 * 从远程仓库拉取技能
 */
export async function fetchFromRemote(skillName: string): Promise<{
  success: boolean;
  definition?: string;
  error?: string;
}> {
  try {
    console.log(`[Repository] 从远程拉取技能: ${skillName}...`);
    
    // 模拟远程拉取（实际应调用 API）
    const mockDefinition = `// 远程拉取的技能: ${skillName}
// From: ${config.skillRegistryUrl}
// 拉取时间: ${new Date().toISOString()}

export async function execute(context) {
  console.log('[${skillName}] 执行中...');
  
  // TODO: 实现具体的技能逻辑
  
  return {
    success: true,
    output: '技能执行完成',
  };
}
`;
    
    // 保存到本地缓存
    saveToLocalCache(skillName, mockDefinition);
    
    // 保存到数据库
    const now = new Date().toISOString();
    db.createSkill({
      id: `skill-${Date.now()}`,
      name: skillName,
      version: '1.0.0',
      description: `远程拉取的技能: ${skillName}`,
      author: 'registry',
      source: 'remote-fetch',
      required_mcps: JSON.stringify([]),
      success_rate: 0.5,
      avg_duration: 0,
      created_at: now,
      updated_at: now,
    });
    
    return {
      success: true,
      definition: mockDefinition,
    };
  } catch (error: any) {
    console.error(`[Repository] 远程拉取失败: ${skillName}`, error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 推送技能到远程仓库（模拟）
 */
export async function pushToRemote(skillName: string, definition: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log(`[Repository] 推送技能到远程: ${skillName}...`);
    
    // 模拟推送
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`[Repository] 技能已推送到远程: ${skillName}`);
    
    return { success: true };
  } catch (error: any) {
    console.error(`[Repository] 推送到远程失败: ${skillName}`, error);
    return {
      success: false,
      error: error?.message || String(error),
    };
  }
}

/**
 * 搜索远程仓库中的技能
 */
export async function searchRemote(query: string): Promise<Array<{
  name: string;
  description: string;
  author: string;
  version: string;
}>> {
  try {
    console.log(`[Repository] 搜索远程技能: ${query}...`);
    
    // 模拟搜索结果
    return [
      {
        name: `${query}-skill`,
        description: `与 ${query} 相关的技能`,
        author: 'registry',
        version: '1.0.0',
      },
    ];
  } catch (error: any) {
    console.error(`[Repository] 搜索远程技能失败: ${query}`, error);
    return [];
  }
}

// ============= 数据库操作 =============

/**
 * 从数据库获取技能
 */
export function getSkillFromDb(skillName: string): any | null {
  const skill = db.getSkill(skillName);
  return skill || null;
}

/**
 * 保存技能到数据库
 */
export function saveSkillToDb(skill: {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  source: string;
  required_mcps: string;
  success_rate: number;
  avg_duration: number;
}): void {
  const now = new Date().toISOString();
  
  db.createSkill({
    id: skill.id,
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    source: skill.source,
    required_mcps: skill.required_mcps,
    success_rate: skill.success_rate,
    avg_duration: skill.avg_duration,
    created_at: now,
    updated_at: now,
  });
}

/**
 * 更新数据库中的技能
 */
export function updateSkillInDb(skillName: string, updates: {
  success_rate?: number;
  avg_duration?: number;
}): boolean {
  return db.updateSkill(skillName, updates);
}

// ============= 组合操作 =============

/**
 * 从所有来源解析技能（本地缓存 → 数据库 → 远程）
 */
export async function resolveSkillFromAllSources(skillName: string): Promise<{
  source: 'local-cache' | 'database' | 'remote-fetch' | 'not-found';
  definition?: string;
  skill?: any;
}> {
  // 1. 检查本地缓存
  const cached = loadFromLocalCache(skillName);
  if (cached) {
    return {
      source: 'local-cache',
      definition: cached,
    };
  }
  
  // 2. 检查数据库
  const dbSkill = getSkillFromDb(skillName);
  if (dbSkill) {
    return {
      source: 'database',
      skill: dbSkill,
      definition: dbSkill.description || '', // 简化：使用 description 作为 definition
    };
  }
  
  // 3. 从远程拉取
  const remoteResult = await fetchFromRemote(skillName);
  if (remoteResult.success && remoteResult.definition) {
    return {
      source: 'remote-fetch',
      definition: remoteResult.definition,
    };
  }
  
  return {
    source: 'not-found',
  };
}
