namespace ClaudeWeb.Services;

/// <summary>
/// Resolves the harness's on-disk data directory (repo registry, auth, dock,
/// ideas, task graph, analytics, …). Defaults to <c>%APPDATA%\ClaudeWeb</c>,
/// but honours the <c>CLAUDEWEB_DATADIR</c> environment variable so an isolated
/// dev/test instance can keep its own store instead of sharing the operator's
/// live one (plans/chat-system-tests.md — the system-test harness runs against a
/// fresh datadir so real CLI turns and repo registrations never touch live data).
///
/// Read once at process start: the env var can't change under a running process,
/// and every service computes its file paths from this single source so they all
/// relocate together.
/// </summary>
public static class AppPaths
{
    /// <summary>The ClaudeWeb data directory for this process.</summary>
    public static string DataDir { get; } = Resolve();

    private static string Resolve()
    {
        var overrideDir = Environment.GetEnvironmentVariable("CLAUDEWEB_DATADIR");
        if (!string.IsNullOrWhiteSpace(overrideDir))
            return overrideDir;
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
    }
}
