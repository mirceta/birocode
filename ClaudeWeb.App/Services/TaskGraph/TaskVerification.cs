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
/// </summary>
public class GitTaskFactsProbe : ITaskFactsProbe
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
/// kanban-lifecycle-columns): every minute it takes the board's cards that are
/// assigned to a repo ON THIS MACHINE, carry a recorded branch, and are not
/// yet done, probes the repo, and lets <see cref="TaskGraphService.ApplyVerification"/>
/// advance the card as far as the facts go. Cards on other machines are that
/// machine's poller's job — the board syncs the result back.
/// </summary>
public class TaskVerificationPoller : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(60);
    private readonly TaskGraphService _graph;
    private readonly RepositoryRegistry _repos;
    private readonly ITaskFactsProbe _probe;
    private readonly Logger _logger;

    public TaskVerificationPoller(TaskGraphService graph, RepositoryRegistry repos, ITaskFactsProbe probe, Logger logger)
    {
        _graph = graph;
        _repos = repos;
        _probe = probe;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try { VerifyOnce(); }
            catch (Exception ex) { _logger.Error($"[TASKVERIFY] pass failed: {ex.Message}"); }
            try { await Task.Delay(Interval, ct); } catch (OperationCanceledException) { break; }
        }
    }

    public void VerifyOnce()
    {
        var repoById = _repos.GetAll().ToDictionary(r => r.Id, StringComparer.Ordinal);
        foreach (var n in _graph.Get().Nodes)
        {
            if (n.Status == TaskLifecycle.Done || n.SourceId is not null) continue; // done, or another machine's job
            if (n.RepoId is null || n.Branch is null) continue;
            if (!repoById.TryGetValue(n.RepoId, out var repo) || !Directory.Exists(repo.Path)) continue;
            var facts = _probe.Probe(repo.Path, n.Branch);
            _graph.ApplyVerification(n.Id, facts, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
    }
}
