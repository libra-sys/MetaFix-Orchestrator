import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface BuildResult {
  success: boolean;
  buildTool: string;
  errors: string[];
  warnings: string[];
  duration: number;
}

export function detectBuildSystem(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'CMakeLists.txt'))) return 'cmake';
  if (fs.existsSync(path.join(cwd, 'Makefile'))) return 'make';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'cargo';
  if (fs.existsSync(path.join(cwd, 'setup.py')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) return 'python';
  if (fs.existsSync(path.join(cwd, 'pom.xml'))) return 'maven';
  if (fs.existsSync(path.join(cwd, 'build.gradle'))) return 'gradle';
  return 'unknown';
}

export function runBuild(cwd: string): BuildResult {
  const start = Date.now();
  const tool = detectBuildSystem(cwd);
  const errors: string[] = [];
  const warnings: string[] = [];
  let success = false;

  try {
    let output = '';
    switch (tool) {
      case 'npm':
        output = execSync('npm run build 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
        break;
      case 'cmake':
        if (!fs.existsSync(path.join(cwd, 'build'))) fs.mkdirSync(path.join(cwd, 'build'), { recursive: true });
        execSync('cmake ..', { encoding: 'utf-8', cwd: path.join(cwd, 'build'), timeout: 120000 });
        output = execSync('cmake --build . 2>&1', { encoding: 'utf-8', cwd: path.join(cwd, 'build'), timeout: 300000 });
        break;
      case 'make':
        output = execSync('make 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
        break;
      case 'cargo':
        output = execSync('cargo build 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
        break;
      case 'python':
        output = execSync('python -m py_compile ./**/*.py 2>&1 || echo "compilation check done"', { encoding: 'utf-8', cwd, timeout: 120000 });
        break;
      case 'maven':
        output = execSync('mvn compile 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
        break;
      case 'gradle':
        output = execSync('gradle build 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
        break;
      default:
        return { success: false, buildTool: tool, errors: ['未知的构建系统'], warnings: [], duration: 0 };
    }

    success = !output.includes('error') && !output.includes('Error') && !output.includes('FAILED');
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('error') || line.includes('Error')) errors.push(line.trim());
      else if (line.includes('warning') || line.includes('Warning')) warnings.push(line.trim());
    }
  } catch (e: any) {
    const output = e?.stderr || e?.stdout || e?.message || String(e);
    success = false;
    errors.push(...output.split('\n').filter((l: string) => l.includes('error') || l.includes('Error')).slice(0, 20));
  }

  return {
    success,
    buildTool: tool,
    errors: errors.slice(0, 20),
    warnings: warnings.slice(0, 20),
    duration: Math.round((Date.now() - start) / 1000),
  };
}

export function fixBuildErrors(cwd: string, errors: string[]): string {
  // 尝试常见的自动修复
  let fixes = '';
  for (const error of errors) {
    if (error.includes('cannot find module') || error.includes('Cannot find module')) {
      fixes += '尝试安装缺失依赖...\n';
      try {
        execSync('npm install 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
        fixes += 'npm install 完成\n';
      } catch (e: any) {
        fixes += `npm install 失败: ${e?.message}\n`;
      }
    }
    if (error.includes('CMake Error') && error.includes('not found')) {
      fixes += 'CMake 配置错误，可能需要手动检查 CMakeLists.txt\n';
    }
  }
  return fixes || '未识别到可自动修复的构建错误';
}
