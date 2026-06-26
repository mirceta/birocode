using ClaudeWeb.Models;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Deploy;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.IpFilter;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.UI;
using Microsoft.Extensions.Configuration;

namespace ClaudeWeb;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();

        // Load strongly typed config from appsettings.json (copied next to the exe).
        var config = LoadConfig();
        EnsureWorkingDirectory(config);

        // Shared singletons -- registered in DI by EmbeddedApi so all modules inject them.
        var logger = new Logger();
        var callLog = new CallLog();

        // Operator-managed repository registry. Built here (not just in DI) so the
        // WinForms UI and the web API share one instance. Seeds from the legacy
        // WorkingDirectory on first run.
        var repositories = new RepositoryRegistry(config, logger);

        // Pin the harness's own source repo as the default project, so the app can
        // be opened (and improved) in itself via the App tab. No-op for installs
        // that ship without the source tree.
        var repoRoot = FindRepoRoot();
        repositories.EnsureSelfRepo(repoRoot, "Claude Web (this app)");

        // Resolve + seed the off-repo deploy tooling (swap/rollback/arm) so the
        // deploy procedure is reproducible on a fresh machine — same LoadOrSeed
        // pattern as auth.json. Missing-only, so an existing box is untouched.
        config.DeployScriptsDir = DeployScriptProvisioner.ResolveDir(config.DeployScriptsDir, repoRoot) ?? config.DeployScriptsDir;
        DeployScriptProvisioner.EnsureSeeded(config.DeployScriptsDir, repoRoot, logger);

        // IP allowlist (plans/auth-ip-filter.md). Built here so the WinForms
        // GUI (the ONLY surface that can approve IPs) and the web API share
        // one instance — same pattern as RepositoryRegistry.
        var ipAllowlist = new IpAllowlistService(logger);

        // Operator-only autopilot gate (plans/loop-autopilot-safety.md). Built here
        // so the WinForms host (the ONLY surface that can turn the autopilot
        // endpoints on/off) and the web API share one instance — same pattern as
        // IpAllowlistService. Default OFF.
        var autopilotGate = new AutopilotGate(logger);

        // Trusted-device tokens (openspec add-resilient-auth). Built here so the
        // WinForms "Trusted devices" GUI (the ONLY surface that can revoke) and
        // the web API share one instance — same pattern as IpAllowlistService.
        var deviceTokens = new Services.Auth.DeviceTokenService(config, logger);

        // Action audit (openspec add-action-audit). Built here so the WinForms "Activity"
        // tab (the ONLY reader) and the web API (the writer) share one instance — same
        // pattern as IpAllowlistService. Resolves actor identity via the auth services.
        var audit = new Services.Audit.AuditService(config, logger, ipAllowlist, deviceTokens);

        // Start the embedded Kestrel server on a background thread.
        var api = new EmbeddedApi(config, logger, callLog, repositories, ipAllowlist, autopilotGate, deviceTokens, audit);
        api.Start();

        // Launch the monitoring GUI (blocks on the WinForms message loop).
        var form = new MainForm(config, logger, api, callLog, repositories, ipAllowlist, autopilotGate, deviceTokens, audit);
        Application.Run(form);

        // Shut the server down cleanly when the GUI closes.
        api.Stop();
    }

    private static AppConfig LoadConfig()
    {
        var configuration = new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
            // CLAUDEWEB_* env vars override appsettings (e.g. CLAUDEWEB_PORT). Lets a
            // self-dev preview instance run on a different port without editing config.
            .AddEnvironmentVariables(prefix: "CLAUDEWEB_")
            .Build();

        var config = new AppConfig();
        configuration.Bind(config);
        return config;
    }

    /// <summary>
    /// Finds the harness's source repo root by walking up from the executable
    /// until a folder containing ClaudeWeb.sln is found. Returns null for installs
    /// that ship without the source tree.
    /// </summary>
    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "ClaudeWeb.sln")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }

    private static void EnsureWorkingDirectory(AppConfig config)
    {
        try { Directory.CreateDirectory(config.WorkingDirectory); }
        catch { /* directory creation is best-effort; GUI surfaces issues later */ }
    }
}
