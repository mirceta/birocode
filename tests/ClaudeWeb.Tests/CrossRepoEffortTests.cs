using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec cross-repo-effort-legs (fleet task 68d33734): one logical effort across repos is
/// ONE card with typed LEGS — driver / driven, an AGENTLESS leg represented by its checkout
/// path, each with its own branch, PR and independently verified merge. The regression that
/// motivates it: the Knjiga-pošte card went DONE off the driver's PR #21 while the prg leg's
/// PR #166 was not merged. Here that card can never be done: one merged leg leaves it
/// PARTIALLY merged, a done claim is judged dishonest with every leg named, the agentless
/// leg is probed at its own checkout, dispatch never pings it, and a repo agent can inspect
/// and report its effort through the harness's tool server.
/// </summary>
public sealed class CrossRepoEffortTests : IDisposable
{
    private const long Hour = 3600_000L;
    private const long Window = 24 * Hour;
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-legs-" + Guid.NewGuid().ToString("N"));
    private static readonly TaskLifecycle.Facts NoFacts = new(false, null, false, false, null, null, false, null, false);
    private const string WebFlowPr21 = "https://github.com/mirceta/web-flow-autodev/pull/21";
    private const string PrgPr166 = "https://github.com/mirceta/prg/pull/166";

    public CrossRepoEffortTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private TaskGraphService Graph() => new(new Logger(), _dir);

    /// <summary>The prgcopies\copy1\prg checkout: a directory on this machine no agent owns.</summary>
    private string Copy1Prg()
    {
        var p = Path.Combine(_dir, "prgcopies", "copy1", "prg");
        Directory.CreateDirectory(p);
        return p;
    }

    // ---- fakes -------------------------------------------------------------------------------

    private sealed class FakeLocal : ITaskFactsProbe
    {
        public TaskLifecycle.Facts Next = NoFacts;
        public readonly List<(string Path, string Branch)> Probed = new();
        public TaskLifecycle.Facts Probe(string repoPath, string branch) { Probed.Add((repoPath, branch)); return Next; }
    }

    private sealed class FakePr : IPrFactsProbe
    {
        public readonly Dictionary<string, PrFacts?> ByKey = new(StringComparer.OrdinalIgnoreCase);
        public readonly Dictionary<string, string> Origins = new(StringComparer.OrdinalIgnoreCase);
        public PrFacts? ProbePr(PrRef pr)
        {
            var key = pr.Number is { } n ? $"{pr.OwnerRepo}#{n}" : $"{pr.OwnerRepo}@{pr.Branch}";
            return ByKey.TryGetValue(key, out var f) ? f : null;
        }
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
        public string? OriginUrl(string clonePath) => Origins.TryGetValue(clonePath, out var o) ? o : null;
    }

    private static PrFacts Merged(string ownerRepo, int number, string mergeCommit) =>
        new($"https://github.com/{ownerRepo}/pull/{number}", number, "MERGED", mergeCommit, "head" + number, "feature/x");
    private static PrFacts Open(string ownerRepo, int number, string branch) =>
        new($"https://github.com/{ownerRepo}/pull/{number}", number, "OPEN", null, "head" + number, branch);

    /// <summary>The Knjiga-pošte card as it SHOULD have been modelled: a driver leg (web-flow on
    /// the spacex peer, PR #21) and a driven AGENTLESS leg (the prg checkout here, PR #166).</summary>
    private (TaskGraphService Graph, string Id, string Copy) Knjiga()
    {
        var g = Graph();
        var n = g.AddNode("Knjiga pošte prenos orchestration", "web-flow-autodev drives prg", null, null, 0, 0, now: 1)!;
        g.AddLeg(n.Id, "src-spacex", "r-webflow", null, Effort.Driver, "knjiga-poste-prenos-orchestration", WebFlowPr21, "arch", 2);
        var copy = Copy1Prg();
        g.AddLeg(n.Id, null, null, copy, Effort.Driven, "knjiga-poste", PrgPr166, "arch", 3);
        g.MarkDispatched(n.Id, 4);
        return (g, n.Id, copy);
    }

    // ---- 1. the regression ----------------------------------------------------------------------

