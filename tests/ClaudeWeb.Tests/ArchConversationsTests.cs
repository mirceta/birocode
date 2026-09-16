using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Multiple arch conversations (openspec arch-conversations): the store keeps
/// one record per conversation (name, session, watermark, standing loop), the default
/// keeps the reserved id and migrates from the legacy top-level fields, the keys are
/// recognised by shape, and the loop store treats every key as its own slot.</summary>
public sealed class ArchConversationsTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-archconv-" + Guid.NewGuid().ToString("N"));

    public ArchConversationsTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void Conversation_keys_are_the_reserved_id_or_a_suffixed_form()
    {
        Assert.True(ArchAgentService.IsArchKey("@arch"));
        Assert.True(ArchAgentService.IsArchKey("@arch:0123abcd"));
        Assert.False(ArchAgentService.IsArchKey("@arch:"));
        Assert.False(ArchAgentService.IsArchKey("@tasks"));
        Assert.False(ArchAgentService.IsArchKey("arch"));
        Assert.False(ArchAgentService.IsArchKey(null));
        Assert.Equal("@arch", ArchAgentService.KeyOrDefault(null));
        Assert.Equal("@arch", ArchAgentService.KeyOrDefault("some-repo"));
        Assert.Equal("@arch:aa", ArchAgentService.KeyOrDefault("@arch:aa"));
    }

    [Fact]
    public void A_fresh_store_has_the_default_conversation_only()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var one = Assert.Single(store.Conversations);
        Assert.Equal("@arch", one.Id);
        Assert.True(one.IsDefault);
        Assert.Equal(ArchStateStore.DefaultConversationName, one.Name);
        Assert.Equal(-1, store.WatermarkOf("@arch"));
        Assert.Null(store.SessionOf("@arch"));
    }

    [Fact]
    public void Conversations_are_created_named_renamed_removed_and_persist()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var a = store.AddConversation("Deploy train");
        var b = store.AddConversation("   ");
        Assert.StartsWith("@arch:", a.Id);
        Assert.True(ArchAgentService.IsArchKey(a.Id));
        Assert.NotEqual(a.Id, b.Id);
        Assert.Equal("Deploy train", a.Name);
        Assert.Equal("Arch conversation 3", b.Name); // blank name → a numbered default
        Assert.False(a.IsDefault);

        Assert.Equal("Release week", store.RenameConversation(a.Id, "  Release week ")!.Name);
        Assert.Equal(ArchStateStore.DefaultConversationName + " 2", store.RenameConversation("@arch", ArchStateStore.DefaultConversationName + " 2")!.Name);
        Assert.Null(store.RenameConversation("@arch:nope", "x"));

        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(new[] { "@arch", a.Id, b.Id }, again.Conversations.Select(c => c.Id).ToArray());
        Assert.Equal("Release week", again.NameOf(a.Id));

        Assert.False(again.RemoveConversation("@arch")); // the default cannot go
        Assert.True(again.RemoveConversation(b.Id));
        Assert.False(again.RemoveConversation(b.Id));
        Assert.Equal(2, new ArchStateStore(new Logger(), _dir).Conversations.Count);
    }

    [Fact]
    public void Session_watermark_and_standing_loop_are_per_conversation()
    {
        var store = new ArchStateStore(new Logger(), _dir);
        var a = store.AddConversation("A");
        store.SetWatermark("@arch", 10);
        store.SetWatermark(a.Id, 42);
        store.SetSessionId("@arch", "sess-default");
        store.SetSessionId(a.Id, "sess-a");
        store.SetStandingLoop(a.Id, "drive", 0);

        Assert.Equal(10, store.WatermarkOf("@arch"));
        Assert.Equal(10, store.Watermark); // the no-key form is the default conversation
        Assert.Equal(42, store.WatermarkOf(a.Id));
        Assert.Equal("sess-default", store.LastSessionId);
        Assert.Equal("sess-a", store.SessionOf(a.Id));
        Assert.Null(store.StandingLoop);
        Assert.Equal(("drive", 0), store.StandingLoopOf(a.Id));
        Assert.Equal(-1, store.WatermarkOf("@arch:unknown"));

        var again = new ArchStateStore(new Logger(), _dir);
        Assert.Equal(42, again.WatermarkOf(a.Id));
        Assert.Equal("sess-a", again.SessionOf(a.Id));
        Assert.Equal(("drive", 0), again.StandingLoopOf(a.Id));
        again.ClearStandingLoop(a.Id);
        Assert.Null(new ArchStateStore(new Logger(), _dir).StandingLoopOf(a.Id));
    }

    [Fact]
    public void A_legacy_file_migrates_its_top_level_fields_into_the_default_conversation()
    {
        File.WriteAllText(Path.Combine(_dir, "arch.json"), """
            {
              "ManagedRepoIds": ["r1"],
              "ManagedFleet": [],
              "AcceptFleetSends": true,
              "Watermark": 77,
              "LastSessionId": "legacy-sess",
              "StandingLoopMode": "suggest",
              "StandingLoopCap": 3,
              "DrivenQuietSeconds": 90
            }
            """);
        var store = new ArchStateStore(new Logger(), _dir);
        var d = Assert.Single(store.Conversations);
        Assert.Equal("@arch", d.Id);
        Assert.Equal(77, store.WatermarkOf("@arch"));
        Assert.Equal("legacy-sess", store.SessionOf("@arch"));
        Assert.Equal(("suggest", 3), store.StandingLoopOf("@arch"));
        Assert.Equal(new[] { "r1" }, store.ManagedRepoIds);
        Assert.Equal(90, store.DrivenQuietSeconds);

        // A save keeps the legacy fields mirrored, so an older build still reads the default.
        store.SetWatermark("@arch", 78);
        var json = File.ReadAllText(Path.Combine(_dir, "arch.json"));
        Assert.Contains("\"Watermark\": 78", json);
        Assert.Contains("\"LastSessionId\": \"legacy-sess\"", json);
        Assert.Contains("\"Conversations\"", json);
    }

    [Fact]
    public void Each_conversation_has_its_own_loop_slot()
    {
        var loops = new LoopConfigStore(new Logger(), _dir);
        loops.StartArch("@arch", "drive", 0, "s1");
        loops.StartGoal("@arch:abcd1234", "ship it", null, "drive", "s2");
        var all = loops.All().Where(l => ArchAgentService.IsArchKey(l.RepoId)).ToList();
        Assert.Equal(2, all.Count);
        Assert.Equal(LoopConfigStore.KindArch, loops.Get("@arch")!.Kind);
        Assert.Equal(LoopConfigStore.KindGoal, loops.Get("@arch:abcd1234")!.Kind);
        loops.Stop("@arch:abcd1234");
        Assert.True(loops.Get("@arch")!.Active);
        Assert.False(loops.Get("@arch:abcd1234")!.Active);
    }

    [Fact]
    public void The_arch_loop_asks_the_wake_source_for_its_own_conversation()
    {
        var wake = new KeyedWake();
        var loop = new ArchLoop(wake);
        var store = new LoopConfigStore(new Logger(), _dir);
        var inst = store.StartArch("@arch:feed1234", "drive", 0, "s");
        var d = loop.Decide(new LoopContext(inst, null, false, false, 0.5, Array.Empty<PromptClassifier.Routine>()));
        Assert.IsType<LoopDecision.Hold>(d);
        Assert.Equal("@arch:feed1234", wake.LastKey);
    }

    private sealed class KeyedWake : IArchWakeSource
    {
        public string? LastKey;
        public WakeDraft? ComposeWake(string key) { LastKey = key; return null; }
    }
}
