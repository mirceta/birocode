using System.Diagnostics;
using System.Text;
using static ClaudeWeb.Services.Chat.ChromePreflightRules;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Repair (openspec chrome-readiness-preflight): what the harness does by itself so a browser
/// turn finds a working browser, and what it hands to the Operator with the right page open.
///
/// Verified on the hub against the real Chrome and extension 1.0.98:
///  - with the extension's local host stopped, an agent turn still got through over the
///    extension's cloud connection — but the extension does NOT restart the host by itself;
///  - opening the extension's own reconnect address (<see cref="ReconnectUrl"/>) in the profile
///    that has it made the extension re-dial: the pipe was back within a second, and the tab
///    closed itself;
///  - with the native-messaging registry value deleted, one <c>--chrome</c> CLI run rewrote it.
///
/// Three triggers, no timer: before every browser turn, when a real agent browser call reports
/// a connection failure, and the Repair button. A reconnect is only ever sent when something is
/// actually wrong — it makes the extension drop and re-dial, which would interrupt a healthy
/// session. Chrome is never restarted and nothing inside it is changed by the harness.
/// </summary>
public partial class ChromePreflightService
{
    public sealed record RepairEvent(long At, string Trigger, string Action, bool Ok, string Detail);

    public static readonly TimeSpan ReconnectDebounce = TimeSpan.FromSeconds(20);
    private static readonly TimeSpan PipeWait = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan PipeWaitColdStart = TimeSpan.FromSeconds(25);
    private const int RepairLogMax = 20;

    private readonly List<RepairEvent> _repairs = new();
    private bool _repairRunning;
    private long _lastReconnectAt;

    private void Log(string trigger, string action, bool ok, string detail)
    {
        lock (_lock)
        {
            _repairs.Add(new RepairEvent(Now(), trigger, action, ok, detail));
            if (_repairs.Count > RepairLogMax) _repairs.RemoveRange(0, _repairs.Count - RepairLogMax);
        }
        _logger.Info($"[CHROME] repair ({trigger}) {action}: {(ok ? "ok" : "FAILED")} — {detail}");
    }

