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
        Assert.Equal(new[] { "my_effort", "report_leg", "harness_help", "stash_prompt", "arm_my_loop", "hub_upload", "hub_download", "hub_files", "my_local_apps", "request_arch", "my_peers", "my_requests" }, names);
        var tool = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "request_arch")!;
        Assert.Contains("NOT woken", tool["description"]!.GetValue<string>());
        Assert.Equal(new[] { "text" }, tool["inputSchema"]!["required"]!.AsArray().Select(n => n!.GetValue<string>()));
        Assert.Equal(6, tool["inputSchema"]!["properties"]!.AsObject().Count);   // text, title + probe / ifFits / ifNone / meanwhile (openspec repo-agent-arch-picture)

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
        Assert.Equal("<!-- arch-role v16 -->", ArchAgentService.RoleVersionMarker); // v16: recurring-task tools (fleet task 933709ea); v15 was this change
        var tool = ArchMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "start_arch_goal")!["description"]!.GetValue<string>();
        Assert.Contains("APPROVED repo-agent request", tool);
        Assert.Contains("start the goal yourself instead of doing step one and going idle", tool);
    }
    // ---- my_peers: the fleet as the arch sees it (openspec repo-agent-my-peers) ------------------

    private static PeerAgent Agent(string machine, bool self, string repoId, string name, string handle, string? remote, string branch, string availability, string? reason = null, bool managed = true, bool dirty = false, string actor = "human", long? running = null) =>
        new(machine, self, repoId, name, handle, remote, branch, dirty, availability, reason, actor, running, managed);

    private static IReadOnlyList<PeerMachine> Fleet() => new List<PeerMachine>
    {
        new("spacex", true, true, "ok", null, "1.0.0+abc", false, true, true, true,
            new List<PeerRepoRow> { new("r-prg", "prg", "prg#1", true, "https://github.com/mirceta/prg.git"), new("r-web", "web", "web#1", true, "https://github.com/mirceta/web.git"), new("r-idle", "idle-repo", "idle-repo", false, null) },
            new List<PeerAgent> { Agent("spacex", true, "r-prg", "prg", "prg#1", "https://github.com/mirceta/prg.git", "feature/local-mode-revival", "claimed", dirty: true), Agent("spacex", true, "r-web", "web", "web#1", "https://github.com/mirceta/web.git", "main", "available") }),
        new("MACHINE-B", false, true, "ok", null, "1.0.0+abc", false, true, true, true,
            new List<PeerRepoRow> { new("b-prg", "prg", "prg#1", true, "git@github.com:mirceta/prg"), new("b-shop", "shop", "shop#1", true, "https://github.com/mirceta/shop.git") },
            new List<PeerAgent> { Agent("MACHINE-B", false, "b-prg", "prg", "prg#1", "git@github.com:mirceta/prg", "main", "claimed", "operator-occupied", actor: "arch"), Agent("MACHINE-B", false, "b-shop", "shop", "shop#1", "https://github.com/mirceta/shop.git", "main", "busy", running: 1000) }),
        new("MACHINE-C", false, true, "ok", null, "0.9.0+old", true, false, false, false,
            new List<PeerRepoRow> { new("c-web", "web", "web", true, null) },
            new List<PeerAgent> { Agent("MACHINE-C", false, "c-web", "web", "web", null, "unknown", "unmanaged", managed: false) }),
        new("laptop", false, false, "unreachable", "connection refused", null, false, false, false, false, Array.Empty<PeerRepoRow>(), Array.Empty<PeerAgent>()),
    };

    private RepoAgentToolbox PeersToolbox(IReadOnlyList<PeerMachine>? fleet)
    {
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        return new RepoAgentToolbox(g, (src, repo) => src is null ? repo + "#1" : src + "/" + repo, () => _now)
        {
            Environment = new RepoAgentEnvironment
            {
                Repo = id => id == "r-prg" ? new RepoFacts("r-prg", "prg", Path.Combine(_dir, "prg"), "prg#1") : id == "r-web" ? new RepoFacts("r-web", "web", Path.Combine(_dir, "web"), "web#1") : null,
                Machine = "spacex", Peers = fleet is null ? null : () => fleet,
            },
        };
    }

    [Fact]
    public void My_peers_shows_every_machine_and_agent_and_marks_the_agents_of_the_callers_own_repo()
    {
        var o = PeersToolbox(Fleet()).MyPeers("r-prg");
        Assert.True(o.Ok);
        var data = JsonSerializer.SerializeToElement(o.Data);
        Assert.Equal("spacex", data.GetProperty("you").GetProperty("machine").GetString());
        Assert.Equal("prg#1", data.GetProperty("you").GetProperty("handle").GetString());
        var machines = data.GetProperty("machines").EnumerateArray().ToList();
        Assert.Equal(new[] { "spacex", "laptop", "MACHINE-B", "MACHINE-C" }, machines.Select(m => m.GetProperty("machine").GetString()));   // self first, then by name
        var b = machines.First(m => m.GetProperty("machine").GetString() == "MACHINE-B");
        Assert.True(b.GetProperty("reachable").GetBoolean());
        Assert.Equal(2, b.GetProperty("repos").GetArrayLength());
        var bPrg = b.GetProperty("agents").EnumerateArray().First(a => a.GetProperty("handle").GetString() == "prg#1");
        Assert.True(bPrg.GetProperty("sameRepo").GetBoolean());                        // same remote URL, written as git@ there
        Assert.True(bPrg.GetProperty("handoffTarget").GetBoolean());
        Assert.Equal("claimed (operator-occupied)", bPrg.GetProperty("availability").GetString());
        Assert.Equal("arch", bPrg.GetProperty("lastActor").GetString());
        var bShop = b.GetProperty("agents").EnumerateArray().First(a => a.GetProperty("handle").GetString() == "shop#1");
        Assert.False(bShop.GetProperty("sameRepo").GetBoolean());
        Assert.True(bShop.GetProperty("running").GetBoolean());
        Assert.Equal("busy", bShop.GetProperty("availability").GetString());
        // The caller's own row is first and marked you; its dirty flag and branch are there.
        var self = machines[0].GetProperty("agents").EnumerateArray().First();
        Assert.True(self.GetProperty("you").GetBoolean());
        Assert.True(self.GetProperty("dirty").GetBoolean());
        Assert.Equal("feature/local-mode-revival", self.GetProperty("branch").GetString());
        Assert.False(self.GetProperty("handoffTarget").GetBoolean());
        // An older peer that does not accept sends: its agent is unmanaged there and no handoff target; the build is marked older.
        var c = machines.First(m => m.GetProperty("machine").GetString() == "MACHINE-C");
        Assert.True(c.GetProperty("olderBuild").GetBoolean());
        Assert.False(c.GetProperty("acceptsSends").GetBoolean());
        Assert.Equal("unmanaged", c.GetProperty("agents")[0].GetProperty("availability").GetString());
        // A dark peer is a row with its status, not a missing row.
        var dark = machines.First(m => m.GetProperty("machine").GetString() == "laptop");
        Assert.False(dark.GetProperty("reachable").GetBoolean());
        Assert.Equal("connection refused", dark.GetProperty("detail").GetString());
        Assert.Equal(new[] { "MACHINE-B/prg#1" }, data.GetProperty("sameRepo").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(new[] { "MACHINE-B/prg#1" }, data.GetProperty("handoffTargets").EnumerateArray().Select(x => x.GetString()));
        Assert.Equal(new[] { "MACHINE-C" }, data.GetProperty("machinesWithoutYourRepo").EnumerateArray().Select(x => x.GetString()));
        Assert.Contains("Same repo as you (the only valid targets for a branch or PR handoff): MACHINE-B/prg#1 (claimed (operator-occupied))", o.Detail);
        Assert.Contains("not answering: laptop", o.Detail);
    }

    [Fact]
    public void My_peers_filters_and_says_plainly_when_no_other_agent_of_the_repo_exists()
    {
        var tb = PeersToolbox(Fleet());
        // sameRepoOnly: only prg agents (and the dark peer, named), reachable machines without it dropped.
        var same = JsonSerializer.SerializeToElement(tb.MyPeers("r-prg", null, sameRepoOnly: true).Data);
        var agents = same.GetProperty("machines").EnumerateArray().SelectMany(m => m.GetProperty("agents").EnumerateArray()).Select(a => a.GetProperty("machine").GetString() + "/" + a.GetProperty("handle").GetString()).ToList();
        Assert.Equal(new[] { "spacex/prg#1", "MACHINE-B/prg#1" }, agents);
        Assert.DoesNotContain("MACHINE-C", same.GetProperty("machines").EnumerateArray().Select(m => m.GetProperty("machine").GetString()));
        Assert.Contains("laptop", same.GetProperty("machines").EnumerateArray().Select(m => m.GetProperty("machine").GetString()));
        // repo filter by name / handle.
        var shop = JsonSerializer.SerializeToElement(tb.MyPeers("r-prg", "shop").Data);
        Assert.Equal(new[] { "MACHINE-B/shop#1" }, shop.GetProperty("machines").EnumerateArray().SelectMany(m => m.GetProperty("agents").EnumerateArray()).Select(a => a.GetProperty("machine").GetString() + "/" + a.GetProperty("handle").GetString()));
        // The web agent: the only other "web" is on MACHINE-C, matched by handle base (no remote known there) — but not a handoff target (unmanaged, no sends).
        var web = tb.MyPeers("r-web");
        var wd = JsonSerializer.SerializeToElement(web.Data);
        Assert.Equal(new[] { "MACHINE-C/web" }, wd.GetProperty("sameRepo").EnumerateArray().Select(x => x.GetString()));
        Assert.Empty(wd.GetProperty("handoffTargets").EnumerateArray());
        Assert.Contains("not reachable by the arch", web.Detail);
        // No other agent of the repo anywhere: the detail says so and names the machines without it.
        var lonely = new List<PeerMachine>
        {
            Fleet()[0],
            new("MACHINE-B", false, true, "ok", null, "1.0.0+abc", false, true, true, true, new List<PeerRepoRow> { new("b-shop", "shop", "shop#1", true, null) }, new List<PeerAgent> { Agent("MACHINE-B", false, "b-shop", "shop", "shop#1", null, "main", "available") }),
        };
        var alone = PeersToolbox(lonely).MyPeers("r-prg");
        Assert.Contains("NONE — no other agent of your repo exists in the fleet", alone.Detail);
        Assert.Contains("ask the Operator (via request_arch) to register your repo there", alone.Detail);
        Assert.Contains("machines without it: MACHINE-B", alone.Detail);
        Assert.Empty(JsonSerializer.SerializeToElement(alone.Data).GetProperty("sameRepo").EnumerateArray());
        Assert.Equal("unavailable", PeersToolbox(null).MyPeers("r-prg").Status);
        Assert.Equal("error", PeersToolbox(Fleet()).MyPeers(null).Status);
    }

    [Fact]
    public void Same_repo_is_the_remote_url_else_the_handle_base_else_the_name()
    {
        Assert.Equal("github.com/mirceta/prg", RepoAgentToolbox.NormalizeRemote("https://github.com/mirceta/prg.git"));
        Assert.Equal("github.com/mirceta/prg", RepoAgentToolbox.NormalizeRemote("git@github.com:mirceta/prg"));
        Assert.Equal("github.com/mirceta/prg", RepoAgentToolbox.NormalizeRemote("ssh://git@github.com/mirceta/prg.git/"));
        Assert.Null(RepoAgentToolbox.NormalizeRemote("  "));
        Assert.Equal("prg", RepoAgentToolbox.HandleBase("spacex/prg#2"));
        Assert.Equal("prg", RepoAgentToolbox.HandleBase("prg"));
        Assert.Equal("", RepoAgentToolbox.HandleBase(null));
        var a = Agent("B", false, "x", "prg", "prg#3", "https://github.com/other/prg.git", "main", "available");
        Assert.False(RepoAgentToolbox.SameRepo(a, "https://github.com/mirceta/prg.git", "prg#1", "prg"));   // both remotes known and different: not the same repo, whatever the handle says
        Assert.True(RepoAgentToolbox.SameRepo(a with { RemoteUrl = null }, "https://github.com/mirceta/prg.git", "prg#1", "prg"));   // no remote on one side: the handle base decides
        Assert.True(RepoAgentToolbox.SameRepo(a with { RemoteUrl = null, Handle = "" }, null, "", "prg"));   // nothing but the name
        Assert.Equal("claimed (operator-occupied)", RepoAgentToolbox.AvailabilityWord("claimed", "operator-occupied"));
        Assert.Equal("claimed", RepoAgentToolbox.AvailabilityWord("claimed", null));
        Assert.Equal("unknown", RepoAgentToolbox.AvailabilityWord(null));
    }

    [Fact]
    public void The_one_line_about_peers_is_in_the_tool_text_and_the_preamble()
    {
        const string line = "A peer is an agent bound to one repo on one machine. A branch or PR can only be handed to an agent of the same repo; a question about a machine can go to any agent on it. Read my_peers before writing a request, and name the recipient when you can.";
        var tool = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "request_arch")!["description"]!.GetValue<string>();
        Assert.Contains(line, tool);
        var server = new RepoAgentMcpServer(Toolbox(Store()));
        var init = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""), "r-prg");
        Assert.Contains(line, init.Body!["result"]!["instructions"]!.GetValue<string>());
        var peers = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "my_peers")!;
        Assert.Contains("never wakes the arch", peers["description"]!.GetValue<string>());
        Assert.Equal(2, peers["inputSchema"]!["properties"]!.AsObject().Count);
    }

    // ---- the picture of the arch (openspec repo-agent-arch-picture) -------------------------------

    [Fact]
    public void The_preamble_and_the_tool_text_give_the_agent_the_picture_of_the_arch()
    {
        var pic = RepoAgentMcpServer.ArchPicture;
        foreach (var must in new[] { "NO HANDS", "no files, no shell, no machines, no credentials", "cannot provision", "answer within your turn",
                     "list the fleet's repo agents", "read their transcripts", "send a task to one agent", "keep its own memory",
                     "(1) it takes tasks from the Operator", "(2) it is the switchboard", "full control of their own machine", "you will receive such probes too",
                     "PROBE about this machine", "short, factual, checked now", "with the risk named", "do not execute what the probe only asks about",
                     "never ask the arch FOR a machine", "leave your work where a peer can pick it up" })
            Assert.Contains(must, pic);
        var server = new RepoAgentMcpServer(Toolbox(Store()));
        var init = server.Handle(System.Text.Json.Nodes.JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"""), "r-prg");
        var instructions = init.Body!["result"]!["instructions"]!.GetValue<string>();
        Assert.StartsWith(pic, instructions);
        Assert.Contains("only RECORDED until the Operator approves", instructions);
        Assert.Contains("never as a tool result", instructions);
        Assert.Contains("my_peers", instructions);
        Assert.Contains("my_requests", instructions);
        var tool = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "request_arch")!["description"]!.GetValue<string>();
        foreach (var must in new[] { "no hands", "cannot provision a machine", "do not ask it FOR things", "find and brief the peer", "probe =", "ifFits =", "ifNone =", "meanwhile =", "only RECORDS", "NOT woken", "never as a tool result", "leave your work in a state a peer can pick up" })
            Assert.Contains(must, tool);
        var names = RepoAgentMcpServer.ToolsList().Select(t => t!["name"]!.GetValue<string>()).ToArray();
        Assert.Contains("my_peers", names);
        Assert.Contains("my_requests", names);
    }

    [Fact]
    public void Structured_fields_are_recorded_persisted_and_rendered_for_the_operator_and_the_arch()
    {
        var store = Store();
        var tb = Toolbox(store);
        var o = tb.RequestArch("r-prg", "I need a peer with a desktop Birokrat in LOCAL layout to run the migration.", "Peer with local Birokrat",
            probe: "  Do you have SQL Server with the Birokrat databases restored, and is it safe to change C:\\Birokrat on your machine? Check the service and the db list. ",
            ifFits: "Take branch feature/invoice-import, run the migration, upload prod.bak to the hub as web/db/prod.bak.",
            ifNone: "Tell me nobody fits; I will stub the data.",
            meanwhile: "I finish the migration script and push the branch.");
        Assert.True(o.Ok);
        Assert.Equal("recorded", o.Status);
        Assert.DoesNotContain("Tip:", o.Detail);                                      // fields given → no nudge
        var row = Assert.Single(store.Local());
        Assert.StartsWith("Do you have SQL Server", row.Probe);                         // trimmed
        Assert.Equal("Tell me nobody fits; I will stub the data.", row.IfNone);
        Assert.Equal(row, Assert.Single(Store().All()));                              // persisted with the fields
        var view = JsonSerializer.SerializeToElement(RequestView.Row(row));
        Assert.Equal(row.Probe, view.GetProperty("probe").GetString());
        Assert.Equal(row.Meanwhile, view.GetProperty("meanwhile").GetString());
        // The arch reads the probe as something to send_task and read back, and the handoff after it.
        var msg = ArchAgentService.ComposeRequestMessage(row);
        Assert.Contains("PROBE for peers (send_task it to each candidate", msg);
        Assert.Contains("read_transcript", msg);
        Assert.Contains("IF A PEER FITS, hand it: Take branch feature/invoice-import", msg);
        Assert.Contains("IF NONE FITS, send back to prg#1: Tell me nobody fits", msg);
        Assert.Contains("MEANWHILE the agent: I finish the migration", msg);
        Assert.Contains("MEANWHILE the agent", ArchAgentService.ComposeRequestGoal(row));
        // A pulled copy keeps the fields.
        var pulled = ArchAgentService.ParsePulled(JsonSerializer.SerializeToElement(new[] { RequestView.Row(row) }));
        Assert.Equal(row.Probe, Assert.Single(pulled).Probe);
        Assert.Equal(row.IfFits, pulled[0].IfFits);
        // Free text alone stays valid, and gets the nudge.
        var plain = tb.RequestArch("r-prg", "Decision needed: drop the /v1 routes?", null);
        Assert.True(plain.Ok);
        Assert.Contains("Tip: a request that needs another machine", plain.Detail);
        Assert.DoesNotContain("PROBE", ArchAgentService.ComposeRequestMessage(store.Local().First(r => r.Title is null)));
    }

    [Fact]
    public void My_requests_tells_pending_approved_dismissed_and_answered_apart()
    {
        var store = Store();
        long? archSentAt = null;
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        var tb = new RepoAgentToolbox(g, (src, repo) => src is null ? repo + "#1" : src + "/" + repo, () => _now)
        {
            Environment = new RepoAgentEnvironment
            {
                Repo = id => id == "r-prg" ? new RepoFacts("r-prg", "prg", Path.Combine(_dir, "prg"), "prg#1") : null,
                Machine = "spacex", Requests = store, ArchSentAt = _ => archSentAt,
            },
        };
        var (a, _, _) = store.Record("r-prg", "prg#1", "spacex", null, "request A");
        var (b, _, _) = store.Record("r-prg", "prg#1", "spacex", null, "request B");
        var (c, _, _) = store.Record("r-prg", "prg#1", "spacex", null, "request C");
        store.Record("r-web", "web#1", "spacex", null, "someone else's");
        _now += 10_000;
        store.Decide(b!.Id, AgentRequestStore.Dismissed, "spacex");
        store.Decide(c!.Id, AgentRequestStore.Approved, "spacex", conversationId: "@arch");
        store.MarkDelivered(c.Id);

        var o = tb.MyRequests("r-prg");
        Assert.True(o.Ok);
        var data = JsonSerializer.SerializeToElement(o.Data);
        var rows = data.GetProperty("requests").EnumerateArray().ToDictionary(r => r.GetProperty("text").GetString()!, r => r.GetProperty("status").GetString());
        Assert.Equal(3, rows.Count);                                                   // only this agent's
        Assert.Equal("pending", rows["request A"]);
        Assert.Equal("dismissed", rows["request B"]);
        Assert.Equal("approved", rows["request C"]);
        Assert.Contains("silence, not rejection", o.Detail);

        // The arch sent this agent a prompt after the delivery → answered.
        _now += 5_000;
        archSentAt = _now;
        var o2 = tb.MyRequests("r-prg");
        var rows2 = JsonSerializer.SerializeToElement(o2.Data).GetProperty("requests").EnumerateArray().ToDictionary(r => r.GetProperty("text").GetString()!, r => r.GetProperty("status").GetString());
        Assert.Equal("answered", rows2["request C"]);
        Assert.Equal("pending", rows2["request A"]);                                   // a send after a still-pending request is not an answer to it
        Assert.Contains("read your own transcript", JsonSerializer.SerializeToElement(o2.Data).GetProperty("requests").EnumerateArray().First(r => r.GetProperty("text").GetString() == "request C").GetProperty("meaning").GetString());
        // The pure rule.
        Assert.Equal("answered", RepoAgentToolbox.RequestStatusFor(c with { Status = AgentRequestStore.Approved, DeliveredAt = 100 }, 200));
        Assert.Equal("approved", RepoAgentToolbox.RequestStatusFor(c with { Status = AgentRequestStore.Approved, DeliveredAt = 300 }, 200));
        Assert.Equal("dismissed", RepoAgentToolbox.RequestStatusFor(c with { Status = AgentRequestStore.Dismissed }, 999));
        Assert.Equal("ok", tb.MyRequests("r-prg", includeDecided: false).Status);
        Assert.Single(JsonSerializer.SerializeToElement(tb.MyRequests("r-prg", includeDecided: false).Data).GetProperty("requests").EnumerateArray());
        Assert.Equal("unavailable", Toolbox(null).MyRequests("r-prg").Status);
    }

    [Fact]
    public void Harness_help_answers_what_is_the_arch_agent_with_the_section_written_for_repo_agents()
    {
        var topics = HarnessKnowledge.Build(HarnessKnowledge.EmbeddedDocs());
        var a = HarnessKnowledge.Search(topics, "what is the arch agent");
        Assert.NotNull(a);
        Assert.Equal("agents", a!.Topic.Id);
        Assert.NotNull(a.Section);
        Assert.Equal("The arch agent, seen from a repo agent", a.Section!.Heading);
        Assert.Contains("no hands", a.Text);
        Assert.Contains("Switchboard", a.Text);
        Assert.Contains("answering a probe", a.Text);
        var b = HarnessKnowledge.Search(topics, "who is the arch and what can it do for me");
        Assert.Equal("agents", b!.Topic.Id);
    }
}
