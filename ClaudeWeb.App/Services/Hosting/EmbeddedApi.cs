using ClaudeWeb.Models;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.ArchPlan;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Deploy;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Expose;
using ClaudeWeb.Services.Files;
using ClaudeWeb.Services.Git;
using ClaudeWeb.Services.IpFilter;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Pins;
using ClaudeWeb.Services.Prompts;
using ClaudeWeb.Services.PromptPlans;
using ClaudeWeb.Services.PromptNotes;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Screen;
using ClaudeWeb.Services.Settings;
using ClaudeWeb.Services.StructuredAsk;
using ClaudeWeb.Services.TaskGraph;
using ClaudeWeb.Services.Terminal;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// Hosts the embedded Kestrel web server on a background thread so the
/// WinForms message loop stays responsive. Wires up:
///   - CORS allow-all (needed for the Vite dev-server proxy)
///   - shared singletons (Logger, AppConfig) in DI
///   - attribute-routed controllers via AddControllers() (auto-discovery)
///   - the shared-password auth middleware
///   - static file serving from client/dist with SPA fallback to index.html
///
/// MODULE REGISTRATION CONVENTION
/// ------------------------------
/// New modules (M1/M2/M3/...) must NOT edit this file. Instead each module
/// ships a static extension class in its own file, e.g.
///   public static class ChatModuleExtensions
///   { public static IServiceCollection AddChatModule(this IServiceCollection s) {...} }
/// and the orchestrator un-comments the matching line in the marked region
/// below between build phases. Controllers register themselves automatically
/// through AddControllers(), so a new controller needs zero changes here.
/// See claude-web/plans/INTEGRATION.md.
/// </summary>
public class EmbeddedApi
{
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private readonly CallLog _callLog;
    private readonly RepositoryRegistry _repositories;
    private readonly IpAllowlistService _ipAllowlist;
    private readonly Autopilot.AutopilotGate _autopilotGate;
    private WebApplication? _app;

    public bool IsRunning { get; private set; }
    public int Port => _config.Port;

    public EmbeddedApi(AppConfig config, Logger logger, CallLog callLog, RepositoryRegistry repositories, IpAllowlistService ipAllowlist, Autopilot.AutopilotGate autopilotGate)
    {
        _config = config;
        _logger = logger;
        _callLog = callLog;
        _repositories = repositories;
        _ipAllowlist = ipAllowlist;
        _autopilotGate = autopilotGate;
    }

    public void Start()
    {
        var thread = new Thread(RunApi) { IsBackground = true };
        thread.Start();
    }

