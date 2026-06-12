using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Git;

/// <summary>
/// Snapshot/restore operations backed by git, run inside the selected
/// repository's folder via <see cref="Process.Start(ProcessStartInfo)"/>
/// (same redirected-stdout spawn pattern as ClaudeMonitor's CLI runner).
///
/// The working directory is supplied per-call by the controller (resolved from
/// the selected repository), never cached.
/// </summary>
public partial class GitService
{
    private readonly Logger _logger;

    /// <summary>Field delimiter for `git log` output -- avoids JSON-escaping issues.</summary>
    private const string Delimiter = "|||";

    /// <summary>Max history entries returned.</summary>
    private const int HistoryLimit = 50;

    [GeneratedRegex("^[0-9a-f]{7,40}$")]
    private static partial Regex CommitHashRegex();

    public GitService(Logger logger)
    {
        _logger = logger;
    }

    public sealed record SaveResult(string Hash, string Message, bool NoChanges);
    public sealed record HistoryEntry(string Hash, string Date, string Message);

    /// <summary>
    /// Stages everything and commits. Uses the provided message or an
    /// auto-generated "Save yyyy-MM-dd HH:mm" when none is given. Returns a
    /// result with NoChanges=true when the working tree is clean.
    /// </summary>
    public SaveResult Save(string workingDir, string? message)
    {
        var commitMessage = string.IsNullOrWhiteSpace(message)
            ? $"Save {DateTime.Now:yyyy-MM-dd HH:mm}"
            : message.Trim();

        RunGit(workingDir, "add -A");

        // Detect a clean tree first so "nothing to commit" is not treated as an error.
        var status = RunGit(workingDir, "status --porcelain");
        if (string.IsNullOrWhiteSpace(status.StdOut))
        {
            _logger.Info("[GIT] Save -> nothing to commit");
            return new SaveResult("", commitMessage, NoChanges: true);
        }

        var commit = RunGit(workingDir, "commit -m", commitMessage);
        if (commit.ExitCode != 0)
            throw new InvalidOperationException(
                $"git commit failed (exit {commit.ExitCode}): {FirstLine(commit.StdErr, commit.StdOut)}");

        var hash = RunGit(workingDir, "rev-parse HEAD").StdOut.Trim();
        _logger.Info($"[GIT] Save -> {Short(hash)} \"{commitMessage}\"");
        return new SaveResult(hash, commitMessage, NoChanges: false);
    }

