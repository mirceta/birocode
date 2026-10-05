using System.Text.Json;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec repo-agent-requests — a repo agent's request UP to its arch: the persisted store
/// (record, limits, decisions final, survives a reload, trim), the <c>request_arch</c> tool that
/// records and nothing else (no send delegate exists to call), the server's catalogue, the hub's
/// merge of pulled rows, the message the arch sees, and the peer-reply parser.
/// </summary>
public sealed class RepoAgentRequestsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-requests-" + Guid.NewGuid().ToString("N"));
    private long _now = 1_700_000_000_000;

    public RepoAgentRequestsTests() { Directory.CreateDirectory(_dir); }
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    private AgentRequestStore Store() => new(new Logger(), _dir, () => _now);

    private RepoAgentToolbox Toolbox(AgentRequestStore? store, List<(string Tool, string Repo, string Outcome)>? audit = null)
    {
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        return new RepoAgentToolbox(g, (src, repo) => src is null ? repo + "#1" : src + "/" + repo, () => _now)
        {
            Environment = new RepoAgentEnvironment
            {
                Repo = id => id == "r-prg" ? new RepoFacts("r-prg", "prg", Path.Combine(_dir, "prg"), "prg#1") : null,
                Machine = "spacex",
                Requests = store,
                Audit = (tool, repo, _, outcome) => audit?.Add((tool, repo, outcome)),
            },
        };
    }

    // ---- the store --------------------------------------------------------------------------------

    [Fact]
    public void A_request_is_recorded_pending_persisted_and_decided_once()
    {
        var store = Store();
        var (row, status, err) = store.Record("r-prg", "prg#1", "spacex", "  Need the staging DB  ", "Please have MONSTER/web#1 upload prod.bak to the hub.");
        Assert.Null(err);
        Assert.Equal("recorded", status);
        Assert.NotNull(row);
        Assert.Equal(AgentRequestStore.Pending, row!.Status);
        Assert.Null(row.SourceId);
        Assert.Equal("Need the staging DB", row.Title);
        Assert.Equal(_now, row.CreatedAt);
        Assert.Equal(1, store.PendingCount("r-prg"));

        // The same text again is the same row, not a second one.
        var (again, dup, _) = store.Record("r-prg", "prg#1", "spacex", null, "Please have MONSTER/web#1 upload prod.bak to the hub.");
        Assert.Equal("duplicate", dup);
        Assert.Equal(row.Id, again!.Id);
        Assert.Single(store.All());

        // Survives a reload from disk.
        Assert.True(File.Exists(Path.Combine(_dir, AgentRequestStore.FileName)));
        var reloaded = Store();
        Assert.Equal(row, Assert.Single(reloaded.All()));

        // Decide: approved, with when/who; the other way is refused; the same way is a no-op.
        _now += 5000;
        var (approved, e1) = reloaded.Decide(row.Id, AgentRequestStore.Approved, "spacex", conversationId: "@arch");
        Assert.Null(e1);
        Assert.Equal(AgentRequestStore.Approved, approved!.Status);
        Assert.Equal(_now, approved.DecidedAt);
        Assert.Equal("spacex", approved.DecidedBy);
        Assert.True(approved.DecisionSynced);          // a local row needs no push
        Assert.Equal("@arch", approved.ConversationId);
        var (_, e2) = reloaded.Decide(row.Id, AgentRequestStore.Dismissed, "spacex");
        Assert.Contains("already approved", e2);
        var (same, e3) = reloaded.Decide(row.Id, AgentRequestStore.Approved, "someone-else");
        Assert.Null(e3);
        Assert.Equal("spacex", same!.DecidedBy);
        Assert.Equal(0, reloaded.PendingCount());
        Assert.Single(reloaded.ApprovedUndelivered());
        var delivered = reloaded.MarkDelivered(row.Id);
        Assert.Equal(_now, delivered!.DeliveredAt);
        Assert.Empty(reloaded.ApprovedUndelivered());

        var (_, e4) = reloaded.Decide("nope", AgentRequestStore.Approved, "spacex");
        Assert.Equal("no request nope", e4);
        var (_, e5) = reloaded.Decide(row.Id, "maybe", "spacex");
        Assert.Contains("approved or dismissed", e5);
    }

    [Fact]
    public void Limits_empty_text_too_long_too_many_pending()
    {
        var store = Store();
        var (_, s1, e1) = store.Record("r-prg", "prg#1", "spacex", null, "   ");
        Assert.Equal("error", s1); Assert.Contains("text is required", e1);
        var (_, s2, e2) = store.Record("r-prg", "prg#1", "spacex", null, new string('x', AgentRequestStore.MaxTextChars + 1));
        Assert.Equal("error", s2); Assert.Contains("too long", e2);
        for (var i = 0; i < AgentRequestStore.MaxPendingPerAgent; i++)
            Assert.Equal("recorded", store.Record("r-prg", "prg#1", "spacex", null, $"request {i}").Status);
        var (_, s3, e3) = store.Record("r-prg", "prg#1", "spacex", null, "one more");
        Assert.Equal("too-many", s3); Assert.Contains("20 pending", e3);
        // Another agent is not blocked by this one's backlog.
        Assert.Equal("recorded", store.Record("r-web", "web#1", "spacex", null, "mine").Status);
    }

    [Fact]
    public void The_hub_merges_pulled_rows_keeps_its_own_decisions_and_takes_a_peers_decision_when_undecided()
    {
        var hub = Store();
        var pulled = new[]
        {
            new AgentRequestStore.AgentRequest("a1", null, "MONSTER", "r-web", "web#1", null, "need fixtures", 10, AgentRequestStore.Pending),
            new AgentRequestStore.AgentRequest("a2", null, "MONSTER", "r-web", "web#1", null, "need a decision", 20, AgentRequestStore.Pending),
        };
        Assert.Equal(2, hub.MergePulled("src-monster", "MONSTER", pulled));
        Assert.All(hub.All(), r => { Assert.Equal("src-monster", r.SourceId); Assert.Equal("MONSTER", r.Machine); });
        Assert.Equal(0, hub.MergePulled("src-monster", "MONSTER", pulled));          // idempotent

        // The hub's Operator approves a1: the decision needs a push; a re-pull of the still-pending peer row changes nothing.
        var (a1, _) = hub.Decide("a1", AgentRequestStore.Approved, "spacex");
        Assert.False(a1!.DecisionSynced);
        Assert.Equal("a1", Assert.Single(hub.DecisionsToPush()).Id);
        Assert.Equal(0, hub.MergePulled("src-monster", "MONSTER", pulled));
        Assert.Equal(AgentRequestStore.Approved, hub.Get("a1")!.Status);
        hub.MarkDecisionSynced("a1");
        Assert.Empty(hub.DecisionsToPush());

        // The peer's own Operator dismissed a2 meanwhile: the hub, undecided on it, takes that — and has nothing to push.
        var peerDecided = new[] { pulled[1] with { Status = AgentRequestStore.Dismissed, DecidedAt = 30, DecidedBy = "MONSTER" } };
        Assert.Equal(1, hub.MergePulled("src-monster", "MONSTER", peerDecided));
        var a2 = hub.Get("a2")!;
        Assert.Equal(AgentRequestStore.Dismissed, a2.Status);
        Assert.True(a2.DecisionSynced);
        Assert.Empty(hub.DecisionsToPush());
        Assert.Empty(hub.Local());                                                   // pulled rows are never "local"

        // A local row with the same id as a pulled one is never overwritten by a peer's view.
        var (local, _, _) = hub.Record("r-prg", "prg#1", "spacex", null, "mine");
        Assert.Equal(0, hub.MergePulled("src-x", "X", new[] { local! with { Status = AgentRequestStore.Approved } }));
        Assert.Equal(AgentRequestStore.Pending, hub.Get(local!.Id)!.Status);
    }

    [Fact]
    public void The_peer_applies_a_pushed_decision_only_to_its_own_rows()
    {
        var peer = Store();
        var (mine, _, _) = peer.Record("r-web", "web#1", "MONSTER", null, "need fixtures");
        var (row, err) = peer.ApplyPushedDecision(mine!.Id, AgentRequestStore.Approved, "operator@spacex", 999);
        Assert.Null(err);
        Assert.Equal(AgentRequestStore.Approved, row!.Status);
        Assert.Equal(999, row.DecidedAt);
        Assert.Equal("operator@spacex", row.DecidedBy);
        var (_, e2) = peer.ApplyPushedDecision("ghost", AgentRequestStore.Approved, "operator@spacex", null);
        Assert.Contains("no request ghost", e2);
        peer.MergePulled("src-other", "other", new[] { new AgentRequestStore.AgentRequest("p9", null, "other", "r-z", "z#1", null, "x", 1, AgentRequestStore.Pending) });
        var (_, e3) = peer.ApplyPushedDecision("p9", AgentRequestStore.Dismissed, "operator@spacex", null);
        Assert.Contains("not recorded on this harness", e3);
    }

    [Fact]
    public void Decided_rows_are_trimmed_beyond_the_cap_pending_never()
    {
        var store = Store();
        for (var i = 0; i < AgentRequestStore.MaxDecidedKept + 5; i++)
        {
            var (r, _, _) = store.Record($"r-{i}", $"a{i}", "spacex", null, $"req {i}");
            _now += 1;
            store.Decide(r!.Id, AgentRequestStore.Dismissed, "spacex");
        }
        store.Record("r-p", "p", "spacex", null, "still pending");
        Assert.Equal(AgentRequestStore.MaxDecidedKept + 1, store.All().Count);
        Assert.Equal(1, store.PendingCount());
    }

    // ---- the tool ---------------------------------------------------------------------------------

    [Fact]
    public void Request_arch_records_only_and_tells_the_agent_the_arch_is_not_woken()
    {
        var store = Store();
        var audit = new List<(string, string, string)>();
        var tb = Toolbox(store, audit);

        var o = tb.RequestArch("r-prg", "Please assign MONSTER/web#1 to upload prod.bak to the hub.", "Need the staging DB");
        Assert.True(o.Ok);
        Assert.Equal("recorded", o.Status);
        Assert.Contains("NOT woken", o.Detail);
        Assert.Contains("approves", o.Detail);
        var data = JsonSerializer.SerializeToElement(o.Data);
        Assert.Equal(AgentRequestStore.Pending, data.GetProperty("request").GetProperty("status").GetString());
        Assert.Equal("prg#1", data.GetProperty("request").GetProperty("agent").GetString());
        Assert.Equal("spacex", data.GetProperty("request").GetProperty("machine").GetString());
        Assert.Equal("Need the staging DB", data.GetProperty("request").GetProperty("title").GetString());
        Assert.Equal(1, data.GetProperty("pendingForYou").GetInt32());
        Assert.Contains(("request_arch", "r-prg", "recorded"), audit);
        Assert.Single(store.Local());

        var dup = tb.RequestArch("r-prg", "Please assign MONSTER/web#1 to upload prod.bak to the hub.", null);
        Assert.True(dup.Ok);
        Assert.Equal("duplicate", dup.Status);
        Assert.Single(store.Local());

        Assert.Equal("error", tb.RequestArch("r-prg", "   ", null).Status);
        Assert.Equal("error", tb.RequestArch("r-nope", "x", null).Status);
        Assert.Equal("error", tb.RequestArch(null, "x", null).Status);
        Assert.Equal("unavailable", Toolbox(null).RequestArch("r-prg", "x", null).Status);
    }

    [Fact]
    public void The_server_lists_and_dispatches_request_arch_as_the_tenth_tool()
    {
        var names = RepoAgentMcpServer.ToolsList().Select(t => t!["name"]!.GetValue<string>()).ToArray();
        Assert.Equal(new[] { "my_effort", "report_leg", "harness_help", "stash_prompt", "arm_my_loop", "hub_upload", "hub_download", "hub_files", "my_local_apps", "request_arch" }, names);
        var tool = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "request_arch")!;
        Assert.Contains("NOT woken", tool["description"]!.GetValue<string>());
        Assert.Equal(new[] { "text" }, tool["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Equal(2, tool["inputSchema"]!["properties"]!.AsObject().Count);

        var store = Store();
        var server = new RepoAgentMcpServer(Toolbox(store));
        var call = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"request_arch","arguments":{"text":"need a decision on the schema","title":"schema"}}}"""), "r-prg");
        var outcome = JsonDocument.Parse(call.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>()).RootElement;
        Assert.True(outcome.GetProperty("ok").GetBoolean());
        Assert.Equal("recorded", outcome.GetProperty("status").GetString());
        Assert.Equal("schema", Assert.Single(store.Local()).Title);
        var init = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""), "r-prg");
        Assert.Contains("request_arch", init.Body!["result"]!["instructions"]!.GetValue<string>());
    }

    // ---- the arch side (pure parts) ---------------------------------------------------------------

    [Fact]
    public void The_message_the_arch_sees_names_the_agent_the_approval_and_the_text()
    {
        var r = new AgentRequestStore.AgentRequest("a1", "src-m", "MONSTER", "r-web", "web#1", "Need fixtures", "  Please have prg#1 upload its fixtures.  ", 1, AgentRequestStore.Approved);
        var msg = ArchAgentService.ComposeRequestMessage(r);
        Assert.StartsWith("[Request from repo agent MONSTER/web#1 — approved by the Operator: Need fixtures]\nPlease have prg#1 upload its fixtures.\n", msg);
        Assert.Contains("send_task", msg);
        Assert.DoesNotContain("Need fixtures]", ArchAgentService.ComposeRequestMessage(r with { Title = null }));
        Assert.Equal("request", ArchAgentService.ActorRequest);
    }

    [Fact]
    public void A_peers_reply_parses_into_rows_and_skips_what_has_no_id_repo_or_text()
    {
        var data = JsonSerializer.SerializeToElement(new object[]
        {
            new { id = "a1", machine = "MONSTER", repoId = "r-web", agent = "web#1", title = "t", text = "need x", createdAt = 123L, status = "pending" },
            new { id = "a2", repoId = "r-web", text = "decided", createdAt = 124L, status = "dismissed", decidedAt = 200L, decidedBy = "MONSTER" },
            new { id = "", repoId = "r-web", text = "no id" },
            new { id = "a4", repoId = "r-web" },
        });
        var rows = ArchAgentService.ParsePulled(data);
        Assert.Equal(new[] { "a1", "a2" }, rows.Select(r => r.Id));
        Assert.Equal("web#1", rows[0].Agent);
        Assert.Equal("t", rows[0].Title);
        Assert.Equal(123L, rows[0].CreatedAt);
        Assert.Equal("r-web", rows[1].Agent);                  // no handle → the repo id
        Assert.Equal(AgentRequestStore.Dismissed, rows[1].Status);
        Assert.Equal(200L, rows[1].DecidedAt);
        Assert.Empty(ArchAgentService.ParsePulled(null));
        Assert.Empty(ArchAgentService.ParsePulled(JsonSerializer.SerializeToElement(new { not = "an array" })));
    }
    // ---- approve as a goal (openspec repo-agent-requests-goal-drive) ------------------------------

    [Fact]
    public void A_request_delivered_as_a_goal_remembers_its_mode_goal_and_conversation_across_a_reload()
    {
        var store = Store();
        var (row, _, _) = store.Record("r-prg", "prg#1", "spacex", "Need the staging DB", "Please have web#1 upload prod.bak.");
        var (approved, _) = store.Decide(row!.Id, AgentRequestStore.Approved, "spacex", conversationId: "@arch:g1");
        Assert.Null(approved!.Mode);
        var delivered = store.MarkDelivered(row.Id, mode: AgentRequestStore.ModeGoal, goalId: "g1", conversationId: "@arch:g1");
        Assert.Equal(AgentRequestStore.ModeGoal, delivered!.Mode);
        Assert.Equal("g1", delivered.GoalId);
        Assert.Equal("@arch:g1", delivered.ConversationId);
        Assert.Equal(delivered, Assert.Single(Store().All()));            // persisted with the mode and the goal
        Assert.Empty(store.ApprovedUndelivered());                          // a goal-driven request never waits for the arch's slot
        // The message path marks the default mode and keeps the conversation it was posted to.
        var (row2, _, _) = store.Record("r-prg", "prg#1", "spacex", null, "a one-step ask");
        store.Decide(row2!.Id, AgentRequestStore.Approved, "spacex", conversationId: "@arch");
        var d2 = store.MarkDelivered(row2.Id);
        Assert.Equal(AgentRequestStore.ModeMessage, d2!.Mode);
        Assert.Null(d2.GoalId);
        Assert.Equal("@arch", d2.ConversationId);
        var view = JsonSerializer.SerializeToElement(RequestView.Row(delivered));
        Assert.Equal("goal", view.GetProperty("mode").GetString());
        Assert.Equal("g1", view.GetProperty("goalId").GetString());
    }

    [Fact]
    public void The_goal_text_names_the_agent_the_request_and_what_done_looks_like_and_the_message_teaches_the_arch_to_self_arm()
    {
        var r = new AgentRequestStore.AgentRequest("a1", "src-m", "MONSTER", "r-web", "web#1", "Need fixtures", "  Please have prg#1 upload its fixtures and transfer them here.  ", 1, AgentRequestStore.Pending);
        var goal = ArchAgentService.ComposeRequestGoal(r);
        Assert.StartsWith("Request from MONSTER/web#1: Need fixtures\n\nFulfil this request from repo agent MONSTER/web#1, approved by the Operator:\nPlease have prg#1 upload its fixtures and transfer them here.\n\n", goal);
        Assert.Equal("goal: Request from MONSTER/web#1: Need fixtures", ArchGoals.ConversationName(goal));   // the goal conversation is named after the headline
        Assert.Contains("send_task", goal);
        Assert.Contains("hub_transfer", goal);
        Assert.Contains("tell web#1 the outcome", goal);
        Assert.Contains("Done = the requesting agent has what it asked for", goal);
        var untitled = ArchAgentService.ComposeRequestGoal(r with { Title = null, Text = "Please have prg#1 upload its fixtures and transfer them here, then tell me.\nSecond line." });
        Assert.StartsWith("Request from MONSTER/web#1: Please have prg#1 upload its fixtures and trans…\n\n", untitled);   // an untitled request headlines with its first words (47 chars + …)
        // The one-shot message tells the arch that coordination across turns means a goal of its own, authorized by the approval.
        var msg = ArchAgentService.ComposeRequestMessage(r);
        Assert.Contains("start a goal conversation for it (start_arch_goal", msg);
        Assert.Contains("this approval authorizes you", msg);
        Assert.Contains("do NOT one-shot it and go idle", msg);
    }

    [Fact]
    public void The_arch_guidance_recognizes_coordination_and_lets_an_approved_request_authorize_a_goal()
    {
        Assert.Equal("<!-- arch-role v15 -->", ArchAgentService.RoleVersionMarker);
        var tool = ArchMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "start_arch_goal")!["description"]!.GetValue<string>();
        Assert.Contains("APPROVED repo-agent request", tool);
        Assert.Contains("start the goal yourself instead of doing step one and going idle", tool);
    }
}
