using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Keeps the arch's agent snapshot warm (openspec hub-perf-arch-state-snapshot): the local
/// agent views — one git state per managed or docked repo, 9–17 git processes each — are
/// computed HERE, every <see cref="Interval"/>, and the Arch tab's state poll and the Fleet
/// Status poll serve the last snapshot in milliseconds instead of walking the repos on the
/// request thread (on the hub that walk took 4–38 s per poll under a dozen pollers).
/// Best-effort: a failed pass is logged and the previous snapshot stays.
/// </summary>
public class AgentSnapshotWorker : BackgroundService
{
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan SlowPass = TimeSpan.FromSeconds(5);

    private readonly ArchAgentService _arch;
    private readonly Logger _logger;

    public AgentSnapshotWorker(ArchAgentService arch, Logger logger)
    {
        _arch = arch;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Off the host's startup thread; ConfigureAwait(false) keeps the loop on the pool
        // whatever synchronization context is ambient (openspec fix-startup-handle-race).
        await Task.Yield();
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // LongRunning: the pass blocks on git for seconds; it must not hold a pool thread.
                var snap = await Task.Factory.StartNew(_arch.RefreshAgentSnapshot, stoppingToken,
                    TaskCreationOptions.LongRunning, TaskScheduler.Default).ConfigureAwait(false);
                if (snap.TookMs > SlowPass.TotalMilliseconds)
                    _logger.Info($"[ARCH] agent snapshot took {snap.TookMs} ms ({snap.Local.Count} local agents)");
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.Error($"[ARCH] agent snapshot pass failed: {ex.Message}");
            }
            try { await Task.Delay(Interval, stoppingToken).ConfigureAwait(false); }
            catch (OperationCanceledException) { break; }
        }
    }
}
