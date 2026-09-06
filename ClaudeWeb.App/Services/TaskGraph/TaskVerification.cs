using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>Reads the observable truth about one task branch in one repo
/// (openspec kanban-lifecycle-columns). Abstracted so the status machine is
/// testable without a git checkout.</summary>
public interface ITaskFactsProbe
{
    TaskLifecycle.Facts Probe(string repoPath, string branch);
}

/// <summary>
/// The real probe: local git for the branch/push facts, `gh` for the PR facts
/// (inheriting gh's own credential — the harness stores no token), and the
/// deploy log for the "merge commit is live" fact on deployed-harness repos.
/// Everything degrades: no gh → git-only facts; any git failure → an empty
/// Facts that moves nothing (observation is forward-only anyway).
/// It is also the <see cref="IPrFactsProbe"/> (openspec board-verify-remote): PR
/// facts for any GitHub repo by number or head branch, and clone ancestry.
/// </summary>
public class GitTaskFactsProbe : ITaskFactsProbe, IPrFactsProbe
{
    private readonly Logger _logger;

    public GitTaskFactsProbe(Logger logger) { _logger = logger; }

    public TaskLifecycle.Facts Probe(string repoPath, string branch)
    {
        try
        {
            var head = Run(repoPath, "git", $"rev-parse --verify --quiet {branch}");
            var originHead = Run(repoPath, "git", $"rev-parse --verify --quiet origin/{branch}");
            var exists = head is not null || originHead is not null;
            var tip = head ?? originHead;

            var def = Run(repoPath, "git", "symbolic-ref --short refs/remotes/origin/HEAD")?.Replace("origin/", "") ?? "main";
            var hasCommits = false;
            if (tip is not null)
            {
                var count = Run(repoPath, "git", $"rev-list --count origin/{def}..{tip}")
                    ?? Run(repoPath, "git", $"rev-list --count {def}..{tip}");
                hasCommits = int.TryParse(count, out var c) && c > 0;
            }

            // Pushed = the remote branch exists AND holds everything local has.
            var onOrigin = originHead is not null &&
                (head is null || Run(repoPath, "git", $"merge-base --is-ancestor {head} origin/{branch}", exitCodeOnly: true) == "0");

            var (prUrl, prNumber, prMerged, mergeCommit) = ProbePr(repoPath, branch);

            // A merged PR delivered to a repo that is not a deployed harness is
            // done; a deployed harness (it carries the committed swap.ps1) is
            // done only when the merge is an ancestor of the local default AND a
            // deploy finished after the merge commit was made.
            var mergeLive = prMerged && (mergeCommit is null
                ? !IsDeployedHarness(repoPath)
                : MergeIsLive(repoPath, def, mergeCommit));

            return new TaskLifecycle.Facts(exists, tip, hasCommits, onOrigin, prUrl, prNumber, prMerged, mergeCommit, mergeLive);
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKVERIFY] probe failed for {branch} in {repoPath}: {ex.Message}");
            return new TaskLifecycle.Facts(false, null, false, false, null, null, false, null, false);
        }
    }

    private (string? Url, int? Number, bool Merged, string? MergeCommit) ProbePr(string repoPath, string branch)
    {
        var json = Run(repoPath, "gh", $"pr list --head {branch} --state all --json number,url,state,mergeCommit --limit 1", timeoutMs: 20_000);
        if (string.IsNullOrWhiteSpace(json)) return (null, null, false, null);
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0) return (null, null, false, null);
            var pr = doc.RootElement[0];
            var merged = pr.TryGetProperty("state", out var st) && st.GetString() == "MERGED";
            string? mergeCommit = null;
            if (pr.TryGetProperty("mergeCommit", out var mc) && mc.ValueKind == JsonValueKind.Object && mc.TryGetProperty("oid", out var oid))
                mergeCommit = oid.GetString();
            return (pr.GetProperty("url").GetString(), pr.GetProperty("number").GetInt32(), merged, mergeCommit);
        }
        catch { return (null, null, false, null); }
    }

    // ---- IPrFactsProbe (openspec board-verify-remote) ---------------------------------------

    private const string PrFields = "number,url,state,mergeCommit,headRefOid,headRefName";

    /// <summary>One PR on GitHub, by number (<c>gh pr view</c>) or by head branch
    /// (<c>gh pr list --head</c>, newest first) in <c>owner/repo</c>. gh runs from the
    /// temp dir so no local clone is needed — the fleet's cards name repos this hub
    /// may not have checked out.</summary>
    public PrFacts? ProbePr(PrRef pr)
    {
        var cwd = Path.GetTempPath();
        try
        {
            if (pr.Number is { } number)
            {
                var json = Run(cwd, "gh", $"pr view {number} --repo {pr.OwnerRepo} --json {PrFields}", timeoutMs: 20_000);
                if (string.IsNullOrWhiteSpace(json)) return null;
                using var doc = JsonDocument.Parse(json);
                return Parse(doc.RootElement);
            }
            if (!string.IsNullOrWhiteSpace(pr.Branch))
            {
                var json = Run(cwd, "gh", $"pr list --repo {pr.OwnerRepo} --head {pr.Branch} --state all --json {PrFields} --limit 1", timeoutMs: 20_000);
                if (string.IsNullOrWhiteSpace(json)) return null;
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Array || doc.RootElement.GetArrayLength() == 0) return null;
                return Parse(doc.RootElement[0]);
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKVERIFY] gh probe failed for {pr.OwnerRepo}: {ex.Message}");
        }
        return null;
    }

    private static PrFacts? Parse(JsonElement e)
    {
        if (e.ValueKind != JsonValueKind.Object) return null;
        string? mergeCommit = null;
        if (e.TryGetProperty("mergeCommit", out var mc) && mc.ValueKind == JsonValueKind.Object && mc.TryGetProperty("oid", out var oid))
            mergeCommit = oid.GetString();
        return new PrFacts(
            e.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "",
            e.TryGetProperty("number", out var n) ? n.GetInt32() : 0,
            e.TryGetProperty("state", out var s) ? s.GetString() ?? "" : "",
            mergeCommit,
            e.TryGetProperty("headRefOid", out var h) && h.ValueKind == JsonValueKind.String ? h.GetString() : null,
            e.TryGetProperty("headRefName", out var b) && b.ValueKind == JsonValueKind.String ? b.GetString() : null);
    }

    public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits)
    {
        var unknown = true;
        foreach (var live in liveCommits)
        {
            var code = Run(clonePath, "git", $"merge-base --is-ancestor {mergeCommit} {live}", exitCodeOnly: true);
            if (code == "0") return true;
            if (code == "1") unknown = false; // both known, not an ancestor
        }
        return unknown ? null : false;
    }

    public string? OriginUrl(string clonePath) => Run(clonePath, "git", "remote get-url origin");

    private static bool IsDeployedHarness(string repoPath) => File.Exists(Path.Combine(repoPath, "swap.ps1"));

    /// <summary>"Live on the machine that did the work": the merge is on the
    /// local default branch and the committed deploy pipeline logged a
    /// `deploy finished` after the merge commit's own commit time. Repos
    /// without swap.ps1 are not deployed harnesses — merged is live enough.</summary>
    private bool MergeIsLive(string repoPath, string defaultBranch, string mergeCommit)
    {
        if (!IsDeployedHarness(repoPath)) return true;
        var onDefault = Run(repoPath, "git", $"merge-base --is-ancestor {mergeCommit} origin/{defaultBranch}", exitCodeOnly: true) == "0";
        if (!onDefault) return false;
        var log = Path.Combine(repoPath, ".claudeweb-deploy", "deploy.log");
        if (!File.Exists(log)) return false;
        if (!long.TryParse(Run(repoPath, "git", $"show -s --format=%ct {mergeCommit}"), out var mergedAtUnix)) return false;
        var mergedAt = DateTimeOffset.FromUnixTimeSeconds(mergedAtUnix).UtcDateTime;
        try
        {
            foreach (var line in File.ReadLines(log))
            {
                if (!line.Contains("deploy finished", StringComparison.Ordinal)) continue;
                // Lines start "2026-09-06T08:00:39  ..." in local time.
                if (DateTime.TryParse(line.AsSpan(0, Math.Min(19, line.Length)), out var at) && at.ToUniversalTime() >= mergedAt)
                    return true;
            }
        }
        catch { /* unreadable log = not proven live */ }
        return false;
    }

    /// <summary>Run one command in the repo dir; stdout trimmed, null on non-zero
    /// exit or timeout (with <paramref name="exitCodeOnly"/>: the exit code as a
    /// string, so ancestry checks can distinguish "no" from "failed").</summary>
    private string? Run(string repoPath, string file, string args, int timeoutMs = 10_000, bool exitCodeOnly = false)
    {
        try
        {
            using var p = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = file, Arguments = args, WorkingDirectory = repoPath,
                    RedirectStandardOutput = true, RedirectStandardError = true,
                    UseShellExecute = false, CreateNoWindow = true,
                },
            };
            p.Start();
            var stdout = p.StandardOutput.ReadToEnd();
            if (!p.WaitForExit(timeoutMs)) { try { p.Kill(entireProcessTree: true); } catch { } return null; }
            if (exitCodeOnly) return p.ExitCode.ToString();
            return p.ExitCode == 0 ? stdout.Trim() : null;
        }
        catch { return null; }
    }
}

