using System.Diagnostics;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec arch-model-fable (fleet task 4e9f50be): the arch runs on a pinned
/// model. Before this change no arch turn carried <c>--model</c> — the arch home is not
/// a registered repo, so the runner had nothing to fall back on and the CLI's own
/// default (Opus 4.8) ran the arch. Pure: the default, the Operator override rule and
/// the argv the Claude adapter builds from it.</summary>
public class ArchModelTests
{
    [Fact]
    public void The_arch_default_is_fable_5_1()
    {
        Assert.Equal("claude-fable-5-1", ArchAgentService.DefaultModel);
        // A fresh appsettings (no ArchModel key) resolves to the same — the live box's
        // appsettings.json is preserved across deploys, so the default must carry it.
        Assert.Equal("claude-fable-5-1", ArchAgentService.ResolveModel(new AppConfig().ArchModel));
    }

    [Theory]
    [InlineData(null, "claude-fable-5-1")]
    [InlineData("", "claude-fable-5-1")]
    [InlineData("   ", "claude-fable-5-1")]
    [InlineData(" claude-opus-4-8 ", "claude-opus-4-8")]     // an Operator override is honoured
    [InlineData("claude-sonnet-4-6", "claude-sonnet-4-6")]
    [InlineData("gpt-6-astra", "claude-fable-5-1")]          // the arch only runs on Claude
    [InlineData("haiku", "claude-fable-5-1")]                // not a claude-* id: no opinion, default
    public void Operator_setting_resolves_to_a_claude_model_or_the_default(string? configured, string expected) =>
        Assert.Equal(expected, ArchAgentService.ResolveModel(configured));

    [Fact]
    public void An_arch_turn_is_spawned_with_the_model_flag()
    {
        var model = ArchAgentService.ResolveModel(new AppConfig().ArchModel);
        var spec = new TurnSpec("wake", null, null, model, false, null, null, false, ArchAgentService.DisallowedTools);
        ProcessStartInfo psi = new ClaudeCliAdapter(new Logger()).CreateProcessInfo(spec);
        var args = psi.ArgumentList.ToList();
        var i = args.IndexOf("--model");
        Assert.True(i >= 0, "arch turn carries --model");
        Assert.Equal("claude-fable-5-1", args[i + 1]);
    }

    [Fact]
    public void Without_a_model_the_adapter_leaves_the_choice_to_the_cli()
    {
        // The pre-change shape of every arch turn: no flag at all.
        var spec = new TurnSpec("wake", null, null, null, false, null, null, false, ArchAgentService.DisallowedTools);
        var args = new ClaudeCliAdapter(new Logger()).CreateProcessInfo(spec).ArgumentList;
        Assert.DoesNotContain("--model", args);
    }
}
