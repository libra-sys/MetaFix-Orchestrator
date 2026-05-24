# MetaFix Orchestrator

端到端自动化修复代码缺陷的自主决策型 AI Agent 系统。

## 简介

MetaFix Orchestrator 是一个基于 CodeBuddy Agent SDK 构建的企业级智能缺陷修复系统。它能够自主完成从 Issue 分析、根因定位、代码修复、测试验证到创建 Pull Request 的完整闭环，无需人工干预。

## 架构

```
MetaFix Orchestrator
├── CLI 层         命令行交互（/fix、/analyze、/history）
├── Web 前端        React + TypeScript 可视化界面
├── Agent 核心层    感知 → 规划 → 执行 → 反思 自主循环
├── 技能系统       五级优先级技能解析与执行
├── 知识库         RAG 检索增强 + 向量数据库
└── 安全与成本     人工审批 + Token 预算控制
```

## 核心功能

### AI Agent 自主修复循环

| 阶段 | 模块 | 功能 |
|------|------|------|
| 感知 | `perception.ts` | 获取 Issue 详情、分析代码定位根因、检索相似历史 Issue |
| 规划 | `planner.ts` | 生成修复计划（3-5 步骤）、评估风险等级、估算成本 |
| 执行 | `executor.ts` | 按步骤执行修复、失败自动重试（最多 3 次）、创建 GitHub PR |
| 反思 | `reflector.ts` | 评估执行结果、更新技能成功率、生成经验教训 |

### 五级优先级技能解析

| 优先级 | 来源 | 描述 |
|--------|------|------|
| 1 | 预制子智能体 | 内置代码分析、修复、测试、PR 创建技能 |
| 2 | 本地缓存 | 从 `data/skills/` 加载已缓存技能 |
| 3 | 远程拉取 | 从技能注册中心拉取 |
| 4 | 自动创建 | 使用 CodeBuddy SDK 自动生成新技能 |
| 5 | 组合 | 将多个现有技能组合成新技能 |

### 知识库与 RAG

- 基于向量数据库的相似 Issue 检索
- 项目 Wiki 和规则自动加载
- 技能知识管理与持续更新

### 安全与成本控制

- 高风险操作人工审批（`security/approval.ts`）
- Token 消耗实时追踪（`cost/token-tracker.ts`）
- 预算上限自动控制（`cost/budget.ts`）

## 项目结构

```
MetaFix Orchestrator/
├── cli/                  # 命令行工具
│   └── commands/
│       ├── fix.ts        # /fix 命令：修复 Issue
│       ├── analyze.ts    # /analyze 命令：分析 Issue
│       └── history.ts    # /history 命令：查看历史
├── server/               # 后端服务（Express + TypeScript）
│   ├── index.ts          # 主入口，API 路由
│   ├── agents/           # Agent 核心模块
│   │   ├── controller.ts # Agent 主循环控制器
│   │   ├── perception.ts # 感知模块
│   │   ├── planner.ts    # 规划模块
│   │   ├── executor.ts   # 执行模块
│   │   └── reflector.ts  # 反思模块
│   ├── skills/           # 技能管理系统
│   ├── knowledge/        # 知识库与 RAG
│   ├── mcp/              # MCP 服务器管理
│   ├── cost/             # 成本控制
│   └── security/         # 安全与审批
├── src/                  # 前端（React + TypeScript）
│   ├── components/       # UI 组件
│   ├── hooks/            # React Hooks
│   ├── App.tsx           # 主应用
│   └── main.tsx          # 入口
├── data/                 # 数据目录
│   ├── chat.db           # SQLite 数据库
│   └── vectors.db        # 向量数据库
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 pnpm

### 安装

```bash
git clone https://github.com/libra-sys/MetaFix-Orchestrator.git
cd MetaFix-Orchestrator
npm install
```

### 配置

复制环境变量模板并填写必要配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下关键项：

| 变量 | 说明 | 必填 |
|------|------|------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | 是 |
| `GITHUB_OWNER` | 仓库所属用户/组织 | 是 |
| `GITHUB_REPO` | 仓库名称 | 是 |
| `CODEBUDDY_API_KEY` | CodeBuddy API Key | 是 |
| `SKILL_REGISTRY_URL` | 技能注册中心地址 | 否 |

### 启动开发环境

```bash
# 启动后端服务（端口 3000）
npm run server

# 另开终端，启动前端开发服务器（端口 5173）
npm run dev
```

### 构建生产版本

```bash
npm run build
npm run preview
```

### CLI 使用

```bash
# 分析 Issue（不执行修复）
npm run cli -- analyze --issue 123

# 修复 Issue
npm run cli -- fix --issue 123

# 查看修复历史
npm run cli -- history
```

## Web 界面功能

- **对话界面**：与 Agent 实时交互，查看修复进度
- **工具调用展示**：展开查看 Agent 每一步调用的工具和参数
- **权限确认对话框**：高风险操作需用户确认后执行
- **设置页面**：配置 GitHub 仓库、API Key 等参数
- **历史记录**：查看过往修复任务和结果

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agent/start` | 启动 Agent 修复任务 |
| POST | `/api/agent/stop` | 停止正在运行的任务 |
| GET | `/api/agent/status` | 查询 Agent 运行状态 |
| GET | `/api/knowledge/search` | RAG 知识库检索 |
| GET | `/api/skills` | 查询可用技能列表 |
| POST | `/api/permission/approve` | 审批通过 |
| POST | `/api/permission/reject` | 审批拒绝 |

## 技术栈

**后端**
- Express + TypeScript
- SQLite（会话与历史存储）
- Vector Database（知识库检索）
- CodeBuddy Agent SDK

**前端**
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Axios

**CLI**
- Commander.js
- Chalk（终端样式）

## License

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