/// <summary>
/// The background watcher that makes transitions harness-verified (openspec
/// kanban-lifecycle-columns; board-verify-remote): every minute — and once at
/// startup, which is the backfill — it runs one <see cref="BoardVerifier"/> pass:
/// this machine's assignees from their clones, and EVERY card that names a PR
/// against GitHub, whichever machine its assignee is on. The operator can run a
/// pass on demand (<c>POST /api/taskgraph/verify</c>, the board's "Re-verify"
/// button); passes never overlap.
/// </summary>
public class TaskVerificationPoller : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);
    private readonly RepositoryRegistry _repos;
    private readonly BoardVerifier _verifier;
    private readonly Logger _logger;
    private readonly object _passGate = new();
    private BoardVerifier.Result? _last;

    public TaskVerificationPoller(TaskGraphService graph, RepositoryRegistry repos, ITaskFactsProbe probe, IPrFactsProbe prProbe, Logger logger, ITaskFleetInfo? fleet = null)
    {
        _repos = repos;
        _logger = logger;
        _verifier = new BoardVerifier(graph, probe, prProbe, fleet, logger);
    }

    /// <summary>The last pass's outcome (for the board's status line), or null before the first.</summary>
    public BoardVerifier.Result? Last => _last;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { VerifyOnce(); }
            catch (Exception ex) { _logger.Error($"[TASKVERIFY] pass failed: {ex.Message}"); }
            try { await Task.Delay(Interval, ct); } catch (OperationCanceledException) { break; }
        }
    }

    /// <summary>One full pass, serialised: a second caller waits for the running pass.</summary>
    public BoardVerifier.Result VerifyOnce()
    {
        lock (_passGate)
        {
            var paths = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var r in _repos.GetAll())
                if (!string.IsNullOrWhiteSpace(r.Path) && Directory.Exists(r.Path)) paths[r.Id] = r.Path;
            var result = _verifier.VerifyOnce(paths, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            _last = result;
            return result;
        }
    }
}
