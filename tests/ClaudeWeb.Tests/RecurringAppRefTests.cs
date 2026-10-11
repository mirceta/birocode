using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec recurring-open-local-app: create_recurring / update_recurring name a tracking
/// card's app by id or by name; anything else is refused with the agent's apps listed.</summary>
public class RecurringAppRefTests
{
    private static readonly IReadOnlyList<(string Id, string Name)> Apps = new[] { ("admin", "Admin"), ("events-feed", "Event feed") };

    [Theory]
    [InlineData("admin", "admin")]
    [InlineData("ADMIN", "admin")]
    [InlineData("Event feed", "events-feed")]
    [InlineData(" event FEED ", "events-feed")]
    public void An_app_is_found_by_id_or_by_name(string want, string id)
    {
        var (hit, known) = ArchAgentService.MatchApp(Apps, want);
        Assert.Equal(id, hit);
        Assert.Null(known);
    }

    [Fact]
    public void An_unknown_app_lists_the_agents_apps()
    {
        var (hit, known) = ArchAgentService.MatchApp(Apps, "reservations");
        Assert.Null(hit);
        Assert.Equal("its apps: Admin (admin), Event feed (events-feed)", known);
        Assert.Equal("it has no registered local apps", ArchAgentService.MatchApp(Array.Empty<(string, string)>(), "x").Known);
    }
}
