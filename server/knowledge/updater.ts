import { recordSkillExperience, findRelevantSkills } from './skill-knowledge.js';
import { ingestWiki, ingestDocument, ingestRules } from './rag.js';
import fs from 'fs';
import path from 'path';
import type { ReflectionResult, FixPlan } from '../agents/types.js';

export async function updateKnowledgeFromReflection(
  plan: FixPlan,
  reflection: ReflectionResult
): Promise<void> {
  // 1. 记录每个技能的经验
  for (const sp of reflection.skillPerformance) {
    recordSkillExperience({
      skillName: sp.skillName,
      issuePattern: `Issue #${plan.issueId}`,
      success: sp.success,
      duration: sp.duration,
      lessons: reflection.lessonsLearned.join('; '),
      timestamp: new Date().toISOString(),
    });
  }

  // 2. 记录知识更新
  for (const update of reflection.knowledgeUpdates) {
    if (update.type === 'rule') {
      // 将规则更新写入 .meta-fix/rules/ 目录
      const rulesDir = path.join(process.cwd(), '.meta-fix', 'rules');
      if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
      const ruleFile = path.join(rulesDir, 'auto-generated.yaml');
      const entry = `- rule: ${update.target}\n  value: ${JSON.stringify(update.value)}\n  reason: ${update.reason}\n  timestamp: ${new Date().toISOString()}\n`;
      fs.appendFileSync(ruleFile, entry, 'utf-8');
    }
  }
}

export async function scanProjectWiki(): Promise<void> {
  const wikiDir = path.join(process.cwd(), '.meta-fix', 'wiki');
  if (!fs.existsSync(wikiDir)) return;

  const files = fs.readdirSync(wikiDir, { recursive: true }) as string[];
  for (const file of files) {
    const fullPath = path.join(wikiDir, file);
    if (fs.statSync(fullPath).isFile() && fullPath.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      await ingestWiki(file, content);
    }
  }
}

export async function scanProjectRules(): Promise<void> {
  const rulesDir = path.join(process.cwd(), '.meta-fix', 'rules');
  if (!fs.existsSync(rulesDir)) return;

  const files = fs.readdirSync(rulesDir, { recursive: true }) as string[];
  let allRules = '';
  for (const file of files) {
    const fullPath = path.join(rulesDir, file);
    if (fs.statSync(fullPath).isFile()) {
      allRules += `\n# ${file}\n${fs.readFileSync(fullPath, 'utf-8')}\n`;
    }
  }
  if (allRules) await ingestRules(allRules);
}

export async function syncProjectKnowledge(): Promise<{ wikis: number; rules: number }> {
  const wikiDir = path.join(process.cwd(), '.meta-fix', 'wiki');
  const rulesDir = path.join(process.cwd(), '.meta-fix', 'rules');
  const wikiCount = fs.existsSync(wikiDir) ? (fs.readdirSync(wikiDir, { recursive: true }) as string[]).filter(f => f.endsWith('.md')).length : 0;
  const rulesCount = fs.existsSync(rulesDir) ? (fs.readdirSync(rulesDir, { recursive: true }) as string[]).filter(f => fs.statSync(path.join(rulesDir, f)).isFile()).length : 0;
  await scanProjectWiki();
  await scanProjectRules();
  return { wikis: wikiCount, rules: rulesCount };
}
