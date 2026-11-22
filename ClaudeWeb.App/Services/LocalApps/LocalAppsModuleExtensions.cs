using ClaudeWeb.Models;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.LocalApps;

/// <summary>DI for local-app autostart + sentry (fleet task f88f97fe, openspec local-apps-autostart-sentry).</summary>
public static class LocalAppsModuleExtensions
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };

    public static IServiceCollection AddLocalAppsModule(this IServiceCollection services)
    {
        services.AddSingleton(sp => new AutostartStore(sp.GetRequiredService<Logger>()));
        services.AddSingleton(sp => new FleetAutostartStore(sp.GetRequiredService<Logger>()));
        services.AddSingleton(sp =>
        {
            var repos = sp.GetRequiredService<RepositoryRegistry>();
            var logger = sp.GetRequiredService<Logger>();
            var env = new LocalAppSentry.Env
            {
                Repos = () => repos.GetAll().Select(r => new LocalAppSentry.RepoEntry(new RepoFacts(r.Id, r.Name, r.Path, r.Handle), r.LocalApps)).ToList(),
                Discovery = sp.GetRequiredService<LocalAppDiscoveryCache>().Load,
                Ops = new RunnerOps(sp.GetRequiredService<LocalAppRunner>()),
                ProbeHttp = ProbeHttp,
                Now = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Delay = Task.Delay,
                Log = logger.Info,
                Machine = sp.GetRequiredService<CollectorService>().SelfLabel,
                HarnessPort = sp.GetRequiredService<AppConfig>().Port,
                FollowUpCheck = TimeSpan.FromSeconds(20),
            };
            return new LocalAppSentry(env, sp.GetRequiredService<AutostartStore>());
        });
        services.AddSingleton<LocalAppsFleet>(sp => new LocalAppsFleet(sp.GetRequiredService<FleetAutostartStore>(), sp.GetRequiredService<LocalAppSentry>(),
            sp.GetRequiredService<CollectorService>(), sp.GetRequiredService<Arch.FleetClient>(), sp.GetRequiredService<Logger>()));
        services.AddHostedService<LocalAppSentryHost>();
        return services;
    }

    /// <summary>GET the health URL: null when the status is the expected one (or any 2xx/3xx), else why not.</summary>
    internal static async Task<string?> ProbeHttp(string url, int? expect, CancellationToken ct)
    {
        try
        {
            using var resp = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            var code = (int)resp.StatusCode;
            var ok = expect is { } e ? code == e : code is >= 200 and < 400;
            return ok ? null : $"{url} answered HTTP {code}{(expect is { } x ? $" (expected {x})" : "")}";
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested) { return $"{url} timed out (5 s)"; }
        catch (HttpRequestException ex) { return $"{url}: {(ex.InnerException ?? ex).Message}"; }
    }
}

/// <summary>
/// Runs the sentry on this machine: once at harness start (after a short settle delay, so the network and the
/// registry are up — the harness itself is brought up on boot by the ClaudeWebKeepAlive scheduled task), it starts
/// the flagged apps; then every <see cref="SentrySettings.IntervalMin"/> minutes it checks them. The interval is
/// re-read each tick, so a new setting takes effect without a restart.
/// </summary>
public sealed class LocalAppSentryHost : BackgroundService
{
    public static TimeSpan BootDelay = TimeSpan.FromSeconds(
        int.TryParse(Environment.GetEnvironmentVariable("CLAUDEWEB_AUTOSTART_BOOT_DELAY_SEC"), out var s) && s >= 0 ? s : 20);

    private readonly LocalAppSentry _sentry;
    private readonly LocalAppsFleet _fleet;
    private readonly Logger _logger;

    public LocalAppSentryHost(LocalAppSentry sentry, LocalAppsFleet fleet, Logger logger) { _sentry = sentry; _fleet = fleet; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        try { await Task.Delay(BootDelay, stoppingToken); } catch (OperationCanceledException) { return; }
        try
        {
            _fleet.SyncSelf();
            var o = await _sentry.ApplyAsync("boot", stoppingToken);
            _logger.Info($"[AUTOSTART] boot pass done: {o.Flagged} flagged, {o.Up} already up");
        }
        catch (OperationCanceledException) { return; }
        catch (Exception ex) { _logger.Error($"[AUTOSTART] boot pass failed: {ex.Message}"); }

        var next = DateTimeOffset.UtcNow.AddMinutes(_sentry.Store.Get().Settings.IntervalMin);
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken); } catch (OperationCanceledException) { return; }
            var interval = TimeSpan.FromMinutes(_sentry.Store.Get().Settings.IntervalMin);
            if (next > DateTimeOffset.UtcNow + interval) next = DateTimeOffset.UtcNow + interval; // a shorter interval was just set
            if (DateTimeOffset.UtcNow < next) continue;
            next = DateTimeOffset.UtcNow + interval;
            try { await _sentry.CheckAsync("sentry", stoppingToken); }
            catch (OperationCanceledException) { return; }
            catch (Exception ex) { _logger.Error($"[AUTOSTART] sentry pass failed: {ex.Message}"); }
        }
    }
}