    [Fact]
    public void Knjiga_poste_regression_one_leg_merged_one_not_is_partially_merged_and_never_done()
    {
        var (g, id, copy) = Knjiga();
        var pr = new FakePr();
        pr.ByKey["mirceta/web-flow-autodev#21"] = Merged("mirceta/web-flow-autodev", 21, "4fbaff0c");
        pr.ByKey["mirceta/prg#166"] = Open("mirceta/prg", 166, "knjiga-poste");
        pr.Origins[copy] = "https://github.com/mirceta/prg.git";
        var verifier = new BoardVerifier(g, new FakeLocal(), pr, null, new Logger());

        verifier.VerifyOnce(new Dictionary<string, string>(), now: 10);
        var card = g.Find(id)!;
        var legs = TaskGraphService.AssigneesOf(card);
        var driver = legs.Single(a => a.Role == Effort.Driver);
        var driven = legs.Single(a => a.Role == Effort.Driven);
        Assert.Equal(TaskLifecycle.PrMerged, driver.VerifiedStatus);             // PR #21 merged on GitHub
        Assert.Equal(TaskLifecycle.PrOpened, driven.VerifiedStatus);             // PR #166 open
        Assert.Equal(TaskLifecycle.PrOpened, card.Status);                        // the card is as far as its slowest leg
        Assert.NotEqual(TaskLifecycle.Done, card.Status);
        Assert.NotEqual(TaskLifecycle.PrMerged, card.Status);
        var s = Effort.Summarize(card);
        Assert.True(s.CrossRepo);
        Assert.True(s.PartiallyMerged);                                            // the distinct, visible state
        Assert.False(s.AllMerged);
        Assert.Equal(1, s.Merged);
        Assert.Equal(2, s.Legs);
        Assert.Equal(BoardIntegrity.Honest, BoardIntegrity.Judge(card, 11, Window).State); // the column is honest — it is not claiming merged

        // What actually happened on the real board: the card was moved to done off PR #21.
        // The claim stands (claims are advisory, never clamped) — but the judge names the leg.
        g.UpdateNode(id, null, null, null, null, TaskLifecycle.Done, null, null, 12);
        var claimed = g.Find(id)!;
        Assert.Equal(TaskLifecycle.Done, claimed.Status);
        var j = BoardIntegrity.Judge(claimed, 13, Window);
        Assert.Equal(BoardIntegrity.Dishonest, j.State);
        Assert.Contains("1 of 2 legs merged", j.Reason);
        Assert.Contains("copy1/prg", j.Reason);
        Assert.Contains("PR #166 open, not merged", j.Reason);
        Assert.Contains("not done until every leg is merged", j.Reason);
        Assert.NotNull(Effort.MismatchReason(claimed));

        // Idempotent: another pass with the same facts moves nothing further.
        verifier.VerifyOnce(new Dictionary<string, string>(), now: 14);
        Assert.True(Effort.Summarize(g.Find(id)!).PartiallyMerged);

        // Only when PR #166 is merged too does the effort count as merged; the local clone of
        // prg (not a deployed harness) makes that leg's merge live at once.
        pr.ByKey["mirceta/prg#166"] = Merged("mirceta/prg", 166, "abc166");
        verifier.VerifyOnce(new Dictionary<string, string>(), now: 15);
        var whole = g.Find(id)!;
        var s2 = Effort.Summarize(whole);
        Assert.True(s2.AllMerged);
        Assert.False(s2.PartiallyMerged);
        Assert.Null(Effort.MismatchReason(whole));
        Assert.Equal(TaskLifecycle.Done, TaskGraphService.AssigneesOf(whole).Single(a => a.Role == Effort.Driven).VerifiedStatus);
    }

    [Theory]
    [InlineData("done,pr-opened", "pr-opened")]
    [InlineData("pr-merged,doing", "doing")]
    [InlineData("pr-merged,pr-merged", "pr-merged")]
    public void One_merged_leg_never_lifts_the_card_past_its_slowest_leg(string statuses, string expected)
    {
        var legs = statuses.Split(',').Select((st, i) => new TaskGraphService.Assignee(null, "r" + i, st)).ToList();
        Assert.Equal(expected, TaskGraphService.AggregateStatus(legs));
    }

    // ---- 2. the agentless leg -------------------------------------------------------------------

