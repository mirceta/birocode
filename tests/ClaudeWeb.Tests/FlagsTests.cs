using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the non-blocking FLAG: channel (docs/loop-driven-agent-convention.md,
/// "Non-blocking flags"): line-start extraction from a reply, the ledger's
/// open-dedup + dismiss + overflow behavior against a throwaway temp dir, and the
/// briefing composition teaching the marker in work sends but never in verify notes.
/// </summary>
public sealed class FlagsTests : IDisposable
{
    private readonly string _dir;
    private readonly FlagsStore _store;

    public FlagsTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-flags-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _store = new FlagsStore(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    // --- extraction ---------------------------------------------------------

    [Fact]
    public void Extracts_line_start_flags_only()
    {
        var flags = FlagsStore.ExtractFlagLines(
            "Did the work.\n"
            + "FLAG: the fixture password in the README is stale\n"
            + "Mentioning FLAG: mid-sentence does nothing.\n"
            + "  flag: markers are case-insensitive and may be indented\n"
            + "FLAG:\n"
            + "All done.");
        Assert.Equal(2, flags.Count);
        Assert.Equal("the fixture password in the README is stale", flags[0]);
        Assert.Equal("markers are case-insensitive and may be indented", flags[1]);
    }

    [Fact]
    public void Extraction_bounds_count_and_length()
    {
        var many = string.Join('\n',
            Enumerable.Range(0, 20).Select(i => $"FLAG: issue {i} " + new string('x', 400)));
        var flags = FlagsStore.ExtractFlagLines(many);
        Assert.Equal(FlagsStore.MaxFlagsPerReply, flags.Count);
        Assert.All(flags, f => Assert.True(f.Length <= FlagsStore.MaxFlagLength));
    }

    // --- ledger -------------------------------------------------------------

    [Fact]
    public void Record_dedups_open_flags_per_repo_until_dismissed()
    {
        Assert.Equal(1, _store.Record("r1", "Repo 1", "queue", 3, new[] { "same gripe" }));
        Assert.Equal(0, _store.Record("r1", "Repo 1", "queue", 4, new[] { "same gripe" }));
        Assert.Equal(1, _store.Record("r2", "Repo 2", "goal", 1, new[] { "same gripe" }));

        var open = _store.Open();
        Assert.Equal(2, open.Count);

        var r1 = open.Single(f => f.RepoId == "r1");
        Assert.True(_store.Dismiss(r1.Id));
        Assert.False(_store.Dismiss(r1.Id)); // already dismissed
        // Dismissed → the same text may be flagged fresh again.
        Assert.Equal(1, _store.Record("r1", "Repo 1", "queue", 5, new[] { "same gripe" }));
    }

    [Fact]
    public void Ledger_survives_reload_and_caps_entries()
    {
        for (var i = 0; i < FlagsStore.MaxEntries + 25; i++)
            _store.Record("r1", "Repo 1", "recipe", i, new[] { $"gripe {i}" });

        var reloaded = new FlagsStore(new Logger(), _dir);
        var open = reloaded.Open();
        Assert.Equal(FlagsStore.MaxEntries, open.Count);
        // Drop-oldest: the newest gripe survives, the very first is gone.
        Assert.Contains(open, f => f.Text == $"gripe {FlagsStore.MaxEntries + 24}");
        Assert.DoesNotContain(open, f => f.Text == "gripe 0");
    }

    [Fact]
    public void Dismissed_flags_move_to_the_history_not_into_the_void()
    {
        _store.Record("r1", "Repo 1", "queue", 1, new[] { "gripe A", "gripe B" });
        var a = _store.Open().Single(f => f.Text == "gripe A");
        Assert.True(_store.Dismiss(a.Id));

        Assert.Single(_store.Open());
        var dismissed = _store.Dismissed();
        Assert.Single(dismissed);
        Assert.Equal("gripe A", dismissed[0].Text);
        Assert.NotNull(dismissed[0].DismissedAt);
    }

    // --- channel switch ------------------------------------------------------

    [Fact]
    public void Channel_defaults_on_and_the_switch_persists_across_reload()
    {
        Assert.True(_store.Enabled);
        _store.SetEnabled(false);
        Assert.False(_store.Enabled);

        var reloaded = new FlagsStore(new Logger(), _dir);
        Assert.False(reloaded.Enabled);
        reloaded.SetEnabled(true);
        Assert.True(new FlagsStore(new Logger(), _dir).Enabled);
    }

    // --- briefing composition -----------------------------------------------

    [Fact]
    public void Work_briefing_teaches_flag_line_verify_note_does_not()
    {
        var work = LoopConfigStore.ComposeBriefedPrompt(
            LoopConfigStore.KindRecipe, null, null, "stored text", new[] { "rule" });
        Assert.Contains(FlagsStore.FlagMarker + " <one short sentence>", work);

        var verify = LoopConfigStore.ComposeBriefedPrompt(
            LoopConfigStore.KindQueue, LoopConfigStore.PhaseVerify, null, "verify text",
            Array.Empty<string>());
        Assert.DoesNotContain(FlagsStore.FlagMarker, verify);
    }

    [Fact]
    public void Channel_off_drops_the_teaching_line_and_nothing_else()
    {
        var on = LoopConfigStore.ComposeBriefedPrompt(
            LoopConfigStore.KindRecipe, null, null, "stored text", new[] { "rule" }, flagLineEnabled: true);
        var off = LoopConfigStore.ComposeBriefedPrompt(
            LoopConfigStore.KindRecipe, null, null, "stored text", new[] { "rule" }, flagLineEnabled: false);

        Assert.DoesNotContain(FlagsStore.FlagMarker, off);
        // Only the FLAG teaching line differs — frame, rules, contract intact.
        Assert.Equal(on.Replace(LoopConfigStore.BriefingFlagLine + "\n", ""), off);
    }
}
