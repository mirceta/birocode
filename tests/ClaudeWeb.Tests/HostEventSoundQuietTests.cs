using ClaudeWeb.Services.Events;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec sofa-mode: the phone remote's own commands never cue the host — they are the
/// Operator's taps, not agent events; every other type keeps its cue.</summary>
public class HostEventSoundQuietTests
{
    [Theory]
    [InlineData("remote.command", true)]
    [InlineData("REMOTE.command", true)]
    [InlineData("remote.pair", true)]
    [InlineData("turn.start", false)]
    [InlineData("turn.ended", false)]
    [InlineData("chat.focus", false)]
    [InlineData("stage.changed", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Only_the_remotes_own_events_are_quiet(string? type, bool quiet) => Assert.Equal(quiet, HostEventSound.IsQuietType(type));
}
