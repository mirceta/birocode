using System.Text.Json;
using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.LocalApps;

/// <summary>
/// The hub's fleet view of local-app autostart (fleet task f88f97fe, openspec local-apps-autostart-sentry). The hub
/// is the SINGLE WRITER: the Operator's edits land in <see cref="FleetAutostartStore"/>, and each machine gets its
/// slice — this machine through its own <see cref="AutostartStore"/>, a peer through
/// <c>POST /api/arch/peer/local-apps/flags</c>. A peer answering with an older version (it was dark, or rebooted
/// before a push) is re-pushed on the next read. Peer reads are cached briefly so the tab's badge poll stays cheap.
/// </summary>
public sealed class LocalAppsFleet
{
    public sealed record MachineView(string Machine, string SourceId, bool Self, bool Reachable, string Status, string? Detail,
        long HubVersion, long? MachineVersion, bool InSync, object? Overview,
        int Flagged, int Up, int Down, int Failing);

    private readonly FleetAutostartStore _fleetStore;
    private readonly LocalAppSentry _sentry;
    private readonly CollectorService _collector;
    private readonly FleetClient _fleet;
    private readonly Logger _logger;
    private readonly Func<long> _now;
    private readonly object _gate = new();
    private readonly Dictionary<string, (long At, MachineView View)> _cache = new(StringComparer.Ordinal);
    private const long CacheMs = 15_000;

    public LocalAppsFleet(FleetAutostartStore fleetStore, LocalAppSentry sentry, CollectorService collector, FleetClient fleet, Logger logger, Func<long>? now = null)
    {
        _fleetStore = fleetStore; _sentry = sentry; _collector = collector; _fleet = fleet; _logger = logger;
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
    }

    private string SelfLabel => _collector.SelfLabel;

    private bool IsSelf(string machine) => string.IsNullOrWhiteSpace(machine) || machine == CollectorService.SelfId
        || string.Equals(machine, SelfLabel, StringComparison.OrdinalIgnoreCase);

    private IEnumerable<CollectorService.SourceView> Peers() => _collector.ListSources().Where(s => s.Kind != "self" && s.Active);

    /// <summary>The hub's own slice is applied here at start (a hub that rebooted reads its fleet store as the truth).</summary>
    public void SyncSelf()
    {
        if (!_fleetStore.Knows(SelfLabel)) return;
        var want = _fleetStore.Slice(SelfLabel, SelfLabel);
        if (_sentry.Store.Get().Version != want.Version) _sentry.Store.Replace(want);
    }

    public IReadOnlyList<MachineView> Overview(bool fresh)
    {
        SyncSelf();
        var list = new List<MachineView> { SelfView() };
        foreach (var src in Peers()) list.Add(PeerView(src, fresh));
        return list;
    }

    private MachineView SelfView()
    {
        var o = _sentry.Snapshot();
        var hub = _fleetStore.Knows(SelfLabel) ? _fleetStore.Slice(SelfLabel, SelfLabel).Version : o.Version;
        return new MachineView(SelfLabel, CollectorService.SelfId, true, true, "ok", null, hub, o.Version, hub == o.Version, o,
            o.Flagged, o.Up, o.Down, o.Failing);
    }

    private MachineView PeerView(CollectorService.SourceView src, bool fresh)
    {
        lock (_gate)
            if (!fresh && _cache.TryGetValue(src.Id, out var c) && _now() - c.At < CacheMs) return c.View;
        var hubVersion = _fleetStore.Knows(src.Label) ? _fleetStore.Slice(src.Label, SelfLabel).Version : 0;
        var r = _fleet.LocalApps(src.Id);
        MachineView view;
        if (!r.Ok)
            view = new MachineView(src.Label, src.Id, false, r.Status is not ("unreachable"), r.Status,
                r.Status == "no-peer-api" ? "this machine's harness is an older build without local-app autostart — upgrade it" : r.Detail,
                hubVersion, null, false, null, 0, 0, 0, 0);
        else
        {
            var d = r.Data is JsonElement e ? e : JsonSerializer.SerializeToElement(r.Data);
            long? ver = d.TryGetProperty("version", out var v) && v.TryGetInt64(out var vv) ? vv : null;
            int N(string k) => d.TryGetProperty(k, out var x) && x.TryGetInt32(out var n) ? n : 0;
            view = new MachineView(src.Label, src.Id, false, true, "ok", null, hubVersion, ver, hubVersion == 0 || ver == hubVersion, d,
                N("flagged"), N("up"), N("down"), N("failing"));
            // The peer runs an older slice (it was dark at the last push, or rebooted from an old file): re-push.
            if (hubVersion > 0 && ver != hubVersion) Push(src.Label);
        }
        lock (_gate) _cache[src.Id] = (_now(), view);
        return view;
    }

    private CollectorService.SourceView? Source(string machine) =>
        Peers().FirstOrDefault(s => string.Equals(s.Label, machine, StringComparison.OrdinalIgnoreCase) || s.Id == machine);

