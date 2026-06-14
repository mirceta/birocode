using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Deploy;

/// <summary>
/// Backs the Deployments tab, slice 1 (plans/deployments-tab.md): surfaces
/// what's live, the armed-rollback state, and deploy history — and lets the
/// operator disarm ("Keep it") or trigger a rollback. Reads the append-only
/// <c>deploys.jsonl</c> ledger that swap.ps1/rollback.ps1 write, the git
/// ancestry of the live commit, and the <c>ClaudeWebAutoRollback</c> scheduled
/// task. The only writes are disarm (delete the task) and rollback (run
/// rollback.ps1) — both already exist as scripts.
/// </summary>
public class DeployService
{
    private const string TaskName = "ClaudeWebAutoRollback";

    private readonly AppConfig _config;
    private readonly RepositoryRegistry _registry;
    private readonly Logger _logger;

    public DeployService(AppConfig config, RepositoryRegistry registry, Logger logger)
    {
        _config = config;
        _registry = registry;
        _logger = logger;
    }

    public sealed record LedgerEntry(string? At, string? Commit, string? Subject, bool? HealthOk, string? Event);
    public sealed record LiveInfo(string? Commit, string? Subject, string? At, bool HealthOk, bool ContainsOriginMain, bool RolledBackSince);
    public sealed record RollbackInfo(bool Armed, string? FiresAt, int SecondsLeft);
    public sealed record DeployStatus(LiveInfo? Live, RollbackInfo Rollback, IReadOnlyList<LedgerEntry> History);

    private string LedgerPath => Path.Combine(_config.DeployScriptsDir, "deploys.jsonl");

    public DeployStatus GetStatus()
    {
        var entries = ReadLedger();
        var deploys = entries.Where(e => e.Event == "deploy").ToList();
        var latest = deploys.LastOrDefault();

        LiveInfo? live = null;
        if (latest is not null)
        {
            // Any rollback recorded after the latest deploy means live was reverted.
            var idx = entries.FindLastIndex(e => e.Event == "deploy");
            var rolledBackSince = entries.Skip(idx + 1).Any(e => e.Event == "rollback");
            live = new LiveInfo(
                latest.Commit, latest.Subject, latest.At, latest.HealthOk ?? false,
                ContainsOriginMain(latest.Commit), rolledBackSince);
        }

        // Newest first, capped.
        var history = ((IEnumerable<LedgerEntry>)entries).Reverse().Take(20).ToList();
        return new DeployStatus(live, GetRollback(), history);
    }

    public bool Disarm()
    {
        // "Keep it" means "ensure no rollback fires" — so success is defined by
        // the END STATE (no armed task), not schtasks's exit code, which returns
        // non-zero when the task is already absent (a harmless, common case).
        Run("schtasks", $"/Delete /TN {TaskName} /F");
        var stillArmed = GetRollback().Armed;
        _logger.Info($"[DEPLOY] Disarm rollback (Keep it) -> armed now: {stillArmed}");
        return !stillArmed;
    }

    public sealed record PullMainResult(bool Deploying, string? MainCommit, string? Error);

