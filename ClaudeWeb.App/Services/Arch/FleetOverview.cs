using System.Diagnostics;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

// The per-machine "Overview" that the harness's own Status strip shows (Claude
// info, GitHub account, host info, admin active), carried through the fleet
// describe/status so the Management App's Fleet Status can show it for every
// machine (openspec fleet-status-panels). The SAME record is serialized by the
// peer's describe AND deserialized on the hub (FleetClient.PeerInfo.Overview), so
// there is one shape and no drift. Every field is nullable/defaulted: an older
// peer that predates this returns no `overview`, the hub sees null, the UI shows
// "n/a" — never an error. Version + build and the machine name already ride the
// fleet object (machine.version / machine.machine); "host active" is the operator
// gate already carried as machine.gateOpen. This adds only the missing pieces.

public sealed record FleetOverview(
    [property: JsonPropertyName("claude")] OverviewClaude? Claude,
    [property: JsonPropertyName("github")] OverviewGitHub? GitHub,
    [property: JsonPropertyName("host")] OverviewHost? Host,
    [property: JsonPropertyName("admin")] OverviewAdmin? Admin);

public sealed record OverviewClaude(
    [property: JsonPropertyName("installed")] bool Installed,
    [property: JsonPropertyName("authenticated")] bool Authenticated,
    [property: JsonPropertyName("account")] string? Account,
    [property: JsonPropertyName("plan")] string? Plan);

public sealed record OverviewGitHub(
    [property: JsonPropertyName("installed")] bool Installed,
    [property: JsonPropertyName("authenticated")] bool Authenticated,
    [property: JsonPropertyName("account")] string? Account,
    [property: JsonPropertyName("host")] string? Host);

public sealed record OverviewHost(
    [property: JsonPropertyName("timeZoneId")] string? TimeZoneId,
    [property: JsonPropertyName("utcOffsetMinutes")] int UtcOffsetMinutes);

public sealed record OverviewAdmin(
    [property: JsonPropertyName("supported")] bool Supported,
    [property: JsonPropertyName("state")] string? State);

/// <summary>
/// Builds THIS machine's <see cref="FleetOverview"/> for the describe/status,
/// non-blocking (openspec fleet-status-panels). <see cref="Current"/> returns the
/// last built overview instantly and kicks a background rebuild when the cache is
/// older than <see cref="TtlMs"/> (single-flight). This matters because the
/// describe is produced on every hub poll (~10 s): the underlying account probes
/// are themselves cached (Claude 1 min, GitHub 5 min) but a GitHub cache miss
/// spawns <c>gh.exe</c> and can block for seconds — building off the request
/// thread keeps the fleet poll cheap and never times a peer's describe out.
/// Cold start returns an empty overview (all fields null → the UI shows "n/a")
/// until the first background build lands.
/// </summary>
public sealed class FleetOverviewProvider
{
    // The overview is a slow-moving identity snapshot; 30 s is far tighter than the
    // account probes' own TTLs, so Current() almost always returns a warm cache.
    private const long TtlMs = 30_000;

    private readonly ClaudeAccountService _claude;
    private readonly GitHubAccountService _github;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private FleetOverview? _cached;
    private long _at;
    private bool _building;

    public FleetOverviewProvider(ClaudeAccountService claude, GitHubAccountService github, Logger logger)
    {
        _claude = claude;
        _github = github;
        _logger = logger;
    }

    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>The last built overview (host/admin are recomputed inline — they are
    /// instant), refreshing the account fields in the background when stale.</summary>
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
        // Host + admin are instant reads, so answer with fresh ones even on a cold
        // start; account fields come from the cache (null until the first build).
        var warm = cached ?? Empty();
        return warm with { Host = ReadHost(), Admin = ReadAdmin() };
    }

    private FleetOverview Build()
    {
        OverviewClaude? claude = null;
        try { var c = _claude.Get(); claude = new OverviewClaude(c.ClaudeInstalled, c.Authenticated, c.Account, c.Plan); }
        catch (Exception ex) { _logger.Error($"[FLEET] overview claude: {ex.Message}"); }

        OverviewGitHub? github = null;
        try { var g = _github.Get(); github = new OverviewGitHub(g.GhInstalled, g.Authenticated, g.Account, g.Host); }
        catch (Exception ex) { _logger.Error($"[FLEET] overview github: {ex.Message}"); }

        return new FleetOverview(claude, github, ReadHost(), ReadAdmin());
    }

    private static FleetOverview Empty() => new(null, null, ReadHost(), ReadAdmin());

    private static OverviewHost ReadHost()
    {
        try
        {
            var tz = TimeZoneInfo.Local;
            var offset = (int)tz.GetUtcOffset(DateTimeOffset.UtcNow).TotalMinutes;
            return new OverviewHost(tz.Id, offset);
        }
        catch { return new OverviewHost(null, 0); }
    }

    // The always-admin (UAC master switch) state, read the same way as
    // AlwaysAdminController.ReadStatus (openspec add-always-admin-status): the three
    // UAC policy DWORDs all 0 => registry set; set + elevated token => active, set +
    // filtered => reboot_pending, else disabled. Kept compact and self-contained so
    // the fleet path never depends on the controller; the controller stays the
    // canonical writer/owner. Non-Windows or a locked key => unsupported.
    private static OverviewAdmin ReadAdmin()
    {
        if (!OperatingSystem.IsWindows()) return new OverviewAdmin(false, "disabled");
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
            return new OverviewAdmin(true, state);
        }
        catch { return new OverviewAdmin(false, "disabled"); }
    }
}
