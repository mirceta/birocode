using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec kanban-board-integrity (fleet task b2ea0809) — the board "policeman": the pure
/// judgement of a card (honest / dishonest / stuck / manual), the stamping and clearing
/// of its OWN "human assistance requested" marks (never anyone else's), the verifier
/// leaving manual cards alone, and the board goal (set, persisted, merged LWW so one
/// fleet board keeps one goal).
/// </summary>
public sealed class BoardIntegrityTests : IDisposable
{
    private const long Hour = 3600_000L;
    private const long Window = 24 * Hour;
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-pol-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly TaskGraphService _graph;

    public BoardIntegrityTests()
    {
        Directory.CreateDirectory(_dir);
        _graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    // A card assigned to r1 on this harness, pinged at `at`, moved to `status` at `at`.
    private TaskGraphService.Node Pinged(string title, string status, long at, string? note = null)
    {
        var n = _graph.AddNode(title, note, "r1", null, 0, 0, at)!;
        _graph.Assign(n.Id, null, "r1", "arch", at);
        _graph.MarkDispatched(n.Id, at);
        return _graph.UpdateNode(n.Id, null, null, null, null, status, null, null, at)!;
    }

    // ---- Judge (pure) ---------------------------------------------------------------

    [Fact]
    public void A_pinged_card_in_doing_with_recent_activity_is_honest()
    {
        var n = Pinged("working", "doing", Now - Hour);
        var j = BoardIntegrity.Judge(n, Now, Window);
        Assert.Equal(BoardIntegrity.Honest, j.State);
        Assert.Null(j.Reason);
    }

    [Fact]
    public void A_column_ahead_of_the_verified_facts_is_dishonest_with_the_existing_warning_as_reason()
    {
        var n = Pinged("claims a PR", "pr-opened", Now - Hour); // nothing verified → the ⚠ unverified rule
        Assert.True(TaskGraphService.IsUnverified(n));
        var j = BoardIntegrity.Judge(n, Now, Window);
        Assert.Equal(BoardIntegrity.Dishonest, j.State);
        Assert.Contains("column ahead of reality", j.Reason);
        Assert.Contains("claimed pr-opened", j.Reason);
    }

    [Fact]
    public void Silent_past_the_window_with_no_PR_is_stuck()
    {
        var n = Pinged("went quiet", "doing", Now - 2 * Window);
        var j = BoardIntegrity.Judge(n, Now, Window);
        Assert.Equal(BoardIntegrity.Stuck, j.State);
        Assert.Contains("no PR and no progress", j.Reason);
    }

    [Fact]
    public void A_card_with_a_PR_is_never_stuck_however_old()
    {
        var n = Pinged("waits on review", "doing", Now - 3 * Window);
        _graph.RecordClaim(n.Id, "feat/x", null, "https://github.com/o/r/pull/7", Now - 3 * Window);
        var j = BoardIntegrity.Judge(_graph.Find(n.Id)!, Now, Window);
        Assert.NotEqual(BoardIntegrity.Stuck, j.State);
    }

    [Fact]
    public void An_explicit_TASK_BLOCKED_relay_is_stuck_at_once()
    {
        var n = Pinged("cannot", "doing", Now - Hour);
        // The arch relays "TASK BLOCKED <id>: …" as todo + the reason in the note.
        n = _graph.UpdateNode(n.Id, null, "TASK BLOCKED: needs a production credential\nmore detail", null, null, "todo", null, null, Now - 60_000)!;
        var j = BoardIntegrity.Judge(n, Now, Window);
        Assert.Equal(BoardIntegrity.Stuck, j.State);
        Assert.Contains("reported it is blocked", j.Reason);
        Assert.Contains("production credential", j.Reason);
        Assert.DoesNotContain("more detail", j.Reason); // first line only
    }

    [Fact]
    public void A_never_pinged_card_and_a_delivered_card_are_not_stuck()
    {
        var idle = _graph.AddNode("assigned, never pinged", null, "r1", null, 0, 0, Now - 3 * Window)!;
        _graph.Assign(idle.Id, null, "r1", "arch", Now - 3 * Window);
        Assert.Equal(BoardIntegrity.Honest, BoardIntegrity.Judge(_graph.Find(idle.Id)!, Now, Window).State);

        var done = Pinged("shipped", "done", Now - 3 * Window);
        Assert.NotEqual(BoardIntegrity.Stuck, BoardIntegrity.Judge(done, Now, Window).State);
    }

    [Fact]
    public void A_manual_card_is_manual_whatever_its_facts_say()
    {
        var n = Pinged("lying but manual", "pr-merged", Now - 3 * Window);
        _graph.SetManual(n.Id, true, Now);
        var j = BoardIntegrity.Judge(_graph.Find(n.Id)!, Now, Window);
        Assert.Equal(BoardIntegrity.ManualState, j.State);
    }

    // ---- Apply: stamps and clears only its own marks -----------------------------------

    [Fact]
    public void Apply_stamps_a_stuck_card_once_and_clears_it_when_it_progresses()
    {
        var n = Pinged("went quiet", "doing", Now - 2 * Window);
        var s1 = BoardIntegrity.Apply(_graph, Now, Window);
        Assert.Equal(1, s1.Stuck);
        var stamped = _graph.Find(n.Id)!;
        Assert.NotNull(stamped.NeedsHuman);
        Assert.Equal(BoardIntegrity.BoardCheck, stamped.NeedsHuman!.By);
        Assert.Contains("no progress", stamped.NeedsHuman.Reason);

        // Idempotent: a second pass neither re-stamps nor bumps the card.
        var before = _graph.Find(n.Id)!;
        BoardIntegrity.Apply(_graph, Now + 1000, Window);
        Assert.Equal(before, _graph.Find(n.Id));

        // Progress (a PR) → the policeman withdraws its own stamp.
        _graph.RecordClaim(n.Id, "feat/x", null, "https://github.com/o/r/pull/9", Now + 2000);
        var s2 = BoardIntegrity.Apply(_graph, Now + 3000, Window);
        Assert.Equal(0, s2.Stuck);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
    }

    [Fact]
    public void Apply_never_clears_a_request_the_Operator_or_an_agent_raised()
    {
        var n = Pinged("fine but the Operator asked", "doing", Now - Hour);
        _graph.SetNeedsHuman(n.Id, new TaskGraphService.HumanRequest(Now, BoardIntegrity.Operator, "please review the approach"), Now);
        BoardIntegrity.Apply(_graph, Now + 1000, Window);
        var after = _graph.Find(n.Id)!.NeedsHuman;
        Assert.NotNull(after);
        Assert.Equal(BoardIntegrity.Operator, after!.By);

        // …and does not overwrite an agent's request on a card that is ALSO stuck.
        var m = Pinged("agent asked, then went quiet", "doing", Now - 2 * Window);
        _graph.SetNeedsHuman(m.Id, new TaskGraphService.HumanRequest(Now - Window, BoardIntegrity.Agent, "need a credential", "req-1"), Now - Window);
        BoardIntegrity.Apply(_graph, Now, Window);
        Assert.Equal(BoardIntegrity.Agent, _graph.Find(m.Id)!.NeedsHuman!.By);
        Assert.Equal("req-1", _graph.Find(m.Id)!.NeedsHuman!.RequestId);
    }

    [Fact]
    public void Going_manual_drops_the_policemans_stamp_but_keeps_the_Operators_and_the_summary_counts_it()
    {
        var a = Pinged("stuck then manual", "doing", Now - 2 * Window);
        BoardIntegrity.Apply(_graph, Now, Window);
        Assert.NotNull(_graph.Find(a.Id)!.NeedsHuman);
        _graph.SetManual(a.Id, true, Now);
        Assert.Null(_graph.Find(a.Id)!.NeedsHuman);   // nothing is policed any more
        Assert.True(_graph.Find(a.Id)!.Manual);

        var b = Pinged("operator flagged, then manual", "doing", Now - Hour);
        _graph.SetNeedsHuman(b.Id, new TaskGraphService.HumanRequest(Now, BoardIntegrity.Operator, "x"), Now);
        _graph.SetManual(b.Id, true, Now);
        Assert.NotNull(_graph.Find(b.Id)!.NeedsHuman); // the Operator's own request stays

        var s = BoardIntegrity.Apply(_graph, Now + 1, Window);
        Assert.Equal(2, s.Manual);
        Assert.Equal(0, s.Stuck);
        Assert.Empty(s.Flagged);

        // Flipping back re-arms policing: the quiet card is stuck again.
        _graph.SetManual(a.Id, false, Now + 2);
        Assert.False(_graph.Find(a.Id)!.Manual);
        Assert.Equal(BoardIntegrity.Stuck, BoardIntegrity.Judge(_graph.Find(a.Id)!, Now + 3, Window).State);
    }

    [Fact]
    public void The_Operator_can_raise_and_resolve_by_hand()
    {
        var n = Pinged("hand-raised", "doing", Now - Hour);
        _graph.SetNeedsHuman(n.Id, new TaskGraphService.HumanRequest(Now, BoardIntegrity.Operator, "look at this"), Now);
        Assert.Equal("look at this", _graph.Find(n.Id)!.NeedsHuman!.Reason);
        _graph.SetNeedsHuman(n.Id, null, Now + 1);          // the Operator resolves anything
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
        Assert.Null(_graph.SetNeedsHuman("nope", null, Now)); // unknown id → null, not a throw
    }

    // ---- The verifier leaves manual cards alone -----------------------------------------

    private sealed class Advancing : ITaskFactsProbe, IPrFactsProbe
    {
        public int Probes;
        public TaskLifecycle.Facts Probe(string repoPath, string branch) { Probes++; return new TaskLifecycle.Facts(true, "abc123", true, false, null, null, false, null, false); }
        public PrFacts? ProbePr(PrRef pr) => null;
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => null;
    }

    [Fact]
    public void The_verifier_skips_manual_cards_entirely()
    {
        var auto = Pinged("auto", "doing", Now - Hour);
        _graph.RecordClaim(auto.Id, "feat/auto", null, null, Now - Hour);
        var manual = Pinged("manual", "doing", Now - Hour);
        _graph.RecordClaim(manual.Id, "feat/manual", null, null, Now - Hour);
        _graph.SetManual(manual.Id, true, Now);

        var probe = new Advancing();
        var verifier = new BoardVerifier(_graph, probe, probe, null, _logger);
        var result = verifier.VerifyOnce(new Dictionary<string, string> { ["r1"] = _dir }, Now);

        Assert.Equal(1, probe.Probes);                                         // only the automatic card was probed
        Assert.Equal("committed", _graph.Find(auto.Id)!.Status);              // facts advanced it
        Assert.Equal("doing", _graph.Find(manual.Id)!.Status);                // the manual one was not touched
        Assert.Contains(result.Notes, x => x.Contains("manual — not verified"));
    }

    // ---- The board goal ------------------------------------------------------------------

    [Fact]
    public void The_goal_is_set_trimmed_persisted_and_a_no_op_write_does_not_stamp()
    {
        Assert.Equal("", _graph.Get().Goal);
        Assert.Equal("Ship v2.4 by Friday", _graph.SetGoal("  Ship v2.4 by Friday  ", 1000));
        Assert.Equal(1000, _graph.Get().GoalUpdatedAt);
        _graph.SetGoal("Ship v2.4 by Friday", 2000);
        Assert.Equal(1000, _graph.Get().GoalUpdatedAt);                      // unchanged text → no stamp
        var reloaded = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir)).Get();
        Assert.Equal("Ship v2.4 by Friday", reloaded.Goal);
        Assert.Equal(1000, reloaded.GoalUpdatedAt);
    }

    [Fact]
    public void The_goal_merges_last_writer_wins_and_an_older_peer_cannot_erase_it()
    {
        _graph.SetGoal("local goal", 5000);
        // An older peer's snapshot has no goal at all → local wins.
        _graph.MergeFrom(new TaskGraphService.GraphSnapshot(null, null, null, null, 0, null));
        Assert.Equal("local goal", _graph.Get().Goal);
        // A newer remote goal replaces it.
        _graph.MergeFrom(new TaskGraphService.GraphSnapshot(null, null, null, null, 0, null, "fleet goal", 6000));
        Assert.Equal("fleet goal", _graph.Get().Goal);
        Assert.Equal(6000, _graph.Get().GoalUpdatedAt);
        // An older remote goal does not.
        _graph.MergeFrom(new TaskGraphService.GraphSnapshot(null, null, null, null, 0, null, "stale goal", 4000));
        Assert.Equal("fleet goal", _graph.Get().Goal);
        // An exact tie with different text converges on the ordinal-greater text on every peer.
        _graph.MergeFrom(new TaskGraphService.GraphSnapshot(null, null, null, null, 0, null, "zzz goal", 6000));
        Assert.Equal("zzz goal", _graph.Get().Goal);
        _graph.MergeFrom(new TaskGraphService.GraphSnapshot(null, null, null, null, 0, null, "aaa goal", 6000));
        Assert.Equal("zzz goal", _graph.Get().Goal);
    }

    [Fact]
    public void Manual_and_needsHuman_ride_the_node_and_survive_a_reload()
    {
        var n = Pinged("flags", "doing", Now - Hour);
        _graph.SetManual(n.Id, true, Now);
        _graph.SetNeedsHuman(n.Id, new TaskGraphService.HumanRequest(Now, BoardIntegrity.Operator, "why"), Now);
        var back = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir)).Find(n.Id)!;
        Assert.True(back.Manual);
        Assert.Equal(Now, back.ManualAt);
        Assert.Equal("why", back.NeedsHuman!.Reason);
    }
}
