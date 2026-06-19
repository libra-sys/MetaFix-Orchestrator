import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface CodeLocation {
  file: string;
  line: number;
  column: number;
  context: string;
  confidence: number;
}

export interface ProjectStructure {
  rootDir: string;
  languages: string[];
  entryPoints: string[];
  testDirs: string[];
  configFiles: string[];
}

export function analyzeProjectStructure(cwd: string): ProjectStructure {
  const files = listAllFiles(cwd);
  const extensions = new Map<string, number>();
  const entryPoints: string[] = [];
  const testDirs: string[] = [];
  const configFiles: string[] = [];

  for (const file of files) {
    const ext = path.extname(file);
    if (ext) extensions.set(ext, (extensions.get(ext) || 0) + 1);

    const basename = path.basename(file).toLowerCase();
    if (['main.ts', 'main.js', 'main.py', 'index.ts', 'index.js', 'app.ts', 'app.py', 'server.ts', 'server.js'].includes(basename)) {
      entryPoints.push(file);
    }
    if (file.includes('/test/') || file.includes('/tests/') || file.includes('/__tests__/') || file.includes('.test.') || file.includes('.spec.')) {
      if (!testDirs.includes(path.dirname(file))) testDirs.push(path.dirname(file));
    }
    if (['package.json', 'tsconfig.json', 'pyproject.toml', 'setup.py', 'cargo.toml', 'cmakeLists.txt', 'Makefile', 'dockerfile'].includes(basename)) {
      configFiles.push(file);
    }
  }

  const languages = Array.from(extensions.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ext]) => ext);

  return { rootDir: cwd, languages, entryPoints, testDirs, configFiles };
}

export function locateCode(pattern: string, cwd: string): CodeLocation[] {
  const results: CodeLocation[] = [];
  try {
    const grepResult = execSync(
      `grep -rn "${pattern.replace(/"/g, '\\"')}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" --include="*.cpp" --include="*.h" --include="*.c" --include="*.java" --include="*.go" --include="*.rs" . 2>/dev/null || echo ""`,
      { encoding: 'utf-8', cwd, timeout: 30000 }
    );

    for (const line of grepResult.split('\n').filter(l => l.includes(':'))) {
      const parts = line.split(':');
      if (parts.length < 3) continue;
      const file = path.resolve(cwd, parts[0]);
      const lineNum = parseInt(parts[1], 10);
      const context = parts.slice(2).join(':');
      results.push({ file, line: lineNum, column: 0, context: context.trim(), confidence: 0.8 });
    }
  } catch { /* ignore */ }

  return results.slice(0, 20);
}

export function getFileTree(cwd: string, maxDepth = 3): string {
  try {
    const result = execSync(`find . -maxdepth ${maxDepth} -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' | sort`,
      { encoding: 'utf-8', cwd, timeout: 10000 });
    return result;
  } catch {
    return '';
  }
}

function listAllFiles(cwd: string): string[] {
  try {
    const result = execSync(
      `find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*'`,
      { encoding: 'utf-8', cwd, timeout: 30000 }
    );
    return result.split('\n').filter(f => f.trim()).map(f => path.resolve(cwd, f));
  } catch {
    return [];
  }
}
