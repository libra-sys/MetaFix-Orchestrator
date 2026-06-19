import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface RegressionResult {
  passed: boolean;
  totalTests: number;
  failedTests: number;
  newFailures: string[];
  duration: number;
  output: string;
}

export function runRegressionTests(cwd: string): RegressionResult {
  const start = Date.now();
  let output = '';
  let passed = false;

  try {
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      output = execSync('npm test 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
      passed = output.includes('pass') && !output.match(/\d+\s+failing/);
    } else if (fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
      output = execSync('python -m pytest -v 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
      passed = output.includes('passed') && !output.includes('failed');
    } else if (fs.existsSync(path.join(cwd, 'CMakeLists.txt'))) {
      output = execSync('ctest --output-on-failure 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
      passed = !output.includes('Tests failed');
    } else if (fs.existsSync(path.join(cwd, 'Makefile'))) {
      output = execSync('make test 2>&1', { encoding: 'utf-8', cwd, timeout: 300000 });
      passed = output.includes('PASS') || output.includes('OK');
    } else {
      return { passed: false, totalTests: 0, failedTests: 0, newFailures: [], duration: 0, output: '未检测到测试框架' };
    }
  } catch (e: any) {
    output = e?.stderr || e?.stdout || e?.message || String(e);
    passed = false;
  }

  const duration = Math.round((Date.now() - start) / 1000);
  const totalMatch = output.match(/(\d+)\s+pass/i) || output.match(/(\d+)\s+tests?/i);
  const failMatch = output.match(/(\d+)\s+fail/i);
  const totalTests = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  const failedTests = failMatch ? parseInt(failMatch[1], 10) : 0;

  const newFailures: string[] = [];
  const failureLines = output.split('\n').filter(l => l.includes('FAIL') || l.includes('failed') || l.includes('Error'));
  for (const line of failureLines.slice(0, 10)) {
    newFailures.push(line.trim());
  }

  return { passed, totalTests, failedTests, newFailures, duration, output: output.slice(0, 5000) };
}

export function runLint(cwd: string): { passed: boolean; output: string } {
  try {
    let output = '';
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf-8'));
      if (pkg.scripts?.lint) {
        output = execSync('npm run lint 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
      } else if (fs.existsSync(path.join(cwd, '.eslintrc')) || fs.existsSync(path.join(cwd, '.eslintrc.js'))) {
        output = execSync('npx eslint . 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
      }
    } else if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
      output = execSync('python -m flake8 . 2>&1', { encoding: 'utf-8', cwd, timeout: 120000 });
    }
    return { passed: !output.includes('error') && !output.includes('Error'), output };
  } catch (e: any) {
    return { passed: false, output: e?.stderr || e?.stdout || e?.message || String(e) };
  }
}