    /// <summary>Returns the most recent commits (newest first, capped at 50).</summary>
    public IReadOnlyList<HistoryEntry> History(string workingDir)
    {
        var result = RunGit(workingDir, $"log -n {HistoryLimit} --format=%H{Delimiter}%ci{Delimiter}%s");
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
    public string Restore(string workingDir, string? hash)
    {
        if (string.IsNullOrWhiteSpace(hash) || !CommitHashRegex().IsMatch(hash))
            throw new ArgumentException("Invalid commit hash");

        var result = RunGit(workingDir, $"checkout {hash} -- .");
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
    private GitOutput RunGit(string workingDir, string arguments, params string[] literalArgs)
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
        // Never let git block on an interactive credential prompt -- fail fast
        // so API calls (e.g. status?fetch=true) cannot hang the request.
        psi.Environment["GIT_TERMINAL_PROMPT"] = "0";

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

    public sealed record StatusFile(string Path, string Index, string Worktree, bool Untracked, bool Conflicted);
    public sealed record StatusResult(
        string Branch, string? Upstream, int Ahead, int Behind, IReadOnlyList<StatusFile> Files,
        bool Fetched, string? FetchError,
        string? BaseBranch, int BaseAhead, int BaseBehind,
        string? LocalBaseBranch, string? OriginBaseBranch, int OriginBaseAhead, int OriginBaseBehind,
        int BaseDriftAhead, int BaseDriftBehind, DateTime? FetchedAt);

    /// <summary>
    /// Read-only working-tree status (plans/git-tab.md): current branch,
    /// upstream + ahead/behind, and the changed/untracked/conflicted paths.
    /// Parses `git status --porcelain=v2 --branch`.
    /// With <paramref name="fetch"/> (plans/git-origin-sync.md) a `git fetch`
    /// runs first so ahead/behind reflects the real origin; a failed fetch is
    /// reported via FetchError rather than failing the status call.
    /// </summary>
    public StatusResult Status(string workingDir, bool fetch = false)
    {
        var fetched = false;
        string? fetchError = null;
        if (fetch)
        {
            var f = RunGit(workingDir, "fetch --quiet");
            if (f.ExitCode == 0) fetched = true;
            else
            {
                fetchError = FirstLine(f.StdErr, f.StdOut);
                _logger.Error($"[GIT] Fetch failed: {fetchError}");
            }
        }

        var result = RunGit(workingDir, "status --porcelain=v2 --branch");
        if (result.ExitCode != 0)
            throw new InvalidOperationException(
                $"git status failed (exit {result.ExitCode}): {FirstLine(result.StdErr, result.StdOut)}");

        string branch = "unknown";
        string? upstream = null;
        int ahead = 0, behind = 0;
        var files = new List<StatusFile>();

        using var reader = new StringReader(result.StdOut);
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (line.StartsWith("# branch.head "))
                branch = line["# branch.head ".Length..].Trim();
            else if (line.StartsWith("# branch.upstream "))
                upstream = line["# branch.upstream ".Length..].Trim();
            else if (line.StartsWith("# branch.ab "))
            {
                // "# branch.ab +1 -0"
                var parts = line["# branch.ab ".Length..].Split(' ', StringSplitOptions.RemoveEmptyEntries);
                foreach (var p in parts)
                {
                    if (p.StartsWith('+') && int.TryParse(p[1..], out var a)) ahead = a;
                    else if (p.StartsWith('-') && int.TryParse(p[1..], out var b)) behind = b;
                }
            }
            else if (line.StartsWith("1 ") || line.StartsWith("2 "))
            {
                // "1 XY sub mH mI mW hH hI path" / "2 XY ... path\torigPath"
                var parts = line.Split(' ', line.StartsWith("1 ") ? 9 : 10);
                if (parts.Length < 9) continue;
                var xy = parts[1];
                var path = parts[^1];
                if (line.StartsWith("2 "))
                {
                    var tab = path.IndexOf('\t');
                    if (tab >= 0) path = path[..tab]; // new name of a rename
                }
                files.Add(new StatusFile(path,
                    Index: xy[0].ToString(), Worktree: xy[1].ToString(),
                    Untracked: false, Conflicted: false));
            }
            else if (line.StartsWith("u "))
            {
                // unmerged: "u XY sub m1 m2 m3 mW h1 h2 h3 path"
                var parts = line.Split(' ', 11);
                if (parts.Length < 11) continue;
                files.Add(new StatusFile(parts[^1], Index: parts[1][0].ToString(),
                    Worktree: parts[1][1].ToString(), Untracked: false, Conflicted: true));
            }
            else if (line.StartsWith("? "))
            {
                files.Add(new StatusFile(line[2..], Index: ".", Worktree: ".",
                    Untracked: true, Conflicted: false));
            }
        }

        var (baseBranch, baseAhead, baseBehind) = CompareToBase(workingDir, branch);
        var origin = CompareToOriginBase(workingDir, branch);

        _logger.Info($"[GIT] Status -> {branch} (+{ahead}/-{behind}), {files.Count} change(s){(fetched ? ", fetched" : "")}"
            + (baseBranch is null ? "" : $", vs {baseBranch} +{baseAhead}/-{baseBehind}")
            + (origin.OriginBase is null ? "" : $", vs {origin.OriginBase} +{origin.Ahead}/-{origin.Behind}, base drift +{origin.DriftAhead}/-{origin.DriftBehind}"));
        return new StatusResult(branch, upstream, ahead, behind, files, fetched, fetchError,
            baseBranch, baseAhead, baseBehind,
            origin.LocalBase, origin.OriginBase, origin.Ahead, origin.Behind,
            origin.DriftAhead, origin.DriftBehind, FetchHeadTime(workingDir));
    }

    /// <summary>
    /// Origin-aware positions (plans/git-origin-visibility.md): HEAD vs the
    /// remote-tracking base (origin/main|master), and local base vs origin
    /// base ("drift" — a stale local main made 'ahead of main' a lie on
    /// 2026-06-12). Local and origin bases are detected independently.
    /// Values reflect the locally-known origin refs; a fetch refreshes them.
    /// </summary>
    private (string? LocalBase, string? OriginBase, int Ahead, int Behind, int DriftAhead, int DriftBehind)
        CompareToOriginBase(string workingDir, string branch)
    {
        string? localBase = null;
        foreach (var c in new[] { "main", "master" })
            if (RunGit(workingDir, $"rev-parse --verify --quiet refs/heads/{c}").ExitCode == 0)
            {
                localBase = c;
                break;
            }
        string? originBase = null;
        foreach (var c in new[] { "origin/main", "origin/master" })
            if (RunGit(workingDir, $"rev-parse --verify --quiet refs/remotes/{c}").ExitCode == 0)
            {
                originBase = c;
                break;
            }

        var (ahead, behind) = (0, 0);
        if (originBase is not null && branch is not "unknown" and not "(detached)")
            (ahead, behind) = CountLeftRight(workingDir, originBase, "HEAD");

        var (driftAhead, driftBehind) = (0, 0);
        if (originBase is not null && localBase is not null)
            (driftAhead, driftBehind) = CountLeftRight(workingDir, originBase, localBase);

        return (localBase, originBase, ahead, behind, driftAhead, driftBehind);
    }

    /// <summary>(right-only, left-only) of `rev-list --left-right --count L...R`
    /// — i.e. how far RIGHT is ahead/behind LEFT. (0,0) on any failure.</summary>
    private (int Ahead, int Behind) CountLeftRight(string workingDir, string leftRef, string rightRef)
    {
        var result = RunGit(workingDir, $"rev-list --left-right --count {leftRef}...{rightRef}");
        if (result.ExitCode != 0) return (0, 0);
        var parts = result.StdOut.Trim().Split('\t', ' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2
            || !int.TryParse(parts[0], out var leftOnly)
            || !int.TryParse(parts[1], out var rightOnly))
            return (0, 0);
        return (rightOnly, leftOnly);
    }

    /// <summary>When origin state was last fetched: .git/FETCH_HEAD's mtime,
    /// null when never fetched (or .git is not a plain directory).</summary>
    private static DateTime? FetchHeadTime(string workingDir)
    {
        try
        {
            var path = Path.Combine(workingDir, ".git", "FETCH_HEAD");
            return File.Exists(path) ? File.GetLastWriteTime(path) : null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Compares HEAD to the repo's main line (plans/git-main-compare.md).
    /// Base = first of local main, local master, origin/main, origin/master
    /// that exists. Returns (null, 0, 0) when on the base branch itself,
    /// detached, no base found, or the comparison fails.
    /// </summary>
    private (string? BaseBranch, int Ahead, int Behind) CompareToBase(string workingDir, string branch)
    {
        if (branch is "main" or "master" or "unknown" or "(detached)")
            return (null, 0, 0);

        string? baseRef = null;
        foreach (var candidate in new[] { "main", "master", "origin/main", "origin/master" })
        {
            if (RunGit(workingDir, $"rev-parse --verify --quiet refs/{(candidate.StartsWith("origin/") ? "remotes/" : "heads/")}{candidate}").ExitCode == 0)
            {
                baseRef = candidate;
                break;
            }
        }
        if (baseRef is null) return (null, 0, 0);

        var (aheadOfBase, behindBase) = CountLeftRight(workingDir, baseRef, "HEAD");
        return (baseRef, aheadOfBase, behindBase);
    }

    public sealed record PullBaseResult(string? BaseBranch, bool Ok, bool Updated, string? Error);

    /// <summary>
    /// Brings the local base branch (main, then master) up to date with origin
    /// (plans/agents-git-sync.md — the one UI-triggered git mutation). On the
    /// base branch itself: `git pull --ff-only`; otherwise
    /// `git fetch origin base:base`, which fast-forwards the local ref without
    /// touching the checkout. Git refuses the latter when the base is checked
    /// out in a sibling worktree — that surfaces as Error.
    /// </summary>
    public PullBaseResult PullBase(string workingDir)
    {
        string? baseRef = null;
        foreach (var candidate in new[] { "main", "master" })
        {
            if (RunGit(workingDir, $"rev-parse --verify --quiet refs/heads/{candidate}").ExitCode == 0)
            {
                baseRef = candidate;
                break;
            }
        }
        if (baseRef is null)
            return new PullBaseResult(null, false, false, "no local main/master branch");

        var before = RunGit(workingDir, $"rev-parse {baseRef}").StdOut.Trim();
        var branch = CurrentBranch(workingDir);
        var run = branch == baseRef
            ? RunGit(workingDir, "pull --ff-only")
            : RunGit(workingDir, $"fetch origin {baseRef}:{baseRef}");
        if (run.ExitCode != 0)
        {
            var error = FirstLine(run.StdErr, run.StdOut);
            _logger.Error($"[GIT] PullBase {baseRef} failed: {error}");
            return new PullBaseResult(baseRef, false, false, error);
        }

        var after = RunGit(workingDir, $"rev-parse {baseRef}").StdOut.Trim();
        var updated = after != before;
        _logger.Info($"[GIT] PullBase -> {baseRef} {(updated ? $"{Short(before)}..{Short(after)}" : "already up to date")}");
        return new PullBaseResult(baseRef, true, updated, null);
    }

    /// <summary>Returns the current branch name (or detached HEAD description).</summary>
    public string CurrentBranch(string workingDir)
    {
        var result = RunGit(workingDir, "rev-parse --abbrev-ref HEAD");
        return result.ExitCode == 0 ? result.StdOut.Trim() : "unknown";
    }

    private static string Short(string hash) => hash.Length >= 7 ? hash[..7] : hash;

    private static string FirstLine(string primary, string fallback)
    {
        var text = !string.IsNullOrWhiteSpace(primary) ? primary : fallback;
        var line = text.Split('\n').FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
        return (line ?? "").Trim();
    }
}
