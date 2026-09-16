using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec kanban-external-owner (fleet task 34707224): a card owned by a DIFFERENT human
/// developer is out of our domain. The owner rides the node (set, trimmed, cleared,
/// persisted); handing a card over withdraws the policeman's own marks; the judge reports
/// it <c>external</c> whatever its facts say (never stuck, never dishonest) and external
/// wins over manual; the verifier skips it; every tool refusal comes from the ONE shared
/// <see cref="CardDomain"/> rule with status <c>external</c>.
/// </summary>
public sealed class ExternalOwnerTests : IDisposable
{
    private const long Hour = 3600_000L;
    private const long Window = 24 * Hour;
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-ext-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly TaskGraphService _graph;

    public ExternalOwnerTests()
    {
        Directory.CreateDirectory(_dir);
        _graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private TaskGraphService.Node Pinged(string title, string status, long at, string? note = null)
    {
        var n = _graph.AddNode(title, note, "r1", null, 0, 0, at)!;
        _graph.Assign(n.Id, null, "r1", "arch", at);
        _graph.MarkDispatched(n.Id, at);
        return _graph.UpdateNode(n.Id, null, null, null, null, status, null, null, at)!;
    }

    // ---- The owner on the node ------------------------------------------------------------

    [Fact]
    public void The_owner_is_named_trimmed_capped_cleared_and_survives_a_reload()
    {
        var n = Pinged("theirs", "doing", Now - Hour);
        Assert.Null(_graph.SetExternalOwner("nope", "Jane", Now));

        var set = _graph.SetExternalOwner(n.Id, "  Jane Doe (Acme)  ", Now)!;
        Assert.Equal("Jane Doe (Acme)", set.ExternalOwner);
        Assert.Equal(Now, set.ExternalOwnerAt);
        Assert.True(CardDomain.IsExternal(set));
        Assert.True(CardDomain.IsHandsOff(set));

        var back = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir)).Find(n.Id)!;
        Assert.Equal("Jane Doe (Acme)", back.ExternalOwner);        // persisted with the card
        Assert.Equal(Now, back.ExternalOwnerAt);

        var same = _graph.SetExternalOwner(n.Id, "Jane Doe (Acme)", Now + 5)!;
        Assert.Equal(Now, same.ExternalOwnerAt);                     // unchanged name → no stamp

        var capped = _graph.SetExternalOwner(n.Id, new string('x', 500), Now + 6)!;
        Assert.Equal(CardDomain.MaxOwner, capped.ExternalOwner!.Length);

