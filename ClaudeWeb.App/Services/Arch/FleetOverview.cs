using System.Diagnostics;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

// The per-machine "Overview" — EVERYTHING the harness's own header status strip shows
// (openspec fleet-status-panels; completed by openspec fleet-overview-honest): the
// Claude account with its plan AND its plan usage (the 5-hour window, the weekly quota,
// the per-model weekly limits, stale/unavailable), the GitHub account, the host clock
// (time, zone, offset), the always-admin state with its two underlying facts, and when
// the snapshot was captured. The SAME record is serialized by the peer's describe AND
// deserialized on the hub (FleetClient.PeerInfo.Overview), so there is ONE shape and no
// drift; the hub's own strip reads the same record through GET /api/arch/overview.
// Every field is nullable/defaulted: an older peer that predates a field returns none of
// it, the hub sees null, and the UI says "unknown" with the reason — never a blank, never
// an error. Version + build and the machine name already ride the fleet object
// (machine.version / machine.machine); "host active" is the operator gate carried as
// machine.gateOpen.

public sealed record FleetOverview(
    [property: JsonPropertyName("claude")] OverviewClaude? Claude,
    [property: JsonPropertyName("github")] OverviewGitHub? GitHub,
    [property: JsonPropertyName("host")] OverviewHost? Host,
    [property: JsonPropertyName("admin")] OverviewAdmin? Admin,
    // Unix ms when the account/usage part was built on the reporting machine (null on a
    // build that predates it): lets a reader say "as of 40 s ago" instead of pretending.
    [property: JsonPropertyName("capturedAt")] long? CapturedAt = null,
    // The OS keep-alive (watchdog scheduled task) state this machine's status strip shows
    // (fleet task c96de7ae): null on a peer whose build predates the field → the UI says
    // "unknown", never a blank. Appended last (with a default) so the positional builders
    // that predate it keep compiling and just leave it null unless set via `with`.
    [property: JsonPropertyName("watchdog")] OverviewWatchdog? Watchdog = null);

public sealed record OverviewWatchdog(
    [property: JsonPropertyName("supported")] bool Supported,
    // healthy | not_set_up | error | unsupported — the SAME states WatchdogPlan.StateOf
    // produces for the local status-strip tile, so the fleet column and the strip agree.
    [property: JsonPropertyName("state")] string? State);

public sealed record OverviewClaude(
    [property: JsonPropertyName("installed")] bool Installed,
    [property: JsonPropertyName("authenticated")] bool Authenticated,
    [property: JsonPropertyName("account")] string? Account,
    [property: JsonPropertyName("plan")] string? Plan,
    // Plan usage as the strip's Claude chip shows it (openspec claude-usage): null on a
    // peer that predates the field; Available=false with the reason when the probe failed.
    [property: JsonPropertyName("usage")] OverviewUsage? Usage = null);

public sealed record OverviewUsage(
    [property: JsonPropertyName("available")] bool Available,
    [property: JsonPropertyName("stale")] bool Stale,
    [property: JsonPropertyName("fetchedAt")] string? FetchedAt,
    [property: JsonPropertyName("session")] OverviewUsageLimit? Session,
    [property: JsonPropertyName("weekly")] OverviewUsageLimit? Weekly,
    [property: JsonPropertyName("scopedWeekly")] List<OverviewUsageLimit>? ScopedWeekly,
    [property: JsonPropertyName("error")] string? Error);

public sealed record OverviewUsageLimit(
    [property: JsonPropertyName("label")] string? Label,
    [property: JsonPropertyName("percent")] double? Percent,
    [property: JsonPropertyName("resetsAt")] string? ResetsAt,
    [property: JsonPropertyName("severity")] string? Severity);

public sealed record OverviewGitHub(
    [property: JsonPropertyName("installed")] bool Installed,
    [property: JsonPropertyName("authenticated")] bool Authenticated,
    [property: JsonPropertyName("account")] string? Account,
    [property: JsonPropertyName("host")] string? Host);

