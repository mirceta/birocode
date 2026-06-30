using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Events;

/// <summary>
/// Background loop that drives the <see cref="CollectorService"/> (openspec change
/// add-event-feed-collector). One poll pass over the active sources every interval,
/// independent of any open frontend — this is what makes listening backend-owned and
/// reload-proof. Best-effort: a failed pass is logged and never tears down the host.
/// </summary>
public class CollectorPoller : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(2.5);

    private readonly CollectorService _collector;
    private readonly Logger _logger;

    public CollectorPoller(CollectorService collector, Logger logger)
    {
        _collector = collector;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.Info("[COLLECTOR] poller started");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _collector.PollActiveSourcesAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.Error($"[COLLECTOR] poll pass failed: {ex.Message}");
            }

            try { await Task.Delay(Interval, stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
