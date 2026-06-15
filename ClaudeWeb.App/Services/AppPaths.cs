namespace ClaudeWeb.Services;

/// <summary>
/// Single source of truth for the harness's data directory — the folder holding
/// every piece of operator state (repositories.json, auth.json, dock.json,
/// notes.json, ...). Defaults to the stable <c>%APPDATA%\ClaudeWeb</c> location
/// that survives rebuilds and reinstalls.
///
/// Honors the <c>CLAUDEWEB_DATADIR</c> environment override so a Self-Development
/// preview can run against an ISOLATED store and never read or write the live
/// operator's files (see docs/claude-web/self-dev.md). The override is read
/// directly from the environment (not via <see cref="ClaudeWeb.Models.AppConfig"/>)
/// because services resolve their paths in their own constructors, before any
/// config object is threaded through — and because plain
/// <see cref="Environment.GetFolderPath(Environment.SpecialFolder)"/> ignores the
/// <c>APPDATA</c> env var on Windows (it uses the known-folder API), so that is
/// not a usable isolation lever.
///
/// The directory is not guaranteed to exist; call sites create it on demand as
/// they always have.
/// </summary>
public static class AppPaths
{
    /// <summary>The ClaudeWeb data directory (may not exist yet).</summary>
    public static string DataDir { get; } = Resolve();

    private static string Resolve()
    {
        var overrideDir = Environment.GetEnvironmentVariable("CLAUDEWEB_DATADIR");
        if (!string.IsNullOrWhiteSpace(overrideDir))
            return Path.GetFullPath(overrideDir.Trim());

        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        return Path.Combine(appData, "ClaudeWeb");
    }
}