    /// <summary>Send <paramref name="machine"/> its slice. Self: written here. Peer: the peer API.</summary>
    public ArchAgentService.ToolOutcome Push(string machine)
    {
        if (IsSelf(machine))
        {
            _sentry.Store.Replace(_fleetStore.Slice(SelfLabel, SelfLabel));
            return new ArchAgentService.ToolOutcome(true, "applied", $"{SelfLabel}: flags written");
        }
        var src = Source(machine);
        if (src is null) return new ArchAgentService.ToolOutcome(false, "not-found", $"no subscribed machine \"{machine}\"");
        var slice = _fleetStore.Slice(src.Label, SelfLabel);
        var r = _fleet.PushLocalAppFlags(src.Id, slice);
        lock (_gate) _cache.Remove(src.Id);
        _logger.Info($"[AUTOSTART] push to {src.Label} (version {slice.Version}, {slice.Flags.Count(f => f.Autostart)} flagged): {r.Status}{(r.Ok ? "" : " — " + r.Detail)}");
        return r;
    }

    public (ArchAgentService.ToolOutcome Outcome, string Machine) SetFlag(string machine, AutostartFlag flag)
    {
        var label = IsSelf(machine) ? SelfLabel : Source(machine)?.Label;
        if (label is null) return (new ArchAgentService.ToolOutcome(false, "not-found", $"no subscribed machine \"{machine}\""), machine);
        _fleetStore.Upsert(label, flag, _now());
        return (Push(label), label);
    }

    public SentrySettings SetSettings(SentrySettings settings)
    {
        _fleetStore.Ensure(SelfLabel, _now());
        foreach (var p in Peers()) _fleetStore.Ensure(p.Label, _now());
        var clean = _fleetStore.SetSettings(settings, _now());
        Push(SelfLabel);
        foreach (var p in Peers()) Push(p.Label);
        return clean;
    }

    /// <summary>"Apply now" / "check now" on one machine (self runs it here; a peer starts it and answers at once).</summary>
    public async Task<ArchAgentService.ToolOutcome> RunAsync(string machine, bool apply, CancellationToken ct)
    {
        if (IsSelf(machine))
        {
            SyncSelf();
            var o = apply ? await _sentry.ApplyAsync("apply-now", ct) : await _sentry.CheckAsync("check-now", ct);
            return new ArchAgentService.ToolOutcome(true, apply ? "applied" : "checked", $"{SelfLabel}: {o.Up} up, {o.Down} down, {o.Failing} failing of {o.Flagged} flagged", o);
        }
        var src = Source(machine);
        if (src is null) return new ArchAgentService.ToolOutcome(false, "not-found", $"no subscribed machine \"{machine}\"");
        var r = apply ? _fleet.LocalAppsApply(src.Id, SelfLabel) : _fleet.LocalAppsCheck(src.Id, SelfLabel);
        lock (_gate) _cache.Remove(src.Id);
        return r;
    }

    /// <summary>The arch's <c>local_apps_status</c>: per machine, what is flagged and what is not answering.</summary>
    public ArchAgentService.ToolOutcome Status(string? machine)
    {
        var views = Overview(fresh: false).Where(v => string.IsNullOrWhiteSpace(machine) || string.Equals(v.Machine, machine, StringComparison.OrdinalIgnoreCase) || (machine == "self" && v.Self)).ToList();
        if (views.Count == 0) return new ArchAgentService.ToolOutcome(false, "not-found", $"no machine \"{machine}\"");
        var rows = views.Select(v => new
        {
            machine = v.Machine, reachable = v.Reachable, status = v.Status, detail = v.Detail, inSync = v.InSync,
            flagged = v.Flagged, up = v.Up, down = v.Down, failing = v.Failing,
            attention = Attention(v),
        }).ToList();
        var bad = rows.Sum(r => r.down + r.failing);
        var dark = rows.Where(r => !r.reachable || r.status != "ok").Select(r => $"{r.machine} ({r.status})").ToList();
        var detail = $"{rows.Sum(r => r.flagged)} autostart app(s) across {rows.Count} machine(s): {rows.Sum(r => r.up)} up, {rows.Sum(r => r.down)} down, {rows.Sum(r => r.failing)} failing"
            + (bad > 0 ? " — " + string.Join("; ", rows.SelectMany(r => r.attention)) : "")
            + (dark.Count > 0 ? $". Not answering: {string.Join(", ", dark)}" : "")
            + ". Report failing apps to the Operator; the sentry already tried one restart — do not start them yourself.";
        return new ArchAgentService.ToolOutcome(true, bad > 0 ? "attention" : "ok", detail, rows);
    }

    private static List<string> Attention(MachineView v)
    {
        var outList = new List<string>();
        if (v.Overview is null) return outList;
        var e = v.Overview is JsonElement j ? j : JsonSerializer.SerializeToElement(v.Overview, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        if (!e.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) return outList;
        foreach (var r in rows.EnumerateArray())
        {
            var state = r.TryGetProperty("state", out var s) ? s.GetString() : null;
            var flagged = r.TryGetProperty("flag", out var f) && f.ValueKind == JsonValueKind.Object && f.TryGetProperty("autostart", out var a) && a.ValueKind == JsonValueKind.True;
            if (!flagged || state is not ("down" or "failing")) continue;
            string P(string k) => r.TryGetProperty(k, out var x) && x.ValueKind == JsonValueKind.String ? x.GetString() ?? "" : "";
            var port = r.TryGetProperty("port", out var pp) && pp.TryGetInt32(out var pn) ? pn : 0;
            outList.Add($"{v.Machine}/{P("repo")}/{P("appId")} :{port} {state}: {P("lastError")}");
        }
        return outList;
    }
}
