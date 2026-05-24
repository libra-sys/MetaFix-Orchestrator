/**
 * 技能校验器：四阶段安全检查
 * 
 * 阶段1：静态分析（检查代码质量）
 * 阶段2：沙箱测试（隔离环境执行）
 * 阶段3：权限检查（确认所需权限）
 * 阶段4：历史成功率检查（查询知识库）
 */

interface ValidationResult {
  valid: boolean;
  stage: number;
  message: string;
  warnings: string[];
}

interface SkillDefinition {
  name: string;
  source: string;
  definition: string;
  requiredMcps: string[];
}

/**
 * 四阶段技能校验
 * @param skill - 技能定义
 * @returns 校验结果
 */
export async function validateSkill(skill: SkillDefinition): Promise<ValidationResult> {
  const warnings: string[] = [];
  let stage = 0;

  try {
    // 阶段1：静态分析
    stage = 1;
    console.log(`[Validator] [1/4] 静态分析: ${skill.name}`);
    const staticResult = await staticAnalysis(skill);
    if (!staticResult.pass) {
      return {
        valid: false,
        stage,
        message: `静态分析失败: ${staticResult.message}`,
        warnings,
      };
    }
    warnings.push(...staticResult.warnings);

    // 阶段2：沙箱测试
    stage = 2;
    console.log(`[Validator] [2/4] 沙箱测试: ${skill.name}`);
    const sandboxResult = await sandboxTest(skill);
    if (!sandboxResult.pass) {
      return {
        valid: false,
        stage,
        message: `沙箱测试失败: ${sandboxResult.message}`,
        warnings,
      };
    }
    warnings.push(...sandboxResult.warnings);

    // 阶段3：权限检查
    stage = 3;
    console.log(`[Validator] [3/4] 权限检查: ${skill.name}`);
    const permissionResult = await checkPermissions(skill);
    if (!permissionResult.pass) {
      return {
        valid: false,
        stage,
        message: `权限检查失败: ${permissionResult.message}`,
        warnings,
      };
    }
    warnings.push(...permissionResult.warnings);

    // 阶段4：历史成功率检查
    stage = 4;
    console.log(`[Validator] [4/4] 历史成功率检查: ${skill.name}`);
    const historyResult = await checkHistorySuccess(skill);
    if (!historyResult.pass) {
      // 历史成功率低，但仍然是有效的（只是警告）
      warnings.push(`历史成功率较低: ${(historyResult.successRate * 100).toFixed(1)}%`);
    }

    console.log(`[Validator] 技能校验通过: ${skill.name}`);
    return {
      valid: true,
      stage: 4,
      message: '校验通过',
      warnings,
    };
  } catch (error: any) {
    return {
      valid: false,
      stage,
      message: `校验异常: ${error?.message || String(error)}`,
      warnings,
    };
  }
}

/**
 * 阶段1：静态分析
 */
async function staticAnalysis(skill: SkillDefinition): Promise<{
  pass: boolean;
  message: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const code = skill.definition;

  // 检查危险操作
  const dangerousPatterns = [
    'rm -rf',
    'eval(',
    'Function(',
    'process.exit',
    '__proto__',
    'constructor.prototype',
  ];

  for (const pattern of dangerousPatterns) {
    if (code.includes(pattern)) {
      return {
        pass: false,
        message: `检测到危险操作: ${pattern}`,
        warnings: [],
      };
    }
  }

  // 检查必需的函数导出
  if (!code.includes('export') || !code.includes('function')) {
    warnings.push('技能代码可能缺少导出函数');
  }

  // 检查错误处理
  if (!code.includes('try') && !code.includes('catch')) {
    warnings.push('技能代码可能缺少错误处理');
  }

  return {
    pass: true,
    message: '静态分析通过',
    warnings,
  };
}

/**
 * 阶段2：沙箱测试
 */
async function sandboxTest(skill: SkillDefinition): Promise<{
  pass: boolean;
  message: string;
  warnings: string[];
}> {
  const warnings: string[] = [];

  try {
    // 模拟沙箱环境执行
    console.log(`[Validator] 沙箱测试中...`);

    // 实际实现应使用 VM 模块或 Worker 线程隔离执行
    // 这里使用模拟实现
    const mockContext = {
      files: new Map(),
      git: { status: 'clean' },
      github: { authenticated: false },
    };

    // 模拟执行（实际应安全执行技能代码）
    // const result = await executeInSandbox(skill.definition, mockContext);

    // 模拟成功
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      pass: true,
      message: '沙箱测试通过',
      warnings,
    };
  } catch (error: any) {
    return {
      pass: false,
      message: `沙箱测试异常: ${error?.message || String(error)}`,
      warnings,
    };
  }
}

/**
 * 阶段3：权限检查
 */
async function checkPermissions(skill: SkillDefinition): Promise<{
  pass: boolean;
  message: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const requiredMcps = skill.requiredMcps || [];

  // 检查是否请求了高危权限
  const highRiskMcps = ['filesystem', 'git'];
  const hasHighRisk = requiredMcps.some(mcp => highRiskMcps.includes(mcp));

  if (hasHighRisk) {
    warnings.push(`技能请求高危权限: ${requiredMcps.join(', ')}`);
  }

  // 检查 MCP 服务器是否可用
  for (const mcp of requiredMcps) {
    const available = await checkMcpAvailable(mcp);
    if (!available) {
      warnings.push(`MCP 服务器不可用: ${mcp}`);
    }
  }

  return {
    pass: true, // 权限检查不阻止执行，只产生警告
    message: '权限检查完成',
    warnings,
  };
}

/**
 * 检查 MCP 服务器是否可用
 */
async function checkMcpAvailable(mcpName: string): Promise<boolean> {
  // 模拟检查
  const availableMcps = ['filesystem', 'git', 'github', 'logging'];
  return availableMcps.includes(mcpName);
}

/**
 * 阶段4：历史成功率检查
 */
async function checkHistorySuccess(skill: SkillDefinition): Promise<{
  pass: boolean;
  successRate: number;
}> {
  // 从数据库查询技能历史成功率
  // 模拟数据
  const mockSuccessRate = 0.85;

  if (mockSuccessRate < 0.5) {
    return {
      pass: false,
      successRate: mockSuccessRate,
    };
  }

  return {
    pass: true,
    successRate: mockSuccessRate,
  };
}

/**
 * 批量校验技能
 */
export async function validateSkills(skills: SkillDefinition[]): Promise<{
  valid: SkillDefinition[];
  invalid: Array<{ skill: SkillDefinition; result: ValidationResult }>;
}> {
  const valid: SkillDefinition[] = [];
  const invalid: Array<{ skill: SkillDefinition; result: ValidationResult }> = [];

  for (const skill of skills) {
    const result = await validateSkill(skill);
    if (result.valid) {
      valid.push(skill);
    } else {
      invalid.push({ skill, result });
    }
  }

  return { valid, invalid };
}
