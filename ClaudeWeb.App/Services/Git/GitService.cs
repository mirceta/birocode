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

    /// <summary>The identity this repo's commits would be authored as (openspec
    /// add-git-identity-surface). <see cref="Scope"/> is "local" when it comes from
    /// the repo's own .git/config, "global" when it comes from an outer (user/system)
    /// config, and "unset" when no identity resolves (Name/Email then null).</summary>
    public sealed record CommitIdentity(string? Name, string? Email, string Scope);

    public sealed record StatusResult(
        string Branch, string? Upstream, int Ahead, int Behind, IReadOnlyList<StatusFile> Files,
        bool Fetched, string? FetchError,
        string? BaseBranch, int BaseAhead, int BaseBehind,
        string? LocalBaseBranch, string? OriginBaseBranch, int OriginBaseAhead, int OriginBaseBehind,
        int BaseDriftAhead, int BaseDriftBehind, DateTime? FetchedAt,
        CommitIdentity CommitIdentity);

    /// <summary>Effective commit identity for a repo, read-only. Scope is decided by
    /// asking the repo-local config first (a local user.* means a per-repo override);
    /// otherwise an effective value comes from an outer/global config. Any failure
    /// degrades to "unset" so it can never break the status call.</summary>
    private CommitIdentity ReadCommitIdentity(string workingDir)
    {
        try
        {
            var name = RunGit(workingDir, "config --get user.name").StdOut.Trim();
            var email = RunGit(workingDir, "config --get user.email").StdOut.Trim();
            if (name.Length == 0 && email.Length == 0)
                return new CommitIdentity(null, null, "unset");

            var localName = RunGit(workingDir, "config --local --get user.name").StdOut.Trim();
            var localEmail = RunGit(workingDir, "config --local --get user.email").StdOut.Trim();
            var scope = localName.Length > 0 || localEmail.Length > 0 ? "local" : "global";

            return new CommitIdentity(
                name.Length == 0 ? null : name,
                email.Length == 0 ? null : email,
                scope);
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Commit-identity read failed: {ex.Message}");
            return new CommitIdentity(null, null, "unset");
        }
    }

    /// <summary>Outcome of a commit-identity write: on success the re-read identity,
    /// otherwise <see cref="Error"/> carries the git failure. Shaped so the endpoint
    /// can return a typed result instead of throwing (openspec
    /// add-commit-identity-write).</summary>
    public sealed record SetIdentityResult(bool Ok, string? Name, string? Email, string Scope, string? Error);

    /// <summary>Writes this repo's commit identity (<c>user.name</c>/<c>user.email</c>) —
    /// the matching writer for <see cref="ReadCommitIdentity"/>. <paramref name="scope"/>
    /// "local" targets the repo's own .git/config (a per-repo override, the default);
    /// "global" targets the outer user config. Values ride the ArgumentList so names
    /// and emails need no escaping. Setting only one of name/email is allowed; an empty
    /// request is rejected. Any git failure is returned in the result, never thrown, so
    /// it degrades to a 4xx rather than a 500.</summary>
    public SetIdentityResult SetCommitIdentity(string workingDir, string? name, string? email, string scope)
    {
        var n = name?.Trim() ?? "";
        var e = email?.Trim() ?? "";
        var normScope = scope == "global" ? "global" : "local";
        if (n.Length == 0 && e.Length == 0)
            return new SetIdentityResult(false, null, null, normScope, "Provide a name or email.");

        var scopeFlag = normScope == "global" ? "--global" : "--local";
        try
        {
            if (n.Length > 0)
            {
                var r = RunGit(workingDir, $"config {scopeFlag} user.name", n);
                if (r.ExitCode != 0)
                    return new SetIdentityResult(false, null, null, normScope, FirstLine(r.StdErr, r.StdOut));
            }
            if (e.Length > 0)
            {
                var r = RunGit(workingDir, $"config {scopeFlag} user.email", e);
                if (r.ExitCode != 0)
                    return new SetIdentityResult(false, null, null, normScope, FirstLine(r.StdErr, r.StdOut));
            }
            var ci = ReadCommitIdentity(workingDir);
            _logger.Info($"[GIT] Commit identity set ({normScope}) -> {ci.Name} <{ci.Email}>");
            return new SetIdentityResult(true, ci.Name, ci.Email, ci.Scope, null);
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Set commit identity failed: {ex.Message}");
            return new SetIdentityResult(false, null, null, normScope, ex.Message);
        }
    }

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
            origin.DriftAhead, origin.DriftBehind, FetchHeadTime(workingDir),
            ReadCommitIdentity(workingDir));
    }

    /// <summary>
    /// Origin-aware positions (plans/git-origin-visibility.md): HEAD vs the
    /// remote-tracking base (origin/main|master), and local base vs origin
    /// base ("drift" — a stale local main made 'ahead of main' a lie on
    /// 2026-06-12). Local and origin bases are detected independently.
    /// Values reflect the locally-known origin refs; a fetch refreshes them.
    /// </summary>
    /// <summary>Local and origin base branches, detected independently
    /// (a repo can have a local master with nothing pushed, etc.).</summary>
    private (string? LocalBase, string? OriginBase) DetectBases(string workingDir)
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
        return (localBase, originBase);
    }

    private (string? LocalBase, string? OriginBase, int Ahead, int Behind, int DriftAhead, int DriftBehind)
        CompareToOriginBase(string workingDir, string branch)
    {
        var (localBase, originBase) = DetectBases(workingDir);

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

    public sealed record BranchInfo(
        string Name, string Subject, DateTimeOffset CommittedAt,
        int BaseAhead, int BaseBehind, int OriginBaseAhead, int OriginBaseBehind,
        bool HasUpstream, int UpstreamAhead, int UpstreamBehind);

    /// <summary>
    /// All local branches except the checked-out one and the base branch
    /// (plans/git-branches.md), newest commit first, each with the same three
    /// comparisons the current-branch card shows. Read-only.
    /// </summary>
    public List<BranchInfo> ListBranches(string workingDir)
    {
        var (localBase, originBase) = DetectBases(workingDir);
        var current = CurrentBranch(workingDir);

        var run = RunGit(workingDir,
            "for-each-ref refs/heads --sort=-committerdate --format=%(refname:short)%09%(committerdate:iso8601-strict)%09%(subject)");
        if (run.ExitCode != 0) return new();

        var result = new List<BranchInfo>();
        foreach (var line in run.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.TrimEnd().Split('\t', 3);
            if (parts.Length < 3) continue;
            var name = parts[0];
            if (name == current || name == localBase) continue;
            if (!DateTimeOffset.TryParse(parts[1], out var when)) when = DateTimeOffset.MinValue;

            var (baseAhead, baseBehind) = localBase is null ? (0, 0)
                : CountLeftRight(workingDir, localBase, name);
            var (obAhead, obBehind) = originBase is null ? (0, 0)
                : CountLeftRight(workingDir, originBase, name);
            // Dead-branch filter (user rule): no unique commits vs any
            // existing base = fully merged = history, not WIP — hidden no
            // matter how far behind it has drifted.
            var hasBase = localBase is not null || originBase is not null;
            var unique = (localBase is not null && baseAhead > 0)
                || (originBase is not null && obAhead > 0);
            if (hasBase && !unique) continue;

            var hasUpstream = RunGit(workingDir,
                $"rev-parse --verify --quiet refs/remotes/origin/{name}").ExitCode == 0;
            var (upAhead, upBehind) = hasUpstream
                ? CountLeftRight(workingDir, $"origin/{name}", name)
                : (0, 0);

            result.Add(new BranchInfo(name, parts[2], when,
                baseAhead, baseBehind, obAhead, obBehind, hasUpstream, upAhead, upBehind));
        }
        _logger.Info($"[GIT] ListBranches -> {result.Count} other branch(es)");
        return result;
    }

    public sealed record GraphCommit(
        string Hash, string Short, IReadOnlyList<string> Parents,
        IReadOnlyList<string> Refs, string Subject);

    /// <summary>
    /// Recent history across the refs that matter (plans/git-graph.md):
    /// HEAD, local+origin base, origin/&lt;current&gt;, and the filtered
    /// other-branches. Newest first; the frontend translates to a mermaid
    /// gitGraph. Read-only.
    /// </summary>
    public List<GraphCommit> GraphLog(string workingDir, int limit = 30)
    {
        var (localBase, originBase) = DetectBases(workingDir);
        var current = CurrentBranch(workingDir);

        var refs = new List<string>();
        if (current is not "unknown" and not "(detached)") refs.Add(current);
        if (localBase is not null && localBase != current) refs.Add(localBase);
        if (originBase is not null) refs.Add(originBase);
        if (current is not "unknown" and not "(detached)"
            && RunGit(workingDir, $"rev-parse --verify --quiet refs/remotes/origin/{current}").ExitCode == 0)
            refs.Add($"origin/{current}");
        foreach (var b in ListBranches(workingDir).Take(5))
            refs.Add(b.Name);
        if (refs.Count == 0) return new();

        // Refs go through literalArgs: RunGit splits the argument string on
        // spaces with no quote handling, so quoting here reaches git verbatim.
        var run = RunGit(workingDir,
            $"log --topo-order -n {limit} --format=%H%x09%h%x09%P%x09%D%x09%s",
            refs.Append("--").ToArray());
        if (run.ExitCode != 0) return new();

        var commits = new List<GraphCommit>();
        foreach (var line in run.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = line.TrimEnd().Split('\t', 5);
            if (parts.Length < 5) continue;
            var decorations = parts[3]
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(d => d.StartsWith("HEAD -> ") ? d["HEAD -> ".Length..] : d)
                .Where(d => d != "HEAD" && !d.StartsWith("tag: "))
                .ToList();
            commits.Add(new GraphCommit(
                parts[0], parts[1],
                parts[2].Split(' ', StringSplitOptions.RemoveEmptyEntries),
                decorations, parts[4]));
        }
        _logger.Info($"[GIT] GraphLog -> {commits.Count} commit(s) across {refs.Count} ref(s)");
        return commits;
    }

    public sealed record GitActionResult(bool Ok, bool Updated, string? Error);

    /// <summary>
    /// Merges the LOCAL base branch (main, then master) into the current
    /// branch (plans/git-actions.md). Requires a clean working tree, and on
    /// any merge failure runs `merge --abort` so a phone tap can never leave
    /// a conflicted tree — conflicts are for Claude in chat.
    /// </summary>
    public GitActionResult MergeBase(string workingDir)
    {
        string? baseRef = null;
        foreach (var candidate in new[] { "main", "master" })
            if (RunGit(workingDir, $"rev-parse --verify --quiet refs/heads/{candidate}").ExitCode == 0)
            {
                baseRef = candidate;
                break;
            }
        if (baseRef is null) return new GitActionResult(false, false, "no local main/master branch");

        var branch = CurrentBranch(workingDir);
        if (branch == baseRef) return new GitActionResult(false, false, $"already on {baseRef}");

        var dirty = RunGit(workingDir, "status --porcelain");
        if (!string.IsNullOrWhiteSpace(dirty.StdOut))
            return new GitActionResult(false, false, "working tree has uncommitted changes");

        var before = RunGit(workingDir, "rev-parse HEAD").StdOut.Trim();
        var run = RunGit(workingDir, $"merge --no-edit {baseRef}");
        if (run.ExitCode != 0)
        {
            RunGit(workingDir, "merge --abort"); // best-effort; tree must stay clean
            var error = FirstLine(run.StdErr, run.StdOut);
            _logger.Error($"[GIT] MergeBase {baseRef} failed (aborted): {error}");
            return new GitActionResult(false, false, error);
        }

        var after = RunGit(workingDir, "rev-parse HEAD").StdOut.Trim();
        var updated = after != before;
        _logger.Info($"[GIT] MergeBase -> {baseRef} into {branch} {(updated ? $"{Short(before)}..{Short(after)}" : "already up to date")}");
        return new GitActionResult(true, updated, null);
    }

    /// <summary>
    /// `git pull --ff-only` on the current branch (plans/git-actions.md).
    /// A diverged branch or missing upstream surfaces as Error — never a
    /// surprise merge commit.
    /// </summary>
    public GitActionResult PullCurrent(string workingDir)
    {
        var before = RunGit(workingDir, "rev-parse HEAD").StdOut.Trim();
        var run = RunGit(workingDir, "pull --ff-only");
        if (run.ExitCode != 0)
        {
            var error = FirstLine(run.StdErr, run.StdOut);
            _logger.Error($"[GIT] PullCurrent failed: {error}");
            return new GitActionResult(false, false, error);
        }

        var after = RunGit(workingDir, "rev-parse HEAD").StdOut.Trim();
        var updated = after != before;
        _logger.Info($"[GIT] PullCurrent {(updated ? $"{Short(before)}..{Short(after)}" : "already up to date")}");
        return new GitActionResult(true, updated, null);
    }

    /// <summary>
    /// Pushes the current branch to origin (plans/git-branches.md — branches
    /// on origin are the user's cross-computer memory). Publishes with -u
    /// when the branch has no upstream yet. Plain push only: a diverged
    /// branch fails cleanly — force-push stays with Claude in chat.
    /// </summary>
    public GitActionResult PushCurrent(string workingDir)
    {
        var branch = CurrentBranch(workingDir);
        if (branch is "unknown" or "(detached)")
            return new GitActionResult(false, false, "not on a branch");

        var remoteRef = $"refs/remotes/origin/{branch}";
        var before = RunGit(workingDir, $"rev-parse --verify --quiet {remoteRef}");
        var hasUpstream = RunGit(workingDir, "rev-parse --abbrev-ref --symbolic-full-name @{u}").ExitCode == 0;

        var run = RunGit(workingDir, hasUpstream ? "push" : $"push -u origin {branch}");
        if (run.ExitCode != 0)
        {
            var error = FirstLine(run.StdErr, run.StdOut);
            _logger.Error($"[GIT] PushCurrent {branch} failed: {error}");
            return new GitActionResult(false, false, error);
        }

        var after = RunGit(workingDir, $"rev-parse --verify --quiet {remoteRef}");
        var updated = before.StdOut.Trim() != after.StdOut.Trim();
        _logger.Info($"[GIT] PushCurrent -> {branch} {(updated ? "pushed" : "already up to date")}");
        return new GitActionResult(true, updated, null);
    }

    // --- branch "PR preview" (plans/git-pr-preview.md) -----------------------

    /// <summary>Max commits / files / patch chars returned by the review.</summary>
    private const int ReviewCommitLimit = 100;
    private const int ReviewFileLimit = 500;
    private const int ReviewPatchMaxChars = 200_000;

    public sealed record ReviewCommit(string Short, string Author, string Date, string Subject);
    public sealed record ReviewFile(string Path, string? OldPath, int Added, int Deleted, bool Binary, string Status);
    public sealed record ReviewResult(
        bool IsFeatureBranch, string? Base, string? BaseRef, string? MergeBase,
        IReadOnlyList<ReviewCommit> Commits, IReadOnlyList<ReviewFile> Files, bool Truncated);
    public sealed record ReviewFilePatch(string Path, string Patch, bool Truncated);
    public sealed record ReviewBase(string Ref, string Kind);
    public sealed record ReviewBasesResult(string? Default, IReadOnlyList<ReviewBase> Bases);

    /// <summary>Pre-checks a chosen base ref (rejects empty / option-like /
    /// whitespace / control / `..`) then verifies it peels to a commit. The
    /// strict pre-check stops a bad value from being spliced as a git option;
    /// rev-parse is the authoritative existence check.</summary>
    private bool TryValidateRef(string workingDir, string candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate)) return false;
        if (candidate.StartsWith('-') || candidate.Contains("..")) return false;
        foreach (var ch in candidate)
            if (char.IsWhiteSpace(ch) || char.IsControl(ch)) return false;
        return RunGit(workingDir, "rev-parse --verify --quiet", $"{candidate}^{{commit}}").ExitCode == 0;
    }

    /// <summary>Candidate base branches for the review picker: local heads +
    /// `origin/*` (excluding `origin/HEAD`), plus the auto-detected default
    /// (the same one Review() would fall back to). Read-only.</summary>
    public ReviewBasesResult ListReviewBases(string workingDir)
    {
        var (localBase, originBase) = DetectBases(workingDir);
        var defaultBase = originBase ?? localBase;

        var bases = new List<ReviewBase>();
        var locals = RunGit(workingDir, "for-each-ref refs/heads --format=%(refname:short)");
        if (locals.ExitCode == 0)
            foreach (var line in locals.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var name = line.Trim();
                if (name.Length > 0) bases.Add(new ReviewBase(name, "local"));
            }
        var remotes = RunGit(workingDir, "for-each-ref refs/remotes/origin --format=%(refname:short)");
        if (remotes.ExitCode == 0)
            foreach (var line in remotes.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var name = line.Trim();
                if (name.Length == 0 || name == "origin/HEAD") continue;
                bases.Add(new ReviewBase(name, "remote"));
            }
        _logger.Info($"[GIT] ListReviewBases -> default={defaultBase ?? "(none)"}, {bases.Count} base(s)");
        return new ReviewBasesResult(defaultBase, bases);
    }

    /// <summary>
    /// What a GitHub pull request would show for the checked-out feature branch
    /// (plans/git-pr-preview.md): the base it would merge into, the merge-base
    /// commit it diverged at, the commits unique to the branch
    /// (<c>git log base..HEAD</c>, two-dot) and the cumulative changed-file list
    /// (<c>git diff base...HEAD</c>, three-dot — the branch's own changes since
    /// divergence, like a PR's "Files changed"). Base prefers the origin base
    /// (mirrors GitHub), else the local base. On the base branch itself there is
    /// nothing to review -> IsFeatureBranch=false. Read-only.
    /// </summary>
    public ReviewResult Review(string workingDir, string? baseOverride = null)
    {
        var empty = new ReviewResult(false, null, null, null,
            Array.Empty<ReviewCommit>(), Array.Empty<ReviewFile>(), false);

        var current = CurrentBranch(workingDir);
        if (current is "unknown" or "(detached)") return empty;

        string? baseRef;
        if (!string.IsNullOrWhiteSpace(baseOverride))
        {
            if (!TryValidateRef(workingDir, baseOverride))
                throw new ArgumentException("unknown base branch");
            baseRef = baseOverride;
        }
        else
        {
            var (localBase, originBase) = DetectBases(workingDir);
            baseRef = originBase ?? localBase;
            if (baseRef is null) return empty;

            // On the base branch itself? Nothing to PR. (Only enforced for
            // auto-detect; an explicit Operator pick is honored.)
            var baseBranchName = baseRef.StartsWith("origin/") ? baseRef["origin/".Length..] : baseRef;
            if (current == baseBranchName || current == localBase) return empty;
        }

        var mb = RunGit(workingDir, $"merge-base {baseRef} HEAD");
        var mergeBase = mb.ExitCode == 0 && !string.IsNullOrWhiteSpace(mb.StdOut)
            ? Short(mb.StdOut.Trim()) : null;
        // Diverged with no common ancestor (unrelated histories): not a reviewable branch.
        if (mergeBase is null) return empty;

        var commits = new List<ReviewCommit>();
        var commitRun = RunGit(workingDir,
            $"log {baseRef}..HEAD --format=%h{Delimiter}%an{Delimiter}%cI{Delimiter}%s -n {ReviewCommitLimit + 1}");
        if (commitRun.ExitCode == 0)
            foreach (var line in commitRun.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split(Delimiter, 4);
                if (parts.Length < 4) continue;
                commits.Add(new ReviewCommit(parts[0], parts[1], parts[2], parts[3]));
            }
        var commitsTruncated = commits.Count > ReviewCommitLimit;
        if (commitsTruncated) commits = commits.Take(ReviewCommitLimit).ToList();

        // Status letters + rename old->new paths from --name-status (clean),
        // line counts from --numstat (keyed by the resolved new path).
        var statuses = new Dictionary<string, (string Status, string? OldPath)>(StringComparer.Ordinal);
        var nameStatus = RunGit(workingDir, $"diff --name-status {baseRef}...HEAD");
        if (nameStatus.ExitCode == 0)
            foreach (var line in nameStatus.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split('\t');
                if (parts.Length < 2) continue;
                var status = parts[0];
                if ((status.StartsWith('R') || status.StartsWith('C')) && parts.Length >= 3)
                    statuses[parts[2]] = (status[0].ToString(), parts[1]);
                else
                    statuses[parts[1]] = (status[0].ToString(), null);
            }

        var files = new List<ReviewFile>();
        var numstat = RunGit(workingDir, $"diff --numstat {baseRef}...HEAD");
        if (numstat.ExitCode == 0)
            foreach (var line in numstat.StdOut.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split('\t');
                if (parts.Length < 3) continue;
                var binary = parts[0] == "-" || parts[1] == "-";
                int.TryParse(parts[0], out var added);
                int.TryParse(parts[1], out var deleted);
                var path = ResolveNumstatPath(string.Join('\t', parts.Skip(2)));
                var meta = statuses.TryGetValue(path, out var m) ? m : ("M", (string?)null);
                files.Add(new ReviewFile(path, meta.Item2, added, deleted, binary, meta.Item1));
            }
        var filesTruncated = files.Count > ReviewFileLimit;
        if (filesTruncated) files = files.Take(ReviewFileLimit).ToList();

        _logger.Info($"[GIT] Review -> {current} vs {baseRef} @ {mergeBase}: {commits.Count} commit(s), {files.Count} file(s)");
        return new ReviewResult(true, baseRef, baseRef, mergeBase, commits, files,
            commitsTruncated || filesTruncated);
    }

    /// <summary>
    /// The unified patch for ONE file of the branch review
    /// (<c>git diff base...HEAD -- &lt;path&gt;</c>), fetched lazily on expand so a
    /// huge diff never ships up front. Output is capped at
    /// <see cref="ReviewPatchMaxChars"/> chars (Truncated marks the cut). The
    /// path is passed via the ArgumentList, never the shell.
    /// </summary>
    public ReviewFilePatch ReviewFileDiff(string workingDir, string path, string? baseOverride = null)
    {
        if (string.IsNullOrWhiteSpace(path)) throw new ArgumentException("path required");

        string? baseRef;
        if (!string.IsNullOrWhiteSpace(baseOverride))
        {
            if (!TryValidateRef(workingDir, baseOverride))
                throw new ArgumentException("unknown base branch");
            baseRef = baseOverride;
        }
        else
        {
            var (localBase, originBase) = DetectBases(workingDir);
            baseRef = originBase ?? localBase;
            if (baseRef is null) throw new InvalidOperationException("no base branch to diff against");
        }

        var run = RunGit(workingDir, $"diff {baseRef}...HEAD --", path);
        if (run.ExitCode != 0)
            throw new InvalidOperationException(
                $"git diff failed (exit {run.ExitCode}): {FirstLine(run.StdErr, run.StdOut)}");

        var patch = run.StdOut;
        var truncated = patch.Length > ReviewPatchMaxChars;
        if (truncated) patch = patch[..ReviewPatchMaxChars];
        _logger.Info($"[GIT] ReviewFile -> {path} ({patch.Length} chars{(truncated ? ", truncated" : "")})");
        return new ReviewFilePatch(path, patch, truncated);
    }

    /// <summary>Resolves a `git diff --numstat` rename path to the NEW path,
    /// handling both the plain "old => new" and the "dir/{old => new}" brace
    /// forms. Non-rename paths are returned unchanged.</summary>
    private static string ResolveNumstatPath(string raw)
    {
        if (!raw.Contains("=>")) return raw;
        var open = raw.IndexOf('{');
        if (open >= 0)
        {
            var arrow = raw.IndexOf("=>", open, StringComparison.Ordinal);
            var close = raw.IndexOf('}', arrow < 0 ? open : arrow);
            if (arrow >= 0 && close > arrow)
            {
                var prefix = raw[..open];
                var newMid = raw[(arrow + 2)..close].Trim();
                var suffix = raw[(close + 1)..];
                return (prefix + newMid + suffix).Replace("//", "/").Trim();
            }
        }
        var parts = raw.Split("=>", 2);
        return parts[^1].Trim();
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
