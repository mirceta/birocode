using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Notes;

/// <summary>
/// One-shot startup migration (openspec ideas-consume-on-promotion): any idea that
/// already has a task graph node pointing at it (node.IdeaId) becomes CONSUMED by
/// that node on first run, so pre-existing promotions leave the Ideas list just like
/// new ones. Idempotent — a later start finds nothing left to do.
///
/// Runs as an IHostedService so it fires once after both boards have loaded from disk
/// (their state is loaded in their constructors, before StartAsync). It only reads the
/// graph's promotion links and writes the notes board; it never mutates the graph.
/// </summary>
public sealed class ConsumedIdeaMigration : IHostedService
{
    private readonly NotesService _notes;
    private readonly TaskGraphService _graph;
    private readonly Logger _logger;

    public ConsumedIdeaMigration(NotesService notes, TaskGraphService graph, Logger logger)
    {
        _notes = notes;
        _graph = graph;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var migrated = _notes.ReconcileConsumed(_graph.IdeaTaskLinks(), now);
            if (migrated > 0) _logger.Info($"[IDEAS] Startup: consumed {migrated} already-promoted idea(s)");
        }
        catch (Exception ex)
        {
            _logger.Error($"[IDEAS] Consumed-idea migration failed: {ex.Message}");
        }
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