        var ours = _graph.SetExternalOwner(n.Id, "   ", Now + 7)!;    // blank = cleared
        Assert.Null(ours.ExternalOwner);
        Assert.Null(ours.ExternalOwnerAt);
        Assert.False(CardDomain.IsExternal(ours));
    }

    [Fact]
    public void Handing_a_card_over_drops_the_policemans_own_marks_but_never_the_Operators()
    {
        var a = Pinged("stuck, then theirs", "doing", Now - 2 * Window);
        BoardIntegrity.Apply(_graph, Now, Window);                   // the policeman stamps it
        _graph.SetObservation(a.Id, new TaskGraphService.CardObservation(Now, BoardIntegrity.Policeman, CardObservations.Blocked, "says it is blocked", "sess1"), Now);
        Assert.Equal(BoardIntegrity.Policeman, _graph.Find(a.Id)!.NeedsHuman!.By);
        Assert.NotNull(_graph.Find(a.Id)!.Observation);

        var handed = _graph.SetExternalOwner(a.Id, "Jane", Now + 1)!;
        Assert.Null(handed.NeedsHuman);                              // not ours to judge any more
        Assert.Null(handed.Observation);

        var b = Pinged("operator flagged, then theirs", "doing", Now - Hour);
        _graph.SetNeedsHuman(b.Id, new TaskGraphService.HumanRequest(Now, BoardIntegrity.Operator, "please look"), Now);
        var kept = _graph.SetExternalOwner(b.Id, "Jane", Now + 1)!;
        Assert.Equal(BoardIntegrity.Operator, kept.NeedsHuman!.By);  // the Operator's own stamp stays
    }

    // ---- The judge ------------------------------------------------------------------------

    [Fact]
    public void An_external_card_is_external_whatever_its_facts_say_and_is_never_stamped()
    {
        var lying = Pinged("column ahead, but theirs", "pr-merged", Now - 3 * Window);
        _graph.SetExternalOwner(lying.Id, "Jane", Now);
        var j = BoardIntegrity.Judge(_graph.Find(lying.Id)!, Now, Window);
        Assert.Equal(BoardIntegrity.ExternalState, j.State);
        Assert.Contains("owned by Jane (external)", j.Reason);
        Assert.Contains("not ours to judge", j.Reason);

        var silent = Pinged("silent past the window, but theirs", "doing", Now - 3 * Window);
        _graph.SetExternalOwner(silent.Id, "Jane", Now);
        var s = BoardIntegrity.Apply(_graph, Now, Window);
        Assert.Null(_graph.Find(silent.Id)!.NeedsHuman);             // never "needs human"
        Assert.Equal(2, s.External);
        Assert.Equal(0, s.Stuck);
        Assert.Equal(0, s.Dishonest);
        Assert.Empty(s.Flagged);

        // Back to ours: the next pass judges it again.
        _graph.SetExternalOwner(silent.Id, null, Now + 1);
        BoardIntegrity.Apply(_graph, Now + 2, Window);
        Assert.Equal(BoardIntegrity.Policeman, _graph.Find(silent.Id)!.NeedsHuman!.By);
    }

    [Fact]
    public void External_wins_over_manual_and_both_are_distinct_states()
    {
        var n = Pinged("both", "doing", Now - Hour);
        _graph.SetManual(n.Id, true, Now);
        Assert.Equal(CardDomain.ManualState, CardDomain.HandsOffStatus(_graph.Find(n.Id)!));
        Assert.Equal(BoardIntegrity.ManualState, BoardIntegrity.Judge(_graph.Find(n.Id)!, Now, Window).State);

        _graph.SetExternalOwner(n.Id, "Jane", Now + 1);
        var both = _graph.Find(n.Id)!;
        Assert.True(both.Manual);                                    // the manual flag is untouched
        Assert.Equal(CardDomain.ExternalState, CardDomain.HandsOffStatus(both));
        Assert.Equal(BoardIntegrity.ExternalState, BoardIntegrity.Judge(both, Now, Window).State);

        var s = BoardIntegrity.Assess(new[] { both }, Now, Window);
        Assert.Equal(1, s.External);
        Assert.Equal(0, s.Manual);                                   // counted once, as external

        _graph.SetExternalOwner(n.Id, null, Now + 2);
        Assert.Equal(CardDomain.ManualState, CardDomain.HandsOffStatus(_graph.Find(n.Id)!)); // manual remains
    }

    // ---- The verifier ---------------------------------------------------------------------

    private sealed class Advancing : ITaskFactsProbe, IPrFactsProbe
    {
        public int Probes;
        public TaskLifecycle.Facts Probe(string repoPath, string branch) { Probes++; return new TaskLifecycle.Facts(true, "abc123", true, false, null, null, false, null, false); }
        public PrFacts? ProbePr(PrRef pr) => null;
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => null;
    }

    [Fact]
    public void The_verifier_skips_external_cards_entirely()
    {
        var ours = Pinged("ours", "doing", Now - Hour);
        _graph.RecordClaim(ours.Id, "feat/ours", null, null, Now - Hour);
        var theirs = Pinged("theirs", "doing", Now - Hour);
        _graph.RecordClaim(theirs.Id, "feat/theirs", null, null, Now - Hour);
        _graph.SetExternalOwner(theirs.Id, "Jane", Now);

        var probe = new Advancing();
        var verifier = new BoardVerifier(_graph, probe, probe, null, _logger);
        var result = verifier.VerifyOnce(new Dictionary<string, string> { ["r1"] = _dir }, Now);

        Assert.Equal(1, probe.Probes);                               // only our card was probed
        Assert.Equal("committed", _graph.Find(ours.Id)!.Status);
        Assert.Equal("doing", _graph.Find(theirs.Id)!.Status);      // not advanced, not badged
        Assert.Null(_graph.Find(theirs.Id)!.Warning);
        Assert.Contains(result.Notes, x => x.Contains("external — owned by Jane, not verified"));
    }

    // ---- The one refusal every tool answers with ---------------------------------------------

    [Fact]
    public void Every_tool_refusal_comes_from_the_shared_rule_with_status_external()
    {
        var n = Pinged("theirs", "doing", Now - Hour);
        Assert.Null(CardDomain.Refusal(n, "nothing was sent"));

        var ext = _graph.SetExternalOwner(n.Id, "Jane Doe", Now)!;
        var r = CardDomain.Refusal(ext, "nothing was sent")!.Value;
        Assert.Equal("external", r.Status);
        Assert.Contains("owned by Jane Doe (external)", r.Message);
        Assert.Contains("out of our domain", r.Message);
        Assert.EndsWith("nothing was sent", r.Message);
        Assert.Contains(TaskGraphService.CardRef(n.Id), r.Message);

        _graph.SetExternalOwner(n.Id, null, Now + 1);
        var man = _graph.SetManual(n.Id, true, Now + 2)!;
        var m = CardDomain.Refusal(man, "the card was not changed")!.Value;
        Assert.Equal("manual", m.Status);
        Assert.Contains("the Operator handles it directly", m.Message);

        Assert.Null(CardDomain.CleanOwner("  "));
        Assert.Equal("Jane", CardDomain.CleanOwner(" Jane "));
    }

    [Fact]
    public void The_policemans_handover_counts_external_cards()
    {
        var summary = ArchPoliceman.VerdictSummary(
            new BoardIntegrity.Summary(1, 6, 3, 1, 1, 0, Array.Empty<BoardIntegrity.CardIntegrity>(), External: 1),
            Array.Empty<(string, string, string, string?)>());
        Assert.Contains("3 honest · 1 dishonest · 1 stuck · 0 manual · 1 external", summary);
    }
}
