namespace ClaudeWeb.Models;

/// <summary>
/// Strongly typed application configuration loaded from appsettings.json.
/// Shared singleton -- all modules inject this to read runtime settings.
/// </summary>
public class AppConfig
{
    /// <summary>
    /// Legacy single working directory. Still read from appsettings.json for
    /// backward compatibility: on first run it seeds the initial entry in the
    /// repository registry (see <see cref="ClaudeWeb.Services.Repositories.RepositoryRegistry"/>).
    /// Runtime repository management lives in the registry, not here.
    /// </summary>
    public string WorkingDirectory { get; set; } = @"C:\Users\km\Desktop\claude-web-workspace";

    /// <summary>Port the embedded Kestrel server binds to (0.0.0.0).</summary>
    public int Port { get; set; } = 5099;

    /// <summary>
    /// Shared password required on /api/* calls (except /api/health and static
    /// files). Supplied by clients via the X-Auth-Password header or ?pw= query.
    /// </summary>
    public string AuthPassword { get; set; } = "changeme";
}
