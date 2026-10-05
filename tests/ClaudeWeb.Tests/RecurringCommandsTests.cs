using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Recurring;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Fleet task 933709ea: ONE command path for the Recurring tab and the arch's tools
/// (RecurringCommands), the tracking-only kind the scheduler never touches, and the five arch
/// tools in the MCP catalogue + the role prompt.</summary>
public sealed class RecurringCommandsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-reccmd-" + Guid.NewGuid().ToString("N"));
    public RecurringCommandsTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private const long T0 = 1_800_000_000_000;
    private const long Min = 60_000;

    private sealed class NoPort : IRecurringPort
    {
        public int Situations;
        public string Label(string? sourceId, string repoId) => $"{sourceId ?? "hub"}/{repoId}";
        public AgentSituation Situation(string? sourceId, string repoId) { Situations++; return new(true, "hub", repoId, false, false, null, true, null); }
        public PortResult ArmGoal(string? sourceId, string repoId, string goal, int maxTurns) => throw new InvalidOperationException("must never arm");
        public LoopProbe? ProbeLoop(string? sourceId, string repoId) => null;
        public PortResult StopLoop(string? sourceId, string repoId) => new(false, "none", "none");
        public bool RestoreSlot(string repoId, string snapshot, long loopArmedAt) => true;
        public PortResult SendOnce(string? sourceId, string repoId, string text) => throw new InvalidOperationException("must never send");
        public string? LastReply(string? sourceId, string repoId, long sinceMs) => null;
    }

    private (RecurringCommands Cmd, RecurringTaskStore Store, RecurringRunLog Log, RecurringEngine Engine, NoPort Port, Func<bool> Gate, Action<bool> SetGate) Rig()
    {
        var gate = true;
        var store = new RecurringTaskStore(new Logger(), _dir);
        var log = new RecurringRunLog(new Logger(), _dir);
        var port = new NoPort();
        var engine = new RecurringEngine(store, log, port, () => gate, () => T0 + 61 * Min, TimeZoneInfo.Utc);
        var cmd = new RecurringCommands(store, log, () => gate, () => T0);
        return (cmd, store, log, engine, port, () => gate, v => gate = v);
    }

    private static RecurringCommands.TaskRequest Tracking(string title = "Nightly import", string? app = "web") =>
        new(Kind: "tracking", Title: title, RepoId: "repo1", Description: "bank statements at 02:00 inside the app", AppId: app);

    private static RecurringCommands.TaskRequest Prompt(string title = "CI health check") =>
        new(Kind: "prompt", Title: title, RepoId: "repo1", Instructions: "Look at the last 10 runs.", Schedule: new ScheduleSpec("interval", 60));

    [Fact]
    public void A_tracking_card_is_created_without_a_schedule_and_the_gate_does_not_apply()
    {
        var r = Rig();
        r.SetGate(false);
        var created = r.Cmd.Create(Tracking(), "arch");
        Assert.True(created.Ok, created.Error);
        var t = created.Task!;
        Assert.True(t.IsTracking);
        Assert.Equal(("Nightly import", "repo1", "web", "arch", ""), (t.Title, t.RepoId, t.AppId, t.CreatedBy, t.Instructions));
        Assert.Equal("none", t.Schedule.Kind);
        // The prompt kind IS gated, like the tab.
        var refused = r.Cmd.Create(Prompt(), "operator");
        Assert.Equal((false, 403), (refused.Ok, refused.Http));
        r.SetGate(true);
        Assert.True(r.Cmd.Create(Prompt(), "operator").Ok);
        // Persisted: a reload sees the kind.
        var again = new RecurringTaskStore(new Logger(), _dir).All();
        Assert.Equal(new[] { "tracking", "prompt" }, again.Select(x => x.Kind));
    }

    [Fact]
    public void Validation_asks_for_what_each_kind_needs()
    {
        var r = Rig();
        Assert.Contains("description", r.Cmd.Create(Tracking() with { Description = " " }, "operator").Error);
        Assert.Contains("plain local-app id", r.Cmd.Create(Tracking(app: "a/b"), "operator").Error);
        Assert.Contains("title", r.Cmd.Create(Tracking(title: ""), "operator").Error);
        Assert.Contains("schedule is required", r.Cmd.Create(Prompt() with { Schedule = null }, "operator").Error);
        Assert.Contains("instructions", r.Cmd.Create(Prompt() with { Instructions = null }, "operator").Error);
        Assert.Null(RecurringCommands.Validate(new(Title: "x", RepoId: "r", Description: "d"), RecurringTask.KindTracking, creating: true));
    }

    [Fact]
    public void The_scheduler_never_touches_a_tracking_card_and_run_now_is_refused()
    {
        var r = Rig();
        var t = r.Cmd.Create(Tracking(), "operator").Task!;
        r.Engine.Tick();                                                       // "now" is an hour on: a prompt card would fire
        Assert.Equal(0, r.Port.Situations);                                    // the agent was not even looked at
        Assert.Empty(r.Log.Runs(t.Id));
        Assert.Null(r.Engine.HoldOf(t.Id));
        var rn = r.Engine.RunNow(t.Id);
        Assert.Equal((false, 409), (rn.Ok, rn.Http));
        Assert.Contains("tracking-only", rn.Detail);
    }

    [Fact]
    public void The_board_view_tells_the_kind_and_never_redacts_a_description()
    {
        var r = Rig();
        r.Cmd.Create(Tracking(), "arch");
        r.Cmd.Create(Prompt(), "operator");
        r.SetGate(false);
        var json = JsonSerializer.Serialize(r.Engine.Board());
        using var doc = JsonDocument.Parse(json);
        var tasks = doc.RootElement.GetProperty("tasks").EnumerateArray().ToList();
        var tr = tasks.Single(x => x.GetProperty("kind").GetString() == "tracking");
        var pr = tasks.Single(x => x.GetProperty("kind").GetString() == "prompt");
        Assert.Equal("bank statements at 02:00 inside the app", tr.GetProperty("description").GetString());
        Assert.Equal("web", tr.GetProperty("appId").GetString());
        Assert.Equal(RecurringEngine.TrackingWords, tr.GetProperty("scheduleWords").GetString());
        Assert.Equal(JsonValueKind.Null, tr.GetProperty("schedule").ValueKind);
        Assert.Equal(JsonValueKind.Null, tr.GetProperty("nextDueAt").ValueKind);
        Assert.False(tr.GetProperty("redacted").GetBoolean());
        Assert.Equal("arch", tr.GetProperty("createdBy").GetString());
        Assert.True(pr.GetProperty("redacted").GetBoolean());                  // the prompt card follows the gate rule as before
        Assert.Equal(JsonValueKind.Null, pr.GetProperty("instructions").ValueKind);
    }

    [Fact]
    public void Edit_pause_resume_delete_go_through_one_path_and_the_kind_is_fixed()
    {
        var r = Rig();
        var t = r.Cmd.Create(Tracking(), "operator").Task!;
        Assert.Contains("kind of a card cannot be changed", r.Cmd.Edit(t.Id, new(Kind: "prompt"), "arch").Error);
        var edited = r.Cmd.Edit(t.Id, new(Description: "now at 03:00", AppId: ""), "arch");
        Assert.True(edited.Ok);
        Assert.Equal(("now at 03:00", (string?)null), (edited.Task!.Description, edited.Task.AppId));
        // Pause / resume through Enabled, and through the dedicated commands, agree.
        Assert.False(r.Cmd.Edit(t.Id, new(Enabled: false), "arch").Task!.Enabled);
        Assert.Equal("operator", r.Store.Get(t.Id)!.PausedReason);
        Assert.True(r.Cmd.Resume(t.Id, "operator").Task!.Enabled);
        Assert.False(r.Cmd.Pause(t.Id, "operator").Task!.Enabled);
        // A tracking card resumes with the gate closed; a prompt card does not.
        r.SetGate(false);
        Assert.True(r.Cmd.Resume(t.Id, "arch").Ok);
        r.SetGate(true);
        var p = r.Cmd.Create(Prompt(), "operator").Task!;
        r.SetGate(false);
        Assert.Equal(403, r.Cmd.Edit(p.Id, new(Enabled: true), "arch").Http);
        Assert.True(r.Cmd.Pause(p.Id, "arch").Ok);                            // pausing only reduces automation
        Assert.True(r.Cmd.Delete(t.Id, "arch").Ok);
        Assert.Null(r.Store.Get(t.Id));
        Assert.Equal(404, r.Cmd.Delete(t.Id, "arch").Http);
    }

    [Fact]
    public void A_prompt_edit_with_a_new_schedule_starts_a_new_grid_and_resume_re_anchors()
    {
        var r = Rig();
        var p = r.Cmd.Create(Prompt(), "operator").Task!;
        var moved = r.Store.Update(p.Id, x => x with { LastHandledDueAt = T0 - Min })!;
        Assert.NotNull(moved.LastHandledDueAt);
        var e = r.Cmd.Edit(p.Id, new(Schedule: new ScheduleSpec("interval", 120)), "arch").Task!;
        Assert.Null(e.LastHandledDueAt);                                       // the old grid is not owed
        Assert.Equal(120, e.Schedule.EveryMinutes);
        r.Store.Update(p.Id, x => x with { Enabled = false, LastHandledDueAt = T0 - Min });
        Assert.Null(r.Cmd.Edit(p.Id, new(Enabled: true), "arch").Task!.LastHandledDueAt);
    }

    [Fact]
    public void Mcp_catalogue_offers_the_five_recurring_tools_and_the_role_prompt_teaches_them()
    {
        var tools = ArchMcpServer.ToolsList();
        string[] Req(string name) => tools.First(t => t!["name"]!.GetValue<string>() == name)!["inputSchema"]!["required"]?.AsArray().Select(n => n!.GetValue<string>()).ToArray() ?? Array.Empty<string>();
        IEnumerable<string> Props(string name) => tools.First(t => t!["name"]!.GetValue<string>() == name)!["inputSchema"]!["properties"]!.AsObject().Select(kv => kv.Key);
        string Desc(string name) => tools.First(t => t!["name"]!.GetValue<string>() == name)!["description"]!.GetValue<string>();
        foreach (var n in new[] { "list_recurring", "recurring_runs", "create_recurring", "update_recurring", "delete_recurring" }) Assert.True(ArchMcpServer.IsKnownTool(n), n);
        Assert.Empty(Req("list_recurring"));
        Assert.Equal(new[] { "id" }, Req("recurring_runs"));
        Assert.Equal(new[] { "title", "repoId" }, Req("create_recurring"));
        Assert.Equal(new[] { "id" }, Req("update_recurring"));
        Assert.Equal(new[] { "id" }, Req("delete_recurring"));
        foreach (var p in new[] { "machine", "instructions", "every", "at", "days", "mode", "maxTurns", "description", "appId", "enabled" })
        {
            Assert.Contains(p, Props("create_recurring"));
            Assert.Contains(p, Props("update_recurring"));
        }
        Assert.Contains("kind", Props("create_recurring"));
        Assert.DoesNotContain("kind", Props("update_recurring"));               // the kind is fixed at creation
        Assert.Contains("tracking", Desc("create_recurring"));
        Assert.Contains("ONLY when the Operator asked", Desc("create_recurring"));
        Assert.Contains("gate-closed", Desc("update_recurring"));
        var role = ArchAgentService.RolePrompt();
        Assert.Contains("## Recurring tasks", role);
        foreach (var n in new[] { "list_recurring", "recurring_runs", "create_recurring", "update_recurring", "delete_recurring" }) Assert.Contains(n, role);
        Assert.Contains("only when the Operator asks", role);
        Assert.Contains("tracking", role);
    }
}
