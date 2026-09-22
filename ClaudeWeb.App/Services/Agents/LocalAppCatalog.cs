using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.StructuredAsk;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// A repo agent's own local apps, as one list (openspec repo-agent-local-apps) — pure, so the
/// join is unit-tested without a registry, a cache or a port probe. Two sources of truth are
/// joined by port:
/// <list type="bullet">
/// <item><b>registered</b> — the repo's local-app list in the repository registry
/// (<c>repositories.json</c>, the Operator's Local setup form): kind <c>repo</c> = a product the
/// agent runs on a loopback port, proxied at <c>/api/localview/&lt;repo&gt;/app/&lt;id&gt;/</c>;
/// kind <c>harness</c> = an always-on app the harness serves itself (Understanding, Goal, and on
/// the self repo the Lab and the events feed) from a folder at the repo root;</item>
/// <item><b>discovered</b> — the repo's discovery cache (the Local Apps panel's scan, or an
/// imported findings file): a folder under the repo, a port, the start and build commands.</item>
/// </list>
/// A registered repo app with a matching discovered port gets its folder and commands from the
/// finding; a discovered app nobody registered is listed too (the agent can still run it), marked
/// unregistered. Running is read live off the port, never from the cache.
/// </summary>
public static class LocalAppCatalog
{
    public const string KindRepo = "repo";
    public const string KindHarness = "harness";

    /// <summary>One app as the agent sees it.</summary>
    public sealed record App(
        string Id, string Name, string Kind, bool Registered, bool Discovered, int Port,
        string? Folder, string? StartCommand, string? BuildCommand, string? Evidence,
        string? Url, string? ServedAt, bool? Running, string HowToRun, string? HowToStop, DateTimeOffset? DiscoveredAt);

    /// <summary>Build the list. <paramref name="isListening"/> answers "is anything on this port
    /// right now" (null = unknown on this harness).</summary>
    public static IReadOnlyList<App> Build(RepoFacts repo, IReadOnlyList<RepositoryRegistry.LocalAppInfo> registered, CachedDiscovery? cached,
        Func<int, bool>? isListening, int harnessPort)
    {
        var findings = cached?.Report.Apps ?? new List<LocalAppFinding>();
        DateTimeOffset? DiscoveredAt(LocalAppFinding f) =>
            cached is null ? null : cached.DiscoveredAtByPort is { } by && by.TryGetValue(f.Port, out var t) ? t : cached.CachedAt;
        string Served(string id) => $"http://127.0.0.1:{harnessPort}/api/localview/{repo.Id}/app/{id}/";
        var apps = new List<App>();
        var usedPorts = new HashSet<int>();
        foreach (var r in registered)
        {
            if (string.Equals(r.Kind, KindHarness, StringComparison.OrdinalIgnoreCase))
            {
                var (folder, how) = HarnessApp(repo, r.Id);
                apps.Add(new App(r.Id, r.Name, KindHarness, true, false, 0, folder, null, null, null, null, Served(r.Id), true, how, null, null));
                continue;
            }
            usedPorts.Add(r.Port);
            var f = findings.FirstOrDefault(x => x.Port == r.Port);
            var abs = f is null ? null : FolderOf(repo, f.Folder);
            var running = isListening?.Invoke(r.Port);
            apps.Add(new App(r.Id, r.Name, KindRepo, true, f is not null, r.Port, abs, Blank(f?.StartCommand), Blank(f?.BuildCommand), Blank(f?.Evidence),
                $"http://127.0.0.1:{r.Port}/", Served(r.Id), running, HowToRun(f, abs, r.Port), f is null ? null : HowToStop(r.Port), f is null ? null : DiscoveredAt(f)));
        }
        foreach (var f in findings)
        {
            if (usedPorts.Contains(f.Port)) continue;
            var abs = FolderOf(repo, f.Folder);
            var running = isListening?.Invoke(f.Port);
            apps.Add(new App($"port-{f.Port}", f.Name, KindRepo, false, true, f.Port, abs, Blank(f.StartCommand), Blank(f.BuildCommand), Blank(f.Evidence),
                $"http://127.0.0.1:{f.Port}/", null, running, HowToRun(f, abs, f.Port), HowToStop(f.Port), DiscoveredAt(f)));
        }
        return apps;
    }

