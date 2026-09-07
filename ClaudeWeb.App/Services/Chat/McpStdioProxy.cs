using System.Diagnostics;
using System.Text.Json;

namespace ClaudeWeb.Services.Chat;

/// <summary>Stdio bridge for servers that need conflicting environment values.
/// Reads the runner's private config file; credentials never appear in argv.
/// Runs before WinForms/HTTP startup when invoked with --mcp-stdio-proxy.</summary>
public static class McpStdioProxy
{
    public static ProcessStartInfo CreateProcessInfo(string configPath, string serverName)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(configPath));
        var server = doc.RootElement.GetProperty("mcpServers").GetProperty(serverName);
        var psi = new ProcessStartInfo
        {
            FileName = server.GetProperty("command").GetString()!, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
        };
        if (server.TryGetProperty("args", out var args))
            foreach (var arg in args.EnumerateArray()) psi.ArgumentList.Add(arg.GetString()!);
        if (server.TryGetProperty("env", out var env))
            foreach (var pair in env.EnumerateObject()) psi.Environment[pair.Name] = pair.Value.GetString();
        if (server.TryGetProperty("cwd", out var cwd)) psi.WorkingDirectory = cwd.GetString();
        return psi;
    }

    public static async Task<int> RunAsync(string configPath, string serverName)
    {
        using var child = new Process { StartInfo = CreateProcessInfo(configPath, serverName) };
        child.Start();
        using var stop = new CancellationTokenSource();
        async Task Input()
        {
            try { await Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream, stop.Token); child.StandardInput.Close(); }
            catch (OperationCanceledException) { }
            catch (IOException) { }
        }
        var input = Input();
        var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
        var error = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
        try
        {
            await child.WaitForExitAsync();
            await Task.WhenAll(output, error);
            return child.ExitCode;
        }
        finally
        {
            stop.Cancel();
            if (!child.HasExited) child.Kill(entireProcessTree: true);
            // The console input may remain open after the MCP child exits. Do not
            // wait on that inherited handle; process exit closes it.
            _ = input;
        }
    }
}
