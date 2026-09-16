using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec verifier-startup-yield: the verifier's hosted service must let the web host
/// finish starting before it runs its first pass. BackgroundService.StartAsync returns at
/// ExecuteAsync's first await, and Kestrel binds only after every hosted service has
/// started — so a synchronous first pass (now a GitHub trace per assignee and a model
/// question per card) held the harness off the network for ~75 s on 2026-09-16 and the
/// deploy's health check restored last-good. Here a slow PR probe stands in for GitHub:
/// StartAsync must return at once, and the pass must still run afterwards.
/// </summary>
public sealed class VerifierStartupTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-verstart-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public VerifierStartupTests() => Directory.CreateDirectory(_dir);

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private sealed class NoLocal : ITaskFactsProbe
    {
        public TaskLifecycle.Facts Probe(string repoPath, string branch) => new(false, null, false, false, null, null, false, null, false);
    }

    /// <summary>A GitHub that takes a while to answer — like the real one, per card.</summary>
    private sealed class SlowPr : IPrFactsProbe
    {
        public int Calls;
        public readonly TimeSpan Delay;
        public SlowPr(TimeSpan delay) => Delay = delay;
        public PrFacts? ProbePr(PrRef pr) { Interlocked.Increment(ref Calls); Thread.Sleep(Delay); return null; }
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => null;
    }

    [Fact]
    public async Task Starting_the_verifier_returns_at_once_even_when_the_first_pass_is_slow()
    {
        var graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // A card assigned to an agent on ANOTHER machine with a PR: verified from GitHub, so
        // the first pass has to wait on the (slow) PR probe.
        var n = graph.AddNode("remote work with a PR", null, "r9", "src-b", 0, 0, now)!;
        graph.Assign(n.Id, "src-b", "r9", "arch", now);
        graph.RecordClaim(n.Id, null, "feature/x", null, "https://github.com/mirceta/birocode/pull/66", now);

        var pr = new SlowPr(TimeSpan.FromSeconds(3));
        var repos = new RepositoryRegistry(new AppConfig(), _logger, _dir);
        var poller = new TaskVerificationPoller(graph, repos, new NoLocal(), pr, _logger);

        using var cts = new CancellationTokenSource();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var start = poller.StartAsync(cts.Token);
        var finished = await Task.WhenAny(start, Task.Delay(TimeSpan.FromSeconds(1.5)));
        sw.Stop();
        Assert.True(finished == start && start.IsCompletedSuccessfully,
            $"StartAsync did not return within 1.5 s (took {sw.ElapsedMilliseconds} ms): the first pass is blocking the host's start");
        Assert.True(sw.ElapsedMilliseconds < 1500, $"StartAsync took {sw.ElapsedMilliseconds} ms");

        // The pass still runs — just after the host is up.
        var deadline = DateTime.UtcNow.AddSeconds(15);
        while (poller.Last is null && DateTime.UtcNow < deadline) await Task.Delay(100);
        Assert.NotNull(poller.Last);
        Assert.True(pr.Calls >= 1, "the slow PR probe was never consulted — the pass did not run");

        cts.Cancel();
        try { await poller.StopAsync(CancellationToken.None); } catch (OperationCanceledException) { /* expected */ }
    }
}
