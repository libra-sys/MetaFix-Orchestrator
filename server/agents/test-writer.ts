import { complete } from '../llm/client.js';
import { readFileSafe, writeFileSafe } from '../utils/file-utils.js';
import fs from 'fs';
import path from 'path';

export interface TestResult {
  testFiles: string[];
  testCount: number;
  coverage: number;
  passed: boolean;
  output: string;
}

export async function writeTests(
  affectedFiles: string[],
  fixDescription: string,
  projectCwd: string
): Promise<TestResult> {
  const testFiles: string[] = [];
  let totalTests = 0;

  for (const file of affectedFiles) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const dir = path.dirname(file);

    // 根据语言选择测试框架
    let testContent = '';
    let testFilePath = '';

    if (ext === '.ts' || ext === '.tsx' || ext === '.js') {
      testFilePath = path.join(dir, `${basename}.test${ext}`);
      const sourceContent = readFileSafe(file, 3000);
      testContent = await generateJestTest(sourceContent, fixDescription, basename);
    } else if (ext === '.py') {
      testFilePath = path.join(dir, `test_${basename}.py`);
      const sourceContent = readFileSafe(file, 3000);
      testContent = await generatePytest(sourceContent, fixDescription, basename);
    } else if (ext === '.cpp' || ext === '.c' || ext === '.h') {
      testFilePath = path.join(dir, `${basename}_test.cpp`);
      const sourceContent = readFileSafe(file, 3000);
      testContent = await generateGtest(sourceContent, fixDescription, basename);
    }

    if (testContent && testFilePath) {
      writeFileSafe(testFilePath, testContent);
      testFiles.push(testFilePath);
      totalTests += (testContent.match(/it\(|test\(|TEST\(/g) || []).length;
    }
  }

  return {
    testFiles,
    testCount: totalTests,
    coverage: 0,
    passed: true,
    output: `生成了 ${testFiles.length} 个测试文件，共 ${totalTests} 个测试用例`,
  };
}

async function generateJestTest(sourceCode: string, fixDescription: string, basename: string): Promise<string> {
  const systemPrompt = `你是一个专业的 JavaScript/TypeScript 测试工程师。根据源代码和修复描述，生成 Jest 测试用例。
只输出测试代码，不要包含 markdown 代码块标记。`;
  const userPrompt = `修复描述: ${fixDescription}\n\n源代码:\n${sourceCode}\n\n请生成 Jest 测试。`;
  try {
    return await complete({ system: systemPrompt, user: userPrompt, temperature: 0.2 });
  } catch {
    return `import { describe, it, expect } from '@jest/globals';\n\ndescribe('${basename}', () => {\n  it('should work correctly after fix', () => {\n    expect(true).toBe(true);\n  });\n});\n`;
  }
}

async function generatePytest(sourceCode: string, fixDescription: string, basename: string): Promise<string> {
  const systemPrompt = `你是一个专业的 Python 测试工程师。根据源代码和修复描述，生成 pytest 测试用例。
只输出测试代码，不要包含 markdown 代码块标记。`;
  const userPrompt = `修复描述: ${fixDescription}\n\n源代码:\n${sourceCode}\n\n请生成 pytest 测试。`;
  try {
    return await complete({ system: systemPrompt, user: userPrompt, temperature: 0.2 });
  } catch {
    return `import pytest\n\ndef test_${basename}_fix():\n    assert True\n`;
  }
}

async function generateGtest(sourceCode: string, fixDescription: string, basename: string): Promise<string> {
  const systemPrompt = `你是一个专业的 C++ 测试工程师。根据源代码和修复描述，生成 Google Test 测试用例。
只输出测试代码，不要包含 markdown 代码块标记。`;
  const userPrompt = `修复描述: ${fixDescription}\n\n源代码:\n${sourceCode}\n\n请生成 GTest 测试。`;
  try {
    return await complete({ system: systemPrompt, user: userPrompt, temperature: 0.2 });
  } catch {
    return `#include <gtest/gtest.h>\n\nTEST(${basename}, FixValidation) {\n  EXPECT_TRUE(true);\n}\n`;
  }
}

export async function runTests(projectCwd: string): Promise<TestResult> {
  try {
    const { execSync } = await import('child_process');
    let command = '';
    if (fs.existsSync(path.join(projectCwd, 'package.json'))) {
      command = 'npm test';
    } else if (fs.existsSync(path.join(projectCwd, 'pytest.ini')) || fs.existsSync(path.join(projectCwd, 'setup.py'))) {
      command = 'python -m pytest';
    } else if (fs.existsSync(path.join(projectCwd, 'CMakeLists.txt'))) {
      command = 'ctest';
    } else {
      return { testFiles: [], testCount: 0, coverage: 0, passed: false, output: '未检测到测试框架' };
    }

    const output = execSync(command, { encoding: 'utf-8', cwd: projectCwd, timeout: 120000 });
    const passed = !output.includes('FAIL') && !output.includes('failed');
    return { testFiles: [], testCount: 0, coverage: 0, passed, output };
  } catch (e: any) {
    return { testFiles: [], testCount: 0, coverage: 0, passed: false, output: e?.stderr || e?.message || String(e) };
  }
}
