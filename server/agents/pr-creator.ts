import { execSync } from 'child_process';
import { complete } from '../llm/client.js';
import { getRepoInfo } from '../utils/git-utils.js';

export interface PrCreateResult {
  success: boolean;
  prUrl?: string;
  branchName: string;
  title: string;
  body: string;
  error?: string;
}

export async function createPullRequest(
  issueUrl: string,
  issueTitle: string,
  fixDescription: string,
  cwd: string
): Promise<PrCreateResult> {
  const repo = getRepoInfo(cwd);
  if (!repo) {
    return { success: false, branchName: '', title: '', body: '', error: '无法获取 Git 仓库信息' };
  }

  const branchName = `metafix/fix-${Date.now()}`;

  // 1. 创建分支
  try {
    execSync(`git checkout -b ${branchName}`, { encoding: 'utf-8', cwd });
  } catch (e: any) {
    return { success: false, branchName, title: '', body: '', error: `创建分支失败: ${e?.message}` };
  }

  // 2. 提交修改
  try {
    execSync('git add -A', { encoding: 'utf-8', cwd });
    execSync(`git commit -m "fix: ${issueTitle.replace(/"/g, '\\"')}"`, { encoding: 'utf-8', cwd });
  } catch (e: any) {
    return { success: false, branchName, title: '', body: '', error: `提交失败: ${e?.message}` };
  }

  // 3. 推送到远程
  try {
    execSync(`git push origin ${branchName}`, { encoding: 'utf-8', cwd, timeout: 60000 });
  } catch (e: any) {
    return { success: false, branchName, title: '', body: '', error: `推送失败: ${e?.message}` };
  }

  // 4. 生成 PR 标题和描述
  const systemPrompt = `你是一个专业的 PR 描述撰写者。根据 Issue 和修复内容，生成清晰的 PR 标题和描述。
输出严格 JSON：{"title": "...", "body": "..."}`;
  const userPrompt = `Issue: ${issueTitle}\n修复描述: ${fixDescription}\n\n请生成 PR 标题和 Markdown 描述。`;

  let title = `fix: ${issueTitle}`;
  let body = `修复了 ${issueUrl}\n\n${fixDescription}`;
  try {
    const response = await complete({ system: systemPrompt, user: userPrompt, jsonMode: true, temperature: 0.3 });
    const parsed = JSON.parse(response);
    title = parsed.title || title;
    body = parsed.body || body;
  } catch { /* ignore */ }

  // 5. 创建 PR（通过 GitHub CLI 或 API）
  let prUrl: string | undefined;
  try {
    // 尝试使用 gh CLI
    const result = execSync(
      `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${getCurrentBranch(cwd)}`,
      { encoding: 'utf-8', cwd, timeout: 60000 }
    );
    const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
    if (urlMatch) prUrl = urlMatch[0];
  } catch {
    // gh CLI 不可用，尝试通过 API
    prUrl = await createPrViaApi(repo.owner, repo.repo, title, body, branchName, getCurrentBranch(cwd));
  }

  return {
    success: !!prUrl,
    prUrl,
    branchName,
    title,
    body,
    error: prUrl ? undefined : 'PR 创建失败，请手动创建',
  };
}

async function createPrViaApi(
  owner: string, repo: string, title: string, body: string, head: string, base: string
): Promise<string | undefined> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return undefined;

  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ title, body, head, base }),
    });
    if (!resp.ok) return undefined;
    const data = await resp.json() as any;
    return data.html_url;
  } catch {
    return undefined;
  }
}

function getCurrentBranch(cwd: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd }).trim();
  } catch {
    return 'main';
  }
}
