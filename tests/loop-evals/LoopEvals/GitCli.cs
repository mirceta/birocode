using System.Diagnostics;
using System.Text;

namespace ClaudeWeb.LoopEvals;

/// <summary>
/// Minimal git process runner for the eval harness (clone/verify/commit/diff on
/// scratch clones). Arguments go through ArgumentList — no shell, no quoting.
/// </summary>
public static class GitCli
{
    public sealed record Result(int ExitCode, string StdOut, string StdErr)
    {
        public bool Ok => ExitCode == 0;
    }

    public static Result Run(string workingDir, params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "git",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        psi.Environment["GIT_TERMINAL_PROMPT"] = "0";
        if (!string.IsNullOrEmpty(workingDir))
            psi.WorkingDirectory = workingDir;
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var p = new Process { StartInfo = psi };
        p.Start();
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        p.WaitForExit();
        return new Result(p.ExitCode, stdout, stderr);
    }

    /// <summary>Run and throw with context on non-zero exit.</summary>
    public static string Must(string workingDir, params string[] args)
    {
        var r = Run(workingDir, args);
        if (!r.Ok)
            throw new InvalidOperationException(
                $"git {string.Join(' ', args)} failed (exit {r.ExitCode}): {FirstLine(r.StdErr, r.StdOut)}");
        return r.StdOut;
    }

    private static string FirstLine(string a, string b)
    {
        var s = string.IsNullOrWhiteSpace(a) ? b : a;
        var nl = s.IndexOf('\n');
        return (nl >= 0 ? s[..nl] : s).Trim();
    }
}
