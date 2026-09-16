using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Deploy;

/// <summary>
/// Backs the Deployments tab (plans/deployments-tab.md; openspec deploy-final-no-deadman):
/// surfaces what's live, whether a last-good snapshot exists for a MANUAL rollback, and
/// the deploy history — and lets the operator trigger that rollback on purpose. A deploy
/// that passes swap.ps1's health check is FINAL: nothing is armed afterwards and there is
/// no "keep" step. Reads the append-only <c>deploys.jsonl</c> ledger that the seeded
/// swap.ps1/rollback.ps1 write and the git ancestry of the live commit. The only write is
/// the rollback (run rollback.ps1) — the scripts are seeded on first run by
/// <see cref="DeployScriptProvisioner"/> if missing, so a fresh checkout has them.
///
/// Migration: a build older than this one may have left an armed
/// <c>ClaudeWebAutoRollback</c> timer behind (the retired dead-man switch). It is removed
/// once at startup so the new build is not reverted by a timer nobody wants any more.
/// </summary>
public class DeployService
{
    /// <summary>The scheduled task the retired dead-man switch used to arm.</summary>
    public const string LegacyRollbackTask = "ClaudeWebAutoRollback";

    private readonly AppConfig _config;
    private readonly RepositoryRegistry _registry;
    private readonly Logger _logger;

    public DeployService(AppConfig config, RepositoryRegistry registry, Logger logger)
    {
        _config = config;
        _registry = registry;
        _logger = logger;
        _ = Task.Run(() =>
        {
            try { RetireLegacyAutoRollback(); }
            catch (Exception ex) { _logger.Error($"[DEPLOY] legacy auto-rollback check failed: {ex.Message}"); }
        });
    }

    public sealed record LedgerEntry(string? At, string? Commit, string? Subject, bool? HealthOk, string? Event);
    public sealed record LiveInfo(string? Commit, string? Subject, string? At, bool HealthOk, bool ContainsOriginMain, bool RolledBackSince);
    /// <summary>Whether a human CAN roll back on purpose: the last-good snapshot swap.ps1
    /// captured before the most recent swap, and when it was captured.</summary>
    public sealed record ManualRollbackInfo(bool LastGoodPresent, string? LastGoodAt);
    public sealed record DeployStatus(LiveInfo? Live, ManualRollbackInfo ManualRollback, IReadOnlyList<LedgerEntry> History);

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
        return new DeployStatus(live, GetManualRollback(), history);
    }

    /// <summary>The retired dead-man switch, if an older build left it armed: delete it
    /// and say so once. Deploys are final now, so no timer may revert live. Returns
    /// whether a legacy timer was found.</summary>
    public bool RetireLegacyAutoRollback()
    {
        if (!OperatingSystem.IsWindows()) return false;
        var (_, stdout, _) = Run("powershell",
            $"-NoProfile -Command \"if (Get-ScheduledTask {LegacyRollbackTask} -ErrorAction SilentlyContinue) {{ 'armed' }}\"");
        if (!stdout.Contains("armed", StringComparison.Ordinal)) return false;
        Run("schtasks", $"/Delete /TN {LegacyRollbackTask} /F");
        _logger.Info($"[DEPLOY] legacy auto-rollback timer ({LegacyRollbackTask}) found and retired: deploys are final, nothing needs keeping");
        return true;
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

    private string? SelfRepoPath() => _registry.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;

    private bool ContainsOriginMain(string? commit)
    {
        if (string.IsNullOrWhiteSpace(commit)) return false;
        var repo = SelfRepoPath();
        if (repo is null) return false;
        // exit 0 == origin/main is an ancestor of <commit>
        var (code, _, _) = Run("git", $"-C \"{repo}\" merge-base --is-ancestor origin/main {commit}");
        return code == 0;
    }

    /// <summary>The snapshot the committed swap.ps1 keeps beside the run dir
    /// (<c>.selfdev-build/run-bin.lastgood</c>), the point rollback.ps1 restores.</summary>
    private ManualRollbackInfo GetManualRollback()
    {
        try
        {
            var repo = SelfRepoPath();
            if (repo is null) return new ManualRollbackInfo(false, null);
            var exe = Path.Combine(repo, ".selfdev-build", "run-bin.lastgood", "ClaudeWeb.exe");
            if (!File.Exists(exe)) return new ManualRollbackInfo(false, null);
            return new ManualRollbackInfo(true, File.GetLastWriteTimeUtc(exe).ToString("o"));
        }
        catch { return new ManualRollbackInfo(false, null); }
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
