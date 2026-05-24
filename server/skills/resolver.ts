import * as db from '../db.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 技能解析器：五级优先级获取技能
 * 
 * 优先级：
 * 1. 预制子智能体
 * 2. 本地缓存
 * 3. 远程拉取
 * 4. 自动创建
 * 5. 组合
 */

// 预制子智能体列表
const PRESET_AGENTS = [
  'code-analyzer',
  'code-fixer',
  'test-writer',
  'pr-creator',
  'doc-generator',
];

/**
 * 解析技能（五级优先级）
 * @param skillName - 技能名称
 * @param context - 上下文（用于自动创建）
 * @returns 技能定义
 */
export async function resolveSkill(
  skillName: string,
  context?: Record<string, any>
): Promise<{
  name: string;
  source: 'preset-agent' | 'local-cache' | 'remote-fetch' | 'auto-create' | 'composite';
  definition: string;
  requiredMcps: string[];
}> {
  console.log(`[Resolver] 解析技能: ${skillName}`);

  // 优先级1：预制子智能体
  let result = await checkPresetAgent(skillName);
  if (result) {
    console.log(`[Resolver] [1/5] 找到预制子智能体: ${skillName}`);
    return result;
  }

  // 优先级2：本地缓存
  result = await checkLocalCache(skillName);
  if (result) {
    console.log(`[Resolver] [2/5] 找到本地缓存: ${skillName}`);
    return result;
  }

  // 优先级3：远程拉取
  result = await fetchRemote(skillName);
  if (result) {
    console.log(`[Resolver] [3/5] 远程拉取成功: ${skillName}`);
    return result;
  }

  // 优先级4：自动创建
  result = await autoCreate(skillName, context);
  if (result) {
    console.log(`[Resolver] [4/5] 自动创建成功: ${skillName}`);
    return result;
  }

  // 优先级5：组合
  result = await findComposite(skillName);
  if (result) {
    console.log(`[Resolver] [5/5] 找到技能组合: ${skillName}`);
    return result;
  }

  // 未找到，返回默认定义
  console.log(`[Resolver] 未找到技能: ${skillName}，使用默认定义`);
  return {
    name: skillName,
    source: 'auto-create',
    definition: `// 默认技能定义: ${skillName}\n// 自动生成的技能\nexports.async function execute(context) {\n  console.log('Executing ${skillName}...');\n  return { success: true };\n}`,
    requiredMcps: [],
  };
}

/**
 * 优先级1：检查预制子智能体
 */
async function checkPresetAgent(skillName: string): Promise<{
  name: string;
  source: 'preset-agent';
  definition: string;
  requiredMcps: string[];
} | null> {
  if (PRESET_AGENTS.includes(skillName)) {
    return {
      name: skillName,
      source: 'preset-agent',
      definition: `// 预制技能: ${skillName}\n// 使用 CodeBuddy SDK 内置能力`,
      requiredMcps: getDefaultMcps(skillName),
    };
  }
  return null;
}

/**
 * 优先级2：检查本地缓存
 */
async function checkLocalCache(skillName: string): Promise<{
  name: string;
  source: 'local-cache';
  definition: string;
  requiredMcps: string[];
} | null> {
  const cachePath = path.join(config.skillCacheDir, `${skillName}.js`);

  if (fs.existsSync(cachePath)) {
    const definition = fs.readFileSync(cachePath, 'utf-8');
    return {
      name: skillName,
      source: 'local-cache',
      definition,
      requiredMcps: extractRequiredMcps(definition),
    };
  }

  // 检查数据库
  const skill = db.getSkill(skillName);
  if (skill) {
    return {
      name: skill.name,
      source: 'local-cache',
      definition: `// Cached skill: ${skill.name}\n${skill.description || '// No description'}`,
      requiredMcps: skill.required_mcps ? JSON.parse(skill.required_mcps) : [],
    };
  }

  return null;
}

/**
 * 优先级3：远程拉取
 */