    [Fact]
    public void An_agentless_leg_is_represented_by_its_checkout_never_by_an_agent_and_survives_a_reload()
    {
        var g = Graph();
        var n = g.AddNode("effort", null, null, null, 0, 0, now: 1)!;
        var copy = Copy1Prg();
        var node = g.AddLeg(n.Id, null, null, copy + "\\", Effort.Driven, null, null, "human", 2)!;
        var leg = TaskGraphService.AssigneesOf(node).Single();
        Assert.Equal(Effort.AgentlessPrefix + copy, leg.RepoId);                 // the synthetic id: no managed agent can be meant
        Assert.Equal(copy, leg.Path);
        Assert.True(Effort.IsAgentless(leg));
        Assert.False(Effort.HasAgent(leg));
        Assert.Equal(copy, Effort.PathOf(leg));
        Assert.Equal("copy1/prg", Effort.LegLabel(leg));
        Assert.Equal(Effort.Driven, leg.Role);
        Assert.Equal("todo", leg.Status);

        var back = new TaskGraphService(new Logger(), _dir).Find(n.Id)!;
        var again = TaskGraphService.AssigneesOf(back).Single();
        Assert.Equal(leg.RepoId, again.RepoId);
        Assert.Equal(Effort.Driven, again.Role);
        Assert.Equal(copy, again.Path);

        // The same path again updates the leg (branch, PR, role) instead of duplicating it.
        var upd = g.AddLeg(n.Id, null, null, copy, Effort.Driver, "knjiga-poste", PrgPr166, "human", 3)!;
        var one = TaskGraphService.AssigneesOf(upd).Single();
        Assert.Equal(Effort.Driver, one.Role);
        Assert.Equal("knjiga-poste", one.Branch);
        Assert.Equal(PrgPr166, one.PrUrl);
        Assert.Same(upd, g.AddLeg(n.Id, null, null, copy, null, null, null, "human", 4)); // nothing to change → the same node

        // It is named by path, path tail or synthetic id; and typed / untyped / removed like any leg.
        Assert.True(Effort.Matches(one, copy));
        Assert.True(Effort.Matches(one, "copy1/prg"));
        Assert.True(Effort.Matches(one, "copy1\\prg"));
        Assert.True(Effort.Matches(one, Effort.AgentlessPrefix + copy));
        Assert.False(Effort.Matches(one, "copy2/prg"));
        Assert.Null(TaskGraphService.AssigneesOf(g.SetLegRole(n.Id, one.Key, null, 5)!).Single().Role);
        Assert.Null(g.SetLegRole(n.Id, "nope|nope", Effort.Driver, 6));
        Assert.Null(g.AddLeg(n.Id, null, null, null, Effort.Driver, null, null, "human", 7)); // no repo and no path
        var removed = g.RemoveAssignee(n.Id, null, one.RepoId, "human", 8)!;
        Assert.Empty(TaskGraphService.AssigneesOf(removed));
        Assert.Null(removed.RepoId);
    }

    [Fact]
    public void An_agentless_leg_on_this_machine_is_probed_at_its_checkout_and_its_PR_resolved_from_its_origin()
    {
        var g = Graph();
        var n = g.AddNode("effort", null, null, null, 0, 0, now: 1)!;
        var copy = Copy1Prg();
        g.AddLeg(n.Id, null, "r-webflow", null, Effort.Driver, null, null, "arch", 2);
        g.AddLeg(n.Id, null, null, copy, Effort.Driven, "knjiga-poste", null, "arch", 3);   // branch known, PR not yet
        var local = new FakeLocal { Next = new TaskLifecycle.Facts(true, "c0ffee", true, true, null, null, false, null, false) };
        var pr = new FakePr();
        pr.Origins[copy] = "git@github.com:mirceta/prg.git";
        pr.ByKey["mirceta/prg@knjiga-poste"] = Open("mirceta/prg", 166, "knjiga-poste");
        var verifier = new BoardVerifier(g, local, pr, null, new Logger());

        var result = verifier.VerifyOnce(new Dictionary<string, string>(), now: 10);

        Assert.Contains(local.Probed, p => p.Path == copy && p.Branch == "knjiga-poste"); // probed at ITS path, no registry entry needed
        var driven = TaskGraphService.AssigneesOf(g.Find(n.Id)!).Single(a => Effort.IsAgentless(a));
        Assert.Equal(166, driven.PrNumber);                                       // found on GitHub from the checkout's origin + branch
        Assert.Equal(TaskLifecycle.PrOpened, driven.VerifiedStatus);
        Assert.Contains(result.Changes, c => c.Id == n.Id && c.To == TaskLifecycle.PrOpened && c.Assignee == driven.RepoId);
    }

