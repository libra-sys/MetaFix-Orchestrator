import * as db from '../db.js';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface ApprovalCheck {
  action: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  reason: string;
}

const HIGH_RISK_PATTERNS = [
  { pattern: /rm\s+-rf\s+\//i, risk: 'critical', reason: '尝试删除根目录' },
  { pattern: /mkfs/i, risk: 'critical', reason: '尝试格式化磁盘' },
  { pattern: /dd\s+if=/i, risk: 'critical', reason: '尝试直接写入磁盘' },
  { pattern: /:\(\)\{\s*:\|:&\s*\};/, risk: 'critical', reason: 'Fork 炸弹' },
  { pattern: />\s*\/dev\/sda/, risk: 'critical', reason: '尝试覆盖磁盘' },
  { pattern: /curl\s+.*\|\s*sh/i, risk: 'high', reason: '管道执行远程脚本' },
  { pattern: /wget\s+.*\|\s*sh/i, risk: 'high', reason: '管道执行远程脚本' },
  { pattern: /eval\s*\(/i, risk: 'high', reason: '执行动态代码' },
  { pattern: /powershell\s+-enc/i, risk: 'high', reason: '执行编码后的 PowerShell' },
  { pattern: /git\s+push\s+--force/i, risk: 'high', reason: '强制推送可能覆盖历史' },
  { pattern: /git\s+reset\s+--hard/i, risk: 'high', reason: '硬重置可能丢失代码' },
];

export function checkCommandRisk(command: string): ApprovalCheck {
  for (const check of HIGH_RISK_PATTERNS) {
    if (check.pattern.test(command)) {
      return { action: command, riskLevel: check.risk as RiskLevel, requiresApproval: true, reason: check.reason };
    }
  }
  return { action: command, riskLevel: 'low', requiresApproval: false, reason: '常规命令' };
}

export function checkFileWriteRisk(filePath: string): ApprovalCheck {
  const criticalPaths = ['/etc/', '/usr/', '/bin/', '/sbin/', '/lib/', '/sys/', '/proc/', 'C:\\Windows'];
  for (const cp of criticalPaths) {
    if (filePath.includes(cp)) {
      return { action: `write ${filePath}`, riskLevel: 'critical', requiresApproval: true, reason: `尝试写入系统路径: ${cp}` };
    }
  }
  return { action: `write ${filePath}`, riskLevel: 'low', requiresApproval: false, reason: '常规文件写入' };
}

export function checkGitRisk(action: string): ApprovalCheck {
  if (action.includes('push') || action.includes('force')) {
    return { action, riskLevel: 'high', requiresApproval: true, reason: 'Git 推送操作影响远程仓库' };
  }
  if (action.includes('reset') || action.includes('revert')) {
    return { action, riskLevel: 'medium', requiresApproval: true, reason: 'Git 历史修改操作' };
  }
  return { action, riskLevel: 'low', requiresApproval: false, reason: '常规 Git 操作' };
}

export function shouldRequireApproval(riskLevel: RiskLevel): boolean {
  return riskLevel === 'high' || riskLevel === 'critical';
}
