using ClaudeWeb.Services.Chat;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-chat-window: <c>?tail=N</c> on a transcript read returns the
/// last N messages and the thread's total; no tail (or a non-positive / oversized one)
/// returns the whole thread — the poll of a long arch conversation stays small and the
/// "Show earlier (hidden)" count is exact.</summary>
public sealed class TranscriptWindowTests
{
    private static List<int> Thread(int n) => Enumerable.Range(1, n).ToList();

    [Fact]
    public void A_tail_returns_the_last_n_and_the_total()
    {
        var (items, total) = TranscriptWindow.Tail(Thread(3000), 50);
        Assert.Equal(3000, total);
        Assert.Equal(50, items.Count);
        Assert.Equal(2951, items[0]);
        Assert.Equal(3000, items[^1]);
        // Widening the window keeps the same tail end.
        var (more, _) = TranscriptWindow.Tail(Thread(3000), 100);
        Assert.Equal(2901, more[0]);
        Assert.Equal(3000, more[^1]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(-7)]
    [InlineData(50)]
    [InlineData(500)]
    public void No_tail_or_a_tail_at_least_the_thread_returns_everything(int? tail)
    {
        var (items, total) = TranscriptWindow.Tail(Thread(50), tail);
        Assert.Equal(50, total);
        Assert.Equal(Thread(50), items);
    }

    [Fact]
    public void An_empty_thread_is_empty_with_total_zero()
    {
        var (items, total) = TranscriptWindow.Tail(new List<string>(), 50);
        Assert.Empty(items);
        Assert.Equal(0, total);
    }
}
