---
name: add-management-pages
overview: 为 MetaFix Orchestrator 补齐缺失的管理页面：Skills 管理、MCP 管理、SubAgent 管理、API Key 配置增强。先补齐后端 API，再构建设计独特的高质量前端页面。
design:
  architecture:
    framework: react
    component: tdesign
  styleKeywords:
    - Dark theme
    - Developer tools
    - Indigo accent
    - Flat layout
    - Professional
    - Linear-inspired
  fontSystem:
    fontFamily: Inter
    heading:
      size: 16px
      weight: 600
    subheading:
      size: 14px
      weight: 500
    body:
      size: 13px
      weight: 400
  colorSystem:
    primary:
      - "#6366f1"
      - "#818cf8"
      - "#4f46e5"
    background:
      - "#0d0d0f"
      - "#16161a"
      - "#1c1c21"
    text:
      - "#f4f4f5"
      - "#a1a1aa"
      - "#71717a"
    functional:
      - "#22c55e"
      - "#ef4444"
      - "#eab308"
todos:
  - id: backend-skills-api
    content: 在 server/index.ts 新增 DELETE /api/skills/:id 和 GET /api/skills/search 路由
    status: completed
  - id: backend-mcp-api
    content: 在 server/index.ts 新增 GET /api/mcp/status 和 POST /api/mcp/toggle 路由，包装 mcp/manager.ts 函数
    status: completed
  - id: backend-subagents-api
    content: 在 server/index.ts 新增 GET /api/agents 和 PATCH /api/agents/:id/toggle 路由
    status: completed
  - id: frontend-types-hooks
    content: 新增 src/types.ts 中的 McpServer/SubAgent 类型，创建 useMcp.ts 和 useSubAgents.ts hooks
    status: completed
  - id: frontend-skills-page
    content: 使用 [skill:Impeccable（前端设计工具集）] 创建 SkillsPage.tsx（列表 + 搜索 + 创建/删除技能）
    status: completed
    dependencies:
      - backend-skills-api
      - frontend-types-hooks
  - id: frontend-mcp-page
    content: 使用 [skill:Impeccable（前端设计工具集）] 创建 McpPage.tsx（4 服务器状态卡片 + 启停开关）
    status: completed
    dependencies:
      - backend-mcp-api
      - frontend-types-hooks
  - id: frontend-subagents-page
    content: 使用 [skill:Impeccable（前端设计工具集）] 创建 SubAgentsPage.tsx（分组列表 + 状态切换）
    status: completed
    dependencies:
      - backend-subagents-api
      - frontend-types-hooks
  - id: frontend-sidebar-app
    content: 修改 Sidebar.tsx 新增管理导航区，修改 App.tsx 扩展 pageView 路由集成三个新页面
    status: completed
    dependencies:
      - frontend-skills-page
      - frontend-mcp-page
      - frontend-subagents-page
  - id: rebuild-verify
    content: 重新编译后端，重新构建前端，启动服务器验证所有管理页面功能正常
    status: completed
    dependencies:
      - frontend-sidebar-app
---

## 用户需求

为 MetaFix Orchestrator 补齐前端缺失的管理功能页面，包括技能管理（Skills）、MCP 配置、子智能体管理（SubAgents）。同时补齐后端缺失的 API 路由，使所有管理页面有坚实的数据层支撑。扩展 Sidebar 导航系统，形成完整的后台管理体验。

## 产品概述

MetaFix Orchestrator 是端到端自动化修复代码缺陷的 AI Agent 系统。当前前端仅具备聊天界面和基础设置页（API Key 配置 + Agent 管理），缺少对核心平台资源（技能、MCP 服务器、子智能体）的管理能力。

## 核心功能

### 1. 技能管理页面 (SkillsPage)

- 展示所有技能列表（名称、描述、版本、作者、来源、成功率）
- 从后端 `GET /api/skills` 加载数据，支持搜索过滤
- 创建新技能（名称、描述、版本、所需 MCP 列表）
- 删除技能（确认弹窗）
- 技能状态指示（成功率进度条）

