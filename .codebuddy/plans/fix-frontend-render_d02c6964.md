---
name: fix-frontend-render
overview: 修复前端页面无法渲染的问题：重建前端（新的App.tsx匹配组件props）、重编译后端、清理旧构建文件、重启服务器验证
todos:
  - id: clean-old-artifacts
    content: 清理 dist/server/public/ 旧构建产物和 node_modules/.vite 缓存
    status: completed
  - id: rebuild-frontend
    content: 执行 npx vite build 重新构建前端到 server/public/
    status: completed
    dependencies:
      - clean-old-artifacts
  - id: recompile-backend
    content: 执行 npx tsc -p tsconfig.node.json 重新编译后端 server/index.ts
    status: completed
  - id: restart-server-verify
    content: 杀旧 node 进程，以 NODE_ENV=production 启动 server/index.js，验证 localhost:3000 正常渲染
    status: completed
    dependencies:
      - rebuild-frontend
      - recompile-backend
---

## 用户需求

修复 MetaFix Orchestrator 前端页面无法渲染的问题，清理旧构建产物，重新构建前后端，生产模式启动服务器，验证浏览器访问 `localhost:3000` 能正常显示完整页面。

## 核心功能

- 清理 `dist/server/public/` 目录中的旧构建产物（避免干扰）
- 重新构建前端：Vite 构建输出到 `server/public/`，生成新的 JS/CSS 文件
- 重新编译后端：`tsc -p tsconfig.node.json` 将修改后的 `server/index.ts` 编译为 `server/index.js`
- 生产模式启动服务器：`$env:NODE_ENV="production"; node server/index.js`
- 验证页面正常渲染，控制台无 Error

## 技术栈

- 前端框架：React 18 + TypeScript + TDesign React
- 构建工具：Vite 5（输出到 `server/public/`）
- 后端框架：Express + TypeScript（ESNext 模块）
- 编译工具：tsc（`tsconfig.node.json`，输出 `.js` 与 `.ts` 同目录）

## 实现方案

### 策略

分四步执行：清理旧产物 → 构建前端 → 编译后端 → 启动验证。每步完成后检查结果，失败则报告错误并修复。

### 关键配置

1. **Vite 构建** (`vite.config.ts`)：`outDir: path.resolve(__dirname, 'server', 'public')`，`emptyOutDir: true`，自动清空并输出 HTML/JS/CSS
2. **TypeScript 编译** (`tsconfig.node.json`)：`module: "ESNext"`，`target: "ES2020"`，`downlevelIteration: true`，编译 `server/**/*.ts` 输出 `.js` 同目录
3. **静态文件服务** (`server/index.ts` 第 840-851 行)：`publicDir = path.resolve(__dirname, 'public')`，`express.static(publicDir)` + SPA 回退
4. **服务器端口**：3000（可通过 `PORT` 环境变量覆盖）

### 验证标准

- `server/public/index.html` 引用新的 JS hash 文件（非 `index-BnMSIgsg.js`）
- 命令行输出 `[Server] 生产模式：服务静态文件 E:\...\server\public`
- 浏览器访问 `http://localhost:3000` 显示完整 React 页面
- 浏览器控制台无 Error（允许有 antd 相关的 warning）