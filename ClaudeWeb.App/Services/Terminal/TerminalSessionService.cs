using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Terminal;

/// <summary>
/// Registry of terminal sessions, one per repo (plans/terminal-tab.md).
/// Sessions are created on demand, survive client disconnects, and die only
/// on explicit kill, shell exit, or app shutdown.
/// </summary>
public class TerminalSessionService
{
    private readonly object _gate = new();
    private readonly Dictionary<string, TerminalSession> _sessions = new();
    private readonly Logger _logger;

    public TerminalSessionService(Logger logger, IHostApplicationLifetime lifetime)
    {
        _logger = logger;
        lifetime.ApplicationStopping.Register(KillAll);
    }

    /// <summary>Returns the repo's live session, starting (or restarting a
    /// dead) one if needed.</summary>
    public TerminalSession Ensure(string repoId, string workingDirectory, short cols, short rows)
    {
        lock (_gate)
        {
            if (_sessions.TryGetValue(repoId, out var existing))
            {
                if (existing.IsRunning) return existing;
                existing.Dispose();
                _sessions.Remove(repoId);
            }
            _logger.Info($"[TERM] Starting PowerShell ({cols}x{rows}) for repo {repoId}");
            var session = new TerminalSession(repoId, workingDirectory, cols, rows, _logger);
            _sessions[repoId] = session;
            return session;
        }
    }

    public TerminalSession? Get(string repoId)
    {
        lock (_gate) return _sessions.GetValueOrDefault(repoId);
    }

    public bool Kill(string repoId)
    {
        lock (_gate)
        {
            if (!_sessions.Remove(repoId, out var session)) return false;
            _logger.Info($"[TERM] Killing terminal for repo {repoId}");
            session.Dispose();
            return true;
        }
    }

    private void KillAll()
    {
        lock (_gate)
        {
            foreach (var s in _sessions.Values) s.Dispose();
            _sessions.Clear();
        }
    }
}
