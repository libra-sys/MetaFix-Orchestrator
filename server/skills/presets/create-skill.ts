import { complete } from '../../llm/client.js';
import { writeFileSafe } from '../../utils/file-utils.js';
import fs from 'fs';
import path from 'path';

export interface CreateSkillInput {
  skillName: string;
  description: string;
  requiredMcps?: string[];
  outputDir?: string;
}

export interface CreateSkillResult {
  success: boolean;
  filePath?: string;
  skillCode?: string;
  error?: string;
}

export async function execute(input: CreateSkillInput): Promise<CreateSkillResult> {
  const outputDir = input.outputDir || path.join(process.cwd(), 'data', 'skills', input.skillName);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const systemPrompt = `你是一个技能开发助手。根据技能名称和描述，生成完整的 TypeScript 技能实现代码。
代码必须导出一个 execute 函数，接收 input 参数，返回 Promise<{ success: boolean; ... }>。
只输出代码，不要包含 markdown 代码块标记。`;

  const userPrompt = `技能名称: ${input.skillName}\n描述: ${input.description}\n所需 MCP: ${(input.requiredMcps || []).join(', ')}\n\n请生成完整的技能实现代码。`;

  try {
    const code = await complete({ system: systemPrompt, user: userPrompt, temperature: 0.3 });
    const cleanCode = code.replace(/```typescript\n?/g, '').replace(/```\n?/g, '').trim();

    const filePath = path.join(outputDir, 'index.ts');
    writeFileSafe(filePath, cleanCode);

    // 同时生成 SKILL.md
    const skillMd = `# ${input.skillName}\n\n## 描述\n${input.description}\n\n## 所需 MCP\n${(input.requiredMcps || []).map(m => `- ${m}`).join('\n')}\n\n## 使用方法\n\`\`\`typescript\nimport { execute } from './index';\nconst result = await execute({ /* input */ });\n\`\`\`\n`;
    writeFileSafe(path.join(outputDir, 'SKILL.md'), skillMd);

    return { success: true, filePath, skillCode: cleanCode };
  } catch (e: any) {
    return { success: false, error: e?.message };
  }
}
