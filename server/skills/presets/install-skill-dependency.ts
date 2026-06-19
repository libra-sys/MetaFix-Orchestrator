import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface InstallDepInput {
  skillName: string;
  dependencies: string[];
  packageManager?: 'npm' | 'pip' | 'cargo' | 'apt';
  cwd?: string;
}

export interface InstallDepResult {
  success: boolean;
  installed: string[];
  failed: string[];
  output: string;
  error?: string;
}

export async function execute(input: InstallDepInput): Promise<InstallDepResult> {
  const installed: string[] = [];
  const failed: string[] = [];
  const outputs: string[] = [];
  const cwd = input.cwd || process.cwd();

  for (const dep of input.dependencies) {
    try {
      let command = '';
      const pm = input.packageManager || detectPackageManager(cwd);
      switch (pm) {
        case 'npm':
          command = `npm install ${dep}`;
          break;
        case 'pip':
          command = `pip install ${dep}`;
          break;
        case 'cargo':
          command = `cargo add ${dep}`;
          break;
        default:
          command = `npm install ${dep}`;
      }
      const output = execSync(command, { encoding: 'utf-8', cwd, timeout: 120000 });
      installed.push(dep);
      outputs.push(output.slice(0, 500));
    } catch (e: any) {
      failed.push(dep);
      outputs.push(`安装 ${dep} 失败: ${e?.stderr || e?.message}`);
    }
  }

  return {
    success: failed.length === 0,
    installed,
    failed,
    output: outputs.join('\n---\n'),
  };
}

function detectPackageManager(cwd: string): 'npm' | 'pip' | 'cargo' | 'apt' {
  if (fs.existsSync(path.join(cwd, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'requirements.txt'))) return 'pip';
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'cargo';
  return 'npm';
}
