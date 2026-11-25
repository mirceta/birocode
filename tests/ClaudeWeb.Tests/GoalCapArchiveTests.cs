using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>The removed 24-conversation cap + archiving (fix/remove-goal-conversation-cap): the
/// only limit is on RUNNING goals; finished goals never count, never block a new conversation,
/// archive instead of being deleted, and stay in <see cref="ArchStateStore.Goals"/> so the Arch
/// examples miner (which reads that list) keeps cataloguing them.</summary>
public sealed class GoalCapArchiveTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-goalcap-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _log = new();

    public GoalCapArchiveTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { } }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    // Add a conversation and run a goal in it; end it unless `running`.
    private static ArchStateStore.ArchGoal StartOne(ArchStateStore s, string name, bool running, string by = "operator", long? endedAt = null)
    {
        var c = s.AddConversation(name);
        var g = s.StartGoal(c.Id, $"goal for {name}", Array.Empty<string>(), Array.Empty<string>(), by, Now());
        if (!running) s.EndGoal(c.Id, ArchGoals.Done, "done", endedAt ?? Now());
        return g;
    }

    [Fact]
    public void Finished_goals_never_block_a_new_conversation_past_the_old_24_cap()
    {
        var s = new ArchStateStore(_log, _dir);
        // 30 finished goals — well past the old cap of 24.
        for (var i = 0; i < 30; i++) StartOne(s, $"finished {i}", running: false);
        // AddConversation never throws, and a new goal still starts.
        var ex = Record.Exception(() => StartOne(s, "the 31st", running: true));
        Assert.Null(ex);
        Assert.Equal(31, s.Conversations.Count(c => !c.IsDefault));
    }

    [Fact]
    public void RunningGoalCount_counts_only_running_goals()
    {
        var s = new ArchStateStore(_log, _dir);
        StartOne(s, "r1", running: true);
        StartOne(s, "r2", running: true);
        StartOne(s, "f1", running: false);
        StartOne(s, "f2", running: false);
        s.AddConversation("plain chat, no goal");
        Assert.Equal(2, s.RunningGoalCount());
    }

    [Fact]
    public void Default_cap_and_auto_archive_age_and_their_setters()
    {
        var s = new ArchStateStore(_log, _dir);
        Assert.Equal(ArchStateStore.DefaultMaxRunningGoals, s.MaxRunningGoals);
        Assert.Equal(50, s.MaxRunningGoals);
        Assert.Equal(7, s.GoalAutoArchiveDays);
        s.SetMaxRunningGoals(80); Assert.Equal(80, s.MaxRunningGoals);
        s.SetMaxRunningGoals(10_000); Assert.Equal(500, s.MaxRunningGoals); // clamped high
        s.SetMaxRunningGoals(0); Assert.Equal(0, s.MaxRunningGoals); // 0 = unlimited
        s.SetGoalAutoArchiveDays(14); Assert.Equal(14, s.GoalAutoArchiveDays);
        s.SetGoalAutoArchiveDays(-5); Assert.Equal(0, s.GoalAutoArchiveDays); // clamped to 0 = off
        // Persists across a reload (the last values set: cap 0, age 0).
        var reloaded = new ArchStateStore(_log, _dir);
        Assert.Equal(0, reloaded.MaxRunningGoals);
        Assert.Equal(0, reloaded.GoalAutoArchiveDays);
    }

    [Fact]
    public void Archive_refuses_running_archives_finished_and_unarchive_reverses_it()
    {
        var s = new ArchStateStore(_log, _dir);
        var running = StartOne(s, "live", running: true);
        var finished = StartOne(s, "ended", running: false);

        Assert.Null(s.ArchiveGoal(running.Id, Now()));          // a running goal is never archived
        Assert.False(s.FindGoal(running.Id)!.Archived);

        var archived = s.ArchiveGoal(finished.Id, Now());
        Assert.NotNull(archived);
        Assert.True(archived!.Archived);
        Assert.NotNull(archived.ArchivedAt);
        Assert.True(s.FindGoal(finished.Id)!.Archived);

        var back = s.UnarchiveGoal(finished.Id);
        Assert.False(back!.Archived);
        Assert.Null(back.ArchivedAt);
    }

    [Fact]
    public void Archived_goals_stay_in_Goals_so_the_miner_still_sees_them()
    {
        var s = new ArchStateStore(_log, _dir);
        var g = StartOne(s, "a mined operator goal", running: false);
        s.ArchiveGoal(g.Id, Now());
        // Goals() is exactly what ArchExamplesMiner reads; the archived goal + its text remain.
        var mined = s.Goals();
        Assert.Contains(mined, x => x.Id == g.Id && x.Archived);
        Assert.Contains(mined, x => x.Text == "goal for a mined operator goal");
    }

    [Fact]
    public void AutoArchive_files_finished_goals_older_than_the_age_only()
    {
        var s = new ArchStateStore(_log, _dir);
        var now = Now();
        var old = StartOne(s, "old finished", running: false, endedAt: now - 10L * 24 * 3600 * 1000); // 10 days
        var recent = StartOne(s, "recent finished", running: false, endedAt: now - 1L * 24 * 3600 * 1000); // 1 day
        var live = StartOne(s, "still running", running: true);

        s.SetGoalAutoArchiveDays(7);
        var archived = s.AutoArchiveFinished(now);
        Assert.Equal(new[] { old.Id }, archived);               // only the 10-day-old one
        Assert.True(s.FindGoal(old.Id)!.Archived);
        Assert.False(s.FindGoal(recent.Id)!.Archived);
        Assert.False(s.FindGoal(live.Id)!.Archived);

        // 0 = off: nothing more archives.
        s.SetGoalAutoArchiveDays(0);
        Assert.Empty(s.AutoArchiveFinished(now));
    }
}