    private void RunApi()
    {
        try
        {
            var distPath = ResolveDistPath();

            // Point the web root at the built React app so static file serving
            // and the SPA fallback (index.html) share one provider. Must be set
            // via WebApplicationOptions -- changing it after CreateBuilder is unsupported.
            var options = new WebApplicationOptions();
            if (distPath != null)
                options = new WebApplicationOptions { WebRootPath = distPath };

            var builder = WebApplication.CreateBuilder(options);
            builder.WebHost.UseUrls($"http://0.0.0.0:{_config.Port}");

            // Which peers may speak for clients via X-Forwarded-For
            // (plans/auth-ip-filter.md §1). Must happen before any request.
            ClientIp.Configure(_config);
            builder.Logging.ClearProviders();

            // Shared singletons -- every module can inject these.
            builder.Services.AddSingleton(_config);
            builder.Services.AddSingleton(_logger);
            builder.Services.AddSingleton(_callLog);
            // Pre-built so the WinForms UI and the API share one instance.
            builder.Services.AddSingleton(_repositories);
            builder.Services.AddSingleton(_ipAllowlist);
            // Pre-built so the WinForms host (the ONLY surface that can flip it) and
            // the API share one instance (plans/loop-autopilot-safety.md).
            builder.Services.AddSingleton(_autopilotGate);
            // Harness-provided Understanding app (plans/multiple-local-apps.md Slice 2).
            builder.Services.AddSingleton<Understanding.UnderstandingApp>();
            // Harness-provided Agentic Engineering Lab app (plans/agentic-lab.md).
            builder.Services.AddSingleton<Understanding.LabApp>();

            // Controllers auto-discovered here -- new controllers need NO changes.
            builder.Services.AddControllers();

            // HttpClient for the Local-tab reverse proxy (plans/local-app-proxy.md).
            builder.Services.AddHttpClient("localview", c => c.Timeout = TimeSpan.FromSeconds(100));
            // Short-timeout client for the Exposure check probes (plans/product-onboarding.md).
            builder.Services.AddHttpClient("expose", c => c.Timeout = TimeSpan.FromSeconds(4));

            // CORS allow-all for the React dev-server proxy.
            builder.Services.AddCors(options =>
                options.AddDefaultPolicy(p => p
                    .AllowAnyOrigin()
                    .AllowAnyHeader()
                    .AllowAnyMethod()));

            // === MODULE SERVICE REGISTRATION (orchestrator wires these between phases) ===
            builder.Services.AddIpFilterModule(); // IP allowlist (plans/auth-ip-filter.md)
            builder.Services.AddAuthModule();   // session login (plans/auth-login.md)
            builder.Services.AddRepositoryModule(); // multi-repo (resolver + HttpContext)
            builder.Services.AddChatModule();   // M1
            builder.Services.AddFileModule();   // M2
            builder.Services.AddGitModule();    // M3
            builder.Services.AddDockModule();   // dock sync (plans/dock-sync.md)
            builder.Services.AddScreenModule(); // screen tab (plans/screen-tab.md)
            builder.Services.AddTerminalModule(); // terminal tab (plans/terminal-tab.md)
            builder.Services.AddSettingsModule(); // UI settings (plans/settings-tab.md)
            builder.Services.AddNotesModule();  // per-project ideas (plans/ideas-tab.md)
            builder.Services.AddArchPlanModule(); // architectural-plan doc (plans/ideas-arch-plan.md)
            builder.Services.AddPinsModule();   // per-project Files pins (plans/plan-files-merge.md)
            builder.Services.AddPromptsModule(); // user-defined composer prompts (plans/custom-prompts.md)
            builder.Services.AddPromptPlansModule(); // user-defined prompt plans (plans/prompt-plans.md)
            builder.Services.AddPromptNotesModule(); // user-defined prompt notes — ⚙ pop-up Notes tab (openspec add-prompt-notes-tab)
            builder.Services.AddDeployModule(); // deployments tab (plans/deployments-tab.md)
            builder.Services.AddExposeModule(); // exposure check (plans/product-onboarding.md)
            builder.Services.AddAnalyticsModule(); // scoreboard (plans/scoreboard-analytics.md)
            builder.Services.AddAutopilotModule(); // loop-autopilot discovery (plans/loop-autopilot.md)
            builder.Services.AddTaskGraphModule(); // task dependency graph (plans/task-dependency-graph.md)
            builder.Services.AddStructuredAskModule(); // discover local apps (openspec discover-local-apps)
            // === END MODULE SERVICE REGISTRATION ===

            _app = builder.Build();

            // IP allowlist gate — the OUTERMOST check, before even static
            // files: an unapproved IP never receives the SPA shell or the
            // login screen, only a standalone rejection page. No exemptions
            // (plans/auth-ip-filter.md).
            _app.UseMiddleware<IpFilterMiddleware>();

            // Pipeline order matters. Static files MUST run before routing:
            // StaticFileMiddleware skips serving once an endpoint is selected,
            // and WebApplication auto-inserts UseRouting at the start of the
            // pipeline unless we call it explicitly. Without this, the catch-all
            // SPA fallback endpoint is matched for /assets/*.js BEFORE static
            // files run, so assets were served as index.html (text/html) and
            // module scripts broke in the browser. Serving static files first
            // (and before auth -- assets need no password) fixes it. Both the
            // static middleware and the fallback share ONE explicit
            // PhysicalFileProvider rooted at client/dist to avoid any web-root
            // ambiguity.
            IFileProvider? distProvider = distPath != null ? new PhysicalFileProvider(distPath) : null;
            ConfigureStaticFiles(_app, distPath, distProvider);

            // Prevent caching of index.html so redeployments are picked up
            // immediately by browsers and the ARR proxy.
            _app.Use(async (context, next) =>
            {
                context.Response.OnStarting(() =>
                {
                    var path = context.Request.Path.Value ?? "";
                    if (context.Response.ContentType?.Contains("text/html") == true
                        && !path.StartsWith("/api/"))
                    {
                        context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
                    }
                    return Task.CompletedTask;
                });
                await next();
            });

            _app.UseRouting();

            _app.UseCors();

            // Auth gate for /api/* — session cookie or X-Auth-Password header
            // (plans/auth-login.md). Health + static assets already served
            // above, so they never reach this. Deps resolve from DI.
            _app.UseMiddleware<PasswordAuthMiddleware>();

            _app.MapControllers();

            // SPA fallback: any non-API, non-file route serves the React shell
            // from the same provider as the static files. Excludes /api/* so
            // unknown API routes return a real 404 instead of HTML.
            if (distProvider != null)
                _app.MapFallbackToFile("{*path:regex(^(?!api/).*$)}", "index.html",
                    new StaticFileOptions { FileProvider = distProvider, OnPrepareResponse = SetSpaCacheHeaders });

            IsRunning = true;
            _logger.Info($"[SERVER] Kestrel running on http://0.0.0.0:{_config.Port}");
            _logger.Info($"[SERVER] Health: GET /api/health (no auth)  |  /api/* requires password");

            _app.Run();
        }
        catch (Exception ex)
        {
            IsRunning = false;
            _logger.Error($"[SERVER] Failed to start: {ex.Message}");
        }
    }

