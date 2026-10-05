using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec status-mark-from-events (fleet task 9c1120fe): the "finished, not yet checked"
/// mark for an agent whose dock latch cannot speak — a peer on a build that predates the latch
/// (living room on 2026-10-05), or a repo with no dock — is raised by the hub from the turn.ended
/// events the collector pulls, acknowledged on the hub, and survives a hub restart without
/// re-raising history.</summary>
public sealed class FleetAttentionTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-attention-" + Guid.NewGuid().ToString("N"));
    public FleetAttentionTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private const string LivingRoom = "5e4c2a5974c54317acff69b4a504ee05";
    private const string Repo = "00b73e53e5c84c5d80c3875507a9edc6";   // living room/living-room

    // A collector event the way a remote one arrives: JsonElement source/data, repoId read once.
    private static CollectorService.CollectorEvent Ev(int seq, long at, string type, string repoId, object data, string sourceId = LivingRoom)
    {
        var source = JsonSerializer.SerializeToElement(new { repoId, repoName = "living-room" });
        return new CollectorService.CollectorEvent(seq, at, type, source, JsonSerializer.SerializeToElement(data), sourceId, "living room", repoId);
    }
    private static CollectorService.CollectorEvent Ended(int seq, long at, string status = "done", bool readOnly = false, string repoId = Repo) =>
        Ev(seq, at, "turn.ended", repoId, new { turnId = "t" + seq, status, rawStatus = status == "done" ? "Success" : "Error", readOnly, numTurns = 3, costUsd = 0.01 });
    private static CollectorService.CollectorEvent Started(int seq, long at, string repoId = Repo) =>
        Ev(seq, at, "turn.start", repoId, new { turnId = "t" + seq, readOnly = false });

    private FleetAttention Store() => new(new Logger(), _dir);

    // ---- what counts as a finish ---------------------------------------------------------------

    [Fact]
    public void A_builder_turn_that_ended_done_or_error_is_a_finish_the_ask_lane_and_other_events_are_not()
    {
        Assert.True(FleetAttention.IsGenuineFinish("turn.ended", JsonSerializer.SerializeToElement(new { status = "done", readOnly = false })));
        Assert.True(FleetAttention.IsGenuineFinish("turn.ended", JsonSerializer.SerializeToElement(new { status = "error", rawStatus = "Throttled" })));
        Assert.False(FleetAttention.IsGenuineFinish("turn.ended", JsonSerializer.SerializeToElement(new { status = "done", readOnly = true })));   // ask lane
        Assert.False(FleetAttention.IsGenuineFinish("turn.start", JsonSerializer.SerializeToElement(new { readOnly = false })));
        Assert.False(FleetAttention.IsGenuineFinish("loop.fired", JsonSerializer.SerializeToElement(new { status = "done" })));
        Assert.False(FleetAttention.IsGenuineFinish("turn.ended", null));
        Assert.True(FleetAttention.IsGenuineFinish("turn.ended", new { status = "done" }));   // a self event's anonymous object
    }

    // ---- the failing case: a peer whose describe does not carry the latch -----------------------

    [Fact]
    public void Living_room_finishes_a_run_the_old_peer_reports_no_latch_and_the_hub_raises_the_mark_itself()
    {
        var a = Store();
        // First contact with the machine: its retained history is a baseline, never marks.
        Assert.Equal(0, a.Ingest(LivingRoom, new[] { Started(1, 1000), Ended(2, 2000), Ended(3, 3000) }, backlog: true));
        Assert.False(a.Pending(LivingRoom, Repo));

        // The Operator runs living-room there; the hub's collector pulls the end of that turn live.
        Assert.Equal(1, a.Ingest(LivingRoom, new[] { Started(4, 4000), Ended(5, 5000) }, backlog: false));
        Assert.True(a.Pending(LivingRoom, Repo));

        // The peer's describe says nothing (null) — before: no mark. Now the hub's record decides.
        Assert.False(FleetAttention.Resolve(dockLatch: null, docked: true, derivedPending: false));
        Assert.True(FleetAttention.Resolve(dockLatch: null, docked: true, derivedPending: true));

        // ✓ mark as checked clears it on the hub; the next finish marks again.
        Assert.True(a.Ack(LivingRoom, Repo));
        Assert.False(a.Pending(LivingRoom, Repo));
        Assert.False(a.Ack(LivingRoom, Repo));
        a.Ingest(LivingRoom, new[] { Ended(6, 6000) }, backlog: false);
        Assert.True(a.Pending(LivingRoom, Repo));
    }

    [Fact]
    public void A_stopped_turn_marks_too_because_the_event_cannot_tell_it_from_a_failure()
    {
        var a = Store();
        a.Ingest(LivingRoom, Array.Empty<CollectorService.CollectorEvent>(), backlog: true);
        a.Ingest(LivingRoom, new[] { Ended(1, 1000, status: "error") }, backlog: false);
        Assert.True(a.Pending(LivingRoom, Repo));
        Assert.Equal("error", a.Get(LivingRoom, Repo)!.Status);
    }

    [Fact]
    public void The_ask_lane_and_a_turn_start_never_mark()
    {
        var a = Store();
        Assert.Equal(0, a.Ingest(LivingRoom, new[] { Started(1, 1000), Ended(2, 2000, readOnly: true) }, backlog: false));
        Assert.False(a.Pending(LivingRoom, Repo));
    }

    // ---- a hub restart: the peer's feed is pulled from its start again ---------------------------

    [Fact]
    public void After_a_hub_restart_the_backlog_re_raises_nothing_already_checked_but_counts_what_ended_while_it_was_away()
    {
        var a = Store();
        a.Ingest(LivingRoom, new[] { Ended(1, 1000) }, backlog: true);     // baseline
        a.Ingest(LivingRoom, new[] { Ended(2, 2000) }, backlog: false);    // live finish → pending
        Assert.True(a.Ack(LivingRoom, Repo));                                // checked

        // Restart: a fresh instance over the same file; the whole retained feed comes back as a backlog,
        // plus one finish (seq 3) that happened while the hub was down.
        var b = Store();
        Assert.False(b.Pending(LivingRoom, Repo));
        Assert.Equal(1, b.Ingest(LivingRoom, new[] { Ended(1, 1000), Ended(2, 2000), Ended(3, 3000) }, backlog: true));
        Assert.True(b.Pending(LivingRoom, Repo));
        Assert.Equal(3000, b.Get(LivingRoom, Repo)!.FinishedAt);

        // A pending mark also survives the restart as it is.
        var c = Store();
        Assert.True(c.Pending(LivingRoom, Repo));
        Assert.Equal(0, c.Ingest(LivingRoom, new[] { Ended(1, 1000), Ended(2, 2000), Ended(3, 3000) }, backlog: true));
    }

    [Fact]
    public void A_peer_whose_feed_restarted_is_pulled_from_its_start_again_instead_of_losing_its_first_events()
    {
        Assert.Equal(-1, CollectorService.NextWatermark(current: 500, feedLastSeq: 3));   // seqs began again at 1
        Assert.Equal(503, CollectorService.NextWatermark(current: 500, feedLastSeq: 503));
        Assert.Equal(0, CollectorService.NextWatermark(current: -1, feedLastSeq: 0));     // an empty feed on first contact
        Assert.Equal(500, CollectorService.NextWatermark(current: 500, feedLastSeq: 500));
    }

    // ---- where the dock latch speaks it stays authoritative --------------------------------------

    [Fact]
    public void A_peer_that_reports_the_latch_decides_and_the_hub_record_follows_it()
    {
        // Reported true → mark; reported false → no mark even with a pending hub record.
        Assert.True(FleetAttention.Resolve(dockLatch: true, docked: true, derivedPending: false));
        Assert.False(FleetAttention.Resolve(dockLatch: false, docked: true, derivedPending: true));
        Assert.True(FleetAttention.LatchSpeaks(false, null));      // docked not reported: taken as docked
        // A repo with no dock there has no tab to latch: the hub's record decides, as for an old peer.
        Assert.False(FleetAttention.LatchSpeaks(false, docked: false));
        Assert.True(FleetAttention.Resolve(dockLatch: false, docked: false, derivedPending: true));
        Assert.False(FleetAttention.LatchSpeaks(null, true));
    }

    [Fact]
    public void This_machine_s_own_events_are_recorded_under_the_self_key_for_a_repo_with_no_dock()
    {
        var a = Store();
        var selfSource = CollectorService.SelfId;
        a.Ingest(selfSource, new[] { Ended(1, 1000, repoId: "r-undocked") with { SourceId = selfSource, SourceLabel = "self" } }, backlog: false);
        Assert.True(a.Pending(null, "r-undocked"));
        Assert.True(a.Pending(selfSource, "r-undocked"));
        Assert.Equal("|r-undocked", FleetAttention.Key(selfSource, "r-undocked"));
        Assert.True(a.Ack(null, "r-undocked"));
        Assert.False(a.Pending(selfSource, "r-undocked"));
    }

    [Fact]
    public void An_older_event_never_moves_the_record_back()
    {
        var a = Store();
        a.Ingest(LivingRoom, new[] { Ended(2, 2000) }, backlog: false);
        a.Ack(LivingRoom, Repo);
        a.Ingest(LivingRoom, new[] { Ended(1, 1000) }, backlog: false);   // a late duplicate from before the check
        Assert.False(a.Pending(LivingRoom, Repo));
    }
}
