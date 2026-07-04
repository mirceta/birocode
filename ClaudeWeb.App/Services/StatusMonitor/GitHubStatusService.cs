using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.StatusMonitor;

/// <summary>
/// The status-monitor wallboard's GitHub side (openspec change
/// status-monitor-dashboard, design decision 3): the repo list is DERIVED from the
/// registered Repos' <c>origin</c> remotes (parsed to owner/name, deduped, repos
/// without a GitHub remote skipped) — no separate configuration. Polling happens
/// server-side through <c>gh api graphql</c>, so the credential established by
/// <see cref="Accounts.GitHubCredentialsService"/> stays inside <c>gh</c> and the
/// PAT never reaches this process or the browser. Results are cached for
/// <see cref="CacheTtl"/>; a stale cache is served immediately while one background
/// refresh runs, so the board endpoint never blocks on GitHub except on the very
/// first call. GitHub being down/unauthenticated degrades this SECTION, never the
/// board: the section carries its own status + error.
/// </summary>
public sealed class GitHubStatusService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(60);
    private const int GhTimeoutMs = 20000;
    private const int GitTimeoutMs = 5000;
    private const int MaxPrsPerRepo = 50;

    // https://github.com/owner/name(.git) | git@github.com:owner/name(.git) | ssh://git@github.com/owner/name
    private static readonly Regex RemoteRx = new(
        @"github\.com[:/]+([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+?)(?:\.git)?/?$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly RepositoryRegistry _repos;
    private readonly Logger _logger;

    private readonly object _lock = new();
    private GitHubSection? _cached;
    private Task? _refreshing;

    public GitHubStatusService(RepositoryRegistry repos, Logger logger)
    {
        _repos = repos;
        _logger = logger;
    }

    /// <summary>One repo tile. <see cref="Ci"/> is pass | fail | pending | none.</summary>
    public sealed record RepoStatus(
        string Name, string Ci, string? FailingCheck, string? DefaultBranch,
        int OpenPrs, int Drafts, int ChangesRequested, long? OldestPrAgeMs, string? Error);

    /// <summary>The board's github section. <see cref="Status"/> is ok | unavailable;
    /// unavailable carries <see cref="Error"/> and an empty repo list.</summary>
    public sealed record GitHubSection(
        string Status, string? Error, long FetchedAtMs, IReadOnlyList<RepoStatus> Repos);

    /// <summary>Cached section if fresh; stale cache is returned immediately with a
    /// background refresh kicked off. Only the first-ever call awaits GitHub.</summary>
    public async Task<GitHubSection> GetSectionAsync(CancellationToken ct)
    {
        Task? await_;
        lock (_lock)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_cached is not null && now - _cached.FetchedAtMs < CacheTtl.TotalMilliseconds)
                return _cached;
            _refreshing ??= Task.Run(RefreshOnce, CancellationToken.None)
                                .ContinueWith(_ => { lock (_lock) _refreshing = null; });
            await_ = _cached is null ? _refreshing : null;
        }
        if (await_ is not null) await await_.WaitAsync(ct);
        lock (_lock)
            return _cached ?? new GitHubSection("unavailable", "no data yet",
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Array.Empty<RepoStatus>());
    }

    private void RefreshOnce()
    {
        var fetched = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        try
        {
            var section = Fetch(fetched);
            lock (_lock) _cached = section;
        }
        catch (Exception ex)
        {
            _logger.Error($"[STATUS-GH] refresh failed: {ex.Message}");
            lock (_lock) _cached = new GitHubSection("unavailable", ex.Message, fetched, Array.Empty<RepoStatus>());
        }
    }

    private GitHubSection Fetch(long fetchedAtMs)
    {
        var list = DeriveRepoList();
        if (list.Count == 0)
            return new GitHubSection("ok", null, fetchedAtMs, Array.Empty<RepoStatus>());

        var gh = ProcessProbe.ResolveOnPath("gh");
        if (gh is null)
            return new GitHubSection("unavailable", "gh not found on PATH", fetchedAtMs, Array.Empty<RepoStatus>());

        // -F query=@- reads the field from STDIN (gh's @-file syntax; -f takes @ literally):
        // the query holds quotes and newlines that would not survive argv quoting on Windows.
        var query = BuildQuery(list);
        var run = ProcessProbe.Run(gh, new[] { "api", "graphql", "-F", "query=@-" }, GhTimeoutMs, stdin: query);
        if (run.TimedOut)
            return new GitHubSection("unavailable", "gh api graphql timed out", fetchedAtMs, Array.Empty<RepoStatus>());

        // gh exits non-zero when the GraphQL response contains errors but may still
        // include data (e.g. one repo of five is inaccessible) — parse stdout first
        // and only fail the section when there is no usable data at all.
        JsonDocument doc;
        try { doc = JsonDocument.Parse(run.StdOut); }
        catch
        {
            var reason = FirstLine(run.StdErr) ?? "gh returned no JSON (not authenticated?)";
            return new GitHubSection("unavailable", reason, fetchedAtMs, Array.Empty<RepoStatus>());
        }

        using (doc)
        {
            if (!doc.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Object)
            {
                var reason = FirstLine(run.StdErr) ?? "GraphQL response had no data";
                return new GitHubSection("unavailable", reason, fetchedAtMs, Array.Empty<RepoStatus>());
            }

            var now = DateTimeOffset.UtcNow;
            var repos = new List<RepoStatus>(list.Count);
            for (var i = 0; i < list.Count; i++)
            {
                var name = list[i];
                if (!data.TryGetProperty("r" + i, out var repo) || repo.ValueKind != JsonValueKind.Object)
                {
                    repos.Add(new RepoStatus(name, "none", null, null, 0, 0, 0, null, "not accessible"));
                    continue;
                }
                repos.Add(ParseRepo(name, repo, now));
            }
            return new GitHubSection("ok", null, fetchedAtMs, repos);
        }
    }

    // ---- repo list derivation (design decision 3) ---------------------------

    /// <summary>Whether <paramref name="ownerName"/> is one of the derived registered
    /// repos — the PR-browser endpoints' allow-list (openspec change github-pr-browser),
    /// so they can never be used as an open proxy to arbitrary repositories.</summary>
    public bool IsKnownRepo(string ownerName)
        => DeriveRepoList().Contains(ownerName, StringComparer.OrdinalIgnoreCase);

    /// <summary>Registered Repos → their <c>origin</c> remotes → distinct
    /// <c>owner/name</c>. A repo without a remote, or with a non-GitHub remote,
    /// is skipped silently.</summary>
    private List<string> DeriveRepoList()
    {
        var git = ProcessProbe.ResolveOnPath("git");
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<string>();
        if (git is null) return result;

        foreach (var repo in _repos.GetAll())
        {
            if (!repo.Exists || !repo.IsGitRepo) continue;
            var run = ProcessProbe.Run(git,
                new[] { "-C", repo.Path, "config", "--get", "remote.origin.url" }, GitTimeoutMs);
            if (run.ExitCode != 0 || run.TimedOut) continue;
            var m = RemoteRx.Match(run.StdOut.Trim());
            if (!m.Success) continue;
            var full = m.Groups[1].Value + "/" + m.Groups[2].Value;
            if (seen.Add(full)) result.Add(full);
        }
        return result;
    }

    // ---- GraphQL -------------------------------------------------------------

    /// <summary>One batched query for all repos (aliases r0..rN): default-branch
    /// check rollup + open PRs. owner/name are regex-constrained to [A-Za-z0-9_.-]
    /// by <see cref="RemoteRx"/>, so string interpolation into the query is safe.</summary>
    private static string BuildQuery(IReadOnlyList<string> repos)
    {
        var sb = new StringBuilder("query {");
        for (var i = 0; i < repos.Count; i++)
        {
            var parts = repos[i].Split('/');
            sb.Append($@"
r{i}: repository(owner: ""{parts[0]}"", name: ""{parts[1]}"") {{
  defaultBranchRef {{ name target {{ ... on Commit {{ statusCheckRollup {{ state
    contexts(first: 50) {{ nodes {{ __typename
      ... on CheckRun {{ name conclusion }}
      ... on StatusContext {{ context state }} }} }} }} }} }} }}
  pullRequests(states: OPEN, first: {MaxPrsPerRepo}) {{ totalCount nodes {{ isDraft reviewDecision createdAt }} }}
}}");
        }
        return sb.Append("\n}").ToString();
    }

    private static RepoStatus ParseRepo(string name, JsonElement repo, DateTimeOffset now)
    {
        string ci = "none";
        string? failing = null, branch = null;

        if (repo.TryGetProperty("defaultBranchRef", out var dbr) && dbr.ValueKind == JsonValueKind.Object)
        {
            branch = dbr.TryGetProperty("name", out var bn) ? bn.GetString() : null;
            if (dbr.TryGetProperty("target", out var target) && target.ValueKind == JsonValueKind.Object &&
                target.TryGetProperty("statusCheckRollup", out var roll) && roll.ValueKind == JsonValueKind.Object)
            {
                var state = roll.TryGetProperty("state", out var st) ? st.GetString() : null;
                ci = state switch
                {
                    "SUCCESS" => "pass",
                    "FAILURE" or "ERROR" => "fail",
                    "PENDING" or "EXPECTED" => "pending",
                    _ => "none",
                };
                if (ci == "fail" && roll.TryGetProperty("contexts", out var ctxs) &&
                    ctxs.TryGetProperty("nodes", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
                {
                    foreach (var n in nodes.EnumerateArray())
                    {
                        var kind = n.TryGetProperty("__typename", out var tn) ? tn.GetString() : null;
                        if (kind == "CheckRun" &&
                            n.TryGetProperty("conclusion", out var c) && c.GetString() is "FAILURE" or "TIMED_OUT")
                        { failing = n.TryGetProperty("name", out var cn) ? cn.GetString() : null; break; }
                        if (kind == "StatusContext" &&
                            n.TryGetProperty("state", out var s2) && s2.GetString() is "FAILURE" or "ERROR")
                        { failing = n.TryGetProperty("context", out var cx) ? cx.GetString() : null; break; }
                    }
                }
            }
        }

        int total = 0, drafts = 0, changes = 0;
        long? oldestAge = null;
        if (repo.TryGetProperty("pullRequests", out var prs) && prs.ValueKind == JsonValueKind.Object)
        {
            total = prs.TryGetProperty("totalCount", out var tc) ? tc.GetInt32() : 0;
            if (prs.TryGetProperty("nodes", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
            {
                foreach (var pr in nodes.EnumerateArray())
                {
                    if (pr.TryGetProperty("isDraft", out var d) && d.ValueKind == JsonValueKind.True) drafts++;
                    if (pr.TryGetProperty("reviewDecision", out var rd) && rd.GetString() == "CHANGES_REQUESTED") changes++;
                    if (pr.TryGetProperty("createdAt", out var ca) &&
                        DateTimeOffset.TryParse(ca.GetString(), out var created))
                    {
                        var age = (long)(now - created).TotalMilliseconds;
                        if (oldestAge is null || age > oldestAge) oldestAge = age;
                    }
                }
            }
        }

        return new RepoStatus(name, ci, failing, branch, total, drafts, changes, oldestAge, null);
    }

    private static string? FirstLine(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var line = s.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0);
        return line is { Length: > 200 } ? line[..200] : line;
    }
}
