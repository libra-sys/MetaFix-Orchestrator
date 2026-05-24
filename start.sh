#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "================================"
echo "  MetaFix Orchestrator - 启动脚本"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[错误] 未检测到 Node.js，请先安装 Node.js 18+${NC}"
    echo "下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}[警告] 建议使用 Node.js 18+，当前版本: $(node -v)${NC}"
fi

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo -e "${GREEN}[安装] 首次运行，正在安装依赖...${NC}"
    npm install --legacy-peer-deps
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}[配置] 未找到 .env 文件，正在从模板创建...${NC}"
    cp .env.example .env
    echo -e "${YELLOW}[提示] 请编辑 .env 文件，填写 CODEBUDDY_API_KEY 等必要配置${NC}"
    echo "配置文件路径: $(pwd)/.env"
    ${EDITOR:-nano} .env
fi

echo -e "${GREEN}[构建] 正在构建项目...${NC}"
npm run build

echo ""
echo "================================"
echo -e "  ${GREEN}构建完成！正在启动服务...${NC}"
echo "  访问地址: http://localhost:3000"
echo "  按 Ctrl+C 停止服务"
echo "================================"
echo ""

export NODE_ENV=production
npm start
