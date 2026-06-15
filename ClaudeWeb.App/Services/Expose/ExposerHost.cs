using System.Net;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ClaudeWeb.Services.Expose;

/// <summary>
/// Serves the bundled Exposure Helper (exposer/) as a genuine local product, so
/// the harness's OWN Local tab finally serves something
/// (plans/serving-model-clarity.md, slice 1). It is the helper AND the proof:
/// to exist it must itself satisfy the embed contract
/// (docs/networking/local-product-guide.md), so it passes its own Exposure
/// check and doubles as the live "done right" reference an agent can copy.
///
/// A second, tiny Kestrel independent of the main harness server, bound
/// loopback dual-stack (127.0.0.1 + [::1]) on <see cref="AppConfig.ExposerPort"/>:
///  - reachable by the same-origin /api/localview proxy and the Exposure check
///    probes (both dial 127.0.0.1 / [::1] server-side),
///  - never exposed on the LAN (loopback only), and
///  - no Windows firewall prompt (loopback binds don't trigger one).
/// The self repo's Local tab falls back to this port when the operator hasn't
/// set one (RepositoryRegistry.SetSelfLocalPortFallback) — a read-time default,
/// never persisted.
/// </summary>
public class ExposerHost
{
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private WebApplication? _app;

    /// <summary>The port actually bound, or null if the host did not start.</summary>
    public int? BoundPort { get; private set; }

    public ExposerHost(AppConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>
    /// Starts the static server. Returns the bound port on success, or null when
    /// the exposer/ folder is missing or the port can't be bound — the harness
    /// keeps running either way; the self repo's Local tab simply shows nothing.
    /// </summary>
    public int? Start()
    {
        var dir = ResolveExposerDir();
        if (dir is null)
        {
            _logger.Info("[EXPOSER] exposer/ not found — self repo serves no local product");
            return null;
        }

        var port = _config.ExposerPort;
        try
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { WebRootPath = dir });
            builder.Logging.ClearProviders();
            builder.WebHost.ConfigureKestrel(k =>
            {
                k.Listen(IPAddress.Loopback, port);     // 127.0.0.1
                k.Listen(IPAddress.IPv6Loopback, port); // [::1] — the dual-stack rule, dogfooded
            });

            var app = builder.Build();
            var provider = new PhysicalFileProvider(dir);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider }); // / -> index.html
            app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });

            // Bind now (Kestrel listens on its own threads) and surface a bind
            // failure synchronously instead of crashing the WinForms app.
            app.StartAsync().GetAwaiter().GetResult();
            _app = app;
            BoundPort = port;
            _logger.Info($"[EXPOSER] Serving exposer/ on loopback :{port} (IPv4+IPv6) from {dir}");
            return port;
        }
        catch (Exception ex)
        {
            _logger.Error($"[EXPOSER] Failed to start on :{port}: {ex.Message}");
            return null;
        }
    }

    public void Stop()
    {
        try { _app?.StopAsync().Wait(TimeSpan.FromSeconds(3)); } catch { }
        BoundPort = null;
    }

    /// <summary>
    /// Locates exposer/ whether running from bin/ (copied next to the exe by the
    /// csproj) or via `dotnet run` from the source tree. Mirrors
    /// EmbeddedApi.ResolveDistPath.
    /// </summary>
    private static string? ResolveExposerDir()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "exposer"),
            Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "exposer")),
        };
        return candidates.FirstOrDefault(d => Directory.Exists(d) && File.Exists(Path.Combine(d, "index.html")));
    }
}
