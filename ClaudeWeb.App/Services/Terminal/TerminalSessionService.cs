using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Hosting;

namespace ClaudeWeb.Services.Terminal;

/// <summary>
/// Registry of terminal sessions, several per repo since
/// plans/terminal-sessions.md (keyed repoId + termId, like dock tabs).
/// Sessions are created on demand, survive client disconnects, and die only
/// on explicit kill, shell exit, or app shutdown. Dead sessions are swept
/// from the registry on List/Ensure so the cap counts live shells only.
/// </summary>
public class TerminalSessionService
{
    /// <summary>Live shells per repo. A rejection, not an eviction: forgotten
    /// shells should be killed deliberately, never silently.</summary>
    public const int MaxPerRepo = 5;

    private readonly object _gate = new();
    private readonly Dictionary<string, Dictionary<string, TerminalSession>> _byRepo = new();
    private readonly Logger _logger;
    private int _counter;

    public TerminalSessionService(Logger logger, IHostApplicationLifetime lifetime)
    {
        _logger = logger;
        lifetime.ApplicationStopping.Register(KillAll);
    }

    /// <summary>
    /// Returns the requested live session (by termId), or starts a new one.
    /// Throws InvalidOperationException when the repo is at the live-shell cap.
    /// </summary>
    public TerminalSession Ensure(string repoId, string? termId, string? label,
        string workingDirectory, short cols, short rows, string? resumeSessionId = null)
    {
        lock (_gate)
        {
            var repo = _byRepo.TryGetValue(repoId, out var r) ? r : _byRepo[repoId] = new();
            Sweep(repo);

            if (termId is not null && repo.TryGetValue(termId, out var existing))
                return existing;

            if (repo.Count >= MaxPerRepo)
                throw new InvalidOperationException(
                    $"This project already has {MaxPerRepo} live terminals. Kill one first.");

            var id = termId ?? Guid.NewGuid().ToString("N");
            var name = string.IsNullOrWhiteSpace(label) ? $"Terminal {++_counter}" : label!.Trim();
            _logger.Info($"[TERM] Starting PowerShell \"{name}\" ({cols}x{rows}) for repo {repoId}" +
                         (resumeSessionId is null ? "" : $", resuming claude session {resumeSessionId}"));
            var session = new TerminalSession(repoId, id, name, workingDirectory, cols, rows, _logger, resumeSessionId);
            repo[id] = session;
            return session;
        }
    }

    public TerminalSession? Get(string repoId, string termId)
    {
        lock (_gate)
            return _byRepo.TryGetValue(repoId, out var repo) ? repo.GetValueOrDefault(termId) : null;
    }

    /// <summary>Live sessions for one repo, oldest first.</summary>
    public List<TerminalSession> List(string repoId)
    {
        lock (_gate)
        {
            if (!_byRepo.TryGetValue(repoId, out var repo)) return new();
            Sweep(repo);
            return repo.Values.OrderBy(s => s.CreatedAt).ToList();
        }
    }

    public bool Kill(string repoId, string termId)
    {
        lock (_gate)
        {
            if (!_byRepo.TryGetValue(repoId, out var repo) || !repo.Remove(termId, out var session))
                return false;
            _logger.Info($"[TERM] Killing terminal \"{session.Label}\" for repo {repoId}");
            session.Dispose();
            return true;
        }
    }

    /// <summary>Drops sessions whose shell already exited (user typed `exit`,
    /// process crashed) so they stop occupying cap slots. Callers hold _gate.</summary>
    private void Sweep(Dictionary<string, TerminalSession> repo)
    {
        foreach (var dead in repo.Where(kv => !kv.Value.IsRunning).Select(kv => kv.Key).ToList())
        {
            repo[dead].Dispose();
            repo.Remove(dead);
        }
    }

    private void KillAll()
    {
        lock (_gate)
        {
            foreach (var repo in _byRepo.Values)
                foreach (var s in repo.Values) s.Dispose();
            _byRepo.Clear();
        }
    }
}