    // ---- 3. the effort summary, dispatch and the brief ---------------------------------------------

    [Fact]
    public void The_summary_names_roles_merge_words_and_only_a_merged_claim_is_a_mismatch()
    {
        var (g, id, _) = Knjiga();
        var card = g.Find(id)!;
        var s = Effort.Summarize(card);
        Assert.Single(s.Drivers);
        Assert.Single(s.Driven);
        Assert.Equal(0, s.Merged);
        Assert.False(s.PartiallyMerged);
        Assert.Null(Effort.MismatchReason(card));                               // doing: nothing claimed beyond the facts
        Assert.Equal("PR recorded, not verified", Effort.MergeWord(s.Driven[0]));
        Assert.Equal("no PR recorded", Effort.MergeWord(new TaskGraphService.Assignee(null, "r", "todo")));
        Assert.Equal("no PR", Effort.MergeWord(new TaskGraphService.Assignee(null, "r", "todo", Branch: "b")));
        Assert.Equal("merged (PR #21)", Effort.MergeWord(new TaskGraphService.Assignee(null, "r", "done", PrNumber: 21, VerifiedStatus: "pr-merged")));
        Assert.Equal("PR #7 open, not merged", Effort.MergeWord(new TaskGraphService.Assignee(null, "r", "pr-opened", PrNumber: 7, VerifiedStatus: "pr-opened")));
        Assert.Null(Effort.CleanRole("boss"));
        Assert.Equal(Effort.Driver, Effort.CleanRole(" Driver "));
    }

    [Fact]
    public void Dispatch_never_targets_an_agentless_leg_and_the_brief_names_every_leg_and_the_done_rule()
    {
        var (g, id, copy) = Knjiga();
        var legs = TaskGraphService.AssigneesOf(g.Find(id)!);
        Assert.True(Effort.HasAgent(legs.Single(a => a.Role == Effort.Driver)));
        Assert.False(Effort.HasAgent(legs.Single(a => a.Role == Effort.Driven)));
        var lines = new[] { "spacex/web-flow#1 (YOU): driver, branch knjiga-poste-prenos-orchestration, PR " + WebFlowPr21 + ", PR recorded, not verified", "copy1/prg (no agent): driven, no agent — checkout " + copy + ", PR recorded, not verified" };
        var text = ArchAgentService.DispatchMessage(g.Find(id)!, Array.Empty<TaskGraphService.Node>(), "arch", "spacex", "web-flow", null, new[] { "copy1/prg (no agent)" }, "spacex/web-flow#1", lines);
        Assert.Contains("CROSS-REPO EFFORT with typed legs", text);
        Assert.Contains("copy1/prg (no agent): driven", text);
        Assert.Contains("done only when EVERY leg's pull request is verified merged", text);
        Assert.Contains("report_leg(task, leg, branch, pr)", text);
        Assert.Contains("my_effort", text);
        // A plain card's brief is unchanged.
        Assert.DoesNotContain("CROSS-REPO", ArchAgentService.DispatchMessage(g.Find(id)!, Array.Empty<TaskGraphService.Node>(), "arch", "spacex", "web-flow"));
    }

    // ---- 4. the repo agent's own tools --------------------------------------------------------------

    private static JsonElement Data(RepoAgentToolbox.ToolOutcome o) => JsonSerializer.SerializeToElement(o.Data);

