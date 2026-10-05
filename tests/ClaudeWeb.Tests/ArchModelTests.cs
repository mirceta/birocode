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
public class ArchModelTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-arch-model-" + Guid.NewGuid().ToString("N"));

    public ArchModelTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ }
    }

    [Fact]
    public void The_arch_default_is_fable_5_1()
    {
        Assert.Equal("claude-fable-5-1", ArchAgentService.DefaultModel);
        // A fresh arch state (nothing picked yet) resolves to the same — an existing
        // harness upgrades onto Fable without anyone touching the picker.
        var store = new ArchStateStore(new Logger(), _dir);
        Assert.Null(store.Model);
        Assert.Equal("claude-fable-5-1", ArchAgentService.ResolveModel(store.Model));
    }

    [Fact]
    public void The_pick_persists_and_blank_resets()
    {
        // The Arch tab's picker posts the pick; it is the arch's counterpart of the
        // registry's per-repo Model, so it survives a restart of the harness.
        new ArchStateStore(new Logger(), _dir).SetModel(" claude-sonnet-4-6 ");
        var reloaded = new ArchStateStore(new Logger(), _dir);
        Assert.Equal("claude-sonnet-4-6", reloaded.Model);
        Assert.Equal("claude-sonnet-4-6", ArchAgentService.ResolveModel(reloaded.Model));
        reloaded.SetModel("   ");
        Assert.Null(new ArchStateStore(new Logger(), _dir).Model);
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
        var model = ArchAgentService.ResolveModel(new ArchStateStore(new Logger(), _dir).Model);
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
