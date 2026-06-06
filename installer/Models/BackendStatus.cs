namespace ClaudeWebInstaller.Models;

/// <summary>
/// A point-in-time snapshot of the ClaudeWeb backend process. The backend and
/// the web app are one process (ClaudeWeb.exe hosts Kestrel which serves both
/// /api/... and the React app from client/dist), so this single status covers
/// both facets: the API health and the URL the user opens in a browser.
/// </summary>
/// <param name="ProcessRunning">A ClaudeWeb process exists.</param>
/// <param name="HealthOk">GET /api/health returned HTTP 200.</param>
/// <param name="Port">The configured port the backend binds.</param>
/// <param name="DistPresent">client/dist/index.html exists (web app is built).</param>
/// <param name="LocalUrl">http://localhost:&lt;port&gt;/ -- open on this machine.</param>
/// <param name="LanUrl">http://&lt;lan-ip&gt;:&lt;port&gt;/ -- open from a phone, or null.</param>
public record BackendStatus(
    bool ProcessRunning,
    bool HealthOk,
    int Port,
    bool DistPresent,
    string LocalUrl,
    string? LanUrl);
