FROM node:20-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制依赖文件（利用 Docker 缓存）
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY tsconfig.json tsconfig.node.json ./

# 安装依赖
RUN npm install --legacy-peer-deps

# 复制源代码
COPY . .

# 构建前端和后端
RUN npm run build

# ========================================
# 生产阶段
# ========================================
FROM node:20-alpine

WORKDIR /app

# 仅复制生产依赖
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

# 从构建阶段复制构建产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/public ./dist/server/public

# 创建数据目录
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 启动服务
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/chat.db
ENV VECTOR_DB_PATH=/app/data/vectors.db

CMD ["node", "dist/server/index.js"]
