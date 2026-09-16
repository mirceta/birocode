using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using Xunit;
using ClaudeWeb.Services.Policeman;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec fix-arch-conversation-session-isolation — every arch conversation keeps its OWN
/// CLI session. The bug: the engine resolved a driven loop's missing session from "the
/// newest transcript in the working directory"; every arch conversation shares the arch
/// home, so a freshly armed conversation (the policeman) was pinned to the Operator's Arch
/// chat and the two fused into one transcript. Pinned here: the engine rule (arch keys never
/// resolve from the folder), session ownership in the store, and the repair that splits a
/// shared session (the Operator-facing conversation keeps it).
/// </summary>
public sealed class ArchConversationSessionIsolationTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-iso-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    [Theory]
    [InlineData("r-web", true)]                 // a repo dock: one repo folder = one conversation
    [InlineData("@arch", false)]                // the Operator-facing arch conversation
    [InlineData("@arch:policeman", false)]      // the policeman
    [InlineData("@arch:1a2b3c4d", false)]       // any sibling arch conversation
    public void Only_repo_docks_may_resolve_a_session_from_the_newest_transcript(string key, bool allowed)
        => Assert.Equal(allowed, ArchAgentService.ResolvesSessionFromNewestTranscript(key));

    [Fact]
    public void A_session_has_one_owner()
    {
        var store = new ArchStateStore(_logger, _dir);
        store.EnsureConversation(PolicemanIdentity.ConversationId, PolicemanIdentity.ConversationName);
        Assert.Null(store.OwnerOfSession("nobody"));
        Assert.Null(store.OwnerOfSession(null));
        store.SetSessionId("@arch", "sess-arch");
        store.SetSessionId(PolicemanIdentity.ConversationId, "sess-police");
        Assert.Equal("@arch", store.OwnerOfSession("sess-arch"));
        Assert.Equal(PolicemanIdentity.ConversationId, store.OwnerOfSession("sess-police"));
        Assert.Equal("@arch", store.OwnerOfSession(" sess-arch "));
    }

    [Fact]
    public void A_shared_session_is_split_and_the_Operator_facing_conversation_keeps_it()
    {
        // The live failure: the policeman got bound to the Arch chat's session.
        var store = new ArchStateStore(_logger, _dir);
        store.EnsureConversation(PolicemanIdentity.ConversationId, PolicemanIdentity.ConversationName);
        store.SetSessionId("@arch", "sess-shared");
        store.SetSessionId(PolicemanIdentity.ConversationId, "sess-shared");

        var cleared = store.SplitSharedSessions();

        Assert.Equal(new[] { PolicemanIdentity.ConversationId }, cleared);
        Assert.Equal("sess-shared", store.SessionOf("@arch"));            // the Arch chat keeps its history
        Assert.Null(store.SessionOf(PolicemanIdentity.ConversationId));       // the policeman starts fresh
        Assert.Empty(store.SplitSharedSessions());                         // idempotent
        // …and it is persisted.
        Assert.Null(new ArchStateStore(_logger, _dir).SessionOf(PolicemanIdentity.ConversationId));
    }

    [Fact]
    public void Two_siblings_sharing_a_session_keep_it_on_the_older_one()
    {
        var store = new ArchStateStore(_logger, _dir);
        var a = store.AddConversation("first");
        Thread.Sleep(2);
        var b = store.AddConversation("second");
        store.SetSessionId(a.Id, "sess-x");
        store.SetSessionId(b.Id, "sess-x");
        var cleared = store.SplitSharedSessions();
        Assert.Equal(new[] { b.Id }, cleared);
        Assert.Equal("sess-x", store.SessionOf(a.Id));
        Assert.Null(store.SessionOf(b.Id));
    }

    [Fact]
    public void Distinct_sessions_are_left_alone()
    {
        var store = new ArchStateStore(_logger, _dir);
        var a = store.AddConversation("a");
        store.SetSessionId("@arch", "s1");
        store.SetSessionId(a.Id, "s2");
        Assert.Empty(store.SplitSharedSessions());
        Assert.Equal("s1", store.SessionOf("@arch"));
        Assert.Equal("s2", store.SessionOf(a.Id));
    }

    [Fact]
    public void A_new_reserved_conversation_starts_without_a_session()
    {
        // The precondition the engine rule protects: with no session of its own, an arch
        // conversation's first turn must start a FRESH CLI session, never join the folder's newest.
        var store = new ArchStateStore(_logger, _dir);
        store.SetSessionId("@arch", "sess-arch");
        var c = store.EnsureConversation(PolicemanIdentity.ConversationId, PolicemanIdentity.ConversationName);
        Assert.Null(c.SessionId);
        Assert.Null(store.SessionOf(c.Id));
        Assert.Equal("@arch", store.OwnerOfSession("sess-arch"));
    }
}