    /// <summary>
    /// Serves the built React app from client/dist when present. The folder
    /// won't exist until the frontend is built; we degrade gracefully so the
    /// API still runs (the SPA fallback simply won't find index.html).
    /// </summary>
    private void ConfigureStaticFiles(WebApplication app, string? distPath, IFileProvider? distProvider)
    {
        if (distProvider == null)
        {
            _logger.Info("[SERVER] client/dist not found -- serving API only (build the frontend to enable the app shell)");
            return;
        }

        // Explicit provider so static files resolve from client/dist regardless
        // of the host's implicit web root.
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = distProvider });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = distProvider, OnPrepareResponse = SetSpaCacheHeaders });
        _logger.Info($"[SERVER] Serving static files from {distPath}");
    }

    /// <summary>
    /// Cache policy that kills stale-SPA-shell bugs (an open tab/proxy keeping the
    /// OLD index.html, which pins OLD hashed asset names → "the deploy didn't ship").
    /// index.html and version.json are served <c>no-store</c> so every reload
    /// revalidates and picks up the new asset hashes; the content-hashed
    /// <c>/assets/*</c> files are immutable (the hash changes when content does), so
    /// they cache for a year. Other files (icons, manifest) keep the default.
    /// </summary>
    internal static void SetSpaCacheHeaders(StaticFileResponseContext ctx)
    {
        var name = ctx.File.Name;
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        if (string.Equals(name, "index.html", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(name, "version.json", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            ctx.Context.Response.Headers["Pragma"] = "no-cache";
            ctx.Context.Response.Headers["Expires"] = "0";
        }
        else if (path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
        }
    }

    /// <summary>
    /// Finds client/dist relative to either the build output or the repo
    /// source tree, so it works whether run from bin/ or via `dotnet run`.
    /// </summary>
    private static string? ResolveDistPath()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "client", "dist"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "client", "dist")),
        };
        return candidates.FirstOrDefault(Directory.Exists);
    }

    public void Stop()
    {
        try { _app?.StopAsync().Wait(TimeSpan.FromSeconds(3)); } catch { }
        IsRunning = false;
    }
}