    private static bool PipeUp()
    {
        try
        {
            var name = BridgePipeName(Environment.UserName);
            return Directory.GetFiles(@"\\.\pipe\").Any(p => p.EndsWith("\\" + name, StringComparison.OrdinalIgnoreCase));
        }
        catch { return false; }
    }

    // The one primitive: an address opened in the Operator's own Chrome, in a chosen profile.
    // Chrome hands it to the running browser (a new tab) or starts the browser when it is closed.
    private static (bool Ok, string Detail) OpenInChrome(string? chromePath, string? profileDir, string url)
    {
        if (chromePath is null || !File.Exists(chromePath)) return (false, "Chrome is not installed");
        try
        {
            var psi = new ProcessStartInfo { FileName = chromePath, UseShellExecute = false, CreateNoWindow = true };
            if (!string.IsNullOrEmpty(profileDir)) psi.ArgumentList.Add($"--profile-directory={profileDir}");
            psi.ArgumentList.Add(url);
            using var p = Process.Start(psi);
            return (p is not null, p is null ? "Chrome did not start" : "opened");
        }
        catch (Exception ex) { return (false, ex.Message); }
    }

    private static string ProfileLabel(StaticFacts s, string? dir) =>
        s.Profiles.FirstOrDefault(p => p.Dir == dir) is { } p ? $"\"{p.Name}\"" : "the default profile";

    /// <summary>Ask the extension to re-dial (and start Chrome when it is closed), then wait
    /// for the local host's pipe. Debounced: a reconnect drops the extension's connections for
    /// a moment, so it is never repeated in a burst.</summary>
    private bool Reconnect(StaticFacts s, string trigger)
    {
        var now = Now();
        lock (_lock)
        {
            if (now - _lastReconnectAt < ReconnectDebounce.TotalMilliseconds) return PipeUp();
            _lastReconnectAt = now;
        }
        var cold = s.ChromeProcesses == 0;
        var profile = PreferredProfile(s.Profiles);
        var (ok, why) = OpenInChrome(s.ChromePath, profile, ReconnectUrl);
        var what = cold ? $"Started Chrome in profile {ProfileLabel(s, profile)}" : $"Asked the extension to reconnect (its reconnect address, profile {ProfileLabel(s, profile)}; the tab closes itself)";
        if (!ok) { Log(trigger, cold ? "start-chrome" : "reconnect", false, $"{what} — failed: {why}."); return false; }
        var sw = Stopwatch.StartNew();
        var wait = cold ? PipeWaitColdStart : PipeWait;
        while (sw.Elapsed < wait && !PipeUp()) Thread.Sleep(250);
        var up = PipeUp();
        Log(trigger, cold ? "start-chrome" : "reconnect", up,
            up ? $"{what}: the extension's local host is up after {sw.Elapsed.TotalSeconds.ToString("0.#", System.Globalization.CultureInfo.InvariantCulture)} s."
               : $"{what}, but the local host did not come up within {wait.TotalSeconds:0} s. The extension may be disabled, signed out, or Chrome may need a restart.");
        return up;
    }

    /// <summary>Have Claude Code rewrite the native-messaging registration: any <c>--chrome</c>
    /// run does it at start (verified by deleting the registry value). One tiny turn.</summary>
    private bool RegenerateHost(string trigger)
    {
        try
        {
            var work = Path.Combine(Path.GetTempPath(), "claudeweb-chrome-preflight");
            Directory.CreateDirectory(work);
            var psi = new ProcessStartInfo
            {
                FileName = ClaudeCliAdapter.ClaudeExecutable, WorkingDirectory = work,
                RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true,
                UseShellExecute = false, CreateNoWindow = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8,
            };
            foreach (var a in new[] { "-p", "Reply with the single word OK.", "--chrome", "--model", "haiku", "--max-turns", "1", "--no-session-persistence", "--allowedTools", "" })
                psi.ArgumentList.Add(a);
            foreach (var v in BrowserTurnStrips(ClaudeAiLogin())) psi.EnvironmentVariables.Remove(v);
            using var process = new Process { StartInfo = psi };
            process.Start();
            process.StandardInput.Close();
            _ = process.StandardOutput.ReadToEndAsync(); _ = process.StandardError.ReadToEndAsync();
            if (!process.WaitForExit(90_000)) { try { process.Kill(entireProcessTree: true); } catch { /* gone */ } }
        }
        catch (Exception ex) { Log(trigger, "rewrite-registration", false, "Claude Code could not be started to rewrite the registration: " + ex.Message); return false; }
        var host = OperatingSystem.IsWindows() ? ReadHost() : new HostFact(false, null, false, null, false, null, false, false, null);
        var ok = host.Registered && host.ManifestExists && host.TargetExists && host.CliExists && host.AllowsExtension;
        Log(trigger, "rewrite-registration", ok, ok
            ? $"Claude Code rewrote the native-messaging registration (it starts {host.CliPath ?? host.TargetPath})."
            : "Ran Claude Code with --chrome, but the registration is still not complete.");
        return ok;
    }

    private bool ClaudeAiLogin() { var a = _account.Get(); return a.ClaudeInstalled && a.Authenticated; }

    /// <summary>Before a browser turn starts: re-read the facts (no process is started for
    /// that), repair what the harness can — start Chrome, ask the extension to reconnect — and
    /// return a notice for the chat when something only the Operator can fix still blocks the
    /// browser. The turn runs either way: a browser-mode agent often needs no browser at all.</summary>
    public string? EnsureReadyForTurn(string agent)
    {
        var facts = RefreshStatic();
        var snap = Build(facts);
        var steps = RepairSteps(snap.Checks);
        if (steps.Contains(StepReconnect))
        {
            // A broken registration is rewritten by the turn's own CLI start; the extension is
            // asked to re-dial a little later, once that has happened.
            if (steps.Contains(StepRegenHost))
                _ = Task.Run(async () => { await Task.Delay(8000).ConfigureAwait(false); try { Reconnect(RefreshStatic(), $"browser turn of {agent} (registration rewritten by the turn)"); } catch { /* logged */ } });
            else
                Reconnect(facts, $"before a browser turn of {agent}");
            facts = RefreshStatic();
            snap = Build(facts);
        }
        var blockers = TurnBlockers(snap.Checks);
        if (blockers.Count == 0) return null;
        var b = blockers[0];
        return $"Claude for Chrome is not ready on this machine — {b.Label}: {b.Detail}"
            + (b.Fix is null ? "" : $" Do: {b.Fix}")
            + (blockers.Count > 1 ? $" (+{blockers.Count - 1} more in the status strip's Chrome section.)" : "")
            + " The turn runs, but its browser tools will not work until this is fixed.";
    }

    /// <summary>The Repair button: everything the harness can do, then the live probe as the
    /// proof. Answers at once; progress shows in the repair log and the checks.</summary>
    public (Snapshot Snapshot, bool Started, string? NotStartedWhy) StartRepair(string trigger)
    {
        var facts = RefreshStatic();
        string? why = null;
        lock (_lock) { if (_repairRunning || _probeRunning) why = "a repair or a probe is already running"; }
        if (why is null && !_gate.TryAcquire(ProbeHolder, out var holder))
            why = $"the browser is held by a browser turn of \"{holder}\" — a reconnect now would interrupt it";
        if (why is not null) return (Build(facts), false, why);
        lock (_lock) { _repairRunning = true; _probeRunning = true; }
        _ = Task.Factory.StartNew(() =>
        {
            try
            {
                var steps = RepairSteps(Build(facts).Checks);
                if (steps.Count == 0) Log(trigger, "nothing-to-repair", true, "Every repairable check already passes; running the live probe.");
                if (steps.Contains(StepRegenHost)) RegenerateHost(trigger);
                if (steps.Contains(StepReconnect)) Reconnect(RefreshStatic(), trigger);
                RefreshStatic();
            }
            catch (Exception ex) { Log(trigger, "repair", false, ex.Message); }
            finally { lock (_lock) _repairRunning = false; }
            if (facts.CliPath is null) { _gate.Release(); lock (_lock) _probeRunning = false; }
            else RunProbe();   // releases the gate and clears the probe flag
        }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
        return (Build(facts), true, null);
    }

    /// <summary>A real agent browser call just answered "not connected": ask the extension to
    /// re-dial now, so the agent's retry finds it. Debounced inside <see cref="Reconnect"/>.</summary>
    private void OnAgentConnectionFailure(string tool)
    {
        _ = Task.Factory.StartNew(() =>
        {
            try
            {
                var facts = RefreshStatic();
                if (facts.ChromePath is null) return;
                Reconnect(facts, $"an agent's {tool} call answered \"not connected\"");
                RefreshStatic();
            }
            catch (Exception ex) { _logger.Error($"[CHROME] self-heal after a failed browser call: {ex.Message}"); }
        }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
    }

    /// <summary>The repairs only the Operator can finish: the harness opens the right page in
    /// the right profile of the host's Chrome.</summary>
    public (bool Ok, string Detail) Open(string target)
    {
        var s = RefreshStatic();
        var withExt = PreferredProfile(s.Profiles);
        var active = s.Profiles.FirstOrDefault(p => p.Active)?.Dir ?? withExt;
        var (url, profile, what) = target switch
        {
            "extensions" => (ExtensionsUrl, withExt, "the extension's page in chrome://extensions"),
            "store" => (StoreUrl, active, "the Claude extension's page in the Chrome Web Store"),
            "signin" => (SignInUrl, withExt, "claude.ai's Chrome page (sign in there with the account Claude Code uses)"),
            _ => (null, null, null),
        };
        if (url is null) return (false, "unknown page");
        var (ok, why) = OpenInChrome(s.ChromePath, profile, url);
        Log("the Operator", "open:" + target, ok, ok ? $"Opened {what} in profile {ProfileLabel(s, profile)} on this machine's Chrome." : $"Could not open {what}: {why}.");
        return (ok, ok ? $"Opened {what} in profile {ProfileLabel(s, profile)} on the harness's machine." : why);
    }
}
