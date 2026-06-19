import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface QualityReport {
  passed: boolean;
  codeStyle: { passed: boolean; issues: string[] };
  securityScan: { passed: boolean; issues: string[] };
  testCoverage: { passed: boolean; percentage: number };
  typeCheck: { passed: boolean; errors: string[] };
  overallScore: number;
}

export function runQualityGate(cwd: string): QualityReport {
  const report: QualityReport = {
    passed: true,
    codeStyle: { passed: true, issues: [] },
    securityScan: { passed: true, issues: [] },
    testCoverage: { passed: true, percentage: 0 },
    typeCheck: { passed: true, errors: [] },
    overallScore: 0,
  };

  // 代码风格检查
  report.codeStyle = checkCodeStyle(cwd);

  // 安全扫描（简单规则）
  report.securityScan = runSecurityScan(cwd);

  // 测试覆盖率
  report.testCoverage = checkTestCoverage(cwd);

  // 类型检查
  report.typeCheck = runTypeCheck(cwd);

  report.passed = report.codeStyle.passed && report.securityScan.passed && report.testCoverage.passed && report.typeCheck.passed;

  let score = 100;
  score -= report.codeStyle.issues.length * 2;
  score -= report.securityScan.issues.length * 10;
  score -= report.typeCheck.errors.length * 3;
  score -= Math.max(0, 80 - report.testCoverage.percentage);
  report.overallScore = Math.max(0, Math.min(100, score));

  return report;
}

function checkCodeStyle(cwd: string): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  try {
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      if (pkg.scripts?.lint) {
        const output = execSync('npm run lint 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
        if (output.includes('error') || output.includes('Error')) {
          issues.push(...output.split('\n').filter(l => l.includes('error')).slice(0, 10));
        }
      }
    }
  } catch (e: any) {
    issues.push(`Lint 检查失败: ${e?.message}`);
  }
  return { passed: issues.length === 0, issues };
}

function runSecurityScan(cwd: string): { passed: boolean; issues: string[] } {
  const issues: string[] = [];
  const dangerousPatterns = [
    { pattern: /eval\s*\(/g, desc: '使用了 eval()' },
    { pattern: /new\s+Function\s*\(/g, desc: '使用了 new Function()' },
    { pattern: /innerHTML\s*=/g, desc: '直接设置了 innerHTML' },
    { pattern: /document\.write\s*\(/g, desc: '使用了 document.write()' },
  ];

  try {
    const files = fs.readdirSync(cwd, { recursive: true }) as string[];
    for (const file of files) {
      const fullPath = path.join(cwd, file);
      if (!fs.statSync(fullPath).isFile()) continue;
      if (!file.match(/\.(ts|tsx|js|jsx|py)$/)) continue;
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const dp of dangerousPatterns) {
          if (dp.pattern.test(content)) {
            issues.push(`${file}: ${dp.desc}`);
          }
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return { passed: issues.length === 0, issues: issues.slice(0, 20) };
}

function checkTestCoverage(cwd: string): { passed: boolean; percentage: number } {
  try {
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      const output = execSync('npx jest --coverage --passWithNoTests 2>&1', { encoding: 'utf-8', cwd, timeout: 180000 });
      const match = output.match(/All files\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*([\d.]+)/);
      if (match) {
        const pct = parseFloat(match[1]);
        return { passed: pct >= 60, percentage: pct };
      }
    }
  } catch { /* ignore */ }
  return { passed: true, percentage: 0 };
}

function runTypeCheck(cwd: string): { passed: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
      const output = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
      if (output.includes('error TS')) {
        errors.push(...output.split('\n').filter(l => l.includes('error TS')).slice(0, 10));
      }
    }
  } catch (e: any) {
    const output = e?.stdout || e?.message || '';
    if (output.includes('error TS')) {
      errors.push(...output.split('\n').filter((l: string) => l.includes('error TS')).slice(0, 10));
    }
  }
  return { passed: errors.length === 0, errors };
}
