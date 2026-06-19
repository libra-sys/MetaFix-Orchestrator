import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function isGitRepo(cwd: string): boolean {
  return fs.existsSync(path.join(cwd, '.git'));
}

export function getCurrentBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: cwd || process.cwd() }).trim();
  } catch {
    return 'main';
  }
}

export function getLastCommitMessage(cwd: string): string {
  try {
    return execSync('git log -1 --pretty=%B', { encoding: 'utf-8', cwd: cwd || process.cwd() }).trim();
  } catch {
    return '';
  }
}

export function createBranch(branchName: string, cwd: string): string {
  try {
    execSync(`git checkout -b ${branchName}`, { encoding: 'utf-8', cwd: cwd || process.cwd() });
    return `分支 ${branchName} 创建成功`;
  } catch (e: any) {
    return `分支创建失败: ${e?.stderr || e?.message}`;
  }
}

export function commitAll(message: string, cwd: string): string {
  try {
    execSync('git add -A', { encoding: 'utf-8', cwd: cwd || process.cwd() });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', cwd: cwd || process.cwd() });
    return `提交成功: ${message}`;
  } catch (e: any) {
    return `提交失败: ${e?.stderr || e?.message}`;
  }
}

export function pushBranch(branchName: string, remote: string, cwd: string): string {
  try {
    execSync(`git push ${remote} ${branchName}`, { encoding: 'utf-8', cwd: cwd || process.cwd() });
    return `推送成功: ${branchName}`;
  } catch (e: any) {
    return `推送失败: ${e?.stderr || e?.message}`;
  }
}

export function getRepoInfo(cwd: string): { owner: string; repo: string; url: string } | null {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: cwd || process.cwd() }).trim();
    const match = url.match(/github\.com[/:]([^/]+)\/([^/]+)(?:\.git)?/);
    if (match) return { owner: match[1], repo: match[2].replace(/\.git$/, ''), url };
    return null;
  } catch {
    return null;
  }
}
