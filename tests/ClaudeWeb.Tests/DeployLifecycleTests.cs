using ClaudeWeb.Services.Deploy;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec deploy-final-no-deadman: a deploy that passes its health check is FINAL. The
/// committed deploy scripts arm nothing, tell nobody to "keep", and still keep a manual
/// rollback path (last-good snapshot + rollback.ps1); the seeded off-repo tooling has no
/// arm script; keep.ps1 is a harmless no-op that says it is no longer needed.
/// These facts are read from the repo's own files so a regression cannot hide in a script.
/// </summary>
public sealed class DeployLifecycleTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "swap.ps1"))) dir = dir.Parent;
        Assert.NotNull(dir);
        return dir!.FullName;
    }

    private static string Read(string rel) => File.ReadAllText(Path.Combine(RepoRoot(), rel));

    [Fact]
    public void Swap_arms_no_timer_and_names_no_keep_but_still_snapshots_and_health_checks()
    {
        var swap = Read("swap.ps1");
        Assert.DoesNotContain("arm-rollback", swap);
        Assert.DoesNotContain("DEAD-MAN SWITCH ARMED", swap);
        Assert.DoesNotContain("Register-ScheduledTask", swap);
        Assert.DoesNotContain("RollbackMinutes", swap);
        Assert.DoesNotContain("NoArm", swap);
        // No line tells anyone to run keep.
        Assert.DoesNotContain("keep.ps1", swap);
        Assert.DoesNotContain("keep it", swap, StringComparison.OrdinalIgnoreCase);
        // The manual rollback path and the success gate stay.
        Assert.Contains("run-bin.lastgood", swap);
        Assert.Contains("rollback.ps1", swap);
        Assert.Contains("/api/auth/check", swap);
        Assert.Contains("deploy FINAL", swap);
        // A failed health check still restores last-good inline.
        Assert.Contains("health FAILED: rolling back to last-good NOW", swap);
    }

    [Fact]
    public void The_dead_man_pieces_are_gone_and_the_manual_rollback_stays()
    {
        var root = RepoRoot();
        Assert.False(File.Exists(Path.Combine(root, "arm-rollback.ps1")));
        Assert.False(File.Exists(Path.Combine(root, "auto-keep.ps1")));
        Assert.False(File.Exists(Path.Combine(root, "ClaudeWeb.App", "Deploy", "templates", "arm.ps1.tmpl")));
        Assert.True(File.Exists(Path.Combine(root, "rollback.ps1")));
        var rollback = Read("rollback.ps1");
        Assert.Contains("run-bin.lastgood", rollback);
        Assert.Contains("MANUAL rollback", rollback);
        Assert.DoesNotContain("keep.ps1", rollback);
    }

    [Fact]
    public void Keep_is_a_no_op_that_says_it_is_no_longer_needed()
    {
        var keep = Read("keep.ps1");
        Assert.Contains("keep is no longer needed", keep);
        Assert.DoesNotContain("Register-ScheduledTask", keep);
    }

    [Fact]
    public void The_seeded_tooling_has_no_arm_script()
    {
        Assert.Equal(new[] { "swap.ps1", "rollback.ps1" }, DeployScriptProvisioner.ScriptNames);
    }

    [Fact]
    public void The_working_notes_no_longer_tell_anyone_to_keep()
    {
        var notes = Read("CLAUDE.md");
        Assert.Contains("A healthy deploy is final", notes);
        Assert.DoesNotContain("arms a 15-min", notes);
        Assert.DoesNotContain("arm-rollback.ps1", notes);
        var runbook = Read(Path.Combine("docs", "claude-web", "redeploy.md"));
        Assert.DoesNotContain("Keep it", runbook);
        Assert.DoesNotContain("arm.ps1", runbook);
    }
}