### 2. MCP 配置页面 (McpPage)

- 展示 4 个 MCP 服务器状态（filesystem/git/github/logging）
- 运行状态指示灯（绿色运行/灰色停止/红色错误）
- 启停按钮（单服务器启动/停止）
- 服务器详情（命令行、参数、环境变量）
- 从后端 `GET /api/mcp/status` 和 `POST /api/mcp/toggle` 获取数据

### 3. 子智能体管理页面 (SubAgentsPage)

- 展示 8 个预制子智能体列表（名称、类型标签、描述、状态）
- 按类型分组（analysis/fix/delivery）
- 启用/禁用按钮
- 子智能体详情（描述、类型、状态）
- 从后端 `GET /api/agents` 加载数据

### 4. Sidebar 导航扩展

- 新增"管理"分区（分隔线 + 标题）
- 三个新导航项：Skills、MCP、SubAgents
- 激活态高亮样式与会话列表一致

### 5. 后端 API 补齐

- Skills: `DELETE /api/skills/:id`, `GET /api/skills/search?q=xxx`
- MCP: `GET /api/mcp/status`, `POST /api/mcp/toggle`
- SubAgents: `GET /api/agents`, `PATCH /api/agents/:id/toggle`

## 技术栈

- 前端框架：React 18 + TypeScript + TDesign React
- 状态管理：React hooks（useState + useCallback + useEffect）
- HTTP 请求：fetch API
- 后端框架：Express + TypeScript + SQLite (better-sqlite3)
- 设计系统：TDesign CSS 变量 + Tailwind 辅助类

## 实现方案

### 策略

采用分模块并行开发：后端 API → 前端 hooks → 前端页面 → Sidebar 集成。每个管理页面遵循「hook 管理数据 → 页面组件渲染」的架构模式，与现有 SettingsPage 一致。

### 后端 API 新增路由

在 `server/index.ts` 中添加以下路由：

**Skills 扩展**

- `DELETE /api/skills/:id` — 从 SQLite 删除技能记录
- `GET /api/skills/search?q=xxx` — 按名称模糊搜索技能

**MCP 管理**

- `GET /api/mcp/status` — 调用 `getMcpServerStatuses()` 返回所有服务器状态
- `POST /api/mcp/toggle` — body `{ name, action: 'start'|'stop' }` 启停服务器

**SubAgent 管理**

- `GET /api/agents` — 查询 `sub_agents` 表返回全部记录（id, name, type, description, status）
- `PATCH /api/agents/:id/toggle` — 切换 status (active/inactive)

### 前端架构

**App.tsx 改动**

- `pageView` 类型从 `'chat' | 'settings'` 扩展为 `'chat' | 'settings' | 'skills' | 'mcp' | 'subagents'`
- 新增 `isManagementPage` 派生状态，用于 Header 标题切换
- 新增对应页面组件的条件渲染分支

**Sidebar 改动**

- SidebarProps 新增 `currentPage` prop 替代 `isSettingsPage`
- 新增 `onNavigate` 回调 prop 替代独立的 `onOpenSettings`
- 新增管理导航区块（分隔线 + Skills/MCP/SubAgents 三个按钮）
- 激活态根据 `currentPage` 值匹配

**新 Hooks**

- `useMcp.ts` — 管理 MCP 服务器状态（fetchStatus, toggleServer, startAll, stopAll）
- `useSubAgents.ts` — 管理子智能体列表（fetchAgents, toggleAgent）

**新页面组件**

- `SkillsPage.tsx` — TDesign Table + Form/Dialog + Search
- `McpPage.tsx` — 自定义状态卡片布局 + Button toggle
- `SubAgentsPage.tsx` — TDesign Tag 分类 + Switch toggle

### 性能摘要

- Skills 列表支持前端搜索过滤（降低 API 调用频率）
- MCP 状态页面初始加载后每 10 秒轮询刷新
- SubAgent 列表一次性加载，toggle 后局部更新而不重取全量

## 目录结构

