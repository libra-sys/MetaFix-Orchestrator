// MetaFix Orchestrator - Windows Launcher (C# 5.0 compatible)
// 编译: csc /target:winexe /out:MetaFix-Orchestrator.exe launcher.cs
// 功能: 双击启动服务器，自动打开浏览器

using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Threading;

class Launcher
{
    [DllImport("user32.dll")]
    static extern IntPtr MessageBox(IntPtr hWnd, string text, string caption, uint type);

    [DllImport("shell32.dll")]
    static extern IntPtr ShellExecute(IntPtr hwnd, string operation, string file, string parameters, string directory, int showCmd);

    static readonly string APP_NAME = "MetaFix Orchestrator";
    static readonly int PORT = 3000;

    static void Main()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');

        // 构建 node.exe 路径
        string nodeExe = Path.Combine(exeDir, "node.exe");
        string serverJs = Path.Combine(exeDir, "dist", "server", "index.cjs");
        string serverJsAlt = Path.Combine(exeDir, "server", "index.js");

        // 检查 node.exe 是否存在
        if (!File.Exists(nodeExe))
        {
            string msg = "未找到 node.exe！\n\n请确保以下文件存在:\n" + nodeExe + "\n\n或将 Node.js 安装到系统中。";
            MessageBox(IntPtr.Zero, msg, APP_NAME + " - 错误", 0x10);
            return;
        }

        // 确定服务器文件
        string serverFile = File.Exists(serverJs) ? serverJs : serverJsAlt;
        if (!File.Exists(serverFile))
        {
            string msg = "未找到服务器入口文件！\n\n期望路径:\n" + serverJs + "\n或\n" + serverJsAlt;
            MessageBox(IntPtr.Zero, msg, APP_NAME + " - 错误", 0x10);
            return;
        }

        // 设置环境变量（子进程会继承）
        // 注意：SetEnvironmentVariable 需要管理员权限才能永久设置，这里用 ProcessStartInfo.EnvironmentVariables

        // 显示启动提示
        string startMsg = APP_NAME + " 正在启动...\n\n将在浏览器中打开 http://localhost:" + PORT.ToString();
        MessageBox(IntPtr.Zero, startMsg, APP_NAME, 0x40);

        // 启动 node 进程（后台运行）
        var processStartInfo = new ProcessStartInfo();
        processStartInfo.FileName = nodeExe;
        processStartInfo.Arguments = "\"" + serverFile + "\"";
        processStartInfo.WorkingDirectory = exeDir;
        processStartInfo.CreateNoWindow = true;
        processStartInfo.UseShellExecute = false;
        processStartInfo.RedirectStandardOutput = true;
        processStartInfo.RedirectStandardError = true;
        // 设置环境变量
        processStartInfo.EnvironmentVariables["NODE_ENV"] = "production";
        processStartInfo.EnvironmentVariables["PORT"] = PORT.ToString();

        Process serverProcess = null;
        try
        {
            serverProcess = Process.Start(processStartInfo);
            if (serverProcess == null)
            {
                MessageBox(IntPtr.Zero, "启动服务器失败！", APP_NAME + " - 错误", 0x10);
                return;
            }
        }
        catch (Exception ex)
        {
            string errMsg = "启动服务器失败！\n\n" + ex.Message;
            MessageBox(IntPtr.Zero, errMsg, APP_NAME + " - 错误", 0x10);
            return;
        }

        // 等待服务器启动（最多 30 秒）
        bool serverReady = false;
        for (int i = 0; i < 30; i++)
        {
            Thread.Sleep(1000);
            try
            {
                using (var client = new HttpClient())
                {
                    var response = client.GetAsync("http://localhost:" + PORT.ToString() + "/api/health").Result;
                    if (response.IsSuccessStatusCode)
                    {
                        serverReady = true;
                        break;
                    }
                }
            }
            catch
            {
                // 继续等待
            }
        }

        if (!serverReady)
        {
            string timeoutMsg = APP_NAME + " 启动超时！\n\n请检查端口 " + PORT.ToString() + " 是否被占用。";
            MessageBox(IntPtr.Zero, timeoutMsg, APP_NAME + " - 警告", 0x30);
        }

        // 打开浏览器
        ShellExecute(IntPtr.Zero, "open", "http://localhost:" + PORT.ToString() + "/", null, null, 1);

        // 显示运行状态
        string runningMsg = APP_NAME + " 已启动！\n\n浏览器已打开 http://localhost:" + PORT.ToString() + "\n\n关闭此窗口不会停止服务器。\n要停止服务器，请结束 node.exe 进程。";
        MessageBox(IntPtr.Zero, runningMsg, APP_NAME, 0x40);

        // 保持进程监控（可选）
        if (serverProcess != null)
        {
            serverProcess.WaitForExit();
        }
    }
}
