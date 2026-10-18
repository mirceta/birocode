using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Memory;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-memory-store (fleet task 0953472c): the hub's memory store — versioned writes, the
/// secret guard, kind + reason, Operator-only delete, staleness, what a turn loads, the one-time import + seed,
/// and that a damaged file is never silently replaced.</summary>
public class MemoryStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-memory-" + Guid.NewGuid().ToString("N"));
    private long _now = 1_790_000_000_000;

    public void Dispose() { try { Directory.Delete(_dir, true); } catch { } }

    private MemoryStore New() => new(new Logger(), _dir, () => _now);
    private static MemoryStore.Input In(string title, string body, string kind = "rule", params string[] tags) => new(title, body, kind, tags);

    [Fact]
    public void Add_needs_a_kind_a_title_and_a_one_line_reason()
    {
        var s = New();
        Assert.Contains("kind is required", Assert.Throws<MemoryStore.Refused>(() => s.Add(new MemoryStore.Input("t", "b", null), "arch", "why")).Message);
        Assert.Contains("kind is required", Assert.Throws<MemoryStore.Refused>(() => s.Add(new MemoryStore.Input("t", "b", "gossip"), "arch", "why")).Message);
        Assert.Contains("title is required", Assert.Throws<MemoryStore.Refused>(() => s.Add(In(" ", "b"), "arch", "why")).Message);
        Assert.Contains("reason is required", Assert.Throws<MemoryStore.Refused>(() => s.Add(In("t", "b"), "arch", " ")).Message);
        var e = s.Add(In("Dispatch rule", "send one task per repo", "rule", "repo:prg"), "arch", "learned on goal 1234abcd");
        Assert.Equal("rule", e.Kind);
        Assert.True(e.NeedsReview);                       // the arch wrote it: the Operator reviews
        Assert.Single(e.History);
        Assert.Equal("add", e.History[0].Action);
    }

    [Theory]
    [InlineData("the token is ghp_abcdefghijklmnopqrstuvwxyz0123456789")]
    [InlineData("key sk-ant-api03-abcdefghijklmnopqrstuvwxyz")]
    [InlineData("Server=db1;Database=x;User Id=sa;Password=hunter22;")]
    [InlineData("password: Correct-Horse-9")]
    [InlineData("clone https://me:s3cretpass@github.com/x/y.git")]
    [InlineData("-----BEGIN OPENSSH PRIVATE KEY-----")]
    [InlineData("AKIAABCDEFGHIJKLMNOP")]
    public void Secrets_are_refused_with_a_visible_reason(string body)
    {
        var s = New();
        var ex = Assert.Throws<MemoryStore.Refused>(() => s.Add(In("creds", body), "arch", "for later"));
        Assert.StartsWith("refused: this looks like", ex.Message);
        Assert.Empty(s.All());
    }

    [Theory]
    [InlineData("the PAT lives in the Windows Credential Manager on HUB")]
    [InlineData("password: <ask the Operator>")]
    [InlineData("set CLAUDEWEB_AUTHPASSWORD in the environment (never in a file)")]
    public void Where_a_secret_lives_is_fine(string body)
    {
        Assert.Null(MemoryStore.SecretFinding(body));
        Assert.NotNull(New().Add(In("where creds live", body, "fleet-fact"), "arch", "so nobody asks again"));
    }

    [Fact]
    public void Updates_are_versioned_and_an_operator_edit_confirms_and_clears_review()
    {
        var s = New();
        var e = s.Add(In("prg builds", "msbuild 17", "repo-note", "repo:prg"), "arch", "seen today");
        _now += 1000;
        s.Update(e.Id, new MemoryStore.Input(Body: "msbuild 17.9"), "arch", "corrected");
        var after = s.Update(e.Id, new MemoryStore.Input(Title: "prg build toolchain"), "operator", "clearer title");
        Assert.Equal(3, after.History.Count);
        Assert.Equal(new[] { "add", "update", "update" }, after.History.Select(h => h.Action));
        Assert.Equal("msbuild 17", after.History[0].Body);
        Assert.False(after.NeedsReview);
        Assert.Equal(_now, after.LastConfirmed);
        Assert.Throws<MemoryStore.Refused>(() => s.Update(e.Id, new MemoryStore.Input(Body: "token ghp_abcdefghijklmnopqrstuvwxyz0123456789"), "arch", "x"));
        Assert.Equal("msbuild 17.9", s.Get(e.Id)!.Body);   // a refused write changes nothing
    }

    [Fact]
    public void Only_the_operator_deletes_the_arch_retires()
    {
        var s = New();
        var e = s.Add(In("old fact", "x", "fleet-fact"), "arch", "r");
        Assert.Contains("only the Operator", Assert.Throws<MemoryStore.Refused>(() => s.Delete(e.Id, "arch")).Message);
        Assert.Contains("only the Operator", Assert.Throws<MemoryStore.Refused>(() => s.Delete(e.Id, "goal 1234abcd")).Message);
        var retired = s.SetStatus(e.Id, MemoryStore.Retired, "arch", "no longer true");
        Assert.Equal(MemoryStore.Retired, retired.Status);
        Assert.True(s.Delete(e.Id, "operator"));
        Assert.Empty(s.All());
    }

    [Fact]
    public void Stale_after_the_configured_age_since_the_last_confirm()
    {
        var s = New();
        var e = s.Add(In("fact", "x", "fleet-fact"), "arch", "r");
        Assert.False(s.IsStale(s.Get(e.Id)!, _now));
        _now += 31L * 86_400_000;
        Assert.True(s.IsStale(s.Get(e.Id)!, _now));
        s.Confirm(e.Id, "arch");
        Assert.False(s.IsStale(s.Get(e.Id)!, _now));
        s.SaveSettings(staleDays: 7, usedWindowTurns: null);
        _now += 8L * 86_400_000;
        Assert.True(s.IsStale(s.Get(e.Id)!, _now));
    }

    [Fact]
    public void A_turn_loads_principles_and_pinned_always_and_knowledge_only_on_a_tag_match()
    {
        var s = New();
        var p = s.Add(In("Front desk", "goals for anything with a then", "principle"), "operator", "r");
        var pin = s.Add(new MemoryStore.Input("Pinned fact", "always here", "fleet-fact", null, Pinned: true), "operator", "r");
        var prg = s.Add(In("prg notes", "build with msbuild", "repo-note", "repo:prg"), "arch", "r");
        var hub = s.Add(In("hub notes", "lives on DESKTOP-POAPPP3", "fleet-fact", "machine:HUB"), "arch", "r");
        var retired = s.Add(In("old prg", "gone", "repo-note", "repo:prg"), "arch", "r");
        s.SetStatus(retired.Id, MemoryStore.Retired, "arch", "obsolete");

        var none = s.ContextFor(new[] { "how is the weather" });
        Assert.Equal(new[] { pin.Id, p.Id }, none.Always.Select(e => e.Id));      // pinned first
        Assert.Empty(none.Knowledge);
        Assert.Contains("Front desk", none.Text);

        var ctx = s.ContextFor(new[] { "ask the prg agent to rebuild" });
        Assert.Equal(new[] { prg.Id }, ctx.Knowledge.Select(e => e.Id));          // whole-word tag match, retired never
        Assert.Contains("build with msbuild", ctx.Text);
        Assert.Empty(s.ContextFor(new[] { "prgcopies is another repo" }).Knowledge); // not a substring match

        s.MarkUsed(ctx.Always.Concat(ctx.Knowledge).Select(e => e.Id));
        Assert.Equal(1, s.TurnSeq);
        Assert.Equal(1, s.Get(prg.Id)!.LastUsedTurn);
        Assert.Null(s.Get(hub.Id)!.LastUsed);
    }

    [Fact]
    public void An_edit_is_what_the_next_turn_loads()
    {
        var s = New();
        var p = s.Add(In("Rule of thumb", "say hello", "principle"), "operator", "r");
        Assert.Contains("say hello", s.ContextFor(Array.Empty<string>()).Text);
        s.Update(p.Id, new MemoryStore.Input(Body: "say goodbye"), "operator", "changed my mind");
        var text = s.ContextFor(Array.Empty<string>()).Text!;
        Assert.Contains("say goodbye", text);
        Assert.DoesNotContain("say hello", text);
    }

    [Fact]
    public void Import_runs_once_with_kinds_tags_dates_and_review_and_withholds_secrets()
    {
        var s = New();
        var files = new[]
        {
            new MemoryStore.ImportFile("memory/prg.md", "# prg\nbuilds on DESKTOP-X with msbuild", 1_700_000_000_000, 1_750_000_000_000),
            new MemoryStore.ImportFile("memory/dispatch-rules.md", "one task per repo", null, null),
            new MemoryStore.ImportFile("memory/fleet.md", "three machines", null, null),
            new MemoryStore.ImportFile("memory/codex.md", "the token was ghp_abcdefghijklmnopqrstuvwxyz0123456789", null, null),
        };
        Assert.Equal(4, s.ImportOnce(files, new[] { "prg" }, new[] { "DESKTOP-X" }));
        Assert.Equal(0, s.ImportOnce(files, new[] { "prg" }, new[] { "DESKTOP-X" }));   // once
        var byName = s.All().ToDictionary(e => e.Source!);
        Assert.Equal("repo-note", byName["memory/prg.md"].Kind);
        Assert.Equal("prg", byName["memory/prg.md"].Title);
        Assert.Contains("repo:prg", byName["memory/prg.md"].Tags);
        Assert.Contains("machine:DESKTOP-X", byName["memory/prg.md"].Tags);
        Assert.Equal(1_700_000_000_000, byName["memory/prg.md"].Created);
        Assert.Equal(1_750_000_000_000, byName["memory/prg.md"].Updated);
        Assert.Equal("rule", byName["memory/dispatch-rules.md"].Kind);
        Assert.Equal("fleet-fact", byName["memory/fleet.md"].Kind);
        Assert.StartsWith("(body withheld on import", byName["memory/codex.md"].Body);
        Assert.All(s.All(), e => { Assert.True(e.NeedsReview); Assert.Equal("arch", e.Author); });
    }

    [Fact]
    public void The_two_first_principles_are_seeded_once_pinned_by_the_operator()
    {
        var s = New();
        Assert.Equal(2, s.SeedOnce());
        Assert.Equal(0, s.SeedOnce());
        var all = s.All();
        Assert.All(all, e => { Assert.Equal("principle", e.Kind); Assert.Equal("operator", e.Author); Assert.True(e.Pinned); Assert.False(e.NeedsReview); });
        Assert.Contains(all, e => e.Body == MemoryStore.PrincipleVisibleMemory);
        Assert.Contains(all, e => e.Body == MemoryStore.PrincipleFrontDesk);
    }

    [Fact]
    public void Persists_and_survives_a_zeroed_file_through_the_backup()
    {
        var s = New();
        var e = s.Add(In("keep me", "x", "fleet-fact"), "arch", "r");
        s.Add(In("and me", "y", "fleet-fact"), "arch", "r");          // second write leaves a .bak with the first
        Assert.Equal(2, New().All().Count);
        File.WriteAllBytes(s.FilePath, new byte[4096]);                // what the crash did to dock/arch/loops
        var reloaded = New();
        Assert.Contains(reloaded.All(), x => x.Id == e.Id);            // loaded from memory.json.bak
    }

    [Fact]
    public void Search_matches_every_word_and_skips_retired_unless_asked()
    {
        var s = New();
        var a = s.Add(In("prg build", "msbuild on HUB", "repo-note", "repo:prg"), "arch", "r");
        var b = s.Add(In("phone agent", "vapi calls", "repo-note", "repo:phone-agent"), "arch", "r");
        s.SetStatus(b.Id, MemoryStore.Retired, "arch", "r");
        Assert.Equal(new[] { a.Id }, s.Search("msbuild prg").Select(e => e.Id));
        Assert.Empty(s.Search("vapi"));
        Assert.Single(s.Search("vapi", includeRetired: true));
        Assert.Equal(new[] { a.Id }, s.Search(null, tag: "repo:prg").Select(e => e.Id));
    }
}
