using System.Diagnostics;
using System.Text;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.LoopEvals;

/// <summary>One commit of a repo copy's history, with the files it touched —
/// the association target for curation (turns ↔ commits).</summary>
public sealed record CurationCommit(string Sha, string DateIso, string Subject, IReadOnlyList<string> Files);

/// <summary>One conversation turn with its stable index — the association source.</summary>
public sealed record CurationTurn(int Index, string Role, string Text, DateTime? Timestamp);

/// <summary>
/// Read-only queries behind the loop-evals curation UI (spec: golden examples are
/// curated from a repo copy and a stored conversation; curation never mutates its
/// sources). Conversations come from the selected repo's stored CLI sessions
/// (<see cref="SessionService"/>); commits come from an arbitrary repo-copy path
/// supplied by the Operator.
/// </summary>
public sealed class CurationService
{
    private readonly SessionService _sessions;
    private readonly Logger _logger;

    public CurationService(SessionService sessions, Logger logger)
    {
        _sessions = sessions;
        _logger = logger;
    }

    public List<SessionSummary> ListConversations(string repoPath) => _sessions.ListSessions(repoPath);

    public List<CurationTurn> GetTurns(string repoPath, string sessionId)
    {
        if (!IsSafeSessionId(sessionId))
            throw new ArgumentException("invalid session id");
        return _sessions.GetMessages(repoPath, sessionId)
            .Select((m, i) => new CurationTurn(i, m.Role, m.Text, m.Timestamp))
            .ToList();
    }

    /// <summary>Newest-first commit history of the repo copy, each with its files
    /// touched (`git log --name-only`).</summary>
    public IReadOnlyList<CurationCommit> ListCommits(string repoCopyPath, int limit = 200)
    {
        ValidateRepoCopy(repoCopyPath);
        limit = Math.Clamp(limit, 1, 1000);

        // @@@-marker format keeps the parse unambiguous vs file-name lines.
        var output = GitRun.Must(repoCopyPath,
            "log", $"-n{limit}", "--name-only", "--format=@@@%H|%cI|%s");

        var commits = new List<CurationCommit>();
        string? sha = null, date = null, subject = null;
        var files = new List<string>();
        void Flush()
        {
            if (sha is not null) commits.Add(new CurationCommit(sha, date!, subject!, files.ToArray()));
            files.Clear();
        }
        foreach (var raw in output.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            if (line.StartsWith("@@@", StringComparison.Ordinal))
            {
                Flush();
                var parts = line[3..].Split('|', 3);
                sha = parts[0];
                date = parts.Length > 1 ? parts[1] : "";
                subject = parts.Length > 2 ? parts[2] : "";
            }
            else if (!string.IsNullOrWhiteSpace(line) && sha is not null)
            {
                files.Add(line.Trim());
            }
        }
        Flush();

        _logger.Info($"[LOOPEVALS] ListCommits({repoCopyPath}) -> {commits.Count}");
        return commits;
    }

    public static void ValidateRepoCopy(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("repo copy path is required");
        var full = Path.GetFullPath(path);
        if (!Directory.Exists(full))
            throw new ArgumentException($"repo copy path does not exist: {full}");
        if (!Directory.Exists(Path.Combine(full, ".git")) && !File.Exists(Path.Combine(full, ".git")))
            throw new ArgumentException($"not a git repository (no .git): {full}");
    }

    public static bool IsSafeSessionId(string id) =>
        !string.IsNullOrWhiteSpace(id) && id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '.');
}

/// <summary>
/// Minimal git spawn helper for the loop-evals module (same redirected-stdout
/// pattern as <see cref="Git.GitService"/>, whose runner is private). Arguments go
/// through ArgumentList, so paths and SHAs need no quoting.
/// </summary>
public static class GitRun
{
    public static string Must(string workingDir, params string[] args)
    {
        var (exit, stdout, stderr) = Run(workingDir, args);
        if (exit != 0)
            throw new InvalidOperationException(
                $"git {string.Join(' ', args)} failed (exit {exit}): {stderr.Trim()}");
        return stdout;
    }

    public static (int ExitCode, string StdOut, string StdErr) Run(string workingDir, params string[] args)
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
        foreach (var a in args) psi.ArgumentList.Add(a);
        if (!string.IsNullOrEmpty(workingDir) && Directory.Exists(workingDir))
            psi.WorkingDirectory = workingDir;

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException("failed to start git");
        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();
        return (process.ExitCode, stdout, stderr);
    }
}
