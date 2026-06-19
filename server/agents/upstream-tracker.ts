import { execSync } from 'child_process';

export interface UpstreamDiff {
  upstreamUrl: string;
  aheadBy: number;
  behindBy: number;
  divergedFiles: string[];
  apiChanges: ApiChange[];
}

export interface ApiChange {
  file: string;
  changeType: 'added' | 'removed' | 'modified';
  signature: string;
  impact: 'breaking' | 'non-breaking';
}

export function getUpstreamInfo(cwd: string): { upstreamUrl: string; branch: string } | null {
  try {
    const url = execSync('git remote get-url upstream', { encoding: 'utf-8', cwd }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd }).trim();
    return { upstreamUrl: url, branch };
  } catch {
    try {
      const url = execSync('git remote get-url origin', { encoding: 'utf-8', cwd }).trim();
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd }).trim();
      return { upstreamUrl: url, branch };
    } catch {
      return null;
    }
  }
}

export function compareWithUpstream(cwd: string): UpstreamDiff | null {
  const upstream = getUpstreamInfo(cwd);
  if (!upstream) return null;

  try {
    execSync('git fetch upstream', { encoding: 'utf-8', cwd, timeout: 30000 });
  } catch {
    try { execSync('git fetch origin', { encoding: 'utf-8', cwd, timeout: 30000 }); } catch { /* ignore */ }
  }

  let aheadBy = 0;
  let behindBy = 0;
  try {
    const revList = execSync(`git rev-list --left-right --count upstream/${upstream.branch}...HEAD`, { encoding: 'utf-8', cwd }).trim().split('\t');
    behindBy = parseInt(revList[0] || '0', 10);
    aheadBy = parseInt(revList[1] || '0', 10);
  } catch {
    try {
      const revList = execSync(`git rev-list --left-right --count origin/${upstream.branch}...HEAD`, { encoding: 'utf-8', cwd }).trim().split('\t');
      behindBy = parseInt(revList[0] || '0', 10);
      aheadBy = parseInt(revList[1] || '0', 10);
    } catch { /* ignore */ }
  }

  let divergedFiles: string[] = [];
  try {
    divergedFiles = execSync(`git diff --name-only upstream/${upstream.branch}...HEAD || git diff --name-only origin/${upstream.branch}...HEAD`,
      { encoding: 'utf-8', cwd }).trim().split('\n').filter(f => f);
  } catch { /* ignore */ }

  return {
    upstreamUrl: upstream.upstreamUrl,
    aheadBy,
    behindBy,
    divergedFiles,
    apiChanges: detectApiChanges(cwd, upstream.branch),
  };
}

function detectApiChanges(cwd: string, branch: string): ApiChange[] {
  const changes: ApiChange[] = [];
  try {
    const diff = execSync(`git diff upstream/${branch}...HEAD -- '*.ts' '*.js' '*.py' '*.cpp' '*.h' '*.java' '*.go' || git diff origin/${branch}...HEAD -- '*.ts' '*.js' '*.py' '*.cpp' '*.h' '*.java' '*.go'`,
      { encoding: 'utf-8', cwd, timeout: 30000 });

    const lines = diff.split('\n');
    let currentFile = '';
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        const match = line.match(/b\/(\S+)/);
        if (match) currentFile = match[1];
      }
      if (line.startsWith('+') && !line.startsWith('+++') && (line.includes('function') || line.includes('def ') || line.includes('class '))) {
        changes.push({ file: currentFile, changeType: 'added', signature: line.slice(1).trim(), impact: 'non-breaking' });
      }
      if (line.startsWith('-') && !line.startsWith('---') && (line.includes('function') || line.includes('def ') || line.includes('class '))) {
        changes.push({ file: currentFile, changeType: 'removed', signature: line.slice(1).trim(), impact: 'breaking' });
      }
    }
  } catch { /* ignore */ }

  return changes;
}
