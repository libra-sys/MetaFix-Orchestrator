@echo off
chcp 65001 > nul
echo ================================
echo  MetaFix Orchestrator - 启动脚本
echo ================================
echo.

REM 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查依赖
if not exist "node_modules\" (
    echo [安装] 首次运行，正在安装依赖（可能需要几分钟）...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

REM 检查 .env 文件
if not exist ".env" (
    echo [配置] 未找到 .env 文件，正在从模板创建...
    copy .env.example .env
    echo [提示] 请编辑 .env 文件，填写 CODEBUDDY_API_KEY 等必要配置
    echo        配置文件路径: %cd%\.env
    notepad .env
)

echo [构建] 正在构建项目...
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 构建失败
    pause
    exit /b 1
)

echo.
echo ================================
echo  构建完成！正在启动服务...
echo  访问地址: http://localhost:3000
echo  按 Ctrl+C 停止服务
echo ================================
echo.

set NODE_ENV=production
call npm start