    [Fact]
    public void A_repo_agent_can_inspect_its_effort_and_a_driver_can_report_the_leg_it_drives()
    {
        var g = Graph();
        var n = g.AddNode("Knjiga pošte prenos orchestration", "the shared goal", null, null, 0, 0, now: 1)!;
        var copy = Copy1Prg();
        g.AddLeg(n.Id, null, "r-webflow", null, Effort.Driver, "knjiga-poste-prenos-orchestration", WebFlowPr21, "arch", 2);
        g.AddLeg(n.Id, null, null, copy, Effort.Driven, null, null, "arch", 3);
        g.AddLeg(n.Id, null, "r-skratek", null, Effort.Driven, null, null, "arch", 4);
        var tools = new RepoAgentToolbox(g, (src, repo) => src is null ? "spacex/" + repo : src + "/" + repo, () => 100);

        var mine = tools.MyEffort("r-webflow");
        Assert.True(mine.Ok);
        Assert.Equal("in-effort", mine.Status);
        Assert.Contains("you are the driver", mine.Detail);
        var effort = Data(mine).GetProperty("efforts")[0];
        Assert.Equal("driver", effort.GetProperty("myRole").GetString());
        Assert.Equal("the shared goal", effort.GetProperty("goal").GetString());
        Assert.Equal(2, effort.GetProperty("iDrive").GetArrayLength());
        Assert.Contains("copy1/prg (no agent", effort.GetProperty("iDrive")[0].GetString());
        Assert.Equal(3, effort.GetProperty("legs").GetArrayLength());
        Assert.Equal(0, effort.GetProperty("legsMerged").GetInt32());
        Assert.False(effort.GetProperty("partiallyMerged").GetBoolean());

        var driven = tools.MyEffort("r-skratek");
        Assert.Equal("spacex/r-webflow", Data(driven).GetProperty("efforts")[0].GetProperty("drivenBy")[0].GetString());
        Assert.Equal("none", tools.MyEffort("r-nobody").Status);
        Assert.Equal("error", tools.MyEffort(null).Status);                    // no identity from the harness → no answer

        // The driver reports the agentless leg it drives; the driven agent may not report another's leg.
        var rep = tools.ReportLeg("r-webflow", null, "copy1/prg", "knjiga-poste", null, PrgPr166);
        Assert.True(rep.Ok);
        Assert.Equal("recorded", rep.Status);
        var legs = TaskGraphService.AssigneesOf(g.Find(n.Id)!);
        Assert.Equal(PrgPr166, legs.Single(a => Effort.IsAgentless(a)).PrUrl);
        Assert.Equal("knjiga-poste", legs.Single(a => Effort.IsAgentless(a)).Branch);
        Assert.Equal("not-yours", tools.ReportLeg("r-skratek", null, "copy1/prg", "x", null, null).Status);
        Assert.Equal("not-yours", tools.ReportLeg("r-skratek", null, "spacex/r-webflow", "x", null, null).Status);
        Assert.Equal("recorded", tools.ReportLeg("r-skratek", TaskGraphService.CardRef(n.Id), "me", "feat/skratek", null, null).Status);
        Assert.Equal("error", tools.ReportLeg("r-webflow", null, null, null, null, "not a url").Status);
        Assert.Equal("error", tools.ReportLeg("r-webflow", null, null, null, null, null).Status);
        Assert.Equal("error", tools.ReportLeg("r-nobody", null, null, "b", null, null).Status);

        // The MCP server: the two tools listed; a call answers JSON with ok / status / data.
        var server = new RepoAgentMcpServer(tools);
        var listed = server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "tools/list" }, "r-webflow");
        Assert.Equal(new[] { "my_effort", "report_leg", "harness_help", "stash_prompt", "arm_my_loop", "hub_upload", "hub_download", "hub_files" }, (listed.Body!["result"]!["tools"] as JsonArray)!.Select(t => t!["name"]!.GetValue<string>()));   // + the self-service three (openspec repo-agent-harness-tools)
        var call = server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 2, ["method"] = "tools/call", ["params"] = new JsonObject { ["name"] = "my_effort", ["arguments"] = new JsonObject() } }, "r-webflow");
        var text = call.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>();
        using var doc = JsonDocument.Parse(text);
        Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
        Assert.Equal("in-effort", doc.RootElement.GetProperty("status").GetString());
        Assert.Equal(202, server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" }, "r-webflow").Status);
        var unknown = server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 3, ["method"] = "tools/call", ["params"] = new JsonObject { ["name"] = "request_human" } }, "r-webflow");
        Assert.NotNull(unknown.Body!["error"]);
    }

    [Fact]
    public void Handing_over_and_manual_still_apply_and_the_effort_rides_list_tasks_shape()
    {
        var (g, id, _) = Knjiga();
        var s = Effort.Summarize(g.Find(id)!);
        Assert.Equal(2, s.Legs);
        // The card carries the legs in its JSON: the legs' roles and paths survive the wire shape.
        var json = JsonSerializer.Serialize(g.Find(id));
        Assert.Contains("\"Role\":\"driver\"", json);
        Assert.Contains("\"Role\":\"driven\"", json);
        Assert.Contains("\"Path\":", json);
    }
}
