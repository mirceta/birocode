using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec board-check-provenance — the Board check's journal: every pass is recorded
/// (trigger, moves, flags raised / cleared, verdict, error); quiet passes coalesce into a run
/// whose pass count stays exact; a card's timeline is the entries that touched it; the journal
/// survives a restart; and the pass description is a pure function of before / after flags.
/// Plus the actor split: the judge stamps as "board-check" and never clears the policeman
/// conversation's own flag.
/// </summary>
public sealed class BoardCheckJournalTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-bcj-" + Guid.NewGuid().ToString("N"));
    private static readonly long T0 = 1_700_000_000_000L;

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static BoardCheckJournal.Entry Quiet(long at, string trigger = TaskVerificationPoller.TriggerTimer, int honest = 3, params BoardCheckJournal.Flag[] flagged) =>
        new(at, at, 1, trigger, 12, 3, 2, Array.Empty<BoardVerifier.Change>(), Array.Empty<string>(), 3 + flagged.Length, honest, 0, flagged.Length, 0, flagged, Array.Empty<BoardCheckJournal.Flag>(), Array.Empty<BoardCheckJournal.Flag>(), null);

    private static readonly BoardCheckJournal.Flag StuckA = new("a1", "card A", BoardIntegrity.Stuck, "pinged, no PR and no progress for 30 h (window 24 h)");

    [Fact]
    public void Quiet_passes_coalesce_into_one_run_and_the_pass_count_stays_exact()
    {
        var j = new BoardCheckJournal(null);
        for (var i = 0; i < 5; i++) j.Record(Quiet(T0 + i * 60_000));
        Assert.Equal(5, j.Passes);
        var recent = j.Recent(10);
        Assert.Single(recent);
        Assert.Equal(5, recent[0].Repeats);
        Assert.Equal(T0, recent[0].At);
        Assert.Equal(T0 + 4 * 60_000, recent[0].LastAt);
    }

    [Fact]
    public void A_move_a_flag_a_different_trigger_or_a_different_verdict_starts_a_new_entry()
    {
        var j = new BoardCheckJournal(null);
        j.Record(Quiet(T0));
        j.Record(Quiet(T0 + 1, TaskVerificationPoller.TriggerOperator));            // the operator pressed Re-verify: its own row
        j.Record(Quiet(T0 + 2, TaskVerificationPoller.TriggerTimer, 2, StuckA));                                  // the verdict changed: a new run
        j.Record(Quiet(T0 + 3, TaskVerificationPoller.TriggerTimer, 2, StuckA));                                  // same again: joins it
        var moved = Quiet(T0 + 4, TaskVerificationPoller.TriggerTimer, 2, StuckA) with { Changes = new[] { new BoardVerifier.Change("b2", "card B", "doing", "pr-opened") } };
        j.Record(moved);                                                            // a move: its own row, never coalesced
        j.Record(Quiet(T0 + 5, TaskVerificationPoller.TriggerTimer, 2, StuckA));                                  // quiet again, but after a loud one: a new run
        var recent = j.Recent(10);
        Assert.Equal(5, recent.Count);
        Assert.Equal(6, j.Passes);
        Assert.Equal(2, recent[2].Repeats);
        Assert.Single(recent[1].Changes);
    }

    [Fact]
    public void The_journal_is_bounded_and_a_card_has_its_own_timeline()
    {
        var j = new BoardCheckJournal(null);
        for (var i = 0; i < BoardCheckJournal.MaxEntries + 20; i++)
        {
            var e = Quiet(T0 + i) with { Changes = new[] { new BoardVerifier.Change(i % 2 == 0 ? "even" : "odd", "card", "doing", "committed") } };
            j.Record(e);
        }
        Assert.Equal(BoardCheckJournal.MaxEntries, j.Recent(10_000).Count);
        var even = j.ForCard("even");
        Assert.Equal(BoardCheckJournal.MaxEntries / 2, even.Count);
        Assert.True(even[0].At > even[^1].At, "newest first");
        Assert.Empty(j.ForCard("nope"));
        Assert.Contains(j.CardsSeen(), c => c.Id == "odd");
    }

    [Fact]
    public void The_journal_survives_a_restart()
    {
        var j = new BoardCheckJournal(_dir);
        j.Record(Quiet(T0, TaskVerificationPoller.TriggerTimer, 2, StuckA) with { Raised = new[] { StuckA } });
        j.Record(Quiet(T0 + 1, TaskVerificationPoller.TriggerTimer, 2, StuckA));
        var again = new BoardCheckJournal(_dir);
        Assert.Equal(2, again.Passes);
        var rows = again.Recent(10);
        Assert.Equal(2, rows.Count);                       // the loud pass (a flag raised) and the quiet one after it
        Assert.Equal(StuckA.Reason, rows[0].Flagged[0].Reason);
        Assert.Single(rows[1].Raised);
        Assert.Equal(2, again.ForCard("a1").Count);       // both passes mention the card (raised, then still flagged)
    }

    [Fact]
    public void Describe_reads_raised_and_cleared_flags_off_the_before_and_after_sets()
    {
        var before = new Dictionary<string, (string, string?)> { ["a1"] = ("card A", "pinged, no PR and no progress for 30 h (window 24 h)") };
        var after = new Dictionary<string, (string, string?)> { ["b2"] = ("card B", "the assignee reported it is blocked: BLOCKED — no creds") };
        var verdict = new BoardIntegrity.Summary(T0, 4, 2, 1, 1, 0, new[] { new BoardIntegrity.CardIntegrity("b2", "card B", BoardIntegrity.Stuck, "…"), new BoardIntegrity.CardIntegrity("c3", "card C", BoardIntegrity.Dishonest, "column ahead") });
        var result = new BoardVerifier.Result(3, 2, new[] { new BoardVerifier.Change("c3", "card C", "doing", "committed") }, new[] { "note" }, T0);
        var e = TaskVerificationPoller.Describe(T0, TaskVerificationPoller.TriggerTimer, 40, result, verdict, before, after, null);
        Assert.Single(e.Raised); Assert.Equal("b2", e.Raised[0].Id); Assert.Equal(BoardIntegrity.Stuck, e.Raised[0].State);
        Assert.Single(e.Cleared); Assert.Equal("a1", e.Cleared[0].Id);
        Assert.Equal(2, e.Flagged.Count);
        Assert.False(e.Quiet);
        Assert.True(e.Touches("c3") && e.Touches("a1") && !e.Touches("zz"));
        // A failed pass is still a journal entry, with the error and nothing else.
        var failed = TaskVerificationPoller.Describe(T0, TaskVerificationPoller.TriggerStartup, 5, null, null, before, before, "gh: not logged in");
        Assert.Equal("gh: not logged in", failed.Error);
        Assert.False(failed.Quiet);
        Assert.Equal(0, failed.Checked);
    }

    // ---- The actor split ---------------------------------------------------------------

    [Fact]
    public void The_judge_stamps_as_board_check_and_leaves_the_policeman_conversations_flag_alone()
    {
        var logger = new Logger();
        Directory.CreateDirectory(_dir);
        var graph = new TaskGraphService(logger, _dir, new NotesService(logger, _dir));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        const long window = 24 * 3600_000L;
        // A card the policeman CONVERSATION flagged for a reason the judge would never write.
        var honest = graph.AddNode("fine but flagged by the policeman", null, "r1", null, 0, 0, now - 3600_000)!;
        graph.SetNeedsHuman(honest.Id, new TaskGraphService.HumanRequest(now, BoardIntegrity.Policeman, "keeps claiming Done while the PR is closed unmerged"), now);
        // A card that is mechanically stuck.
        var stuck = graph.AddNode("went quiet", null, "r1", null, 0, 0, now - 2 * window)!;
        graph.Assign(stuck.Id, null, "r1", "arch", now - 2 * window);
        graph.MarkDispatched(stuck.Id, now - 2 * window);
        graph.UpdateNode(stuck.Id, null, null, null, null, "doing", null, null, now - 2 * window);
        // A pre-split stamp: "policeman" with a mechanical reason, on a card that is no longer stuck.
        var legacy = graph.AddNode("recovered", null, "r1", null, 0, 0, now - 3600_000)!;
        graph.SetNeedsHuman(legacy.Id, new TaskGraphService.HumanRequest(now - 7200_000, BoardIntegrity.Policeman, "pinged, no PR and no progress for 30 h (window 24 h)"), now - 7200_000);

        BoardIntegrity.Apply(graph, now, window);

        Assert.Equal(BoardIntegrity.Policeman, graph.Find(honest.Id)!.NeedsHuman!.By); // untouched: not the judge's to clear
        Assert.Equal(BoardIntegrity.BoardCheck, graph.Find(stuck.Id)!.NeedsHuman!.By);
        Assert.Null(graph.Find(legacy.Id)!.NeedsHuman);                                // the old mechanical stamp is recognised and withdrawn
        Assert.True(BoardIntegrity.IsMechanicalReason("pinged, no PR and no progress for 2 h (window 24 h)"));
        Assert.False(BoardIntegrity.IsMechanicalReason("keeps lying"));
    }
}
