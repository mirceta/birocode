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
    /// Directory holding the deploy scripts (arm/swap/rollback) and the
    /// append-only <c>deploys.jsonl</c> ledger the Deployments tab reads
    /// (plans/deployments-tab.md). Off-repo by design — the deploy tooling
    /// lives outside the tree it deploys.
    /// </summary>
    public string DeployScriptsDir { get; set; } = @"C:\Users\Administrator\Desktop\playground\claudeweb-rollback";

    /// <summary>
    /// Port the "App" tab previews. Claude is expected to start the product
    /// (the app in the opened repo) listening on 0.0.0.0:&lt;PreviewPort&gt;; the App
    /// tab simply iframes it. The harness does not start/stop the product.
    /// </summary>
    public int PreviewPort { get; set; } = 5200;

    /// <summary>
    /// How the browser should reach the product when the app is served through a
    /// reverse proxy (e.g. IIS). Set to a same-origin path like "/preview/" that
    /// the proxy forwards to the product, so the iframe works over HTTPS without
    /// exposing the raw preview port. Empty = embed the product directly at
    /// &lt;host&gt;:&lt;PreviewPort&gt; (the LAN/no-proxy case). When set, it is only used
    /// for proxied requests; direct access on the Kestrel port still uses the port.
    /// </summary>
    public string PreviewUrl { get; set; } = "";

    /// <summary>
    /// LEGACY seed only (plans/auth-login.md): hashed into
    /// %APPDATA%\ClaudeWeb\auth.json on first run, then ignored. Rotate the
    /// real password via POST /api/auth/password, not here.
    /// </summary>
    public string AuthPassword { get; set; } = "changeme";

    /// <summary>
    /// Reverse-proxy addresses whose X-Forwarded-For header is trusted, in
    /// addition to loopback (plans/auth-ip-filter.md §1). Needed when IIS/ARR
    /// runs on a DIFFERENT machine than the harness: without it, every visitor
    /// appears as the proxy's IP and the IP allowlist becomes all-or-nothing.
    /// Exact IPs only. Anything connecting from these addresses can claim any
    /// client IP, so list ONLY your own proxy.
    /// </summary>
    public string[] TrustedProxyIps { get; set; } = [];
}