```
e:\MetaFix Orchestrator\
├── server/
│   └── index.ts                    # [MODIFY] 新增 6 个 API 路由
├── src/
│   ├── App.tsx                     # [MODIFY] 扩展 pageView，新增页面渲染分支
│   ├── Sidebar.tsx                 # [MODIFY] 新增管理导航区块
│   ├── Header.tsx                  # [MODIFY] 适配 currentPage 标题
│   ├── SkillsPage.tsx              # [NEW] 技能管理页
│   ├── McpPage.tsx                 # [NEW] MCP 配置页
│   ├── SubAgentsPage.tsx           # [NEW] 子智能体管理页
│   ├── hooks/
│   │   ├── useMcp.ts               # [NEW] MCP 状态管理 hook
│   │   └── useSubAgents.ts         # [NEW] 子智能体管理 hook
│   └── types.ts                    # [MODIFY] 新增 McpServer、SubAgent 类型
```

## 关键代码结构

**SidebarProps 接口改动**

```typescript
type PageView = 'chat' | 'settings' | 'skills' | 'mcp' | 'subagents';

interface SidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  currentPage: PageView;
  sidebarOpen: boolean;
  agents: Agent[];
  getAgent: (id: string) => Agent | undefined;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onNavigate: (page: PageView) => void;  // 统一导航回调
}
```

**McpServer 类型**

```typescript
interface McpServer {
  name: string;
  command: string;
  args: string[];
  running: boolean;
  enabled: boolean;
  pid?: number;
  error?: string;
}
```

## 设计风格

采用**专业开发者工具**美学，深色主题为主调，以紫色/靛蓝为品牌色系。整体风格偏向 **Linear/Figma** 式的克制精致——高对比度的深色背景、细腻的边框分隔、精准的间距节奏。避免卡片泛滥，使用扁平分区设计让信息密度适中。Typography 使用系统优选字体（Inter/SF Mono），数字和状态标识清晰。

## 三页面差异化设计

### Skills 管理页

- 顶部搜索栏 + 创建按钮，采用 TDesign Table 组件
- 成功率列使用进度条 + 百分比数字，绿色（高）/ 黄色（中）/ 红色（低）三级着色
- 新建技能弹窗：Form 表单，Version 字段带 placeholder 提示

### MCP 配置页

- 4 个服务器卡片横排（2列网格），每张卡片内：图标 + 名称 + 状态灯 + 启停开关
- 运行中用绿色脉冲动画灯，停止中灰色静态灯，错误红色灯 + 错误信息
- 卡片底部展示命令行和参数（等宽字体，可复制）

### SubAgents 管理页

- 按 type 分组（analysis / fix / delivery），每组用 Tag 区分颜色
- 列表布局：名称 + 描述 + 状态 Switch + 类型 Tag
- 禁用状态整行半透明，视觉上与启用状态区分

## 动效

- 页面切换：轻微 fade-in 过渡（200ms ease-out）
- MCP 状态灯：运行中 pulse 动画（2s infinite）
- 按钮 hover：scale(1.02) + 阴影抬升

## 字体

- 标题：Inter 600 weight，16px/14px
- 正文：Inter 400，13px，行高 1.5
- 等宽：JetBrains Mono / SF Mono，12px

## 色彩

- 主背景：深灰黑 #0d0d0f
- 面板背景：#16161a
- 边框：rgba(255,255,255,0.06)
- 品牌色：靛蓝 #6366f1
- 成功绿：#22c55e，错误红：#ef4444，警告黄：#eab308

## Agent Extensions

### Skill

- **Impeccable（前端设计工具集）**
- Purpose：指导三大管理页面的视觉设计，确保每个页面有独特的专业质感，避免泛AI审美
- Expected outcome：产出的页面组件具有 Linear/Figma 式开发者工具美学，深色主题、精密间距、清晰的视觉层级

### SubAgent

- **code-explorer**
- Purpose：在实现后端 API 路由时，快速定位 server/index.ts 中现有路由的插入位置、检查 db.ts 中相关函数签名
- Expected outcome：准确找到代码插入点，确保新增路由与现有路由风格一致