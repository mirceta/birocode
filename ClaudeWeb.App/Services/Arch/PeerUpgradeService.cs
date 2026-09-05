using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Models;
using ClaudeWeb.Services;
using ClaudeWeb.Services.Deploy;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The receiving side of arch-orchestrated peer upgrades (openspec
/// arch-peer-upgrades): on request from a fleet arch (or the operator), bring
/// THIS harness's self repo to a ref (fast-forward only, on that branch, clean
/// tree), carry any template-declared config keys the preserved live
/// appsettings.json lacks, and run the committed <c>swap.ps1</c> detached — with
/// its guard, stage-before-stop and dead-man switch untouched. The swap kills
/// this process; the job file survives it, and the NEW process reconciles on
/// startup: running the target commit → keep (disarm the rollback), anything else
/// → the switch restores last-good exactly as it does for a human deploy.
///
/// One job at a time. Everything is plain git + the same scripts the operator
/// runs by hand; nothing here can deploy a tree that swap.ps1 would refuse.
/// </summary>
public sealed class PeerUpgradeService
{
    public const string StateDeploying = "deploying";
    public const string StateDone = "done";
    public const string StateRolledBack = "rolled-back";
    public const string StateFailed = "failed";
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(25);

    public sealed record Job(string Id, string Ref, string FromCommit, string TargetCommit, string? RequestedBy,
        long StartedAt, string State, string? Detail);

    private readonly RepositoryRegistry _repos;
    private readonly DeployService _deploy;
    private readonly AppConfig _config;
    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Job? _job;

    public PeerUpgradeService(RepositoryRegistry repos, DeployService deploy, AppConfig config, Logger logger)
    {
        _repos = repos;
        _deploy = deploy;
        _config = config;
        _logger = logger;
        _path = Path.Combine(AppPaths.DataDir, "peer-upgrade.json");
        Load();
        // Startup reconcile: if we are the build a pending job asked for, keep it.
        try { Refresh(); }
        catch (Exception ex) { _logger.Error($"[UPGRADE] startup reconcile failed: {ex.Message}"); }
    }

    public Job? Current { get { lock (_gate) return _job; } }

    /// <summary>The short commit this process was built from ("1.0.0+abc…" → "abc…"), or null.</summary>
    public static string? CommitOf(string? version)
    {
        if (string.IsNullOrWhiteSpace(version)) return null;
        var plus = version.IndexOf('+');
        if (plus < 0 || plus == version.Length - 1) return null;
        return version[(plus + 1)..].Trim();
    }

    public static bool SameCommit(string? a, string? b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b)) return false;
        var n = Math.Min(a.Length, b.Length);
        return n >= 7 && string.Equals(a[..n], b[..n], StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Config-key carry (proposal item 5): every top-level key the template
    /// declares and the live file lacks is added with the template's value; keys the
    /// live file already has are never touched. Returns the merged live JSON and the
    /// keys added.</summary>
    public static (string Merged, List<string> Added) MergeMissingKeys(string templateJson, string liveJson)
    {
        var template = JsonNode.Parse(templateJson) as JsonObject ?? new JsonObject();
        var live = JsonNode.Parse(liveJson) as JsonObject ?? new JsonObject();
        var added = new List<string>();
        foreach (var kv in template)
        {
            if (live.ContainsKey(kv.Key)) continue;
            live[kv.Key] = kv.Value?.DeepClone();
            added.Add(kv.Key);
        }
        return (live.ToJsonString(new JsonSerializerOptions { WriteIndented = true }), added);
    }

    /// <summary>Start an upgrade to <paramref name="refName"/> (default main). Answers with
    /// the shared outcome vocabulary: started | busy | not-on-branch | dirty |
    /// pull-failed | current | error.</summary>
    public ArchAgentService.ToolOutcome Start(string? requestedBy, string? refName)
    {
        var branch = string.IsNullOrWhiteSpace(refName) ? "main" : refName.Trim();
        var self = _repos.GetAll().FirstOrDefault(r => r.IsSelf);
        if (self is null || !self.Exists) return new ArchAgentService.ToolOutcome(false, "error", "this harness has no self repo registered");
        lock (_gate)
        {
            if (_job is { State: StateDeploying } j && Age(j) < Window)
                return new ArchAgentService.ToolOutcome(false, "busy", $"an upgrade is already deploying (job {j.Id}, {j.FromCommit[..7]} → {j.TargetCommit[..7]})", j);
        }

        var fetch = Git(self.Path, "fetch origin");
        if (fetch.Code != 0) return new ArchAgentService.ToolOutcome(false, "error", "git fetch failed: " + FirstLine(fetch.Err));
        var head = Git(self.Path, "rev-parse --abbrev-ref HEAD").Out.Trim();
        if (!string.Equals(head, branch, StringComparison.Ordinal))
            return new ArchAgentService.ToolOutcome(false, "not-on-branch", $"{self.Name} is on {head}, not {branch}; the operator must switch it first (nothing was changed)");
        var dirty = Git(self.Path, "status --porcelain --untracked-files=no").Out;
        if (!string.IsNullOrWhiteSpace(dirty))
            return new ArchAgentService.ToolOutcome(false, "dirty", $"{self.Name} has uncommitted changes on {branch}; refusing to pull over them (nothing was changed)");
        var from = Git(self.Path, "rev-parse HEAD").Out.Trim();
        var pull = Git(self.Path, $"pull --ff-only origin {branch}");
        if (pull.Code != 0) return new ArchAgentService.ToolOutcome(false, "pull-failed", "git pull --ff-only failed: " + FirstLine(pull.Err));
        var target = Git(self.Path, "rev-parse HEAD").Out.Trim();
        var running = CommitOf(ArchAgentService.BuildVersion);
        if (SameCommit(running, target))
            return new ArchAgentService.ToolOutcome(false, "current", $"already running {target[..7]} ({branch} is at that commit)");

        var carried = CarryConfigKeys(self.Path);
        var job = new Job(Guid.NewGuid().ToString("N")[..12], branch, from, target, requestedBy, Now(), StateDeploying,
            carried.Count > 0 ? $"carried config keys: {string.Join(", ", carried)}" : null);
        lock (_gate) { _job = job; Save(); }

        try
        {
            LaunchSwapDetached(self.Path);
        }
        catch (Exception ex)
        {
            lock (_gate) { _job = job with { State = StateFailed, Detail = "launch failed: " + ex.Message }; Save(); }
            return new ArchAgentService.ToolOutcome(false, "error", "could not launch the deploy: " + ex.Message, _job);
        }
        _logger.Info($"[UPGRADE] job {job.Id}: {from[..7]} → {target[..7]} on {branch}, requested by {requestedBy ?? "operator"}; swap.ps1 launched detached");
        return new ArchAgentService.ToolOutcome(true, "started", $"upgrade {job.Id} started: {from[..7]} → {target[..7]}; this harness restarts and keeps itself when healthy", job);
    }

    public Job? Status(string? id)
    {
        Refresh();
        var j = Current;
        return j is null || (id is not null && j.Id != id) ? null : j;
    }

    /// <summary>Reconcile the pending job against reality: the running build, the
    /// deploy ledger, and time.</summary>
    public void Refresh()
    {
        Job? j;
        lock (_gate) j = _job;
        if (j is null || j.State != StateDeploying) return;

        var running = CommitOf(ArchAgentService.BuildVersion);
        if (SameCommit(running, j.TargetCommit))
        {
            // We ARE the requested build and we are answering requests: health is real.
            var kept = _deploy.Disarm();
            Set(j with { State = StateDone, Detail = $"running {j.TargetCommit[..7]}; {(kept ? "kept (rollback disarmed)" : "rollback was not armed")}" });
            _logger.Info($"[UPGRADE] job {j.Id} done: running {j.TargetCommit[..7]}, kept");
            return;
        }
        var status = _deploy.GetStatus();
        if (status.Live?.RolledBackSince == true && Age(j) > TimeSpan.FromMinutes(1))
        {
            Set(j with { State = StateRolledBack, Detail = "the dead-man switch restored last-good" });
            return;
        }
        if (DeployLogAborted(j))
        {
            Set(j with { State = StateFailed, Detail = "swap.ps1 aborted (see .claudeweb-deploy/peer-upgrade.log)" });
            return;
        }
        if (Age(j) > Window)
            Set(j with { State = StateRolledBack, Detail = "no healthy restart on the target commit within the window" });
    }

    // ---- internals ---------------------------------------------------------------

    private List<string> CarryConfigKeys(string repoPath)
    {
        try
        {
            var template = Path.Combine(repoPath, "ClaudeWeb.App", "appsettings.json");
            var live = Path.Combine(repoPath, ".selfdev-build", "run-bin", "appsettings.json");
            if (!File.Exists(template) || !File.Exists(live)) return new List<string>();
            var (merged, added) = MergeMissingKeys(File.ReadAllText(template), File.ReadAllText(live));
            if (added.Count > 0)
            {
                File.WriteAllText(live, merged);
                _logger.Info($"[UPGRADE] carried missing config keys into live appsettings.json: {string.Join(", ", added)}");
            }
            return added;
        }
        catch (Exception ex)
        {
            _logger.Error($"[UPGRADE] config-key carry failed (continuing): {ex.Message}");
            return new List<string>();
        }
    }

    /// <summary>The same detached launch the operator's agent uses: a one-shot scheduled
    /// task running a cmd launcher (cmd-level redirection survives the harness restart
    /// that swap.ps1 performs), deleted shortly after it fires.</summary>
    private void LaunchSwapDetached(string repoPath)
    {
        var dir = Path.Combine(repoPath, ".claudeweb-deploy");
        Directory.CreateDirectory(dir);
        var launcher = Path.Combine(dir, "peer-upgrade-launch.cmd");
        File.WriteAllText(launcher,
            "@echo off\r\n" +
            $"cd /d \"{repoPath}\"\r\n" +
            "set RunAnalyzers=false\r\n" +
            $"powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\\swap.ps1 -Port {_config.Port} > .claudeweb-deploy\\peer-upgrade.log 2>&1\r\n");
        const string task = "ClaudeWebPeerUpgrade";
        Run("schtasks", $"/Delete /TN {task} /F");
        var create = Run("schtasks", $"/Create /TN {task} /SC ONCE /ST 23:59 /TR \"cmd.exe /c \\\"{launcher}\\\"\" /RL HIGHEST /F");
        if (create.Code != 0) throw new InvalidOperationException("schtasks create: " + FirstLine(create.Err + create.Out));
        var run = Run("schtasks", $"/Run /TN {task}");
        if (run.Code != 0) throw new InvalidOperationException("schtasks run: " + FirstLine(run.Err + run.Out));
        // The task instance keeps running after the definition is deleted; never leave
        // a 23:59 trigger behind (an unattended deploy fired that way once).
        _ = Task.Run(async () => { await Task.Delay(TimeSpan.FromSeconds(20)); Run("schtasks", $"/Delete /TN {task} /F"); });
    }

    private bool DeployLogAborted(Job j)
    {
        try
        {
            var self = _repos.GetAll().FirstOrDefault(r => r.IsSelf);
            if (self is null) return false;
            var log = Path.Combine(self.Path, ".claudeweb-deploy", "peer-upgrade.log");
            if (!File.Exists(log) || File.GetLastWriteTimeUtc(log) < DateTimeOffset.FromUnixTimeMilliseconds(j.StartedAt).UtcDateTime) return false;
            using var fs = new FileStream(log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var sr = new StreamReader(fs);
            return sr.ReadToEnd().Contains("ABORT", StringComparison.Ordinal);
        }
        catch { return false; }
    }

    private void Set(Job j) { lock (_gate) { _job = j; Save(); } }
    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private static TimeSpan Age(Job j) => TimeSpan.FromMilliseconds(Math.Max(0, Now() - j.StartedAt));
    private static string FirstLine(string s) => (s ?? "").Split('\n').FirstOrDefault(l => !string.IsNullOrWhiteSpace(l))?.Trim() ?? "";

    private static (int Code, string Out, string Err) Git(string cwd, string args) => Run("git", args, cwd);

    private static (int Code, string Out, string Err) Run(string file, string args, string? cwd = null)
    {
        var psi = new ProcessStartInfo(file, args)
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true,
        };
        if (cwd is not null) psi.WorkingDirectory = cwd;
        using var p = Process.Start(psi)!;
        var o = p.StandardOutput.ReadToEnd();
        var e = p.StandardError.ReadToEnd();
        p.WaitForExit(120_000);
        return (p.ExitCode, o, e);
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            _job = JsonSerializer.Deserialize<Job>(File.ReadAllText(_path));
        }
        catch (Exception ex) { _logger.Error($"[UPGRADE] failed to load {_path}: {ex.Message}"); }
    }

    private void Save()
    {
        try { File.WriteAllText(_path, JsonSerializer.Serialize(_job, new JsonSerializerOptions { WriteIndented = true })); }
        catch (Exception ex) { _logger.Error($"[UPGRADE] failed to save {_path}: {ex.Message}"); }
    }
}
