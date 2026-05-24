// MetaFix Orchestrator - Windows Launcher
// 编译: gcc launcher.c -o MetaFix-Orchestrator.exe -mwindows -lst
// 或者: cl launcher.c /link user32.lib shell32.lib
//
// 功能: 双击启动服务器，自动打开浏览器

#include <windows.h>
#include <process.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define MAX_PATH_LEN 4096

// 获取当前 exe 所在目录
void get_exe_dir(char *buf, int bufsize) {
    char path[MAX_PATH_LEN];
    DWORD len = GetModuleFileNameA(NULL, path, MAX_PATH_LEN);
    // 找到最后一个反斜杠
    char *last_slash = strrbrk(path, "\\");
    if (last_slash) {
        int idx = (int)(last_slash - path + 1);
        if (idx < bufsize) {
            strncpy(buf, path, idx);
            buf[idx] = '\0';
        }
    }
}

// 启动进程
int start_process(const char *exe_path, const char *args, const char *workdir) {
    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    char cmdline[MAX_PATH_LEN];
    
    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;  // 隐藏子进程窗口
    
    memset(&pi, 0, sizeof(pi));
    
    snprintf(cmdline, sizeof(cmdline), "\"%s\" %s", exe_path, args);
    
    int ret = CreateProcessA(
        exe_path,
        cmdline,
        NULL, NULL,
        FALSE,
        0,
        NULL,
        workdir,
        &si,
        &pi
    );
    
    if (ret) {
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        return 1;
    }
    return 0;
}

// 打开浏览器
void open_browser(const char *url) {
    ShellExecuteA(NULL, "open", url, NULL, NULL, SW_SHOWNORMAL);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow) {
    char exedir[MAX_PATH_LEN];
    char node_path[MAX_PATH_LEN];
    char server_js_path[MAX_PATH_LEN];
    char env_var[256];
    
    get_exe_dir(exedir, MAX_PATH_LEN);
    
    // 构建 node.exe 路径: <exe_dir>\node.exe
    snprintf(node_path, sizeof(node_path), "%s\\node.exe", exedir);
    
    // 构建 server index.js 路径
    snprintf(server_js_path, sizeof(server_js_path), "%s\\dist\\server\\index.cjs", exedir);
    
    // 检查 node.exe 是否存在
    DWORD file_attr = GetFileAttributesA(node_path);
    if (file_attr == INVALID_FILE_ATTRIBUTES) {
        // 尝试找 server/index.js
        char alt_path[MAX_PATH_LEN];
        snprintf(alt_path, sizeof(alt_path), "%s\\server\\index.js", exedir);
        if (GetFileAttributesA(alt_path) != INVALID_FILE_ATTRIBUTES) {
            snprintf(server_js_path, sizeof(server_js_path), "%s\\server\\index.js", exedir);
        } else {
            char msg[1024];
            snprintf(msg, sizeof(msg), 
                "未找到 node.exe！\n\n请确保以下文件存在:\n%s\n\n或将 Node.js 安装在系统中并将 node.exe 所在目录添加到 PATH。", 
                node_path);
            MessageBoxA(NULL, msg, "MetaFix Orchestrator - 错误", MB_OK | MB_ICONERROR);
            return 1;
        }
    }
    
    // 设置环境变量 NODE_ENV=production
    SetEnvironmentVariableA("NODE_ENV", "production");
    
    // 显示启动提示
    MessageBoxA(NULL, 
        "MetaFix Orchestrator 正在启动...\n\n将在浏览器中打开 http://localhost:3000", 
        "MetaFix Orchestrator", MB_OK | MB_ICONINFORMATION);
    
    // 启动 node 服务器（后台运行）
    char args[MAX_PATH_LEN];
    snprintf(args, sizeof(args), "\"%s\"", server_js_path);
    
    if (!start_process(node_path, args, exedir)) {
        char errmsg[1024];
        DWORD err = GetLastError();
        snprintf(errmsg, sizeof(errmsg), "启动服务器失败！\n\n错误代码: %lu\n\n请检查 node.exe 和服务器文件是否存在。", err);
        MessageBoxA(NULL, errmsg, "MetaFix Orchestrator - 错误", MB_OK | MB_ICONERROR);
        return 1;
    }
    
    // 等待服务器启动（最多 30 秒）
    int attempts = 0;
    while (attempts < 30) {
        Sleep(1000);
        attempts++;
        
        // 尝试连接 localhost:3000
        HN INTERNET hSession = InternetOpenA("MetaFixLauncher/1.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hSession) {
            HN INTERNET hConnect = InternetConnectA(hSession, "localhost", 3000, NULL, NULL, INTERNET_SERVICE_HTTP, 0, 0);
            if (hConnect) {
                HN INTERNET hRequest = HttpOpenRequestA(hConnect, "GET", "/api/health", NULL, NULL, NULL, INTERNET_FLAG_RELOAD, 0);
                if (hRequest) {
                    if (HttpSendRequestA(hRequest, NULL, 0, NULL, 0)) {
                        // 服务器已启动
                        InternetCloseHandle(hRequest);
                        InternetCloseHandle(hConnect);
                        InternetCloseHandle(hSession);
                        break;
                    }
                    InternetCloseHandle(hRequest);
                }
                InternetCloseHandle(hConnect);
            }
            InternetCloseHandle(hSession);
        }
    }
    
    // 打开浏览器
    open_browser("http://localhost:3000");
    
    // 显示运行状态提示
    MessageBoxA(NULL, 
        "MetaFix Orchestrator 已启动！\n\n浏览器已打开 http://localhost:3000\n\n关闭此窗口不会停止服务器。\n要停止服务器，请按 Ctrl+C 关闭 Node.js 窗口。", 
        "MetaFix Orchestrator", MB_OK | MB_ICONINFORMATION);
    
    return 0;
}
