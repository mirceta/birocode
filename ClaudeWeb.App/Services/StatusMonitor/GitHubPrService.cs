using System.Text.Json;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.StatusMonitor;

/// <summary>
/// The GitHub drill-down behind the events-app PR browser (openspec change
/// github-pr-browser): on-demand open-PR lists and single-PR detail, fetched
/// server-side through <c>gh api graphql</c> like <see cref="GitHubStatusService"/> —
/// the PAT stays inside <c>gh</c>, the browser never sees a credential. Results are
/// cached per key (repo, or repo#number) for <see cref="CacheTtl"/> with single-flight
/// fetches: concurrent clicks on the same key await one gh call; within the TTL the
/// cache answers. The <c>repo</c> parameter is validated by the caller against the
/// board's derived registered-repo list, so this service is never an open proxy.
/// GitHub failing degrades the PANEL, never the page: results carry their own
/// status + error instead of throwing.
/// </summary>
public sealed class GitHubPrService
{
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);
    private const int GhTimeoutMs = 20000;

    private readonly Logger _logger;

    private readonly object _lock = new();
    private readonly Dictionary<string, (long AtMs, object Value)> _cache = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Task<object>> _inflight = new(StringComparer.OrdinalIgnoreCase);

    public GitHubPrService(Logger logger) => _logger = logger;

    /// <summary>One row of a repo's open-PR list. <see cref="Ci"/> is pass | fail | pending | none.</summary>
    public sealed record PrListItem(
        int Number, string Title, string? Author, string HeadRef, bool IsDraft,
        string? ReviewDecision, string Ci, long AgeMs);

    /// <summary>The PR-list panel payload. <see cref="Status"/> is ok | error; error
    /// carries <see cref="Error"/> and an empty list.</summary>
    public sealed record PrListResult(
        string Status, string? Error, long FetchedAtMs, int TotalCount, IReadOnlyList<PrListItem> Prs);

    public sealed record PrCheck(string Name, string State);
    public sealed record PrFile(string Path, int Additions, int Deletions);

    public sealed record PrDetail(
        int Number, string Title, string? Author, string Body, string Url, long CreatedAtMs,
        string BaseRef, string HeadRef, bool IsDraft, string? Mergeable, string? ReviewDecision,
        string Ci, int Additions, int Deletions, int ChangedFiles,
        IReadOnlyList<PrCheck> Checks, IReadOnlyList<PrFile> Files, int ReviewCount, int CommentCount);

    /// <summary>The PR-detail panel payload. <see cref="Status"/> is ok | error;
    /// error carries <see cref="Error"/> and a null <see cref="Pr"/>.</summary>
    public sealed record PrDetailResult(string Status, string? Error, long FetchedAtMs, PrDetail? Pr);

    public Task<PrListResult> GetOpenPrsAsync(string ownerName, CancellationToken ct)
        => GetOrFetchAsync(ownerName, () => FetchList(ownerName), ct);

    public Task<PrDetailResult> GetPrAsync(string ownerName, int number, CancellationToken ct)
        => GetOrFetchAsync(ownerName + "#" + number, () => FetchDetail(ownerName, number), ct);

    // ---- cache + single-flight ------------------------------------------------

    private async Task<T> GetOrFetchAsync<T>(string key, Func<T> fetch, CancellationToken ct) where T : class
    {
        Task<object> task;
        lock (_lock)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (_cache.TryGetValue(key, out var hit) && now - hit.AtMs < CacheTtl.TotalMilliseconds)
                return (T)hit.Value;
            if (!_inflight.TryGetValue(key, out task!))
            {
                // fetch() never throws (errors become error-status payloads), so the
                // continuation always runs and the key can never wedge as inflight.
                task = Task.Run(() =>
                {
                    var value = (object)fetch();
                    lock (_lock)
                    {
                        _cache[key] = (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), value);
                        _inflight.Remove(key);
                    }
                    return value;
                }, CancellationToken.None);
                _inflight[key] = task;
            }
        }
        return (T)await task.WaitAsync(ct);
    }

    // ---- fetches ---------------------------------------------------------------

    private PrListResult FetchList(string ownerName)
    {
        var fetched = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        try
        {
            var parts = ownerName.Split('/');
            var query = $@"query {{
repository(owner: ""{parts[0]}"", name: ""{parts[1]}"") {{
  pullRequests(states: OPEN, first: 50, orderBy: {{field: CREATED_AT, direction: DESC}}) {{
    totalCount
    nodes {{
      number title isDraft reviewDecision createdAt headRefName
      author {{ login }}
      commits(last: 1) {{ nodes {{ commit {{ statusCheckRollup {{ state }} }} }} }}
    }} }} }} }}";

            return RunQuery(query, out var error) is not { } data
                ? new PrListResult("error", error, fetched, 0, Array.Empty<PrListItem>())
                : ParseList(data, fetched);
        }
        catch (Exception ex)
        {
            _logger.Error($"[STATUS-GH-PR] list {ownerName} failed: {ex.Message}");
            return new PrListResult("error", ex.Message, fetched, 0, Array.Empty<PrListItem>());
        }
    }

    private PrDetailResult FetchDetail(string ownerName, int number)
    {
        var fetched = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        try
        {
            var parts = ownerName.Split('/');
            var query = $@"query {{
repository(owner: ""{parts[0]}"", name: ""{parts[1]}"") {{
  pullRequest(number: {number}) {{
    number title body url createdAt isDraft mergeable reviewDecision
    baseRefName headRefName additions deletions changedFiles
    author {{ login }}
    commits(last: 1) {{ nodes {{ commit {{ statusCheckRollup {{ state
      contexts(first: 50) {{ nodes {{ __typename
        ... on CheckRun {{ name status conclusion }}
        ... on StatusContext {{ context state }} }} }} }} }} }} }}
    files(first: 100) {{ nodes {{ path additions deletions }} }}
    reviews(first: 1) {{ totalCount }}
    comments(first: 1) {{ totalCount }}
  }} }} }}";

            if (RunQuery(query, out var error) is not { } data)
                return new PrDetailResult("error", error, fetched, null);

            using (data)
            {
                if (!data.RootElement.GetProperty("data").GetProperty("repository")
                        .TryGetProperty("pullRequest", out var pr) || pr.ValueKind != JsonValueKind.Object)
                    return new PrDetailResult("error", $"PR #{number} not found", fetched, null);
                return new PrDetailResult("ok", null, fetched, ParseDetail(pr));
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[STATUS-GH-PR] detail {ownerName}#{number} failed: {ex.Message}");
            return new PrDetailResult("error", ex.Message, fetched, null);
        }
    }

    /// <summary>Runs one GraphQL query through gh. Null result means failure with
    /// <paramref name="error"/> set; a non-null document is guaranteed to have a
    /// <c>data.repository</c> object. Caller disposes.</summary>
    private static JsonDocument? RunQuery(string query, out string? error)
    {
        var gh = ProcessProbe.ResolveOnPath("gh");
        if (gh is null) { error = "gh not found on PATH"; return null; }

        // -F query=@- reads the query from STDIN — same rationale as GitHubStatusService.
        var run = ProcessProbe.Run(gh, new[] { "api", "graphql", "-F", "query=@-" }, GhTimeoutMs, stdin: query);
        if (run.TimedOut) { error = "gh api graphql timed out"; return null; }

        JsonDocument doc;
        try { doc = JsonDocument.Parse(run.StdOut); }
        catch
        {
            error = FirstLine(run.StdErr) ?? "gh returned no JSON (not authenticated?)";
            return null;
        }

        if (doc.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Object &&
            data.TryGetProperty("repository", out var repo) && repo.ValueKind == JsonValueKind.Object)
        { error = null; return doc; }

        error = FirstLine(run.StdErr) ?? "GraphQL response had no repository data";
        doc.Dispose();
        return null;
    }

    // ---- parsing ---------------------------------------------------------------

    private static PrListResult ParseList(JsonDocument doc, long fetchedAtMs)
    {
        using (doc)
        {
            var prs = doc.RootElement.GetProperty("data").GetProperty("repository").GetProperty("pullRequests");
            var total = prs.TryGetProperty("totalCount", out var tc) ? tc.GetInt32() : 0;
            var now = DateTimeOffset.UtcNow;
            var items = new List<PrListItem>();
            if (prs.TryGetProperty("nodes", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
            {
                foreach (var pr in nodes.EnumerateArray())
                {
                    long age = 0;
                    if (pr.TryGetProperty("createdAt", out var ca) &&
                        DateTimeOffset.TryParse(ca.GetString(), out var created))
                        age = (long)(now - created).TotalMilliseconds;
                    items.Add(new PrListItem(
                        pr.GetProperty("number").GetInt32(),
                        pr.GetProperty("title").GetString() ?? "",
                        AuthorLogin(pr),
                        pr.TryGetProperty("headRefName", out var hr) ? hr.GetString() ?? "" : "",
                        pr.TryGetProperty("isDraft", out var d) && d.ValueKind == JsonValueKind.True,
                        NullableString(pr, "reviewDecision"),
                        CiOfLastCommit(pr, out _),
                        age));
                }
            }
            return new PrListResult("ok", null, fetchedAtMs, total, items);
        }
    }

    private static PrDetail ParseDetail(JsonElement pr)
    {
        long createdMs = 0;
        if (pr.TryGetProperty("createdAt", out var ca) && DateTimeOffset.TryParse(ca.GetString(), out var created))
            createdMs = created.ToUnixTimeMilliseconds();

        var ci = CiOfLastCommit(pr, out var rollup);

        var checks = new List<PrCheck>();
        if (rollup is { } r && r.TryGetProperty("contexts", out var ctxs) &&
            ctxs.TryGetProperty("nodes", out var cnodes) && cnodes.ValueKind == JsonValueKind.Array)
        {
            foreach (var n in cnodes.EnumerateArray())
            {
                var kind = n.TryGetProperty("__typename", out var tn) ? tn.GetString() : null;
                if (kind == "CheckRun")
                    checks.Add(new PrCheck(
                        n.TryGetProperty("name", out var cn) ? cn.GetString() ?? "?" : "?",
                        NullableString(n, "conclusion") ?? NullableString(n, "status") ?? "UNKNOWN"));
                else if (kind == "StatusContext")
                    checks.Add(new PrCheck(
                        n.TryGetProperty("context", out var cx) ? cx.GetString() ?? "?" : "?",
                        NullableString(n, "state") ?? "UNKNOWN"));
            }
        }

        var files = new List<PrFile>();
        if (pr.TryGetProperty("files", out var f) && f.TryGetProperty("nodes", out var fnodes) &&
            fnodes.ValueKind == JsonValueKind.Array)
            foreach (var n in fnodes.EnumerateArray())
                files.Add(new PrFile(
                    n.GetProperty("path").GetString() ?? "?",
                    n.GetProperty("additions").GetInt32(),
                    n.GetProperty("deletions").GetInt32()));

        return new PrDetail(
            pr.GetProperty("number").GetInt32(),
            pr.GetProperty("title").GetString() ?? "",
            AuthorLogin(pr),
            pr.TryGetProperty("body", out var b) ? b.GetString() ?? "" : "",
            pr.TryGetProperty("url", out var u) ? u.GetString() ?? "" : "",
            createdMs,
            pr.TryGetProperty("baseRefName", out var br) ? br.GetString() ?? "" : "",
            pr.TryGetProperty("headRefName", out var hr) ? hr.GetString() ?? "" : "",
            pr.TryGetProperty("isDraft", out var d) && d.ValueKind == JsonValueKind.True,
            NullableString(pr, "mergeable"),
            NullableString(pr, "reviewDecision"),
            ci,
            pr.TryGetProperty("additions", out var add) ? add.GetInt32() : 0,
            pr.TryGetProperty("deletions", out var del) ? del.GetInt32() : 0,
            pr.TryGetProperty("changedFiles", out var cf) ? cf.GetInt32() : 0,
            checks, files,
            TotalCount(pr, "reviews"), TotalCount(pr, "comments"));
    }

    /// <summary>pass | fail | pending | none from the head commit's statusCheckRollup;
    /// also surfaces the rollup element for check enumeration.</summary>
    private static string CiOfLastCommit(JsonElement pr, out JsonElement? rollup)
    {
        rollup = null;
        if (!pr.TryGetProperty("commits", out var commits) ||
            !commits.TryGetProperty("nodes", out var nodes) || nodes.ValueKind != JsonValueKind.Array)
            return "none";
        foreach (var n in nodes.EnumerateArray())
        {
            if (!n.TryGetProperty("commit", out var commit) ||
                !commit.TryGetProperty("statusCheckRollup", out var roll) || roll.ValueKind != JsonValueKind.Object)
                continue;
            rollup = roll;
            return (roll.TryGetProperty("state", out var st) ? st.GetString() : null) switch
            {
                "SUCCESS" => "pass",
                "FAILURE" or "ERROR" => "fail",
                "PENDING" or "EXPECTED" => "pending",
                _ => "none",
            };
        }
        return "none";
    }

    private static string? AuthorLogin(JsonElement pr)
        => pr.TryGetProperty("author", out var a) && a.ValueKind == JsonValueKind.Object &&
           a.TryGetProperty("login", out var l) ? l.GetString() : null;

    private static string? NullableString(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static int TotalCount(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var c) && c.ValueKind == JsonValueKind.Object &&
           c.TryGetProperty("totalCount", out var tc) ? tc.GetInt32() : 0;

    private static string? FirstLine(string? s)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        var line = s.Split('\n', StringSplitOptions.RemoveEmptyEntries)
                    .Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0);
        return line is { Length: > 200 } ? line[..200] : line;
    }
}
