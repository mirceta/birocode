using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Git;

/// <summary>
/// Snapshot/restore operations backed by git, run inside
/// <see cref="AppConfig.WorkingDirectory"/> via <see cref="Process.Start(ProcessStartInfo)"/>
/// (same redirected-stdout spawn pattern as ClaudeMonitor's CLI runner).
///
/// The working directory is read per-request (never cached) because the
/// operator can change it at runtime.
/// </summary>
public partial class GitService
{
    private readonly AppConfig _config;
    private readonly Logger _logger;

    /// <summary>Field delimiter for `git log` output -- avoids JSON-escaping issues.</summary>
    private const string Delimiter = "|||";

    /// <summary>Max history entries returned.</summary>
    private const int HistoryLimit = 50;

    [GeneratedRegex("^[0-9a-f]{7,40}$")]
    private static partial Regex CommitHashRegex();

    public GitService(AppConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    public sealed record SaveResult(string Hash, string Message, bool NoChanges);
    public sealed record HistoryEntry(string Hash, string Date, string Message);

    /// <summary>
    /// Stages everything and commits. Uses the provided message or an
    /// auto-generated "Save yyyy-MM-dd HH:mm" when none is given. Returns a
    /// result with NoChanges=true when the working tree is clean.
    /// </summary>
    public SaveResult Save(string? message)
    {
        var commitMessage = string.IsNullOrWhiteSpace(message)
            ? $"Save {DateTime.Now:yyyy-MM-dd HH:mm}"
            : message.Trim();

        RunGit("add -A");

        // Detect a clean tree first so "nothing to commit" is not treated as an error.
        var status = RunGit("status --porcelain");
        if (string.IsNullOrWhiteSpace(status.StdOut))
        {
            _logger.Info("[GIT] Save -> nothing to commit");
            return new SaveResult("", commitMessage, NoChanges: true);
        }

        var commit = RunGit("commit -m", commitMessage);
        if (commit.ExitCode != 0)
            throw new InvalidOperationException(
                $"git commit failed (exit {commit.ExitCode}): {FirstLine(commit.StdErr, commit.StdOut)}");

        var hash = RunGit("rev-parse HEAD").StdOut.Trim();
        _logger.Info($"[GIT] Save -> {Short(hash)} \"{commitMessage}\"");
        return new SaveResult(hash, commitMessage, NoChanges: false);
    }

    /// <summary>Returns the most recent commits (newest first, capped at 50).</summary>
    public IReadOnlyList<HistoryEntry> History()
    {
        var result = RunGit($"log -n {HistoryLimit} --format=%H{Delimiter}%ci{Delimiter}%s");
        if (result.ExitCode != 0)
        {
            // No commits yet (or not a repo) -> empty history rather than an error.
            _logger.Info("[GIT] History -> no commits");
            return Array.Empty<HistoryEntry>();
        }

        var entries = new List<HistoryEntry>();
        using var reader = new StringReader(result.StdOut);
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var parts = line.Split(Delimiter);
            if (parts.Length < 3) continue;
            entries.Add(new HistoryEntry(parts[0], parts[1], parts[2]));
        }

        _logger.Info($"[GIT] History -> {entries.Count} entries");
        return entries;
    }

    /// <summary>
    /// Restores working-tree files to the given commit WITHOUT moving HEAD
    /// (`git checkout &lt;hash&gt; -- .`). The hash is validated against
    /// ^[0-9a-f]{7,40}$ before being passed to git.
    /// </summary>
    public string Restore(string? hash)
    {
        if (string.IsNullOrWhiteSpace(hash) || !CommitHashRegex().IsMatch(hash))
            throw new ArgumentException("Invalid commit hash");

        var result = RunGit($"checkout {hash} -- .");
        if (result.ExitCode != 0)
            throw new InvalidOperationException(
                $"git checkout failed (exit {result.ExitCode}): {FirstLine(result.StdErr, result.StdOut)}");

        _logger.Info($"[GIT] Restore -> {Short(hash)}");
        return hash;
    }

    // --- process plumbing ----------------------------------------------------

    private sealed record GitOutput(int ExitCode, string StdOut, string StdErr);

    /// <summary>
    /// Runs `git &lt;arguments&gt;` in the current working directory with stdout/stderr
    /// redirected. Extra <paramref name="literalArgs"/> are passed via the
    /// ArgumentList so values (e.g. commit messages) need no manual quoting/escaping.
    /// </summary>
    private GitOutput RunGit(string arguments, params string[] literalArgs)
    {
        var workingDir = _config.WorkingDirectory;

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

        if (!string.IsNullOrEmpty(workingDir) && Directory.Exists(workingDir))
            psi.WorkingDirectory = workingDir;

        // Split the space-separated argument string into individual tokens so
        // each is passed as a distinct argument (no shell involved).
        foreach (var token in arguments.Split(' ', StringSplitOptions.RemoveEmptyEntries))
            psi.ArgumentList.Add(token);
        foreach (var arg in literalArgs)
            psi.ArgumentList.Add(arg);

        using var process = new Process { StartInfo = psi };
        process.Start();

        var stdout = process.StandardOutput.ReadToEnd();
        var stderr = process.StandardError.ReadToEnd();
        process.WaitForExit();

        return new GitOutput(process.ExitCode, stdout, stderr);
    }

    private static string Short(string hash) => hash.Length >= 7 ? hash[..7] : hash;

    private static string FirstLine(string primary, string fallback)
    {
        var text = !string.IsNullOrWhiteSpace(primary) ? primary : fallback;
        var line = text.Split('\n').FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
        return (line ?? "").Trim();
    }
}
