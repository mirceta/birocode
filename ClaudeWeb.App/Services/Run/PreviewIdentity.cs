using System.Diagnostics;
using System.Management;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Run;

/// <summary>
/// Answers "which Repo's Product is the process currently listening on the
/// Preview Port?" (see plans/preview-identity.md). The harness never starts
/// Products itself, so this inspects the OS: netstat finds the listening PID,
/// WMI provides its command line, and a Repo claims the process when its
/// registered folder path appears in that command line (or exe path).
///
/// Results are cached briefly: the App tab polls, and netstat/WMI are not free.
/// </summary>
public static class PreviewIdentity
{
    public sealed record Identity(
        bool Running,
        int? Pid,
        string? ProcessName,
        string? RepoId,
        string? RepoName,
        bool IsSelf);

    private static readonly object Gate = new();
    private static Identity? _cached;
    private static DateTime _cachedAt;
    private static int _cachedPort;
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(5);

    public static Identity Resolve(int port, IReadOnlyList<RepositoryRegistry.RepositoryInfo> repos)
    {
        lock (Gate)
        {
            if (_cached is not null && _cachedPort == port && DateTime.UtcNow - _cachedAt < Ttl)
                return _cached;
        }

        var identity = ResolveUncached(port, repos);

        lock (Gate)
        {
            _cached = identity;
            _cachedAt = DateTime.UtcNow;
            _cachedPort = port;
        }
        return identity;
    }

    private static Identity ResolveUncached(int port, IReadOnlyList<RepositoryRegistry.RepositoryInfo> repos)
    {
        var pid = FindListeningPid(port);
        if (pid is null)
            return new Identity(false, null, null, null, null, false);

        string? processName = null;
        try { processName = Process.GetProcessById(pid.Value).ProcessName; }
        catch { /* exited between netstat and lookup */ }

        var haystack = Normalize($"{GetCommandLine(pid.Value)} {GetExecutablePath(pid.Value)}");

        foreach (var repo in repos)
        {
            if (string.IsNullOrWhiteSpace(repo.Path)) continue;
            if (haystack.Contains(Normalize(repo.Path), StringComparison.OrdinalIgnoreCase))
                return new Identity(true, pid, processName, repo.Id, repo.Name, repo.IsSelf);
        }

        return new Identity(true, pid, processName, null, null, false);
    }

    /// <summary>Lower-case, forward slashes — so path containment matching is style-agnostic.</summary>
    private static string Normalize(string s) => s.Replace('\\', '/').ToLowerInvariant();

    /// <summary>Parses `netstat -ano -p tcp` for a LISTENING entry on the port.</summary>
    private static int? FindListeningPid(int port)
    {
        try
        {
            var psi = new ProcessStartInfo("netstat", "-ano -p tcp")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            using var proc = Process.Start(psi);
            if (proc is null) return null;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(5000);

            var suffix = ":" + port;
            foreach (var line in output.Split('\n'))
            {
                var cols = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                // TCP  0.0.0.0:5200  0.0.0.0:0  LISTENING  16996
                if (cols.Length >= 5
                    && cols[0] == "TCP"
                    && cols[1].EndsWith(suffix, StringComparison.Ordinal)
                    && cols[3] == "LISTENING"
                    && int.TryParse(cols[4], out var pid))
                    return pid;
            }
        }
        catch { /* netstat unavailable — treat as not running */ }
        return null;
    }

    private static string GetCommandLine(int pid)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT CommandLine FROM Win32_Process WHERE ProcessId = {pid}");
            foreach (var obj in searcher.Get())
                return obj["CommandLine"]?.ToString() ?? "";
        }
        catch { /* WMI unavailable or access denied */ }
        return "";
    }

    private static string GetExecutablePath(int pid)
    {
        try { return Process.GetProcessById(pid).MainModule?.FileName ?? ""; }
        catch { return ""; } // elevated process or exited
    }
}
