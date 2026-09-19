using System.Text.Json;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.HubFs;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's side of the hub file system (openspec hub-file-system): the fleet-wide
/// listing (<c>hub_files</c>) and the one thing only the arch can do — MOVE a file between
/// machines (<c>hub_transfer</c>) over the proven hub→peer channel (the fleet client, the
/// peer's stored credential, the peer's own accept-sends opt-in for anything written there).
/// Repo agents only ever touch THEIR harness's store; the arch is how a file on machine A
/// becomes a file on machine B. Plus the peer-side handlers the peer API exposes, so a hub
/// can list, fetch from and push into this harness's store.
/// </summary>
public partial class ArchAgentService
{
    private HubFileStore? _hubFiles;

    /// <summary>The store this harness keeps (null on a build without the module — every tool then says so).</summary>
    public HubFileStore? HubFiles { get => _hubFiles; set => _hubFiles = value; }

    private static object FileRow(HubFileStore.Entry e, string machine) => new
    {
        machine, path = e.Path, size = e.Size, sizeHuman = HubFileStore.Human(e.Size), sha256 = e.Sha256, contentType = e.ContentType,
        uploadedBy = e.UploadedBy, uploadedFrom = e.Machine, uploadedAt = e.UploadedAt, updatedAt = e.UpdatedAt, version = e.Version, note = e.Note, via = e.Via,
    };

