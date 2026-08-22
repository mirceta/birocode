using System.Text.Json;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the per-repository host cue rules (openspec repo-sounds-and-latency):
/// <see cref="HostEventSound.EffectiveRule"/> resolution precedence, disk persistence of
/// repo scopes, and <see cref="CollectorService.RepoNameOf"/> envelope extraction. Each
/// test owns a throwaway data dir via the ctor's test override, so nothing touches the
/// operator's real cue store.
/// </summary>
public sealed class HostEventSoundRuleTests : IDisposable
{
    private readonly string _dir;
    private static readonly byte[] Bytes = { 1, 2, 3 };

    public HostEventSoundRuleTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-cues-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* temp cleanup only */ }
    }

    private HostEventSound NewSound() => new(new Logger(), _dir);

    [Fact]
    public void RepoRuleWinsOverGlobalRuleForSameType()
    {
        var s = NewSound();
        s.AssignRule("turn.ended", Bytes, "global.wav");
        s.AssignRule("turn.ended", Bytes, "repo.wav", "birocode");

        Assert.Equal("repo.wav", s.EffectiveRule("turn.ended", "birocode")?.Name);
        Assert.Equal("global.wav", s.EffectiveRule("turn.ended")?.Name);
    }

    [Fact]
    public void RepoDefaultCoversAnyTypeFromThatRepo()
    {
        var s = NewSound();
        s.AssignRule("_default", Bytes, "repo-any.wav", "birocode");

        // Known slot with no repo-specific file still resolves to the repo default —
        // that is the repo scope's widened _default semantics.
        Assert.Equal("repo-any.wav", s.EffectiveRule("turn.start", "birocode")?.Name);
        Assert.Equal("repo-any.wav", s.EffectiveRule("something.new", "birocode")?.Name);
        // …but only for that repo.
        Assert.Null(s.EffectiveRule("turn.start", "other-repo"));
        Assert.Null(s.EffectiveRule("turn.start"));
    }

    [Fact]
    public void GlobalDefaultStillCoversOnlyUnknownTypes()
    {
        var s = NewSound();
        s.AssignRule("_default", Bytes, "global-default.wav");

        // Pre-repo-scope semantics unchanged: a recognized slot with no file uses its
        // built-in cue (null here), not the global default.
        Assert.Null(s.EffectiveRule("turn.start"));
        Assert.Equal("global-default.wav", s.EffectiveRule("something.new")?.Name);
        // A repo with no rules of its own falls through to the same global behavior.
        Assert.Null(s.EffectiveRule("turn.start", "birocode"));
        Assert.Equal("global-default.wav", s.EffectiveRule("something.new", "birocode")?.Name);
    }

    [Fact]
    public void RepoTypeRuleWinsOverRepoDefault()
    {
        var s = NewSound();
        s.AssignRule("_default", Bytes, "repo-any.wav", "birocode");
        s.AssignRule("turn.ended", Bytes, "repo-ended.wav", "birocode");

        Assert.Equal("repo-ended.wav", s.EffectiveRule("turn.ended", "birocode")?.Name);
        Assert.Equal("repo-any.wav", s.EffectiveRule("turn.start", "birocode")?.Name);
    }

    [Fact]
    public void RepoScopesSurviveReloadFromDisk()
    {
        NewSound().AssignRule("turn.ended", Bytes, "repo.wav", "my repo / with:chars");

        var reloaded = NewSound();                        // fresh instance, same dir
        Assert.Equal("repo.wav", reloaded.EffectiveRule("turn.ended", "my repo / with:chars")?.Name);
        var scope = Assert.Single(reloaded.ListRepoRules());
        Assert.Equal("my repo / with:chars", scope.Repo);
        Assert.Contains(scope.Rules, r => r.Slot == "turn.ended" && r.HasCustom);
    }

    [Fact]
    public void ClearingLastRepoRuleRemovesTheScope()
    {
        var s = NewSound();
        s.AssignRule("turn.ended", Bytes, "repo.wav", "birocode");
        Assert.Single(s.ListRepoRules());

        s.ClearRule("turn.ended", "birocode");
        Assert.Empty(s.ListRepoRules());
        Assert.Null(s.EffectiveRule("turn.ended", "birocode"));
        Assert.Empty(NewSound().ListRepoRules());          // gone on disk too
    }

    [Fact]
    public void GlobalListingAndBehaviorUnaffectedByRepoScopes()
    {
        var s = NewSound();
        s.AssignRule("turn.ended", Bytes, "repo.wav", "birocode");

        Assert.All(s.ListRules(), r => Assert.False(r.HasCustom));
        Assert.Null(s.EffectiveRule("turn.ended"));
    }

    [Fact]
    public void BadRepoNamesAreRejected()
    {
        var s = NewSound();
        Assert.Throws<ArgumentException>(() => s.AssignRule("turn.ended", Bytes, "x.wav", new string('r', 200)));
        Assert.Throws<ArgumentException>(() => s.AssignRule("turn.ended", Bytes, "x.wav", "bad" + (char)1 + "name"));
    }

    [Fact]
    public void RepoNameOfReadsSelfAndRemoteEnvelopes()
    {
        // Self events publish an anonymous object; remote events arrive as JsonElement.
        Assert.Equal("birocode", CollectorService.RepoNameOf(new { repoId = "1", repoName = "birocode" }));
        var je = JsonDocument.Parse("""{"repoId":"1","repoName":"birocode"}""").RootElement;
        Assert.Equal("birocode", CollectorService.RepoNameOf(je));

        Assert.Null(CollectorService.RepoNameOf(null));
        Assert.Null(CollectorService.RepoNameOf(new { other = 1 }));
        Assert.Null(CollectorService.RepoNameOf(JsonDocument.Parse("\"just a string\"").RootElement));
    }
}
