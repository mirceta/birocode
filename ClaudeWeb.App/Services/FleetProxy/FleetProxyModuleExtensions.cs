using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.FleetProxy;

/// <summary>
/// DI registration for the fleet proxy (openspec fleet-proxy). The orchestrator wires
/// <c>builder.Services.AddFleetProxyModule()</c> in EmbeddedApi.cs; the middleware goes in
/// OUTERMOST through an <see cref="IStartupFilter"/>, so this module never edits the shared
/// pipeline (plans/INTEGRATION.md).
/// </summary>
public static class FleetProxyModuleExtensions
{
    public const string HttpClientName = "fleet-proxy";

    public static IServiceCollection AddFleetProxyModule(this IServiceCollection services)
    {
        services.AddSingleton<FleetProxyService>();
        // The forwarding leg: never through a proxy itself, no redirects followed, bytes as-is,
        // no cookie jar, no overall timeout (answers may stream); a dead target fails fast.
        services.AddHttpClient(HttpClientName, c => c.Timeout = Timeout.InfiniteTimeSpan)
            .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
            {
                UseProxy = false, AllowAutoRedirect = false, AutomaticDecompression = DecompressionMethods.None,
                UseCookies = false, ConnectTimeout = TimeSpan.FromSeconds(8),
            });
        services.AddTransient<IStartupFilter, FleetProxyStartupFilter>();
        services.AddHostedService<FleetProxyApplier>();
        return services;
    }

    private sealed class FleetProxyStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            app.UseMiddleware<FleetProxyMiddleware>();
            next(app);
        };
    }

    /// <summary>Applies the stored role once the harness starts (client role: outgoing calls + browser).</summary>
    private sealed class FleetProxyApplier(FleetProxyService svc) : IHostedService
    {
        public Task StartAsync(CancellationToken cancellationToken) { svc.Apply(); return Task.CompletedTask; }
        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
