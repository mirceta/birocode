using ClaudeWeb.Services.Events;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>The collector's unreachable backoff schedule (openspec hub-perf-arch-state-snapshot):
/// a dead peer is dialled at 8 s, then 16, 32, 64, and every 2 minutes — never every pass.</summary>
public class CollectorBackoffTests
{
    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 8_000)]
    [InlineData(2, 16_000)]
    [InlineData(3, 32_000)]
    [InlineData(4, 64_000)]
    [InlineData(5, 120_000)]
    [InlineData(6, 120_000)]
    [InlineData(40, 120_000)]
    [InlineData(1_000_000, 120_000)]
    public void Backoff_doubles_from_eight_seconds_and_caps_at_two_minutes(int streak, long expectedMs)
        => Assert.Equal(expectedMs, CollectorService.BackoffMs(streak));

    [Fact]
    public void Backoff_is_monotonic()
    {
        long prev = 0;
        for (var streak = 1; streak < 50; streak++)
        {
            var cur = CollectorService.BackoffMs(streak);
            Assert.True(cur >= prev, $"streak {streak}: {cur} < {prev}");
            prev = cur;
        }
    }
}