public sealed record OverviewHost(
    [property: JsonPropertyName("timeZoneId")] string? TimeZoneId,
    [property: JsonPropertyName("utcOffsetMinutes")] int UtcOffsetMinutes,
    // The host clock as the strip shows it (openspec dashboard-host-clock): the machine's
    // own "now" when this overview was produced. Null on a peer that predates the field.
    [property: JsonPropertyName("nowUnixMs")] long? NowUnixMs = null,
    [property: JsonPropertyName("nowIso")] string? NowIso = null);

public sealed record OverviewAdmin(
    [property: JsonPropertyName("supported")] bool Supported,
    [property: JsonPropertyName("state")] string? State,
    // The two facts behind the state (openspec always-admin): the UAC policy trio set,
    // and the harness's own token elevated. Null on a peer that predates the fields.
    [property: JsonPropertyName("registrySet")] bool? RegistrySet = null,
    [property: JsonPropertyName("elevated")] bool? Elevated = null);

/// <summary>
/// Builds THIS machine's <see cref="FleetOverview"/> for the describe/status,
/// non-blocking (openspec fleet-status-panels). <see cref="Current"/> returns the
/// last built overview instantly and kicks a background rebuild when the cache is
/// older than <see cref="TtlMs"/> (single-flight). This matters because the
/// describe is produced on every hub poll (~10 s): the underlying account probes
/// are themselves cached (Claude 1 min, GitHub 5 min, usage 5 min) but a GitHub cache
/// miss spawns <c>gh.exe</c> and can block for seconds — building off the request
/// thread keeps the fleet poll cheap and never times a peer's describe out.
/// Cold start returns an empty overview (account fields null → the UI says "unknown,
/// not probed yet") until the first background build lands.
/// </summary>
public sealed class FleetOverviewProvider
{
    // The overview is a slow-moving identity snapshot; 30 s is far tighter than the
    // account probes' own TTLs, so Current() almost always returns a warm cache.
    private const long TtlMs = 30_000;

    private readonly ClaudeAccountService _claude;
    private readonly GitHubAccountService _github;
    private readonly ClaudeUsageService? _usage;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private FleetOverview? _cached;
    private long _at;
    private bool _building;

