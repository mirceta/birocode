using ClaudeWeb.Services.StructuredAsk;

namespace ClaudeWeb.Services.Agents;

/// <summary>The runtime side of a repo agent's local apps: is a port live, launch a command
/// detached in a folder, stop whatever listens on a port. <see cref="RunnerOps"/> binds it to
/// the harness's <see cref="LocalAppRunner"/> with the Local Apps panel's guards; tests fake it.</summary>
public interface ILocalAppOps
{
    bool IsListening(int port);
    /// <summary>Launch detached; returns the pid, or an error.</summary>
    (int? Pid, string? Error) Launch(string startCommand, string folder);
    /// <summary>Stop the listener's process tree, with the harness's self-guard; returns the pid ended, or an error.</summary>
    (int? Pid, string? Error) Stop(int port);
    bool WaitForPortFree(int port, TimeSpan timeout);
}

/// <summary>The harness's own runner behind <see cref="ILocalAppOps"/> (openspec
/// local-app-lifecycle-controls): the same launch, the same live PID resolution, the same
/// structural refusal to end the harness or anything hosting it.</summary>
public sealed class RunnerOps : ILocalAppOps
{
    private readonly LocalAppRunner _runner;
    public RunnerOps(LocalAppRunner runner) { _runner = runner; }
    public bool IsListening(int port) => _runner.IsListening(port);
    public (int? Pid, string? Error) Launch(string startCommand, string folder)
    {
        try { return (_runner.Launch(startCommand, folder).Id, null); }
        catch (Exception ex) { return (null, ex.Message); }
    }
    public (int? Pid, string? Error) Stop(int port)
    {
        if (!_runner.IsListening(port)) return (null, $"nothing is listening on :{port}");
        var pid = _runner.ResolveListenerPid(port);
        if (pid is null) return (null, $"could not resolve the process listening on :{port}");
        if (_runner.ProtectedPids().Contains(pid.Value)) return (null, $"refusing to stop PID {pid} on :{port} — that is the harness itself (or its host process)");
        var (ok, detail) = _runner.KillTree(pid.Value);
        return ok ? (pid, null) : (null, $"taskkill failed for PID {pid}: {detail}");
    }
    public bool WaitForPortFree(int port, TimeSpan timeout) => _runner.WaitForPortFree(port, timeout);
}

