using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec repo-agent-subagents, the main-conversation pointer: each repo agent's main
/// conversation is explicit and follows the main thread's forks; any other conversation in the
/// same transcript folder (a subagent, a side tab, an old fork) never moves it. Plus the
/// subagent's session list and the concurrent writer's boundaries.</summary>
public sealed class MainConversationTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-main-" + Guid.NewGuid().ToString("N"));
    public MainConversationTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private MainConversationStore Store() => new(new Logger(), _dir);

    // ---- the pure rules ---------------------------------------------------------------------

    [Theory]
    [InlineData(null, null, "s1", true)]          // no main yet: the first conversation becomes it
    [InlineData("s1", "s1", "s2", true)]          // the main thread resumed and forked: follow
    [InlineData("s1", "x9", "x10", false)]        // another conversation (a side tab) forked: no
    [InlineData("s1", null, "n1", false)]         // a NEW conversation while a main exists: no
    [InlineData("s1", "s1", null, false)]         // a run that died before its session: no
    public void A_run_moves_the_pointer_only_from_the_main_thread(string? current, string? resumed, string? next, bool follows) =>
        Assert.Equal(follows, MainConversationStore.FollowsRun(current, resumed, next));

    [Theory]
    [InlineData(null, null, "s1", true)]
    [InlineData("s1", "s1", "s2", true)]          // the main tab recorded the fork (or "New conversation" there)
    [InlineData("s1", "t7", "t8", false)]         // a side tab changed
    [InlineData("s1", "s1", null, false)]         // a tab cleared: the main stays
    public void A_tab_moves_the_pointer_only_when_it_held_the_main_thread(string? current, string? old, string? next, bool follows) =>
        Assert.Equal(follows, MainConversationStore.FollowsTab(current, old, next));

    // ---- the store ---------------------------------------------------------------------------

    [Fact]
    public void The_main_thread_is_followed_through_its_forks_and_survives_a_restart()
    {
        var m = Store();
        m.OnRun("repo1", null, "main-1");                 // first conversation
        m.OnRun("repo1", "main-1", "main-2");             // resumed → fork
        m.OnRun("repo1", "side-1", "side-2");             // a side conversation: ignored
        m.OnRun("repo1", null, "brand-new");              // a new conversation elsewhere: ignored
        Assert.Equal("main-2", m.Get("repo1"));
        Assert.Equal("main-2", Store().Get("repo1"));     // persisted
        Assert.Null(m.Get("repo2"));
    }

    [Fact]
    public void The_operator_sets_it_explicitly_and_the_follow_rules_continue_from_there()
    {
        var m = Store();
        m.OnRun("repo1", null, "a");
        Assert.True(m.Set("repo1", "b", "operator"));
        Assert.False(m.Set("repo1", "b", "operator"));    // unchanged
        m.OnRun("repo1", "a", "a2");                      // the old thread no longer counts
        Assert.Equal("b", m.Get("repo1"));
        m.OnTab("repo1", "b", "b2");
        Assert.Equal("b2", m.Get("repo1"));
        Assert.Equal("fork followed (dock)", m.GetEntry("repo1")!.SetBy);
    }

    // ---- the dock announces session changes --------------------------------------------------------

    [Fact]
    public void The_dock_reports_a_tab_session_change_once()
    {
        var dock = new DockRegistry(new Logger(), _dir);
        var tab = dock.Add("repo1", "prg");
        var seen = new List<(string, string?, string?)>();
        dock.SessionChanged += (r, o, n) => seen.Add((r, o, n));
        dock.Update(tab.Id, "s1", null, null, null, null, null, null, null, null, null);
        dock.Update(tab.Id, "s1", "busy", null, null, null, null, null, null, null, null);   // same session: silent
        dock.Update(tab.Id, null, "idle", null, null, null, null, null, null, null, null);   // untouched: silent
        dock.Update(tab.Id, "s2", null, null, null, null, null, null, null, null, null);
        Assert.Equal(new[] { ("repo1", (string?)null, (string?)"s1"), ("repo1", "s1", "s2") }, seen);
    }

    [Fact]
    public void A_subagent_writing_last_in_the_folder_never_becomes_the_main_conversation()
    {
        // The scenario that motivated the pointer: the parent's and a subagent's transcripts sit in ONE
        // folder and the subagent wrote last. The subagent's runs complete under its own key and only a
        // registered repo's builder runs reach OnRun, so the pointer stays on the parent's thread.
        var m = Store();
        m.OnRun("repo1", null, "parent-1");
        // (the subagent's runs: key repo1~sub~ab12 — the tracker drops them before OnRun)
        Assert.False(MainConversationStore.FollowsRun(m.Get("repo1"), null, "sub-1"));
        Assert.False(MainConversationStore.FollowsRun(m.Get("repo1"), "sub-1", "sub-2"));
        Assert.Equal("parent-1", m.Get("repo1"));
    }

    // ---- subagents: every session remembered; the concurrent writer --------------------------------

    [Fact]
    public void A_subagent_owns_every_session_it_ever_had()
    {
        var store = new RepoSubagentStore(new Logger(), _dir);
        var s = store.Start("repo1", "n", "g", "agent", 1, 5, false, null, "main", null, null, null, false, null);
        store.SetSession(s.Id, "fork-1");
        store.SetSession(s.Id, "fork-2");
        Assert.Equal(s.Id, store.OwnerOfSession("fork-1")!.Id);   // an older fork is still recognised
        Assert.Equal(s.Id, store.OwnerOfSession("fork-2")!.Id);
        Assert.Equal(new[] { "fork-1", "fork-2" }, store.Find(s.Id)!.Sessions);
    }

    [Fact]
    public void Concurrent_is_a_writer_flag_and_never_set_on_a_helper()
    {
        var store = new RepoSubagentStore(new Logger(), _dir);
        Assert.True(store.Start("repo1", "w", "g", "agent", 1, 5, false, null, "main", null, null, null, false, null, concurrent: true).Concurrent);
        Assert.False(store.Start("repo1", "h", "g", "agent", 1, 5, true, null, "main", null, null, null, false, null, concurrent: true).Concurrent);
    }

    [Fact]
    public void A_concurrent_writer_is_told_to_touch_and_commit_only_its_own_files()
    {
        var repo = new RepositoryRegistry.RepositoryInfo("repo1", "prg", @"C:\x\prg", true, true, false, "advanced", null, Array.Empty<RepositoryRegistry.LocalAppInfo>(), "prg");
        var s = new RepoSubagentStore.Subagent("deadbeef", "repo1", "docs", "Write the docs.", "running", 1, null, "agent", null, null, null, null, 10, false, null, "main",
            Array.Empty<ArchGoalPlans.Step>(), false, Array.Empty<RepoSubagentStore.QueuedMessage>(), false, null, null, null, Concurrent: true);
        var text = RepoSubagentService.LoopGoalText(s, repo, "main");
        Assert.Contains("AT THE SAME TIME", text);
        Assert.Contains("Touch ONLY the files your goal names", text);
        Assert.Contains("commit ONLY your own files", text);
        Assert.Contains("no checkout, reset, stash, clean, add -A", text);
        Assert.DoesNotContain("the parent waits", text);
    }
}
