using System.Diagnostics;
using System.Text;

namespace ClaudeWeb.Services.Accounts;

/// <summary>
/// Tiny read-only process helper shared by the account probes
/// (openspec add-account-status). Resolves a CLI on PATH ourselves (so "not
/// installed" is an explicit, fast answer rather than a spawn exception) and runs
/// it with a hard timeout and redirected output — the same spawn shape as
/// <c>GitService.RunGit</c>, never a shell, never an interactive prompt.
/// </summary>
public static class ProcessProbe
{
    /// <summary>Result of a bounded process run. <paramref name="TimedOut"/> is set
    /// when the child overran the timeout (and was killed); callers treat that as a
    /// non-authenticated / unreachable outcome rather than a hang.</summary>
    public sealed record Result(int ExitCode, string StdOut, string StdErr, bool TimedOut);

    /// <summary>
    /// Resolves <paramref name="baseName"/> (e.g. <c>gh</c>, <c>claude</c>) to a real
    /// file on PATH, or null when it is not installed. On Windows we try the common
    /// launcher extensions; on Unix the bare name. Returns the full path so the
    /// caller spawns it directly (no PATH-resolution ambiguity under
    /// <c>UseShellExecute=false</c>).
    /// </summary>
    public static string? ResolveOnPath(string baseName)
    {
        var candidates = OperatingSystem.IsWindows()
            ? new[] { baseName + ".exe", baseName + ".cmd", baseName + ".bat", baseName }
            : new[] { baseName };

        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);

        foreach (var dir in dirs)
        {
            var d = dir.Trim();
            if (d.Length == 0) continue;
            foreach (var name in candidates)
            {
                try
                {
                    var full = Path.Combine(d, name);
                    if (File.Exists(full)) return full;
                }
                catch { /* malformed PATH entry — skip */ }
            }
        }
        return null;
    }

    /// <summary>
    /// Runs <paramref name="filePath"/> with <paramref name="args"/> (each passed via
    /// ArgumentList — no quoting needed), redirecting stdout/stderr, with a hard
    /// <paramref name="timeoutMs"/>. Never throws for a normal non-zero exit; a spawn
    /// failure surfaces as a TimedOut=false result with a non-zero exit and the
    /// exception text in StdErr so callers can degrade to a typed status.
    /// </summary>
    public static Result Run(string filePath, IReadOnlyList<string> args, int timeoutMs)
    {
        var psi = new ProcessStartInfo
        {
            FileName = filePath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        // gh shells out to git for some calls — never let either block on an
        // interactive credential prompt; we want a fast, definitive answer.
        psi.Environment["GIT_TERMINAL_PROMPT"] = "0";
        foreach (var a in args) psi.ArgumentList.Add(a);

        try
        {
            using var process = new Process { StartInfo = psi };
            process.Start();

            // Read both streams asynchronously so a chatty child cannot deadlock
            // against a full pipe while we wait on the timeout.
            var outTask = process.StandardOutput.ReadToEndAsync();
            var errTask = process.StandardError.ReadToEndAsync();

            if (!process.WaitForExit(timeoutMs))
            {
                try { process.Kill(entireProcessTree: true); } catch { /* already gone */ }
                return new Result(-1, string.Empty, "timed out", TimedOut: true);
            }

            // Ensure async stream readers have drained after exit.
            process.WaitForExit();
            return new Result(process.ExitCode, outTask.Result ?? string.Empty, errTask.Result ?? string.Empty, TimedOut: false);
        }
        catch (Exception ex)
        {
            return new Result(-1, string.Empty, ex.Message, TimedOut: false);
        }
    }
}
