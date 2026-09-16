using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec policeman-syncs-cards — tracing a pull request back to the card it
/// delivers (pure <see cref="PrTrace"/>): recorded PR beats recorded branch beats the #ref
/// in the PR beats a title match; delivered and manual cards are never candidates; a tie is
/// no match. And the mechanism sync_card relies on: link a PR to a card in Doing, one
/// verifier pass, the card is at PR open — forward only, by the facts.</summary>
public sealed class PrTraceTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-prtrace-" + Guid.NewGuid().ToString("N"));
    public PrTraceTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private TaskGraphService Graph() => new(new Logger(), _dir);
    private static PrListItem Pr(int n, string title, string? head = null, string? body = null, string state = "OPEN") =>
        new(n, title, $"https://github.com/mirceta/birocode/pull/{n}", state, false, head, "h" + n, body, "bot", null);

    [Fact]
    public void Recorded_PR_then_branch_then_ref_then_title_in_that_order()
    {
        var g = Graph();
        var byPr = g.AddNode("Export the invoice register as CSV", null, null, null, 0, 0, now: 1)!;
        g.Assign(byPr.Id, null, "r-prg", "arch", 2);
        g.RecordClaim(byPr.Id, null, null, "https://github.com/mirceta/birocode/pull/9", 3);
        var byBranch = g.AddNode("Wire the CSV button", null, null, null, 0, 0, now: 1)!;
        g.Assign(byBranch.Id, null, "r-prg", "arch", 2);
        g.RecordClaim(byBranch.Id, "feat/csv-button", null, null, 3);
        var byRef = g.AddNode("Something unrelated", null, null, null, 0, 0, now: 1)!;
        var byTitle = g.AddNode("Kanban card sections", null, null, null, 0, 0, now: 1)!;
        var nodes = g.Get().Nodes;

        var m1 = PrTrace.Trace(Pr(9, "csv export"), nodes)!;
        Assert.Equal(byPr.Id, m1.Node.Id);
        Assert.Equal(4, m1.Strength);

        var m2 = PrTrace.Trace(Pr(10, "button", head: "feat/csv-button"), nodes)!;
        Assert.Equal(byBranch.Id, m2.Node.Id);
        Assert.Equal(3, m2.Strength);

        var short8 = TaskGraphService.ShortId(byRef.Id);
        var m3 = PrTrace.Trace(Pr(11, "fix stuff", body: $"Closes card #{short8} on the board"), nodes)!;
        Assert.Equal(byRef.Id, m3.Node.Id);
        Assert.Equal(2, m3.Strength);
        var m3b = PrTrace.Trace(Pr(12, "x", head: $"feat/{short8}-fix"), nodes)!;
        Assert.Equal(byRef.Id, m3b.Node.Id);

        var m4 = PrTrace.Trace(Pr(13, "feat: Kanban card sections instead of badges"), nodes)!;
        Assert.Equal(byTitle.Id, m4.Node.Id);
        Assert.Equal(1, m4.Strength);

        Assert.Null(PrTrace.Trace(Pr(14, "nothing here", head: "main"), nodes));
    }

    [Fact]
    public void Delivered_and_manual_cards_are_not_candidates_and_a_tie_is_no_match()
    {
        var g = Graph();
        var done = g.AddNode("Ideas consumed on promotion", null, null, null, 0, 0, now: 1)!;
        g.UpdateNode(done.Id, null, null, null, null, "done", null, null, 2);
        var manual = g.AddNode("Release notes for 2.4", null, null, null, 0, 0, now: 1)!;
        g.SetManual(manual.Id, true, 2);
        var a = g.AddNode("Fleet keep-alive column", null, null, null, 0, 0, now: 1)!;
        var b = g.AddNode("Fleet keep-alive column (again)", null, null, null, 0, 0, now: 1)!;
        var nodes = g.Get().Nodes;

        Assert.Null(PrTrace.Trace(Pr(1, "Ideas consumed on promotion"), nodes));
        Assert.Null(PrTrace.Trace(Pr(2, "Release notes for 2.4"), nodes));
        // Both a and b match the title at strength 1 → a tie → no guess.
        Assert.Null(PrTrace.Trace(Pr(3, "Fleet keep-alive column"), nodes));
        Assert.NotNull(a); Assert.NotNull(b);
    }

    [Fact]
    public void Branch_and_PR_matches_are_scoped_to_the_named_repo()
    {
        var g = Graph();
        var n = g.AddNode("Two repos", null, null, null, 0, 0, now: 1)!;
        g.SetAssignees(n.Id, new[] { ((string?)null, "r-web"), ((string?)null, "r-prg") }, "arch", 2, resetDispatch: true);
        g.RecordClaim(n.Id, TaskGraphService.AssigneeKey(null, "r-prg"), "feat/prg-side", null, null, 3);
        var nodes = g.Get().Nodes;
        Assert.NotNull(PrTrace.Trace(Pr(5, "x", head: "feat/prg-side"), nodes, "r-prg"));
        Assert.Null(PrTrace.Trace(Pr(5, "x", head: "feat/prg-side"), nodes, "r-web"));
        Assert.NotNull(PrTrace.Trace(Pr(5, "x", head: "feat/prg-side"), nodes));
    }

    // ---- the mechanism behind sync_card: link, then one pass moves the card by the facts ----

    private sealed class FakePr : IPrFactsProbe
    {
        public readonly Dictionary<string, PrFacts?> ByKey = new(StringComparer.OrdinalIgnoreCase);
        public PrFacts? ProbePr(PrRef pr) => ByKey.TryGetValue(pr.Number is { } n ? $"{pr.OwnerRepo}#{n}" : $"{pr.OwnerRepo}@{pr.Branch}", out var f) ? f : null;
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => null;
    }
    private sealed class NoLocal : ITaskFactsProbe
    {
        public TaskLifecycle.Facts Probe(string repoPath, string branch) => new(false, null, false, false, null, null, false, null, false);
    }

    [Fact]
    public void Linking_an_open_PR_to_a_card_in_doing_moves_it_to_pr_opened_on_the_next_pass_and_never_back()
    {
        var g = Graph();
        var n = g.AddNode("Export the invoice register as CSV", null, null, null, 0, 0, now: 1)!;
        g.Assign(n.Id, null, "r-prg", "arch", 2);
        g.UpdateNode(n.Id, null, null, null, null, "doing", null, null, 3);
        var pr = new FakePr();
        pr.ByKey["mirceta/birocode#9"] = new PrFacts("https://github.com/mirceta/birocode/pull/9", 9, "OPEN", null, "h9", "feat/csv");
        var v = new BoardVerifier(g, new NoLocal(), pr, null, new Logger());

        // Before the link the verifier has nowhere to look: the card stays in Doing.
        v.VerifyOnce(new Dictionary<string, string>(), 10);
        Assert.Equal("doing", g.Find(n.Id)!.Status);

        // sync_card's two steps: record the linkage, run one pass.
        g.RecordClaim(n.Id, null, "feat/csv", null, "https://github.com/mirceta/birocode/pull/9", 11);
        var pass = v.VerifyOnce(new Dictionary<string, string>(), 12);
        var after = g.Find(n.Id)!;
        Assert.Equal("pr-opened", after.Status);
        Assert.Equal("pr-opened", after.VerifiedStatus);
        Assert.Null(after.Warning);
        Assert.Contains(pass.Changes, c => c.Id == n.Id && c.From == "doing" && c.To == "pr-opened");

        // The PR closed without a merge: the facts no longer support PR open, but an
        // observation never demotes — the card stays, the policeman would flag it.
        pr.ByKey["mirceta/birocode#9"] = new PrFacts("https://github.com/mirceta/birocode/pull/9", 9, "CLOSED", null, "h9", "feat/csv");
        v.VerifyOnce(new Dictionary<string, string>(), 13);
        Assert.Equal("pr-opened", g.Find(n.Id)!.Status);
    }
}
