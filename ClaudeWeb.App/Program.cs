using ClaudeWeb.Models;
using ClaudeWeb.Services.Expose;
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
        repositories.EnsureSelfRepo(FindRepoRoot(), "Claude Web (this app)");

        // Serve the bundled Exposure Helper (exposer/) as the harness's OWN
        // Local-tab product (plans/serving-model-clarity.md, slice 1): a loopback
        // dual-stack static server that dogfoods the embed contract and is the
        // live reference. The self repo's Local tab falls back to its port when
        // the operator hasn't set one (read-time only, never persisted).
        var exposer = new ExposerHost(config, logger);
        repositories.SetSelfLocalPortFallback(exposer.Start());

        // IP allowlist (plans/auth-ip-filter.md). Built here so the WinForms
        // GUI (the ONLY surface that can approve IPs) and the web API share
        // one instance — same pattern as RepositoryRegistry.
        var ipAllowlist = new IpAllowlistService(logger);

        // Start the embedded Kestrel server on a background thread.
        var api = new EmbeddedApi(config, logger, callLog, repositories, ipAllowlist);
        api.Start();

        // Launch the monitoring GUI (blocks on the WinForms message loop).
        var form = new MainForm(config, logger, api, callLog, repositories, ipAllowlist);
        Application.Run(form);

        // Shut the servers down cleanly when the GUI closes.
        api.Stop();
        exposer.Stop();
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