    /// <summary>The app an agent names: a registered id, a discovered name (case-insensitive),
    /// or a port. Null when nothing matches; the second value lists what would have matched.</summary>
    public static (App? App, string Candidates) Resolve(IReadOnlyList<App> apps, string? key)
    {
        var candidates = string.Join(", ", apps.Select(a => a.Port > 0 ? $"{a.Id} ({a.Name}, :{a.Port})" : $"{a.Id} ({a.Name})"));
        if (string.IsNullOrWhiteSpace(key)) return (null, candidates);
        var k = key.Trim().TrimStart(':');
        if (int.TryParse(k, out var port) && apps.FirstOrDefault(a => a.Port == port) is { } byPort) return (byPort, candidates);
        return (apps.FirstOrDefault(a => string.Equals(a.Id, k, StringComparison.OrdinalIgnoreCase))
             ?? apps.FirstOrDefault(a => string.Equals(a.Name, k, StringComparison.OrdinalIgnoreCase)), candidates);
    }

    /// <summary>The absolute folder of a finding (its folder is repo-relative), or null when it
    /// would leave the repo — never a path outside the agent's own checkout.</summary>
    public static string? FolderOf(RepoFacts repo, string? relative)
    {
        if (string.IsNullOrWhiteSpace(relative)) return Path.GetFullPath(repo.Path);
        string full;
        try { full = Path.GetFullPath(Path.Combine(repo.Path, relative.Trim())); } catch { return null; }
        var root = Path.GetFullPath(repo.Path).TrimEnd(Path.DirectorySeparatorChar);
        return full.StartsWith(root, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    private static (string? Folder, string How) HarnessApp(RepoFacts repo, string id) => id switch
    {
        RepositoryRegistry.UnderstandingAppId => (Path.Combine(repo.Path, "understanding-app"),
            $"always on — the harness serves {Path.Combine(repo.Path, "understanding-app", "index.html")} itself; overwrite that file (relative URLs, assets beside it) and reload"),
        RepositoryRegistry.GoalAppId => (Path.Combine(repo.Path, "goal-app"),
            $"always on — the harness serves {Path.Combine(repo.Path, "goal-app")} itself; the record is goal.json there (the dock's Update goal button keeps it current)"),
        RepositoryRegistry.LabAppId => (null, "always on — served by the harness from its own build (the Operator's Agentic Engineering Lab); nothing to start"),
        RepositoryRegistry.EventsAppId => (null, "always on — served by the harness from its own build (the harness event feed viewer); nothing to start"),
        _ => (null, "always on — served by the harness itself; nothing to start"),
    };

    private static string HowToRun(LocalAppFinding? f, string? folder, int port)
    {
        if (f is null) return $"registered on the Local tab at :{port} but never discovered — no folder or start command is known; run the Local Apps panel's Discover (or import findings), or start it yourself the way the project documents";
        if (folder is null) return $"the discovery cache points outside this repo ({f.Folder}) — fix the cache before running it";
        if (string.IsNullOrWhiteSpace(f.StartCommand)) return $"in {folder}: no start command is known (the discovery found it by \"{f.Evidence}\") — run the Local Apps panel's Discover again, or start it the way the project documents";
        var build = string.IsNullOrWhiteSpace(f.BuildCommand) ? "" : $"; build first with: {f.BuildCommand.Trim()}";
        return $"in {folder}: {f.StartCommand.Trim()}{build} — or call my_local_apps action start (the harness launches it detached in that folder)";
    }

    private static string HowToStop(int port) => $"my_local_apps action stop (the harness resolves whatever listens on :{port} and ends its process tree; never the harness itself)";

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