    /// <summary>
    /// Pull-main-redeploy slice 1 (plans/pull-main-redeploy.md), option (A):
    /// redeploy live from the latest origin/main, leaving the current branch
    /// checkout untouched. Pre-flights synchronously (fetch + resolve
    /// origin/main) so a bad state fails fast with a clear message, then fires
    /// scripts/deploy-main.ps1 DETACHED — it restarts the harness, so it must
    /// outlive this request (same pattern as <see cref="TriggerRollback"/>).
    /// </summary>
    public PullMainResult PullMainRedeploy(bool noSwap = false)
    {
        var repo = _registry.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;
        if (string.IsNullOrWhiteSpace(repo))
            return new PullMainResult(false, null, "No self repository is registered.");

        var (fc, _, fe) = Run("git", $"-C \"{repo}\" fetch origin");
        if (fc != 0)
            return new PullMainResult(false, null, $"git fetch origin failed: {fe.Trim()}");
        var (rc, sha, re) = Run("git", $"-C \"{repo}\" rev-parse origin/main");
        if (rc != 0)
            return new PullMainResult(false, null, $"origin/main not found: {re.Trim()}");
        var commit = sha.Trim();

        var script = Path.Combine(repo, "scripts", "deploy-main.ps1");
        if (!File.Exists(script))
            return new PullMainResult(false, commit, $"Deploy script missing: {script}");

        var psi = new ProcessStartInfo
        {
            FileName = "powershell",
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-ExecutionPolicy");
        psi.ArgumentList.Add("Bypass");
        psi.ArgumentList.Add("-File");
        psi.ArgumentList.Add(script);
        psi.ArgumentList.Add("-RepoPath");
        psi.ArgumentList.Add(repo);
        if (noSwap) psi.ArgumentList.Add("-NoSwap");
        Process.Start(psi);

        _logger.Info($"[DEPLOY] pull-main redeploy triggered (origin/main {commit[..Math.Min(7, commit.Length)]}, noSwap={noSwap}, detached)");
        return new PullMainResult(true, commit, null);
    }

    public void TriggerRollback()
    {
        // Detached: rollback.ps1 stops the harness, so it must outlive this request.
        var script = Path.Combine(_config.DeployScriptsDir, "rollback.ps1");
        var psi = new ProcessStartInfo
        {
            FileName = "powershell",
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        psi.ArgumentList.Add("-ExecutionPolicy");
        psi.ArgumentList.Add("Bypass");
        psi.ArgumentList.Add("-Command");
        psi.ArgumentList.Add($"Start-Sleep 2; & '{script}'");
        Process.Start(psi);
        _logger.Info("[DEPLOY] Manual rollback triggered (detached)");
    }

    // --- internals -------------------------------------------------------

    private List<LedgerEntry> ReadLedger()
    {
        var list = new List<LedgerEntry>();
        try
        {
            if (!File.Exists(LedgerPath)) return list;
            foreach (var raw in File.ReadAllLines(LedgerPath))
            {
                var line = raw.Trim().TrimStart('﻿');
                if (line.Length == 0) continue;
                try { list.Add(JsonSerializer.Deserialize<LedgerEntry>(line, JsonOpts)!); }
                catch { /* skip a malformed line rather than fail the whole tab */ }
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[DEPLOY] Failed to read ledger {LedgerPath}: {ex.Message}");
        }
        return list;
    }

    private static readonly JsonSerializerOptions JsonOpts =
        new() { PropertyNameCaseInsensitive = true };

    private bool ContainsOriginMain(string? commit)
    {
        if (string.IsNullOrWhiteSpace(commit)) return false;
        var repo = _registry.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;
        if (repo is null) return false;
        // exit 0 == origin/main is an ancestor of <commit>
        var (code, _, _) = Run("git", $"-C \"{repo}\" merge-base --is-ancestor origin/main {commit}");
        return code == 0;
    }

    private RollbackInfo GetRollback()
    {
        // PowerShell gives a real DateTime (ISO 8601) — schtasks /query's locale
        // string is what burned arm.ps1 before (dd.MM vs MM/dd). Empty == not armed.
        var (_, stdout, _) = Run("powershell",
            "-NoProfile -Command \"$t = Get-ScheduledTask ClaudeWebAutoRollback -ErrorAction SilentlyContinue; " +
            "if ($t) { ($t | Get-ScheduledTaskInfo).NextRunTime.ToString('o') }\"");
        var iso = stdout.Trim();
        if (string.IsNullOrEmpty(iso) || !DateTimeOffset.TryParse(iso, out var firesAt))
            return new RollbackInfo(false, null, 0);
        var secs = (int)Math.Max(0, (firesAt - DateTimeOffset.Now).TotalSeconds);
        return new RollbackInfo(true, firesAt.ToString("o"), secs);
    }

    private static (int Code, string Out, string Err) Run(string file, string args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = file,
            Arguments = args,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
        };
        using var p = Process.Start(psi)!;
        var so = p.StandardOutput.ReadToEnd();
        var se = p.StandardError.ReadToEnd();
        p.WaitForExit();
        return (p.ExitCode, so, se);
    }
}