    /// <summary>The <c>hub_files</c> tool: every file on the hub's store and on each reachable
    /// peer's store (or one machine's). Read-only.</summary>
    public ToolOutcome ToolHubFiles(string? machine, string? prefix)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", "this harness has no hub file store");
        var rows = new List<object>();
        var errors = new List<string>();
        MachineRef? only = null;
        if (!string.IsNullOrWhiteSpace(machine))
        {
            only = ResolveMachine(machine);
            if (only.Error is not null) return new ToolOutcome(false, "error", only.Error);
        }
        if (only is null || only.IsSelf)
            rows.AddRange(_hubFiles.List(prefix).Select(e => FileRow(e, SelfLabel)));
        if (only is null || !only.IsSelf)
        {
            var sources = only is { IsSelf: false } ? new[] { only.Source! } : _collector.ListSources().Where(s => s.Active).ToArray();
            foreach (var src in sources)
            {
                var o = _fleet.HubFiles(src.Id, prefix);
                if (!o.Ok) { errors.Add($"{src.Label}: {o.Status} — {o.Detail}"); continue; }
                if (o.Data is JsonElement arr && arr.ValueKind == JsonValueKind.Array)
                    foreach (var el in arr.EnumerateArray()) rows.Add(el);
            }
        }
        var detail = $"{rows.Count} file(s){(only is null ? " across the fleet" : $" on {(only.IsSelf ? SelfLabel : only.Source!.Label)}")}"
            + (errors.Count > 0 ? "; not answered: " + string.Join("; ", errors) : "")
            + ". A repo agent downloads from ITS OWN machine's store: hub_transfer moves a file to that machine first.";
        return new ToolOutcome(true, "ok", detail, new { hub = SelfLabel, files = rows, notAnswered = errors, stats = _hubFiles.GetStats() });
    }

    /// <summary>The <c>hub_transfer</c> tool: copy a hub file between machines — a peer's store →
    /// the hub (fetch), the hub → a peer (push), or peer → peer (through the hub, which keeps a
    /// copy). Pushes need this Operator's "allow sends" to that machine and the peer's own
    /// "accept fleet sends"; a peer without the route answers no-peer-api.</summary>
    public ToolOutcome ToolHubTransfer(string? path, string? from, string? to, bool overwrite)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", "this harness has no hub file store");
        var norm = HubFileStore.Normalize(path, out var err);
        if (norm is null) return new ToolOutcome(false, "error", err!);
        var src = ResolveMachine(string.IsNullOrWhiteSpace(from) ? Machine : from);
        if (src.Error is not null) return new ToolOutcome(false, "error", "from: " + src.Error);
        var dst = ResolveMachine(string.IsNullOrWhiteSpace(to) ? Machine : to);
        if (dst.Error is not null) return new ToolOutcome(false, "error", "to: " + dst.Error);
        if (src.IsSelf && dst.IsSelf) return new ToolOutcome(false, "error", $"from and to are both {SelfLabel} — nothing to move; a repo agent here downloads straight from the hub store");
        var srcLabel = src.IsSelf ? SelfLabel : src.Source!.Label;
        var dstLabel = dst.IsSelf ? SelfLabel : dst.Source!.Label;
        if (!src.IsSelf && !dst.IsSelf && src.Source!.Id == dst.Source!.Id) return new ToolOutcome(false, "error", $"from and to are both {srcLabel}");

        // 1. the bytes: from the hub's own store, or fetched from the peer (kept on the hub too).
        HubFileStore.Entry entry;
        byte[] bytes;
        if (src.IsSelf)
        {
            var got = _hubFiles.Get(norm);
            if (got is null) return new ToolOutcome(false, "not-found", $"no file {norm} on {SelfLabel}'s hub store; hub_files lists what is there");
            (entry, bytes) = got.Value;
        }
        else
        {
            var o = _fleet.HubFileGet(src.Source!.Id, norm);
            if (!o.Ok) { AuditTool("hub_transfer", null, $"fetch {norm} from {srcLabel}: {o.Status}"); return new ToolOutcome(false, o.Status, $"{srcLabel}: {o.Detail}"); }
            var wire = ParseWireFile(o.Data);
            if (wire is null) return new ToolOutcome(false, "error", $"{srcLabel} answered without the file's content");
            bytes = wire.Value.Bytes;
            var (put, perr) = _hubFiles.Put(norm, bytes, wire.Value.UploadedBy, wire.Value.Machine, wire.Value.Note, overwrite: true, via: $"arch ← {srcLabel}", uploadedAt: wire.Value.UploadedAt);
            if (put is null) return new ToolOutcome(false, "error", $"could not keep {norm} on the hub: {perr}");
            entry = put;
        }
        if (dst.IsSelf)
        {
            AuditTool("hub_transfer", null, $"fetched {norm} from {srcLabel} ({HubFileStore.Human(entry.Size)})");
            _logger.Info($"[ARCH] hub_transfer: {norm} fetched from {srcLabel} ({HubFileStore.Human(entry.Size)})");
            return new ToolOutcome(true, "fetched", $"{norm} ({HubFileStore.Human(entry.Size)}, uploaded by {entry.UploadedBy} on {entry.Machine}) is now on {SelfLabel}'s hub store — a repo agent here can hub_download it",
                FileRow(entry, SelfLabel));
        }

        // 2. push to the destination peer.
        var target = dst.Source!;
        if (!target.AllowSends) return new ToolOutcome(false, "error", $"the operator has not allowed sends to {dstLabel} (events app / Arch tab: allow sends); nothing was moved");
        var push = _fleet.HubFilePut(target.Id, new
        {
            from = SelfLabel, path = norm, contentBase64 = Convert.ToBase64String(bytes),
            uploadedBy = entry.UploadedBy, machine = entry.Machine, note = entry.Note, uploadedAt = entry.UploadedAt, overwrite,
        });
        AuditTool("hub_transfer", null, $"push {norm} → {dstLabel}: {push.Status}");
        if (!push.Ok) return new ToolOutcome(false, push.Status, $"{dstLabel}: {push.Detail}");
        _logger.Info($"[ARCH] hub_transfer: {norm} pushed to {dstLabel} ({HubFileStore.Human(entry.Size)})");
        return new ToolOutcome(true, "pushed", $"{norm} ({HubFileStore.Human(entry.Size)}) is now on {dstLabel}'s hub store{(src.IsSelf ? "" : $" (and kept on {SelfLabel})")} — a repo agent there can hub_download it",
            new { path = norm, from = srcLabel, to = dstLabel, size = entry.Size, uploadedBy = entry.UploadedBy, peer = push.Data });
    }

    private static (byte[] Bytes, string UploadedBy, string Machine, string? Note, long? UploadedAt)? ParseWireFile(object? data)
    {
        if (data is not JsonElement d || d.ValueKind != JsonValueKind.Object) return null;
        string? S(string k) => d.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        var b64 = S("contentBase64");
        if (b64 is null) return null;
        byte[] bytes;
        try { bytes = Convert.FromBase64String(b64); } catch { return null; }
        long? at = d.TryGetProperty("uploadedAt", out var a) && a.ValueKind == JsonValueKind.Number ? a.GetInt64() : null;
        return (bytes, S("uploadedBy") ?? "unknown", S("machine") ?? "?", S("note"), at);
    }

    // ---- the peer side (what a hub calls on this harness) -------------------------------------

    /// <summary>The peer API's file list: this harness's store, as rows a hub can merge.</summary>
    public ToolOutcome PeerHubFiles(string? prefix)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store");
        var rows = _hubFiles.List(prefix).Select(e => FileRow(e, SelfLabel)).ToList();
        return new ToolOutcome(true, "ok", $"{rows.Count} file(s) on {SelfLabel}", rows);
    }

    /// <summary>The peer API's fetch: one file's bytes, base64, with its provenance.</summary>
    public ToolOutcome PeerHubFileGet(string? path)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store");
        var got = _hubFiles.Get(path);
        if (got is null) return new ToolOutcome(false, "not-found", $"no file {path} on {SelfLabel}'s hub store");
        var (e, bytes) = got.Value;
        return new ToolOutcome(true, "ok", $"{e.Path} ({HubFileStore.Human(e.Size)})", new
        {
            path = e.Path, size = e.Size, sha256 = e.Sha256, contentType = e.ContentType, uploadedBy = e.UploadedBy, machine = e.Machine,
            uploadedAt = e.UploadedAt, version = e.Version, note = e.Note, contentBase64 = Convert.ToBase64String(bytes),
        });
    }

    /// <summary>The peer API's push: a hub writes a file into this store. Behind this harness's
    /// "accept fleet sends" opt-in like every write a fleet arch may do here.</summary>
    public ToolOutcome PeerHubFilePut(string? from, string? path, string? contentBase64, string? uploadedBy, string? machine, string? note, long? uploadedAt, bool overwrite)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store");
        var sender = SanitizeMachine(from);
        if (sender is null) return new ToolOutcome(false, "error", "from (the sending machine's label) is required");
        if (!AcceptFleetSends) return new ToolOutcome(false, "not-accepting", $"{SelfLabel} does not accept fleet sends (its operator has not opted in)");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(contentBase64 ?? ""); } catch { return new ToolOutcome(false, "error", "contentBase64 is not valid base64"); }
        var (entry, err) = _hubFiles.Put(path, bytes, uploadedBy ?? "unknown", machine ?? sender, note, overwrite, via: $"arch@{sender}", uploadedAt: uploadedAt);
        if (entry is null) return new ToolOutcome(false, "error", err!);
        _logger.Info($"[ARCH] hub file {entry.Path} received from {sender} ({HubFileStore.Human(entry.Size)})");
        return new ToolOutcome(true, "stored", $"{entry.Path} stored on {SelfLabel} (v{entry.Version})", FileRow(entry, SelfLabel));
    }

    /// <summary>Every reachable peer's file list for the File System tab: one block per machine,
    /// dark peers named with their status instead of hidden.</summary>
    public IReadOnlyList<object> PeerHubFileLists()
    {
        var blocks = new List<object>();
        foreach (var src in _collector.ListSources().Where(s => s.Active))
        {
            var o = _fleet.HubFiles(src.Id, null);
            var files = new List<object>();
            if (o.Ok && o.Data is JsonElement arr && arr.ValueKind == JsonValueKind.Array)
                foreach (var el in arr.EnumerateArray()) files.Add(el);
            blocks.Add(new { machine = src.Label, sourceId = src.Id, status = o.Ok ? "ok" : o.Status, detail = o.Ok ? null : o.Detail, allowSends = src.AllowSends, files });
        }
        return blocks;
    }

    /// <summary>The Operator's how-to, served with the File System tab so the phrasings and the
    /// tool names on the page are the harness's own, never a copy that drifts.</summary>
    public static object HubFilesHowTo(string selfLabel) => new
    {
        hub = selfLabel,
        rules = new[]
        {
            $"A hub path is a short forward-slash path of plain segments, e.g. fixtures/customers.json or prg/testdata/2026-09.csv — no drive letters, no .., at most {HubFileStore.MaxSegments} segments. Namespace by agent or purpose so the arch can name files unambiguously.",
            $"One file up to {HubFileStore.Human(HubFileStore.MaxFileBytes)}; the store up to {HubFileStore.Human(HubFileStore.MaxTotalBytes)} / {HubFileStore.MaxFiles} files.",
            "Uploading to an existing path replaces it and bumps the version (agents pass overwrite to do so knowingly). Nothing expires by itself: files older than " + HubFileStore.StaleDays + " days are marked stale here, and you delete them.",
            "Every harness keeps its own store. A repo agent uploads to and downloads from ITS machine's store; the arch's hub_transfer moves a file between machines. On the hub itself an agent downloads directly.",
            "Sandboxed: the store is a folder under the harness's data dir; agents cannot reach anything else through it. Downloads land inside the agent's own repo folder (hub-downloads/ by default).",
        },
        arch = new[]
        {
            $"arch, have spacex/prg#1 upload its test fixtures (the folder tests/fixtures) to the hub as prg/fixtures/, then have MONSTER/web-flow-autodev#1 download them into its tests/fixtures.",
            "arch, ask MONSTER/prg#1 to upload testdata/customers.sql to the hub as prg/customers.sql, move it here, and tell spacex/prg#1 to download it.",
            "arch, what is on the hub file system? (hub_files) — then: move prg/customers.sql to MONSTER (hub_transfer).",
        },
        repoAgent = new[]
        {
            "upload tests/fixtures/customers.json to the hub file system as prg/fixtures/customers.json (hub_upload)",
            "list the hub file system (hub_files) and download prg/fixtures/customers.json into tests/fixtures/ (hub_download)",
            "put this text on the hub as notes/handoff.md: <text> (hub_upload with text)",
        },
        tools = new
        {
            repoAgent = new[] { "hub_upload", "hub_download", "hub_files" },
            arch = new[] { "hub_files", "hub_transfer" },
        },
    };
}
