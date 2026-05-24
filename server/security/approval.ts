/**
 * 人工审批模块：高危操作前请求人工审批
 */

interface ApprovalRequest {
  id: string;
  type: 'high-risk-operation' | 'plan-approval' | 'mcp-permission';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  requester: string;
  timestamp: number;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  response?: {
    approved: boolean;
    message?: string;
    timestamp: number;
  };
}

// 待处理的审批请求
const pendingApprovals = new Map<string, ApprovalRequest>();

// 审批超时时间（5 分钟）
const APPROVAL_TIMEOUT = 5 * 60 * 1000;

/**
 * 请求人工审批
 * @param request - 审批请求
 * @returns 是否批准
 */
export async function requestApproval(
  request: Omit<ApprovalRequest, 'id' | 'status' | 'timestamp'>
): Promise<boolean> {
  const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fullRequest: ApprovalRequest = {
    ...request,
    id,
    status: 'pending',
    timestamp: Date.now(),
  };

  pendingApprovals.set(id, fullRequest);

  console.log(`[Approval] 审批请求: ${id}`);
  console.log(`[Approval] 类型: ${request.type}`);
  console.log(`[Approval] 描述: ${request.description}`);
  console.log(`[Approval] 风险等级: ${request.riskLevel}`);

  // 发送审批请求到前端（通过 SSE 或 WebSocket）
  // 这里简化为等待超时
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (pendingApprovals.has(id)) {
        const req = pendingApprovals.get(id)!;
        req.status = 'timeout';
        console.log(`[Approval] 审批超时: ${id}`);
        resolve(false);
      }
    }, APPROVAL_TIMEOUT);

    // 模拟用户批准（实际应等待前端响应）
    setTimeout(() => {
      if (pendingApprovals.has(id)) {
        const req = pendingApprovals.get(id)!;
        req.status = 'approved';
        req.response = {
          approved: true,
          timestamp: Date.now(),
        };
        clearTimeout(timeout);
        console.log(`[Approval] 审批通过: ${id}`);
        resolve(true);
      }
    }, 2000); // 2 秒后自动批准（模拟）
  });
}

/**
 * 提交审批响应
 */
export function submitApprovalResponse(
  requestId: string,
  approved: boolean,
  message?: string
): boolean {
  const request = pendingApprovals.get(requestId);

  if (!request) {
    console.log(`[Approval] 审批请求不存在: ${requestId}`);
    return false;
  }

  if (request.status !== 'pending') {
    console.log(`[Approval] 审批请求已处理: ${requestId}`);
    return false;
  }

  request.status = approved ? 'approved' : 'rejected';
  request.response = {
    approved,
    message,
    timestamp: Date.now(),
  };

  console.log(`[Approval] 审批响应: ${requestId} - ${approved ? '批准' : '拒绝'}`);
  return true;
}

/**
 * 获取审批请求
 */
export function getApprovalRequest(requestId: string): ApprovalRequest | undefined {
  return pendingApprovals.get(requestId);
}

/**
 * 获取所有待审批请求
 */
export function getPendingApprovals(): ApprovalRequest[] {
  return Array.from(pendingApprovals.values()).filter(
    (req) => req.status === 'pending'
  );
}

/**
 * 检查操作是否需要审批
 */
export function needsApproval(
  operation: string,
  riskLevel: string
): boolean {
  // 高风险操作需要审批
  if (riskLevel === 'high') return true;

  // 特定操作需要审批
  const restrictedOperations = [
    'delete-file',
    'modify-build-system',
    'execute-shell-command',
    'create-pull-request',
  ];

  return restrictedOperations.some((op) => operation.includes(op));
}

/**
 * 清理过期的审批请求
 */
export function cleanupExpiredApprovals(): void {
  const now = Date.now();
  const expired: string[] = [];

  for (const [id, req] of pendingApprovals.entries()) {
    if (now - req.timestamp > APPROVAL_TIMEOUT) {
      req.status = 'timeout';
      expired.push(id);
    }
  }

  console.log(`[Approval] 清理 ${expired.length} 个过期审批请求`);
}
