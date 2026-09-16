using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Policeman;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec board-check-provenance / one-policeman — the policeman's journal: every pass is
/// recorded (trigger, traces, moves, questions, flags raised / cleared, verdict, error); quiet
/// passes coalesce into a run whose pass count stays exact; a card's timeline is the entries that
/// touched it; the journal survives a restart; and the pass description is a pure function of
/// before / after flags. Plus the judge's actor rule: it stamps as the policeman and never clears
/// a flag the reading sweep raised.
/// </summary>
public sealed class PolicemanJournalTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-pj-" + Guid.NewGuid().ToString("N"));
    private static readonly long T0 = 1_700_000_000_000L;
    private static readonly PolicemanJournal.Traced[] NoTrace = Array.Empty<PolicemanJournal.Traced>();
    private static readonly PolicemanJournal.Question[] NoQuestions = Array.Empty<PolicemanJournal.Question>();
    private static readonly PolicemanJournal.Flag[] NoFlags = Array.Empty<PolicemanJournal.Flag>();

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private static PolicemanJournal.Entry Quiet(long at, string trigger = TaskVerificationPoller.TriggerTimer, int honest = 3, params PolicemanJournal.Flag[] flagged) =>
        new(at, at, 1, trigger, 12, 3, 2, Array.Empty<BoardVerifier.Change>(), NoTrace, NoQuestions, Array.Empty<string>(), 3 + flagged.Length, honest, 0, flagged.Length, 0, flagged, NoFlags, NoFlags, null);

    private static readonly PolicemanJournal.Flag StuckA = new("a1", "card A", BoardIntegrity.Stuck, "pinged, no PR and no progress for 30 h (window 24 h)");

    [Fact]
    public void Quiet_passes_coalesce_into_one_run_and_the_pass_count_stays_exact()
    {
        var j = new PolicemanJournal(null);
        for (var i = 0; i < 5; i++) j.Record(Quiet(T0 + i * 60_000));
        Assert.Equal(5, j.Passes);
        var recent = j.Recent(10);
        Assert.Single(recent);
        Assert.Equal(5, recent[0].Repeats);
        Assert.Equal(T0, recent[0].At);
        Assert.Equal(T0 + 4 * 60_000, recent[0].LastAt);
    }

    [Fact]
    public void A_move_a_question_a_flag_a_different_trigger_or_a_different_verdict_starts_a_new_entry()
    {
        var j = new PolicemanJournal(null);
        j.Record(Quiet(T0));
        j.Record(Quiet(T0 + 1, TaskVerificationPoller.TriggerOperator));
        j.Record(Quiet(T0 + 2, TaskVerificationPoller.TriggerTimer, 2, StuckA));
        j.Record(Quiet(T0 + 3, TaskVerificationPoller.TriggerTimer, 2, StuckA));
        j.Record(Quiet(T0 + 4, TaskVerificationPoller.TriggerTimer, 2, StuckA) with { Changes = new[] { new BoardVerifier.Change("b2", "card B", "doing", "pr-opened") } });
        j.Record(Quiet(T0 + 5, TaskVerificationPoller.TriggerTimer, 2, StuckA) with { Questions = new[] { new PolicemanJournal.Question("b2", "card B", "prg", "opened PR", "waiting-review", "PR up", 900, null) } });
        j.Record(Quiet(T0 + 6, TaskVerificationPoller.TriggerTimer, 2, StuckA));
        var recent = j.Recent(10);
        Assert.Equal(6, recent.Count);
        Assert.Equal(7, j.Passes);
        Assert.Equal(900, recent[1].Tokens);
        Assert.False(recent[1].Quiet);
        Assert.Equal(2, recent[3].Repeats);
    }

    [Fact]
    public void The_journal_is_bounded_and_a_card_has_its_own_timeline()
    {
        var j = new PolicemanJournal(null);
        for (var i = 0; i < PolicemanJournal.MaxEntries + 20; i++)
            j.Record(Quiet(T0 + i) with { Changes = new[] { new BoardVerifier.Change(i % 2 == 0 ? "even" : "odd", "card", "doing", "committed") } });
        Assert.Equal(PolicemanJournal.MaxEntries, j.Recent(10_000).Count);
        var even = j.ForCard("even");
        Assert.Equal(PolicemanJournal.MaxEntries / 2, even.Count);
        Assert.True(even[0].At > even[^1].At, "newest first");
        Assert.Empty(j.ForCard("nope"));
        Assert.Contains(j.CardsSeen(), c => c.Id == "odd");
    }

    [Fact]
    public void The_journal_survives_a_restart()
    {
        var j = new PolicemanJournal(_dir);
        j.Record(Quiet(T0, TaskVerificationPoller.TriggerTimer, 2, StuckA) with { Raised = new[] { StuckA }, Traced = new[] { new PolicemanJournal.Traced("a1", "card A", "PR #7 open", "the assignee records branch feat/a") } });
        j.Record(Quiet(T0 + 1, TaskVerificationPoller.TriggerTimer, 2, StuckA));
        var again = new PolicemanJournal(_dir);
        Assert.Equal(2, again.Passes);
        var rows = again.Recent(10);
        Assert.Equal(2, rows.Count);
        Assert.Equal(StuckA.Reason, rows[0].Flagged[0].Reason);
        Assert.Single(rows[1].Raised);
        Assert.Single(rows[1].Traced);
        Assert.Equal(2, again.ForCard("a1").Count);
    }

    [Fact]
    public void Describe_reads_raised_and_cleared_flags_off_the_before_and_after_sets_and_carries_the_sweep()
    {
        var before = new Dictionary<string, (string, string?)> { ["a1"] = ("card A", "pinged, no PR and no progress for 30 h (window 24 h)") };
        var after = new Dictionary<string, (string, string?)> { ["b2"] = ("card B", "asked a question 3 h ago and nobody answered: needs the API key") };
        var verdict = new BoardIntegrity.Summary(T0, 4, 2, 1, 1, 0, new[] { new BoardIntegrity.CardIntegrity("b2", "card B", BoardIntegrity.Stuck, "…") });
        var result = new BoardVerifier.Result(3, 2, new[] { new BoardVerifier.Change("c3", "card C", "doing", "pr-opened") }, new[] { "note" }, T0);
        var traced = new[] { new PolicemanJournal.Traced("c3", "card C", "PR #9 open", "the PR names #c3") };
        var questions = new[] { new PolicemanJournal.Question("b2", "card B", "prg#1", "which key?", "asked-question", "asks which key", 1200, null) };
        var e = TaskVerificationPoller.Describe(T0, TaskVerificationPoller.TriggerTimer, 40, result, verdict, before, after, traced, questions, new[] { "sweep note" }, null);
        Assert.Single(e.Raised); Assert.Equal("b2", e.Raised[0].Id);
        Assert.Single(e.Cleared); Assert.Equal("a1", e.Cleared[0].Id);
        Assert.Single(e.Traced); Assert.Single(e.Questions); Assert.Equal(1200, e.Tokens);
        Assert.Equal(new[] { "note", "sweep note" }, e.Notes);
        Assert.False(e.Quiet);
        Assert.True(e.Touches("c3") && e.Touches("a1") && e.Touches("b2") && !e.Touches("zz"));
        var failed = TaskVerificationPoller.Describe(T0, TaskVerificationPoller.TriggerStartup, 5, null, null, before, before, NoTrace, NoQuestions, Array.Empty<string>(), "gh: not logged in");
        Assert.Equal("gh: not logged in", failed.Error);
        Assert.False(failed.Quiet);
    }

    // ---- The judge and the sweep share one name but never each other's flags ----------------------

    [Fact]
    public void The_judge_stamps_as_the_policeman_and_leaves_the_sweeps_flag_alone_while_migrating_a_legacy_stamp()
    {
        var logger = new Logger();
        Directory.CreateDirectory(_dir);
        var graph = new TaskGraphService(logger, _dir, new NotesService(logger, _dir));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        const long window = 24 * 3600_000L;
        // A card the reading sweep flagged for a reason the judge never writes.
        var read = graph.AddNode("flagged by the reading", null, "r1", null, 0, 0, now - 3600_000)!;
        graph.SetNeedsHuman(read.Id, new TaskGraphService.HumanRequest(now, BoardIntegrity.Policeman, "asked a question 3 h ago and nobody answered: which key?"), now);
        // A card that is mechanically stuck.
        var stuck = graph.AddNode("went quiet", null, "r1", null, 0, 0, now - 2 * window)!;
        graph.Assign(stuck.Id, null, "r1", "arch", now - 2 * window);
        graph.MarkDispatched(stuck.Id, now - 2 * window);
        graph.UpdateNode(stuck.Id, null, null, null, null, "doing", null, null, now - 2 * window);
        // A legacy "board-check" stamp on a card that is no longer stuck.
        var legacy = graph.AddNode("recovered", null, "r1", null, 0, 0, now - 3600_000)!;
        graph.SetNeedsHuman(legacy.Id, new TaskGraphService.HumanRequest(now - 7200_000, BoardIntegrity.BoardCheck, "pinged, no PR and no progress for 30 h (window 24 h)"), now - 7200_000);

        BoardIntegrity.Apply(graph, now, window);

        Assert.Equal("asked a question 3 h ago and nobody answered: which key?", graph.Find(read.Id)!.NeedsHuman!.Reason); // untouched
        Assert.Equal(BoardIntegrity.Policeman, graph.Find(stuck.Id)!.NeedsHuman!.By);
        Assert.Null(graph.Find(legacy.Id)!.NeedsHuman);
        Assert.True(BoardIntegrity.IsMechanicalReason("pinged, no PR and no progress for 2 h (window 24 h)"));
        Assert.False(BoardIntegrity.IsMechanicalReason("asked a question 3 h ago and nobody answered"));
    }
}
