using ClaudeWeb.Services.Chat;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec codex-account-and-models: a conversation id may only be resumed
/// on the engine whose store holds it; an Engine switch under a live chat therefore
/// starts a fresh conversation instead of resuming a foreign id.</summary>
public class SessionOwnershipTests
{
    [Fact]
    public void Codex_thread_is_found_by_its_date_partitioned_rollout_file()
    {
        var home = Path.Combine(Path.GetTempPath(), "cw-own-" + Guid.NewGuid().ToString("N"));
        var day = Path.Combine(home, "sessions", "2026", "09", "07");
        Directory.CreateDirectory(day);
        File.WriteAllText(Path.Combine(day, "rollout-2026-09-07T10-54-05-01a07b4a-0d6c-7413-87bd-74a0b1756cec.jsonl"), "{}");
        try
        {
            Assert.True(SessionOwnership.IsCodexThread(home, "01a07b4a-0d6c-7413-87bd-74a0b1756cec"));
            Assert.False(SessionOwnership.IsCodexThread(home, "11111111-2222-4333-8444-555555555555"));
            Assert.True(SessionOwnership.BelongsTo("codex", "01a07b4a-0d6c-7413-87bd-74a0b1756cec", @"C:\x", home));
            Assert.False(SessionOwnership.BelongsTo("codex", "11111111-2222-4333-8444-555555555555", @"C:\x", home)); // a Claude id on codex
            Assert.True(SessionOwnership.BelongsTo("codex", null, @"C:\x", home));   // new conversation
            Assert.True(SessionOwnership.BelongsTo("codex", "", @"C:\x", home));
        }
        finally { Directory.Delete(home, true); }
    }

    [Fact]
    public void Claude_session_is_found_by_its_transcript_file()
    {
        var dir = Path.Combine(Path.GetTempPath(), "cw-own-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "194f3269-58bb-4584-9105-7b07c22b37dc.jsonl"), "{}");
        try
        {
            Assert.True(SessionOwnership.IsClaudeSession(dir, "194f3269-58bb-4584-9105-7b07c22b37dc"));
            Assert.False(SessionOwnership.IsClaudeSession(dir, "01a07b4a-0d6c-7413-87bd-74a0b1756cec")); // a Codex id on claude
        }
        finally { Directory.Delete(dir, true); }
    }

    [Fact]
    public void Missing_store_or_hostile_id_never_throws()
    {
        Assert.False(SessionOwnership.IsCodexThread(Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid()), "x"));
        Assert.False(SessionOwnership.IsClaudeSession(Path.Combine(Path.GetTempPath(), "does-not-exist-" + Guid.NewGuid()), "x"));
        Assert.False(SessionOwnership.BelongsTo("claude", "../../etc", @"C:\x"));
    }
}
