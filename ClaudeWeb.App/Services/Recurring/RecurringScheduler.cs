using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Recurring;

/// <summary>The clock of recurring tasks (openspec recurring-tasks): ticks the engine on the
/// loop engine's cadence. Yields before its first pass — a hosted service that works before
/// its first await holds Kestrel off the network (openspec verifier-startup-yield).</summary>
public sealed class RecurringScheduler : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private readonly RecurringEngine _engine;
    private readonly Logger _logger;

    public RecurringScheduler(RecurringEngine engine, Logger logger) { _engine = engine; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); } catch (OperationCanceledException) { return; }
        _logger.Info("[RECURRING] scheduler running (10 s tick; each due occurrence arms the assignee's goal loop)");
        while (!stoppingToken.IsCancellationRequested)
        {
            try { _engine.Tick(); }
            catch (Exception ex) { _logger.Error($"[RECURRING] tick failed: {ex.Message}"); }
            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { return; }
        }
    }
}

public static class RecurringModuleExtensions
{
    public static IServiceCollection AddRecurringModule(this IServiceCollection services)
    {
        services.AddSingleton<RecurringTaskStore>(sp => new RecurringTaskStore(sp.GetRequiredService<Logger>()));
        services.AddSingleton<RecurringRunLog>(sp => new RecurringRunLog(sp.GetRequiredService<Logger>()));
        services.AddSingleton<IRecurringPort>(sp => sp.GetRequiredService<Arch.ArchAgentService>());
        services.AddSingleton<RecurringEngine>(sp =>
        {
            var gate = sp.GetRequiredService<AutopilotGate>();
            var feed = sp.GetRequiredService<HarnessEventFeed>();
            return new RecurringEngine(sp.GetRequiredService<RecurringTaskStore>(), sp.GetRequiredService<RecurringRunLog>(),
                sp.GetRequiredService<IRecurringPort>(), () => gate.Enabled,
                publish: (type, source, data) => feed.Publish(type, source, data), logger: sp.GetRequiredService<Logger>());
        });
        services.AddHostedService<RecurringScheduler>();
        return services;
    }
}
