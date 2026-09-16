using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec kanban-policeman-conversation — the policeman as an arch conversation: the
/// observe-only tool policy, the ritual prompt, the rollover rule and the mechanical
/// handover (pure, ArchPoliceman); and the state store's bookkeeping — the reserved
/// conversation, session tracking across turns, the rollover that closes a session and
/// parks a one-shot handover, the settings' bounds (ArchStateStore).
/// </summary>
public sealed class ArchPolicemanTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-pol-conv-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    // ---- the policy (pure) ---------------------------------------------------------------

    [Theory]
    [InlineData("board_integrity", true)]
    [InlineData("flag_needs_human", true)]
    [InlineData("clear_needs_human", true)]
    [InlineData("list_tasks", true)]
    [InlineData("read_transcript", true)]
    [InlineData("git_state", true)]
    [InlineData("recall", true)]
    [InlineData("list_pull_requests", true)]
    [InlineData("sync_card", true)]
    [InlineData("send_task", false)]
    [InlineData("dispatch_task", false)]
    [InlineData("update_task", false)]
    [InlineData("assign_task", false)]
    [InlineData("delete_task", false)]
    [InlineData("create_task", false)]
    [InlineData("start_loop", false)]
    [InlineData("start_arch_goal", false)]
    [InlineData("adopt_branch", false)]
    public void The_policeman_may_only_observe_verify_and_flag(string tool, bool allowed)
    {
        Assert.Equal(allowed, ArchPoliceman.IsToolAllowed(tool));
        Assert.True(ArchMcpServer.IsKnownTool(tool)); // every name here is a real catalogue tool
        if (!allowed) Assert.Contains(tool, ArchPoliceman.RefusalDetail(tool));
    }

    [Fact]
    public void The_catalogue_carries_the_three_integrity_tools()
    {
        Assert.True(ArchMcpServer.IsKnownTool("board_integrity"));
        Assert.True(ArchMcpServer.IsKnownTool("flag_needs_human"));
        Assert.True(ArchMcpServer.IsKnownTool("clear_needs_human"));
        Assert.False(ArchMcpServer.IsKnownTool("nope"));
    }

    [Fact]
    public void The_ritual_prompt_names_its_tools_the_boundary_the_goal_and_the_tripwire()
    {
        var p = ArchPoliceman.Prompt("Ship the CSV export by Friday");
        Assert.Contains("board_integrity", p);
        Assert.Contains("flag_needs_human", p);
        Assert.Contains("clear_needs_human", p);
        Assert.Contains("cannot dispatch, edit, assign, delete or move a card by claim", p);
        Assert.Contains("list_pull_requests", p);
        Assert.Contains("sync_card", p);
        Assert.Contains("forward only", p);
        Assert.Contains("Board goal (set by the Operator): Ship the CSV export by Friday", p);
        Assert.Contains("Never write the word " + ArchPoliceman.Sentinel, p);
        Assert.DoesNotContain("Board goal", ArchPoliceman.Prompt(null)); // no goal → no goal line
        Assert.Equal(ArchPoliceman.ConversationId, "@arch:policeman");
        Assert.True(ArchStateStore.IsConversationId(ArchPoliceman.ConversationId)); // a real arch key
        Assert.True(ArchPoliceman.IsPoliceman("@arch:policeman"));
        Assert.False(ArchPoliceman.IsPoliceman("@arch"));
    }

    [Fact]
    public void Rollover_triggers_at_the_context_cap_or_the_turn_fallback()
    {
        Assert.False(ArchPoliceman.NeedsRollover(null, 400_000, 10, 400));
        Assert.False(ArchPoliceman.NeedsRollover(399_999, 400_000, 10, 400));
        Assert.True(ArchPoliceman.NeedsRollover(400_000, 400_000, 10, 400));
        Assert.True(ArchPoliceman.NeedsRollover(null, 400_000, 400, 400));   // no usage reported: turns decide
        Assert.False(ArchPoliceman.NeedsRollover(999_999, 0, 1, 0));       // no cap, no fallback → never
        Assert.Equal(ArchPoliceman.DefaultIntervalSeconds, ArchPoliceman.CleanInterval(null));
        Assert.Equal(ArchPoliceman.MinIntervalSeconds, ArchPoliceman.CleanInterval(5));
        Assert.Equal(ArchPoliceman.DefaultContextCapTokens, ArchPoliceman.CleanCap(0));
        Assert.Equal(ArchPoliceman.MinContextCapTokens, ArchPoliceman.CleanCap(1));
    }

    [Fact]
    public void The_handover_says_why_which_session_and_what_the_board_says_now()
    {
        var summary = ArchPoliceman.VerdictSummary(
            new BoardIntegrity.Summary(1, 5, 3, 1, 1, 0, new[] { new BoardIntegrity.CardIntegrity("a", "Lying card", BoardIntegrity.Dishonest, "column ahead of reality") }),
            new[] { ("#a1b2c3d4", "Stuck card", BoardIntegrity.Policeman, (string?)"no PR for 30 h") });
        var h = ArchPoliceman.Handover(2, "abcdef1234567890", "its context reached 400,123 tokens", summary);
        Assert.Contains("session #3", h);
        Assert.Contains("abcdef12", h);
        Assert.Contains("400,123", h);
        Assert.Contains("3 honest · 1 dishonest · 1 stuck · 0 manual", h);
        Assert.Contains("dishonest: Lying card — column ahead of reality", h);
        Assert.Contains("#a1b2c3d4 Stuck card — by the policeman: no PR for 30 h", h);
        Assert.EndsWith("[Your standing prompt follows.]", h);
    }


    // ---- the surface each conversation is OFFERED (tools/list + the CLI fence) ------------------

    [Fact]
    public void The_policeman_is_offered_only_its_subset_on_tools_list_and_the_arch_the_full_catalogue()
    {
        var all = ArchMcpServer.ToolsList().Select(t => (string?)t?["name"] ?? "").ToList();
        var police = ArchMcpServer.ToolsList(ArchPoliceman.ConversationId).Select(t => (string?)t?["name"] ?? "").ToList();
        var arch = ArchMcpServer.ToolsList("@arch").Select(t => (string?)t?["name"] ?? "").ToList();
        var other = ArchMcpServer.ToolsList("@arch:g1").Select(t => (string?)t?["name"] ?? "").ToList();

        Assert.Equal(all, arch);
        Assert.Equal(all, other);
        Assert.True(police.Count < all.Count, "the policeman must see fewer tools than the arch");
        Assert.All(police, n => Assert.True(ArchPoliceman.IsToolAllowed(n), n));
        Assert.Equal(ArchPoliceman.AllowedTools.OrderBy(n => n, StringComparer.Ordinal), police.OrderBy(n => n, StringComparer.Ordinal));
        Assert.DoesNotContain("send_task", police);
        Assert.DoesNotContain("dispatch_task", police);
        Assert.DoesNotContain("start_loop", police);
        Assert.Contains("board_integrity", police);
        Assert.Contains("flag_needs_human", police);

        // What is withheld is exactly the complement, and nothing for the arch.
        var withheld = ArchMcpServer.WithheldTools(ArchPoliceman.ConversationId);
        Assert.Equal(all.Count, police.Count + withheld.Count);
        Assert.All(withheld, n => Assert.False(ArchPoliceman.IsToolAllowed(n), n));
        Assert.Empty(ArchMcpServer.WithheldTools("@arch"));
        Assert.Empty(ArchMcpServer.WithheldTools(null));
    }

    [Fact]
    public void The_cli_fence_for_the_policeman_denies_every_withheld_arch_tool_by_its_mcp_name()
    {
        var arch = ArchAgentService.DisallowedToolsFor("@arch");
        var police = ArchAgentService.DisallowedToolsFor(ArchPoliceman.ConversationId);
        Assert.Equal(ArchAgentService.DisallowedTools, arch);
        Assert.All(ArchAgentService.DisallowedTools, d => Assert.Contains(d, police));
        Assert.Contains("mcp__arch__send_task", police);
        Assert.Contains("mcp__arch__dispatch_task", police);
        Assert.Contains("mcp__arch__delete_task", police);
        Assert.DoesNotContain("mcp__arch__board_integrity", police);
        Assert.DoesNotContain("mcp__arch__list_tasks", police);
        Assert.DoesNotContain("mcp__arch__read_transcript", police);
        Assert.Equal(ArchAgentService.DisallowedTools.Length + ArchMcpServer.WithheldTools(ArchPoliceman.ConversationId).Count, police.Count);
    }

    // ---- the state (ArchStateStore) -------------------------------------------------------

    [Fact]
    public void The_reserved_conversation_is_created_once_with_its_fixed_id_and_name()
    {
        var store = new ArchStateStore(_logger, _dir);
        var a = store.EnsureConversation(ArchPoliceman.ConversationId, ArchPoliceman.ConversationName);
        var b = store.EnsureConversation(ArchPoliceman.ConversationId, "ignored on the second call");
        Assert.Equal("@arch:policeman", a.Id);
        Assert.Equal(ArchPoliceman.ConversationName, a.Name);
        Assert.Equal(a.Id, b.Id);
        Assert.Equal(ArchPoliceman.ConversationName, b.Name);
        Assert.False(a.IsDefault);
        Assert.Single(store.Conversations, c => c.Id == ArchPoliceman.ConversationId);
        // …and survives a reload.
        Assert.True(new ArchStateStore(_logger, _dir).HasConversation(ArchPoliceman.ConversationId));
    }

    [Fact]
    public void Turns_track_sessions_and_a_rollover_closes_the_open_one_and_parks_a_one_shot_handover()
    {
        var store = new ArchStateStore(_logger, _dir);
        store.NotePolicemanTurn("sess-A", 120_000, 1000);
        store.NotePolicemanTurn("sess-A", 250_000, 2000);
        var p = store.Policeman;
        Assert.Single(p.Sessions);
        Assert.Equal(2, p.Sessions[0].Turns);
        Assert.Equal(250_000, p.LastContextTokens);
        Assert.Equal(2, p.TurnsThisSession);
        Assert.Null(p.Sessions[0].EndedAt);

        var prev = store.BeginPolicemanRollover("its context reached the cap", "[handover text]", 3000);
        Assert.Equal("sess-A", prev);
        p = store.Policeman;
        Assert.Equal(1, p.Rollovers);
        Assert.Equal(3000, p.LastRolloverAt);
        Assert.True(p.HandoverPending);
        Assert.Equal(0, p.TurnsThisSession);
        Assert.Null(p.LastContextTokens);
        Assert.Equal(3000, p.Sessions[0].EndedAt);
        Assert.Equal("its context reached the cap", p.Sessions[0].EndedBecause);
        Assert.Equal(250_000, p.Sessions[0].ContextTokens);

        Assert.Equal("[handover text]", store.TakePolicemanHandover());
        Assert.Null(store.TakePolicemanHandover());          // once
        Assert.False(store.Policeman.HandoverPending);

        // The fresh session's first turn opens a new record; the old one stays for provenance.
        store.NotePolicemanTurn("sess-B", 30_000, 4000);
        p = store.Policeman;
        Assert.Equal(2, p.Sessions.Count);
        Assert.Equal("sess-B", p.Sessions[1].SessionId);
        Assert.Null(p.Sessions[1].EndedAt);
        Assert.Equal(1, p.TurnsThisSession);
        // …all of it after a reload.
        var back = new ArchStateStore(_logger, _dir).Policeman;
        Assert.Equal(2, back.Sessions.Count);
        Assert.Equal(1, back.Rollovers);
    }

    [Fact]
    public void An_unexpected_new_session_id_closes_the_previous_record_by_itself()
    {
        // The CLI started a new session without the harness cutting it (e.g. an errored turn):
        // the sessions strip must still tell the truth.
        var store = new ArchStateStore(_logger, _dir);
        store.NotePolicemanTurn("s1", 10_000, 1);
        store.NotePolicemanTurn("s2", 5_000, 2);
        var p = store.Policeman;
        Assert.Equal(2, p.Sessions.Count);
        Assert.Equal(2, p.Sessions[0].EndedAt);
        Assert.Equal("a new session started", p.Sessions[0].EndedBecause);
        Assert.Equal(1, p.TurnsThisSession);
    }

    [Fact]
    public void Settings_are_bounded_and_enable_is_a_flag()
    {
        var store = new ArchStateStore(_logger, _dir);
        store.SetPolicemanSettings(intervalSeconds: 5, contextCapTokens: 1);
        Assert.Equal(ArchPoliceman.MinIntervalSeconds, store.Policeman.IntervalSeconds);
        Assert.Equal(ArchPoliceman.MinContextCapTokens, store.Policeman.ContextCapTokens);
        store.SetPolicemanSettings(intervalSeconds: 600, contextCapTokens: null);
        Assert.Equal(600, store.Policeman.IntervalSeconds);
        Assert.Equal(ArchPoliceman.MinContextCapTokens, store.Policeman.ContextCapTokens); // untouched
        Assert.False(store.Policeman.Enabled);
        store.SetPolicemanEnabled(true);
        Assert.True(new ArchStateStore(_logger, _dir).Policeman.Enabled);
        store.NotePolicemanRestart();
        Assert.Equal(1, store.Policeman.Restarts);
    }
}
