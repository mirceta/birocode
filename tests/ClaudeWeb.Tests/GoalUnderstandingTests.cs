using ClaudeWeb.Services;
using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>The per-goal Understanding app (fleet task 93b481e6): the pure, DI-free half —
/// the goal-id → folder resolver (contained to the data dir, rejecting anything that could
/// escape it) and the built-state disk check that the goal view surfaces as a badge.</summary>
public sealed class GoalUnderstandingTests
{
    [Fact]
    public void AppDir_is_under_the_data_dir_root_for_a_clean_id()
    {
        var dir = GoalUnderstanding.AppDir("g7abc");
        Assert.NotNull(dir);
        Assert.StartsWith(GoalUnderstanding.Root, dir);
        Assert.Equal(Path.Combine(GoalUnderstanding.Root, "g7abc"), dir);
        Assert.StartsWith(Path.Combine(AppPaths.DataDir, "goal-understanding"), dir);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("../escape")]
    [InlineData("a/b")]
    [InlineData("a\\b")]
    [InlineData("a:b")]
    public void AppDir_rejects_ids_that_could_escape_the_folder(string? id)
    {
        Assert.Null(GoalUnderstanding.AppDir(id));
    }

    [Fact]
    public void BuiltState_false_when_absent_invalid_or_no_index_true_when_authored()
    {
        Assert.Equal((false, (long?)null), GoalUnderstanding.BuiltState("../nope"));
        var id = "gtest-" + Guid.NewGuid().ToString("N");
        try
        {
            Assert.Equal((false, (long?)null), GoalUnderstanding.BuiltState(id)); // no folder yet
            var dir = GoalUnderstanding.AppDir(id)!;
            Directory.CreateDirectory(dir);
            Assert.Equal((false, (long?)null), GoalUnderstanding.BuiltState(id)); // folder but no index.html
            File.WriteAllText(Path.Combine(dir, "index.html"), "<!doctype html><title>x</title>");
            var (built, at) = GoalUnderstanding.BuiltState(id);
            Assert.True(built);
            Assert.NotNull(at);
        }
        finally
        {
            try { Directory.Delete(GoalUnderstanding.AppDir(id)!, recursive: true); } catch { /* best effort */ }
        }
    }
}