public sealed partial class RepoAgentToolbox
{
    /// <summary>
    /// <c>my_local_apps</c> (openspec repo-agent-local-apps): THIS agent's local apps — registered
    /// on the Local tab or discovered in its repo — with name, folder, port and URLs, how to run and
    /// stop each, and whether it is listening right now; and, on the same tool, start / stop /
    /// restart of a discovered app by its cached start command. Read from the registry and the
    /// discovery cache on every call, so a new registration or a fresh scan is the next answer.
    /// </summary>
    public ToolOutcome MyLocalApps(string? repoId, string? action, string? app)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env is null) return new ToolOutcome(false, "unavailable", "my_local_apps is not available on this harness (no environment wired)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var act = (action ?? "list").Trim().ToLowerInvariant();
        var ops = env.LocalAppOps;
        var apps = LocalAppCatalog.Build(repo, env.RegisteredApps(repoId), env.Discovery?.Load(repoId), ops is null ? null : ops.IsListening, env.HarnessPort);

        if (act is "list" or "status")
        {
            var (one, _) = LocalAppCatalog.Resolve(apps, app);
            if (!string.IsNullOrWhiteSpace(app) && one is null)
                return new ToolOutcome(false, "not-found", $"no local app \"{app.Trim()}\" for {repo.Name}; the apps: {LocalAppCatalog.Resolve(apps, null).Candidates}", new { repo = repo.Name, repoId, apps = apps.Select(View).ToList() });
            var shown = one is null ? apps : new[] { one };
            var live = shown.Count(a => a.Running == true);
            var detail = apps.Count == 0
                ? $"{repo.Name} has no local apps: nothing registered on the Local tab and no discovery cached. The Operator registers a port (Local setup form) or runs the Local Apps panel's Discover; you can also document the app and ask them to."
                : one is not null
                    ? $"{one.Name} ({one.Id}): {(one.Running == true ? "listening" : one.Running == false ? "not listening" : "liveness unknown")}{(one.Port > 0 ? $" on :{one.Port}" : "")} — {one.HowToRun}"
                    : $"{apps.Count} local app{(apps.Count == 1 ? "" : "s")} for {repo.Name} ({live} listening): {string.Join(", ", apps.Select(a => $"{a.Name}{(a.Port > 0 ? $" :{a.Port}" : "")}{(a.Registered ? "" : " (unregistered)")}"))}. Each row says its folder, how to run it and its URLs; my_local_apps action start | stop | restart with app = its id, name or port.";
            return new ToolOutcome(true, one is null ? "ok" : (one.Running == true ? "listening" : "not-listening"), detail,
                new { repo = repo.Name, repoId, path = repo.Path, localTab = $"http://127.0.0.1:{env.HarnessPort}/api/localview/{repoId}/", registered = apps.Count(a => a.Registered), discovered = apps.Count(a => a.Discovered), apps = shown.Select(View).ToList() });
        }
        if (act is not ("start" or "stop" or "restart"))
            return new ToolOutcome(false, "error", $"unknown action \"{action}\": list | status | start | stop | restart");
        if (ops is null) return new ToolOutcome(false, "unavailable", $"my_local_apps {act} is not available on this harness (no runner wired)");
        var (target, candidates) = LocalAppCatalog.Resolve(apps, app);
        if (target is null)
            return new ToolOutcome(false, string.IsNullOrWhiteSpace(app) ? "error" : "not-found", string.IsNullOrWhiteSpace(app) ? $"app is required for {act}: an id, a name or a port — {candidates}" : $"no local app \"{app.Trim()}\" for {repo.Name}; the apps: {candidates}");
        if (target.Kind == LocalAppCatalog.KindHarness)
            return new ToolOutcome(false, "always-on", $"{target.Name} is served by the harness itself — nothing to {act}; {target.HowToRun}", View(target));
        var title = $"{char.ToUpperInvariant(act[0]) + act[1..]} · {target.Name} (agent)";

        if (act is "start" or "restart")
        {
            if (target.Folder is null || target.StartCommand is null)
                return new ToolOutcome(false, "no-command", $"cannot {act} {target.Name}: {target.HowToRun}", View(target));
            if (!Directory.Exists(target.Folder))
                return new ToolOutcome(false, "no-folder", $"cannot {act} {target.Name}: its folder {target.Folder} does not exist", View(target));
            if (target.Running == true)
            {
                if (act == "start")
                    return new ToolOutcome(true, "already-listening", $"{target.Name} is already listening on :{target.Port} ({target.Url}); action restart replaces it", View(target));
                var (spid, serr) = ops.Stop(target.Port);
                if (serr is not null) { env.Events?.Invoke(repoId, act, "error", title, serr); return new ToolOutcome(false, "stop-failed", $"restart aborted at the stop phase: {serr}", View(target)); }
                env.Events?.Invoke(repoId, act, "started", title, $"stopped PID {spid} on :{target.Port}; waiting for the port to free…");
                if (!ops.WaitForPortFree(target.Port, TimeSpan.FromSeconds(10)))
                {
                    env.Events?.Invoke(repoId, act, "error", title, $"port :{target.Port} did not free within 10 s — not launching a second instance");
                    return new ToolOutcome(false, "port-busy", $"restart aborted: :{target.Port} did not free within 10 s after stopping PID {spid}", View(target));
                }
            }
            env.Events?.Invoke(repoId, act, "started", title, $"launching \"{target.StartCommand}\" in {target.Folder} (detached)…");
            var (pid, err) = ops.Launch(target.StartCommand, target.Folder);
            if (err is not null) { env.Events?.Invoke(repoId, act, "error", title, err); env.Audit?.Invoke("my_local_apps", repoId, repo.Name, $"{act}-failed"); return new ToolOutcome(false, "launch-failed", $"failed to {act} {target.Name}: {err}", View(target)); }
            env.Events?.Invoke(repoId, act, "done", title, $"launch issued (pid {pid}) — port liveness is read separately");
            env.Audit?.Invoke("my_local_apps", repoId, repo.Name, $"{act} :{target.Port}");
            return new ToolOutcome(true, "launched", $"{target.Name}: launch issued (pid {pid}) in {target.Folder} with \"{target.StartCommand}\"; it should answer at {target.Url} shortly — my_local_apps action status app={target.Id} reads the live port", View(target with { Running = null }));
        }
        // stop
        if (target.Running == false)
            return new ToolOutcome(true, "not-listening", $"{target.Name} is not listening on :{target.Port}; nothing to stop", View(target));
        env.Events?.Invoke(repoId, "stop", "started", title, $"stopping whatever listens on :{target.Port} (process tree)…");
        var (stoppedPid, stopErr) = ops.Stop(target.Port);
        if (stopErr is not null) { env.Events?.Invoke(repoId, "stop", "error", title, stopErr); env.Audit?.Invoke("my_local_apps", repoId, repo.Name, "stop-failed"); return new ToolOutcome(false, "stop-failed", $"could not stop {target.Name}: {stopErr}", View(target)); }
        env.Events?.Invoke(repoId, "stop", "done", title, $"PID {stoppedPid} terminated — port liveness is read separately");
        env.Audit?.Invoke("my_local_apps", repoId, repo.Name, $"stop :{target.Port}");
        return new ToolOutcome(true, "stopped", $"{target.Name}: PID {stoppedPid} on :{target.Port} terminated (with its process tree)", View(target with { Running = null }));
    }

    private static object View(LocalAppCatalog.App a) => new
    {
        id = a.Id, name = a.Name, kind = a.Kind, registered = a.Registered, discovered = a.Discovered,
        port = a.Port > 0 ? a.Port : (int?)null, folder = a.Folder, startCommand = a.StartCommand, buildCommand = a.BuildCommand, evidence = a.Evidence,
        url = a.Url, servedAt = a.ServedAt, running = a.Running, howToRun = a.HowToRun, howToStop = a.HowToStop, discoveredAt = a.DiscoveredAt,
    };
}
