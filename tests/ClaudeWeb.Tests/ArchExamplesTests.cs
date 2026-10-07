using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-examples-tab (fleet task 7914195c): the miner keeps the Operator's own words,
/// drops what the harness wrote into the conversation, scrubs secrets, classifies by the committed
/// category rules, and builds a report with counts, examples and a per-week timeline.</summary>
public sealed class ArchExamplesTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "management", "arch-example-categories.json"))) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("repo root with management/arch-example-categories.json not found");
    }
    private static readonly IReadOnlyList<ArchExamplesMiner.CategoryDef> Cats =
        ArchExamplesMiner.LoadCategories(File.ReadAllText(Path.Combine(RepoRoot(), "management", "arch-example-categories.json")));

    [Theory]
    // the brief's own list of categories, each with a real phrasing from the hub's conversations
    [InlineData("we merged the new harness optimization PR 141 . Please pull main and redeploy so we get the new work", "redeploy-hub")]
    [InlineData("please pull from main and redeploy our harness on this computer", "redeploy-hub")]
    [InlineData("ok now we have merged some features into main. can you make sure all of our harnesses on the whole fleet are on the newest versions?", "redeploy-fleet")]
    [InlineData("alright now we merged something new in birocode. please update all of the fleet computer birocode repo agents except spacex please", "redeploy-fleet")]
    [InlineData("i want you to update fotrsqlbirokrat and razvoj2016 machines to the most recent birocode harness version", "redeploy-fleet")]
    [InlineData("Another task for a free birocode repo agent: right now when talking to the arch agent - you can see tools being called. Make a PR with screenshots.", "delegate-feature-task")]
    [InlineData("can you find a free birocode agent and give it this task: In the management section for the arch conversations show the tool calls", "delegate-feature-task")]
    [InlineData("Make a card for razvoj2016's prg agent - we are doing local-bironext on there. just a card - dont delegate it anything, its already working on it", "tracking-card")]
    [InlineData("Add a new task for the busi-dec agent on DESKTOP-POAPPP3. It's preparing everything for PMR. Dont delegate it anything because its already doing it, we just need a card", "tracking-card")]
    [InlineData("we merged task 6124c147537b4865bf43a6fdcd1f01e4. Can you sync this hub computer harness with main, pull and redeploy please so we get the new work", "redeploy-hub")]
    [InlineData("this one is done already: task cbc74bc0934f4442b9bd2949203818af", "card-status-fix")]
    [InlineData("task 62d6b5ac872e4d45aa4e75e031061286 is now handled by another developer. please move this task into done column even if its not done", "card-status-fix")]
    [InlineData("as you know from before - task 8e3ff4e1a7f54498a84e254cb2afd46c has been moved from razvoj2016 to spacex4 so reflect that on the card please", "card-reassign")]
    [InlineData("i dont know what this is: task 2712a00a2d60417e92132d4edb47b040 . can you actually remove the task it must have not been very important", "card-delete")]
    [InlineData("What are the free prg agents that we have?", "agents-status")]
    [InlineData("please for each of the prg repositories list what they are doing. ping all computers's prg repo agents for what branch they are working on", "agents-status")]
    [InlineData("please transfer spacex's kniga-poste in the hub file system to our hub DESKTOP-POAPPP3", "hub-files")]
    [InlineData("the loop capped out but you are not finished yet", "repo-agent-request")]
    [InlineData("ok I armed it", "loop-on-agent")]
    [InlineData("can you create a new recurring task that is just for tracking. nepremicine scraper repo agent. Its scraping parking places for me already we just need a card in there", "tracking-card")]
    [InlineData("for task 656647cd323d46f290b1dfff1e4c0989 - make a pull request upstream and label it a work in proress please.", "branch-handover")]
    [InlineData("PR #103 has a merge conflict. Get that sorted please", "merge-conflict-followup")]
    [InlineData("can you explain to me what the 'Committed' column is supposed to be in our kanban?", "explain-concept")]
    [InlineData("wait are goal conversations just like regular arch agent conversations, but just armed with a goal loop?", "explain-concept")]
    [InlineData("Why doesnt double clicking the pers-dec agent on DESKTOP-POAPPP3 open that agent? something is wrong", "bug-report")]
    [InlineData("We want to create a new card for the Racun orchestration. Assign it the webflow-autodev repo agent on spacex and the prg repo agent on spacex. Dont send them anything just create the card", "tracking-card")]
    [InlineData("ok i put pavlin's birocode under managed agents too", "scope-and-access")]
    [InlineData("Continue from where you left off.", "nudge")]
    [InlineData("so what happened", "nudge")]
    [InlineData("Another task for a birocode agent. Sometimes we want to create a new repo agent genuinely new one. and right now the process is somewhat cumbersome", "provision-repo-agent")]
    [InlineData("we have new commits on origin main please pull on this harness and redeploy", "redeploy-hub")]
    [InlineData("i have merged #98 bro fucking deploy on my computer so i can use it", "redeploy-hub")]
    [InlineData("great we merged one item into birocode can you pull on our harness and redeploy. just on this computer", "redeploy-hub")]
    [InlineData("great now all agents prs have been merged. now make sure all are synced with origin main and redeployed the newest harness and kept it", "redeploy-fleet")]
    public void Real_phrasings_land_in_the_expected_category(string text, string expected)
    {
        Assert.Equal(expected, ArchExamplesMiner.Classify(text, Cats));
    }

    [Fact]
    public void Harness_written_turns_are_not_the_operator_but_queued_instructions_are()
    {
        Assert.False(ArchExamplesMiner.TryOperatorText("[wake-up from the harness · events after seq 12]\nWhat happened:", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("[Autopilot loop briefing] This prompt was sent by an automated loop.", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("[goal 7144bdf0 done — summary from conversation]", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("[Request from repo agent spacex/web-flow-autodev1] …", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("This session is being continued from a previous conversation that ran out of context.", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("You are the board POLICEMAN — the standing checker", out _));
        Assert.False(ArchExamplesMiner.TryOperatorText("   ", out _));
        Assert.True(ArchExamplesMiner.TryOperatorText("[from the Operator, queued while you were busy — these are instructions]\nthe loop capped out but you are not finished yet", out var body));
        Assert.Equal("the loop capped out but you are not finished yet", body);
        Assert.True(ArchExamplesMiner.TryOperatorText("pull and redeploy our harness please", out var plain));
        Assert.Equal("pull and redeploy our harness please", plain);
    }

    [Fact]
    public void Secrets_and_addresses_never_reach_the_report()
    {
        Assert.Equal("use token [redacted] on spacex", ArchExamplesMiner.Scrub("use token ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 on spacex"));
        Assert.Equal("the password [redacted] please", ArchExamplesMiner.Scrub("the password: hunter2-very-secret please"));
        Assert.Equal("mail <email> about it", ArchExamplesMiner.Scrub("mail someone@example.com about it"));
        Assert.Equal("Bearer [redacted]", ArchExamplesMiner.Scrub("Bearer abcdefghijklmnopqrstu"));
        Assert.Equal("task 8e3ff4e1a7f54498a84e254cb2afd46c moved", ArchExamplesMiner.Scrub("task 8e3ff4e1a7f54498a84e254cb2afd46c moved"));   // task ids stay
    }

    [Fact]
    public void A_transcript_yields_the_operator_turns_with_their_time()
    {
        var lines = new[]
        {
            """{"type":"user","timestamp":"2026-09-05T10:00:00.000Z","message":{"role":"user","content":"can you check on spacex what the claude web repository has been doing?"}}""",
            """{"type":"assistant","timestamp":"2026-09-05T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Sure."}]}}""",
            """{"type":"user","timestamp":"2026-09-05T10:01:00.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"x","content":"ok"}]}}""",
            """{"type":"user","timestamp":"2026-09-05T10:02:00.000Z","message":{"role":"user","content":[{"type":"text","text":"[wake-up from the harness · events after seq 3]\nWhat happened:"}]}}""",
            """{"type":"user","timestamp":"2026-09-05T10:03:00.000Z","message":{"role":"user","content":[{"type":"text","text":"ok go ahead"}]}}""",
            "not json at all",
        };
        var items = ArchExamplesMiner.ReadTranscript(lines, "Arch agent").ToList();
        Assert.Equal(2, items.Count);
        Assert.Equal("can you check on spacex what the claude web repository has been doing?", items[0].Text);
        Assert.Equal(DateTimeOffset.Parse("2026-09-05T10:00:00Z").ToUnixTimeMilliseconds(), items[0].At);
        Assert.Equal(("ok go ahead", "arch-chat", "Arch agent"), (items[1].Text, items[1].Source, items[1].Conversation));
    }

    [Fact]
    public void The_report_counts_dedupes_resends_picks_clean_examples_and_fills_the_weeks()
    {
        long T(string iso) => DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds();
        var items = new List<ArchExamplesMiner.Item>
        {
            new("we have new commits on origin main please pull on this harness and redeploy", T("2026-10-05T12:00:00Z"), "arch-chat", "Arch agent"),
            new("we have new commits on origin main please pull on this harness and redeploy", T("2026-10-05T12:00:20Z"), "arch-chat", "Arch agent"),   // a resend: counted once
            new("i have merged #98 bro fucking deploy on my computer so i can use it", T("2026-09-16T09:00:00Z"), "arch-chat", "Arch agent"),
            new("great we merged one item into birocode can you pull on our harness and redeploy. just on this computer", T("2026-09-16T10:00:00Z"), "arch-chat", "Arch agent"),
            new("What are the free prg agents that we have?", T("2026-09-22T08:00:00Z"), "arch-chat", "Arch agent"),
            new("totally unclassifiable remark about the weather", T("2026-09-22T09:00:00Z"), "arch-chat", "Arch agent"),
        };
        var requests = new List<AgentRequestStore.AgentRequest>
        {
            new("r1", "src", "spacex", "repo", "web-flow-autodev1", "ZXOptimizator: fetch the VB6 replay recording", "long text", T("2026-10-05T20:00:00Z"), "approved"),
        };
        var report = ArchExamplesMiner.Build(items, Cats, requests, "HUB", T("2026-10-07T00:00:00Z"), transcripts: 1, goals: 3, operatorGoals: 1);
        Assert.Equal(6, report["totals"]!["requests"]!.GetValue<int>());          // 5 distinct messages + 1 request
        Assert.Equal(1, report["totals"]!["other"]!.GetValue<int>());
        var cats = report["categories"]!.AsArray().OfType<JsonObject>().ToDictionary(c => c["id"]!.GetValue<string>());
        Assert.Equal(3, cats["redeploy-hub"]["count"]!.GetValue<int>());
        Assert.Equal(1, cats["agents-status"]["count"]!.GetValue<int>());
        Assert.Equal(1, cats["repo-agent-request"]["count"]!.GetValue<int>());
        Assert.Equal("[approved] spacex/web-flow-autodev1: ZXOptimizator: fetch the VB6 replay recording", cats["repo-agent-request"]["examples"]![0]!["text"]!.GetValue<string>());
        // examples: the profane one is skipped while two clean ones exist; first and last in time
        var ex = cats["redeploy-hub"]["examples"]!.AsArray().Select(e => e!["text"]!.GetValue<string>()).ToList();
        Assert.Equal(2, ex.Count);
        Assert.DoesNotContain(ex, e => e.Contains("fucking"));
        Assert.Equal(T("2026-09-16T09:00:00Z"), cats["redeploy-hub"]["firstSeen"]!.GetValue<long>());
        Assert.Equal(T("2026-10-05T12:00:00Z"), cats["redeploy-hub"]["lastSeen"]!.GetValue<long>());
        // "other" is last, the rest by count
        var ids = report["categories"]!.AsArray().Select(c => c!["id"]!.GetValue<string>()).ToList();
        Assert.Equal("redeploy-hub", ids[0]);
        Assert.Equal(ArchExamplesMiner.OtherId, ids[^1]);
        // the timeline runs from the week of 16 Sep to the week of 5 Oct with every week present
        var weeks = report["timeline"]!.AsArray().Select(w => (w!["week"]!.GetValue<string>(), w["count"]!.GetValue<int>())).ToList();
        Assert.Equal("2026-W38", weeks[0].Item1);
        Assert.Equal("2026-W41", weeks[^1].Item1);
        Assert.Equal(4, weeks.Count);
        Assert.Equal(2, weeks[0].Item2);
        Assert.Equal(2, weeks[^1].Item2);   // the deduped resend + the approved request
        Assert.Equal(1, report["sources"]!["requestsApproved"]!.GetValue<int>());
    }

    [Fact]
    public void Week_keys_are_iso_weeks()
    {
        Assert.Equal("2026-W41", ArchExamplesMiner.WeekKey(DateTimeOffset.Parse("2026-10-05T12:00:00Z").ToUnixTimeMilliseconds()));
        Assert.Equal("2026-W01", ArchExamplesMiner.WeekKey(DateTimeOffset.Parse("2025-12-29T12:00:00Z").ToUnixTimeMilliseconds()));
    }
}
