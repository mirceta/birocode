using ClaudeWeb.Models;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.LoopEval;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for openspec add-loop-eval-ui-runner: the single-run rule the 409
/// rides on, run-state derivation from captured runner output (the suite's real
/// line shapes), one-shot session revocation on every terminal transition, and
/// the boot-time stale-session sweep — all against an AuthService pointed at a
/// throwaway temp dir (the ctor's test-only dir override), never the real
/// APPDATA store.
/// </summary>
public sealed class LoopEvalRunnerTests : IDisposable
{
    private readonly string _dir;
    private readonly AuthService _auth;

    public LoopEvalRunnerTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-loopeval-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _auth = new AuthService(new AppConfig { AuthPassword = "test-pw-loopeval" }, new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    private LoopEvalRun NewRun(string scenario = "goal") =>
        new(scenario, "Goal loop", _auth, new Logger());

    // Captured line shapes from a real live run (lib.mjs say()/Verdicts output).
    private const string ArmAssert =
        """12:00:01 @@LOOPEVAL@@ {"scenario":"goal","assert":"goal loop armed","ok":true,"detail":"http 200"}""";
    private const string WatchBanner = "12:00:02 │ WATCH IT LIVE: http://localhost:5099";
    private const string StatusLine = "12:00:07 loop status=working phase=work sent=- left=- iter=2 run=running";
    private const string FailAssert =
        """12:09:01 @@LOOPEVAL@@ {"scenario":"goal","assert":"goal check now exits 0 (feature really implemented)","ok":false,"detail":"exit 1"}""";
    private const string PassSummary =
        """12:10:00 @@LOOPEVAL@@ {"scenario":"goal","summary":true,"pass":true,"failed":[]}""";

    // --- single-run rule (the controller maps a refused start to 409) ---------

    [Fact]
    public void No_run_yet_can_start()
    {
        Assert.True(LoopEvalRunnerService.CanStart(null));
    }

    [Fact]
    public void Active_run_blocks_a_second_start()
    {
        var run = NewRun();
        Assert.False(LoopEvalRunnerService.CanStart(run));

        run.FeedLine(StatusLine); // still active mid-run
        Assert.False(LoopEvalRunnerService.CanStart(run));
    }

    [Fact]
    public void Terminal_run_unblocks_the_next_start()
    {
        var run = NewRun();
        run.MarkExited(0);
        Assert.True(LoopEvalRunnerService.CanStart(run));
    }

    // --- state derivation from runner output ----------------------------------

    [Fact]
    public void States_progress_preflight_armed_running_passed()
    {
        var run = NewRun();
        Assert.Equal("preflight", StateOf(run));

        run.FeedLine(WatchBanner);
        Assert.Equal("armed", StateOf(run));

        run.FeedLine(StatusLine);
        Assert.Equal("running", StateOf(run));
        Assert.Equal(2, IterationOf(run));

        run.FeedLine(PassSummary);
        run.MarkExited(0);
        Assert.Equal("passed", StateOf(run));
    }

    [Fact]
    public void Arm_assert_also_flips_to_armed_and_verdicts_are_collected()
    {
        var run = NewRun();
        run.FeedLine(ArmAssert);
        Assert.Equal("armed", StateOf(run));

        run.FeedLine(FailAssert);
        run.FeedLine("""12:10:00 @@LOOPEVAL@@ {"scenario":"goal","summary":true,"pass":false,"failed":["goal check now exits 0 (feature really implemented)"]}""");
        run.MarkExited(1);
        Assert.Equal("failed", StateOf(run));

        var snap = System.Text.Json.JsonSerializer.SerializeToElement(run.Snapshot());
        var asserts = snap.GetProperty("asserts");
        Assert.Equal(2, asserts.GetArrayLength());
        Assert.True(asserts[0].GetProperty("ok").GetBoolean());
        Assert.False(asserts[1].GetProperty("ok").GetBoolean());
        Assert.False(snap.GetProperty("summaries")[0].GetProperty("pass").GetBoolean());
    }

    [Fact]
    public void Nonzero_exit_without_any_verdict_is_error_not_failed()
    {
        var run = NewRun();
        run.FeedLine("node: some crash before the suite spoke");
        run.MarkExited(1);
        Assert.Equal("error", StateOf(run));
    }

    [Fact]
    public void Terminal_state_never_regresses()
    {
        var run = NewRun();
        run.MarkStopped();
        run.MarkExited(0);   // the waiter losing the race to a Stop
        run.FeedLine(StatusLine);
        Assert.Equal("stopped", StateOf(run));
    }

    // --- one-shot credential: revoked on EVERY terminal transition ------------

    [Fact]
    public void Session_is_valid_while_active_and_revoked_on_pass()
    {
        var run = NewRun();
        Assert.True(_auth.ValidateSession(run.Token));
        run.MarkExited(0);
        Assert.False(_auth.ValidateSession(run.Token));
    }

    [Fact]
    public void Session_is_revoked_on_fail_error_and_stop()
    {
        var failed = NewRun();
        failed.FeedLine(FailAssert);
        failed.MarkExited(1);
        Assert.False(_auth.ValidateSession(failed.Token));

        var errored = NewRun();
        errored.MarkError("node exploded");
        Assert.False(_auth.ValidateSession(errored.Token));

        var stopped = NewRun();
        stopped.MarkStopped();
        Assert.False(_auth.ValidateSession(stopped.Token));
    }

    // --- boot-time sweep: tagged orphans die, browser sessions survive --------

    [Fact]
    public void Sweep_revokes_tagged_sessions_only()
    {
        var orphan = _auth.CreateSession(LoopEvalRun.SessionTag);
        var browser = _auth.CreateSession();

        var swept = _auth.RevokeSessionsByTag(LoopEvalRun.SessionTag);

        Assert.Equal(1, swept);
        Assert.False(_auth.ValidateSession(orphan));
        Assert.True(_auth.ValidateSession(browser));
    }

    [Fact]
    public void Sweep_survives_a_restart_via_the_persisted_store()
    {
        var orphan = _auth.CreateSession(LoopEvalRun.SessionTag);

        // Same data dir, fresh service — a harness reboot after a crash mid-run.
        var rebooted = new AuthService(new AppConfig { AuthPassword = "test-pw-loopeval" }, new Logger(), _dir);
        Assert.True(rebooted.ValidateSession(orphan)); // the orphan persisted…
        rebooted.RevokeSessionsByTag(LoopEvalRun.SessionTag);
        Assert.False(rebooted.ValidateSession(orphan)); // …and the sweep kills it
    }

    // --- helpers ----------------------------------------------------------------

    private static string StateOf(LoopEvalRun run) =>
        System.Text.Json.JsonSerializer.SerializeToElement(run.Snapshot())
            .GetProperty("state").GetString()!;

    private static int? IterationOf(LoopEvalRun run)
    {
        var it = System.Text.Json.JsonSerializer.SerializeToElement(run.Snapshot()).GetProperty("iteration");
        return it.ValueKind == System.Text.Json.JsonValueKind.Number ? it.GetInt32() : null;
    }
}
