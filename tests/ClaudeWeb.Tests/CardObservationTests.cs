using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec policeman-observes-agents — the fixed observation vocabulary, and the
/// card's observation field: set by the policeman with its provenance, a no-op rewrite does
/// not churn, only the reader's own observation is cleared with onlyIfBy, the Operator
/// clears any, and it survives a reload.</summary>
public sealed class CardObservationTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-observe-" + Guid.NewGuid().ToString("N"));
    public CardObservationTests() => Directory.CreateDirectory(_dir);
    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    [Fact]
    public void The_vocabulary_is_fixed_and_names_what_needs_attention()
    {
        Assert.Equal(7, CardObservations.States.Count);
        Assert.True(CardObservations.IsState("asked-question"));
        Assert.True(CardObservations.IsState("waiting-review"));
        Assert.False(CardObservations.IsState("panicking"));
        Assert.False(CardObservations.IsState(null));
        Assert.True(CardObservations.NeedsAttention("blocked"));
        Assert.True(CardObservations.NeedsAttention("errored"));
        Assert.False(CardObservations.NeedsAttention("working"));
        Assert.Equal("Asked a question", CardObservations.States["asked-question"].Word);
        Assert.Contains("working | waiting-review", CardObservations.StateList);
    }

    [Fact]
    public void An_observation_is_recorded_with_its_provenance_and_cleared_only_by_its_reader_or_the_operator()
    {
        var g = new TaskGraphService(new Logger(), _dir);
        var n = g.AddNode("Export the invoice register as CSV", null, null, null, 0, 0, now: 1)!;
        var obs = new TaskGraphService.CardObservation(10, BoardIntegrity.Policeman, CardObservations.AskedQuestion, "asked for the production API key 30 min ago, no answer yet", "a1f3c9d2ffff");

        var after = g.SetObservation(n.Id, obs, 10)!;
        Assert.Equal(obs, after.Observation);
        Assert.Equal(10, after.UpdatedAt);
        // The same observation again: no save, no stamp.
        var again = g.SetObservation(n.Id, obs, 11)!;
        Assert.Equal(10, again.UpdatedAt);
        // Survives a reload.
        Assert.Equal(obs, new TaskGraphService(new Logger(), _dir).Find(n.Id)!.Observation);

        // Another reader's observation is not the policeman's to clear…
        g.SetObservation(n.Id, obs with { By = "agent" }, 12);
        var kept = g.SetObservation(n.Id, null, 13, onlyIfBy: BoardIntegrity.Policeman)!;
        Assert.NotNull(kept.Observation);
        // …but the Operator (no onlyIfBy) clears any.
        var cleared = g.SetObservation(n.Id, null, 14)!;
        Assert.Null(cleared.Observation);
        Assert.Equal(14, cleared.UpdatedAt);
        Assert.Null(g.SetObservation("nope", obs, 15));
    }
}