    public FleetOverviewProvider(ClaudeAccountService claude, GitHubAccountService github, Logger logger, ClaudeUsageService? usage = null)
    {
        _claude = claude;
        _github = github;
        _usage = usage;
        _logger = logger;
        // Warm up at construction (openspec fleet-overview-honest): the first reader — a
        // hub's poll, the strip's Machine tile — should not see "not probed yet" for the
        // account and usage fields just because nobody had asked before.
        _ = Task.Run(() => { try { Current(); } catch { /* logged inside */ } });
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>The last built overview (host/admin are recomputed inline — they are
    /// instant), refreshing the account and usage fields in the background when stale.</summary>
    public FleetOverview Current()
    {
        FleetOverview? cached;
        bool start;
        lock (_gate)
        {
            cached = _cached;
            start = (cached is null || Now() - _at > TtlMs) && !_building;
            if (start) _building = true;
        }
        if (start)
        {
            _ = Task.Run(() =>
            {
                FleetOverview built;
                try { built = Build(); }
                catch (Exception ex) { _logger.Error($"[FLEET] overview build failed: {ex.Message}"); built = Empty(); }
                lock (_gate) { _cached = built; _at = Now(); _building = false; }
            });
        }
        // Host + admin + watchdog are instant reads, so answer with fresh ones even on a
        // cold start; account fields come from the cache (null until the first build).
        var warm = cached ?? Empty();
        return warm with { Host = ReadHost(), Admin = ReadAdmin(), Watchdog = ReadWatchdog() };
    }

    private FleetOverview Build()
    {
        OverviewClaude? claude = null;
        try
        {
            var c = _claude.Get();
            // Usage only makes sense for an authenticated session; a failed probe is an
            // honest "unavailable: <reason>", never a blank (openspec claude-usage).
            OverviewUsage? usage = null;
            if (c.Authenticated && _usage is not null)
            {
                try { usage = MapUsage(_usage.GetAsync().GetAwaiter().GetResult()); }
                catch (Exception ex) { _logger.Info($"[FLEET] overview usage: {ex.GetType().Name}"); usage = new OverviewUsage(false, false, null, null, null, null, "usage probe failed"); }
            }
            claude = new OverviewClaude(c.ClaudeInstalled, c.Authenticated, c.Account, c.Plan, usage);
        }
        catch (Exception ex) { _logger.Error($"[FLEET] overview claude: {ex.Message}"); }

        OverviewGitHub? github = null;
        try { var g = _github.Get(); github = new OverviewGitHub(g.GhInstalled, g.Authenticated, g.Account, g.Host); }
        catch (Exception ex) { _logger.Error($"[FLEET] overview github: {ex.Message}"); }

        return new FleetOverview(claude, github, ReadHost(), ReadAdmin(), Now(), ReadWatchdog());
    }

    /// <summary>The strip's usage rows, one shape for the fleet (pure; unit-tested).</summary>
    public static OverviewUsage MapUsage(ClaudeUsageService.ClaudeUsageStatus u)
    {
        static OverviewUsageLimit? L(ClaudeUsageService.UsageLimit? x) => x is null ? null : new OverviewUsageLimit(x.Label, x.Percent, x.ResetsAt, x.Severity);
        return new OverviewUsage(u.Available, u.Stale, u.FetchedAt, L(u.Session), L(u.Weekly),
            u.ScopedWeekly.Select(L).Where(x => x is not null).Select(x => x!).ToList(), u.Error);
    }

    private static FleetOverview Empty() => new(null, null, ReadHost(), ReadAdmin(), null, ReadWatchdog());

    // This machine's keep-alive state via the shared probe (WatchdogProbe) — the SAME
    // source the status-strip tile reads, so the fleet column and the strip never drift
    // (fleet task c96de7ae). Instant + degrade-not-throw, like ReadHost/ReadAdmin.
    private static OverviewWatchdog ReadWatchdog()
    {
        var (supported, state) = ClaudeWeb.Services.Watchdog.WatchdogProbe.Read();
        return new OverviewWatchdog(supported, state);
    }

    private static OverviewHost ReadHost()
    {
        try
        {
            var now = DateTimeOffset.Now;
            var tz = TimeZoneInfo.Local;
            return new OverviewHost(tz.Id, (int)now.Offset.TotalMinutes, now.ToUnixTimeMilliseconds(), now.ToString("o"));
        }
        catch { return new OverviewHost(null, 0, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), null); }
    }

    // The always-admin (UAC master switch) state, read the same way as
    // AlwaysAdminController.ReadStatus (openspec add-always-admin-status): the three
    // UAC policy DWORDs all 0 => registry set; set + elevated token => active, set +
    // filtered => reboot_pending, else disabled. Kept compact and self-contained so
    // the fleet path never depends on the controller; the controller stays the
    // canonical writer/owner. Non-Windows or a locked key => unsupported.
    private static OverviewAdmin ReadAdmin()
    {
        if (!OperatingSystem.IsWindows()) return new OverviewAdmin(false, "disabled", null, null);
        try
        {
            using var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System");
            int? D(string n) => key?.GetValue(n) as int?;
            var lua = D("EnableLUA");
            var consent = D("ConsentPromptBehaviorAdmin");
            var secure = D("PromptOnSecureDesktop");
            var registrySet = lua == 0 && consent == 0 && secure == 0;
            bool elevated;
            try
            {
                using var id = System.Security.Principal.WindowsIdentity.GetCurrent();
                elevated = new System.Security.Principal.WindowsPrincipal(id)
                    .IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
            }
            catch { elevated = false; }
            var state = !registrySet ? "disabled" : elevated ? "active" : "reboot_pending";
            return new OverviewAdmin(true, state, registrySet, elevated);
        }
        catch { return new OverviewAdmin(false, "disabled", null, null); }
    }
}