async function fetchRemote(skillName: string): Promise<{
  name: string;
  source: 'remote-fetch';
  definition: string;
  requiredMcps: string[];
} | null> {
  try {
    console.log(`[Resolver] 从 ${config.skillRegistryUrl} 拉取 ${skillName}...`);

    // 模拟远程拉取（实际应调用 API）
    const mockDefinition = `// 远程拉取的技能: ${skillName}\n// From: ${config.skillRegistryUrl}\nexports.async function execute(context) {\n  // 实现\n  return { success: true };\n}`;

    // 保存到本地缓存
    if (!fs.existsSync(config.skillCacheDir)) {
      fs.mkdirSync(config.skillCacheDir, { recursive: true });
    }
    fs.writeFileSync(path.join(config.skillCacheDir, `${skillName}.js`), mockDefinition);

    // 保存到数据库
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return {
      name: skillName,
      source: 'remote-fetch',
      definition: mockDefinition,
      requiredMcps: [],
    };
  } catch (error: any) {
    console.error(`[Resolver] 远程拉取失败: ${skillName}`, error);
    return null;
  }
}

/**
 * 优先级4：自动创建
 */
async function autoCreate(
  skillName: string,
  context?: Record<string, any>
): Promise<{
  name: string;
  source: 'auto-create';
  definition: string;
  requiredMcps: string[];
} | null> {
  try {
    console.log(`[Resolver] 自动创建技能: ${skillName}...`);

    // 使用 CodeBuddy SDK 生成技能代码
    const definition = await generateSkillCode(skillName, context);

    // 保存到本地缓存
    if (!fs.existsSync(config.skillCacheDir)) {
      fs.mkdirSync(config.skillCacheDir, { recursive: true });
    }
    fs.writeFileSync(path.join(config.skillCacheDir, `${skillName}.js`), definition);

    // 保存到数据库
    db.createSkill({
      id: `skill-${Date.now()}`,
      name: skillName,
      version: '1.0.0',
      description: `自动创建的技能: ${skillName}`,
      author: 'auto',
      source: 'auto-create',
      required_mcps: JSON.stringify([]),
      success_rate: 0.5,
      avg_duration: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return {
      name: skillName,
      source: 'auto-create',
      definition,
      requiredMcps: [],
    };
  } catch (error: any) {
    console.error(`[Resolver] 自动创建失败: ${skillName}`, error);
    return null;
  }
}

/**
 * 优先级5：组合现有技能
 */
async function findComposite(skillName: string): Promise<{
  name: string;
  source: 'composite';
  definition: string;
  requiredMcps: string[];
} | null> {
  // 从技能组合知识库查找
  const combos = db.getAllSkillCombinations();

  for (const combo of combos) {
    const skillIds = combo.skill_ids.split(',');
    if (skillIds.includes(skillName) || combo.id === skillName) {
      return {
        name: skillName,
        source: 'composite',
        definition: `// 组合技能: ${skillName}\n// 组合 ID: ${combo.id}\n// 包含技能: ${combo.skill_ids}`,
        requiredMcps: [],
      };
    }
  }

  return null;
}

// ============= 辅助函数 =============

function getDefaultMcps(skillName: string): string[] {
  const mcpMap: Record<string, string[]> = {
    'code-analyzer': ['filesystem', 'git'],
    'code-fixer': ['filesystem', 'git'],
    'test-writer': ['filesystem'],
    'pr-creator': ['github', 'git'],
    'doc-generator': ['filesystem'],
  };
  return mcpMap[skillName] || [];
}

function extractRequiredMcps(definition: string): string[] {
  // 简单提取：从定义中查找 MCP 声明
  const mcpMatch = definition.match(/requiredMcps:\s*\[(.*?)\]/);
  if (mcpMatch) {
    try {
      return JSON.parse(`[${mcpMatch[1]]`);
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function generateSkillCode(skillName: string, context?: Record<string, any>): Promise<string> {
  // 简化实现：返回模板代码
  return `// 自动生成的技能: ${skillName}
// 生成时间: ${new Date().toISOString()}

export async function execute(context) {
  const { session, step, perception } = context;
  
  console.log('[${skillName}] 开始执行...');
  
  // TODO: 使用 CodeBuddy SDK 生成具体实现
  
  return {
    success: true,
    output: '技能执行完成',
  };
}
`;
}

/**
 * 批量解析技能
 */
export async function resolveSkills(
  skillNames: string[],
  context?: Record<string, any>
): Promise<Array<{
  name: string;
  source: string;
  definition: string;
  requiredMcps: string[];
}>> {
  const results = [];
  for (const name of skillNames) {
    const result = await resolveSkill(name, context);
    results.push(result);
  }
  return results;
}
