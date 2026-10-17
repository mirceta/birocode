using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-arm-control: why the arch went OFF, in the Operator's words — including the
/// case that hid it before: the conversation holding the standing loop was deleted.</summary>
public class ArchArmControlTests
{
    private static LoopConfigStore.LoopState Loop(string kind, string status, string? reason, string? detail = null, int done = 3, int max = 0) =>
        new("@arch:x", kind, "drive", "", "LOOP_DONE", max, false, done, status, 0, reason, detail, null, null, null, null, null, null, 0, null,
            null, false, null, 0, Array.Empty<string>(), Array.Empty<int>());

    [Fact]
    public void A_deleted_conversation_is_named_as_the_reason()
    {
        Assert.Equal("the standing wake loop stopped because its conversation was deleted",
            ArchAgentService.WhyEnded(Loop("arch", "stopped", "user"), conversationExists: false));
        Assert.Equal("the standing wake loop was stopped by the Operator",
            ArchAgentService.WhyEnded(Loop("arch", "stopped", "user"), conversationExists: true));
    }

    [Fact]
    public void Goals_caps_and_errors_read_plainly()
    {
        Assert.Equal("the goal loop finished — its goal was verified", ArchAgentService.WhyEnded(Loop("goal", "done", "verified"), true));
        Assert.Equal("the goal loop reached its cap (20/20)", ArchAgentService.WhyEnded(Loop("goal", "capped", "cap", done: 20, max: 20), true));
        Assert.Equal("the goal loop was stopped by arch", ArchAgentService.WhyEnded(Loop("goal", "stopped", "arch"), true));
        Assert.Equal("the standing wake loop stopped on an error: boom", ArchAgentService.WhyEnded(Loop("arch", "error", "error", "boom"), true));
    }
}
