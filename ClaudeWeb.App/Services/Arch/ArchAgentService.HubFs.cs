using System.Collections.Concurrent;
using System.Text.Json;
using ClaudeWeb.Services.Events;
using ClaudeWeb.Services.HubFs;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's side of the hub file system (openspec hub-file-system; streamed and
/// unbounded since hubfs-large-files-tree): the fleet-wide listing (<c>hub_files</c>) and the
/// one thing only the arch can do — MOVE a file between machines (<c>hub_transfer</c>) over the
/// proven hub→peer channel (the fleet client, the peer's stored credential, the peer's own
/// accept-sends opt-in for anything written there). A transfer STREAMS: a peer's file is pulled
/// as a raw body straight into this store, and pushed to a peer as a raw body straight from
/// disk — never held in memory, never base64. Because a multi-GB move takes minutes, a transfer
/// runs as a JOB: the tool waits a little, then answers <c>running</c> with a job id the arch
/// polls (<c>action: status</c>). Plus the peer-side handlers the peer API exposes.
/// </summary>
public partial class ArchAgentService
{
    private HubFileStore? _hubFiles;

    /// <summary>The store this harness keeps (null on a build without the module — every tool then says so).</summary>
    public HubFileStore? HubFiles { get => _hubFiles; set => _hubFiles = value; }

    /// <summary>How long hub_transfer waits for a job before answering <c>running</c> with its id.</summary>
    public static readonly TimeSpan TransferWait = TimeSpan.FromSeconds(20);
    /// <summary>Finished transfer jobs are kept this long for status polls.</summary>
    public static readonly TimeSpan TransferJobTtl = TimeSpan.FromHours(6);

    /// <summary>One transfer in flight or finished. <c>Bytes</c> moves as the copy runs.</summary>
    public sealed class TransferJob
    {
        public string Id { get; } = Guid.NewGuid().ToString("N")[..12];
        public string Path { get; init; } = "";
        public string From { get; init; } = "";
        public string To { get; init; } = "";
        public long StartedAt { get; init; }
        public long? FinishedAt { get; set; }
        public long Bytes;                       // copied so far (Interlocked)
        public long? Total { get; set; }
        public string Status { get; set; } = "running";   // running | fetched | pushed | error | <peer status>
        public string Detail { get; set; } = "";
        public object? Data { get; set; }
        public bool Ok { get; set; }
    }

    private readonly ConcurrentDictionary<string, TransferJob> _transfers = new(StringComparer.Ordinal);

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
        return new ToolOutcome(true, "ok", detail, new { hub = SelfLabel, files = rows, notAnswered = errors, stats = _hubFiles.GetStats(), transfers = TransferViews() });
    }

    private IReadOnlyList<object> TransferViews()
    {
        var now = Now();
        foreach (var (id, j) in _transfers.ToArray())
            if (j.FinishedAt is { } f && now - f > TransferJobTtl.TotalMilliseconds) _transfers.TryRemove(id, out _);
        return _transfers.Values.OrderByDescending(j => j.StartedAt).Select(TransferView).ToList();
    }

    private static object TransferView(TransferJob j) => new
    {
        jobId = j.Id, path = j.Path, from = j.From, to = j.To, status = j.Status, ok = j.Ok, detail = j.Detail,
        bytes = Interlocked.Read(ref j.Bytes), bytesHuman = HubFileStore.Human(Interlocked.Read(ref j.Bytes)), total = j.Total,
        percent = j.Total is > 0 ? Math.Min(100, (int)(Interlocked.Read(ref j.Bytes) * 100 / j.Total.Value)) : (int?)null,
        startedAt = j.StartedAt, finishedAt = j.FinishedAt, data = j.Data,
    };

    /// <summary>The <c>hub_transfer</c> tool. <c>action</c> transfer (default): copy a hub file
    /// between machines — a peer's store → the hub (fetched, kept), the hub → a peer (pushed), or
    /// peer → peer through the hub — as a streamed background job; answers when it finished
    /// within <see cref="TransferWait"/>, else <c>running</c> with the job id. <c>action</c> status:
    /// one job (<c>jobId</c>) or every recent one. Pushes need this Operator's "allow sends" to
    /// that machine and the peer's own "accept fleet sends"; a peer without the route answers
    /// no-peer-api.</summary>
    public ToolOutcome ToolHubTransfer(string? action, string? path, string? from, string? to, bool overwrite, string? jobId = null)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", "this harness has no hub file store");
        var act = (action ?? "transfer").Trim().ToLowerInvariant();
        if (act == "status")
        {
            if (!string.IsNullOrWhiteSpace(jobId))
            {
                if (!_transfers.TryGetValue(jobId.Trim(), out var j)) return new ToolOutcome(false, "not-found", $"no transfer job {jobId} (finished jobs are kept {TransferJobTtl.TotalHours:0} h)");
                return new ToolOutcome(j.Status != "error", j.Status, $"{j.Path} {j.From} → {j.To}: {j.Status}{(j.Status == "running" ? $", {HubFileStore.Human(Interlocked.Read(ref j.Bytes))}{(j.Total is { } t ? $" of {HubFileStore.Human(t)}" : "")} so far" : $" — {j.Detail}")}", TransferView(j));
            }
            var all = TransferViews();
            return new ToolOutcome(true, "ok", $"{all.Count} recent transfer job(s)", new { transfers = all });
        }
        if (act != "transfer") return new ToolOutcome(false, "error", $"unknown action \"{action}\": transfer | status");

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
        if (src.IsSelf && _hubFiles.Find(norm) is null) return new ToolOutcome(false, "not-found", $"no file {norm} on {SelfLabel}'s hub store; hub_files lists what is there");
        if (!dst.IsSelf && !dst.Source!.AllowSends) return new ToolOutcome(false, "error", $"the operator has not allowed sends to {dstLabel} (events app / Arch tab: allow sends); nothing was moved");

        var job = new TransferJob { Path = norm, From = srcLabel, To = dstLabel, StartedAt = Now() };
        _transfers[job.Id] = job;
        var run = Task.Run(() => RunTransfer(job, src, dst, overwrite));
        if (run.Wait(TransferWait))
            return new ToolOutcome(job.Ok, job.Status, job.Detail, TransferView(job));
        return new ToolOutcome(true, "running",
            $"{norm} {srcLabel} → {dstLabel} is streaming in the background ({HubFileStore.Human(Interlocked.Read(ref job.Bytes))}{(job.Total is { } tot ? $" of {HubFileStore.Human(tot)}" : "")} so far); poll hub_transfer action status jobId {job.Id} — a multi-GB file takes minutes",
            TransferView(job));
    }

    private void RunTransfer(TransferJob job, MachineRef src, MachineRef dst, bool overwrite)
    {
        try
        {
            HubFileStore.Entry entry;
            // 1. the bytes: from the hub's own store, or streamed from the peer into the hub (kept here).
            if (src.IsSelf)
            {
                entry = _hubFiles!.Find(job.Path)!;
            }
            else
            {
                var pull = _fleet.HubFileOpen(src.Source!.Id, job.Path);
                if (pull.Error is not null) { Finish(job, false, pull.Error.Status, $"{job.From}: {pull.Error.Detail}"); AuditTool("hub_transfer", null, $"fetch {job.Path} from {job.From}: {pull.Error.Status}"); return; }
                using var body = pull.Body!;
                job.Total = pull.Length;
                var (put, perr) = _hubFiles!.PutStream(job.Path, body.Stream, pull.Length, pull.UploadedBy, pull.Machine, pull.Note, overwrite: true,
                    via: $"arch ← {job.From}", uploadedAt: pull.UploadedAt, progress: n => Interlocked.Exchange(ref job.Bytes, n));
                if (put is null) { Finish(job, false, "error", $"could not keep {job.Path} on the hub: {perr}"); return; }
                entry = put;
            }
            if (dst.IsSelf)
            {
                Interlocked.Exchange(ref job.Bytes, entry.Size);
                job.Total = entry.Size;
                AuditTool("hub_transfer", null, $"fetched {job.Path} from {job.From} ({HubFileStore.Human(entry.Size)})");
                _logger.Info($"[ARCH] hub_transfer: {job.Path} fetched from {job.From} ({HubFileStore.Human(entry.Size)})");
                job.Data = FileRow(entry, SelfLabel);
                Finish(job, true, "fetched", $"{job.Path} ({HubFileStore.Human(entry.Size)}, uploaded by {entry.UploadedBy} on {entry.Machine}) is now on {SelfLabel}'s hub store — a repo agent here can hub_download it");
                return;
            }
            // 2. push to the destination peer, streamed straight from disk.
            var opened = _hubFiles!.Open(job.Path);
            if (opened is null) { Finish(job, false, "not-found", $"{job.Path} vanished from {SelfLabel}'s store before the push"); return; }
            var (e2, fs) = opened.Value;
            job.Total = e2.Size;
            Interlocked.Exchange(ref job.Bytes, 0);
            ToolOutcome push;
            using (fs)
            {
                push = _fleet.HubFilePutStream(dst.Source!.Id, job.Path, new FleetClient.CountingStream(fs, n => Interlocked.Exchange(ref job.Bytes, n)), e2.Size,
                    new FleetClient.HubFileProvenance(SelfLabel, e2.UploadedBy, e2.Machine, e2.Note, e2.UploadedAt, overwrite));
            }
            AuditTool("hub_transfer", null, $"push {job.Path} → {job.To}: {push.Status}");
            if (!push.Ok) { Finish(job, false, push.Status, $"{job.To}: {push.Detail}"); return; }
            _logger.Info($"[ARCH] hub_transfer: {job.Path} pushed to {job.To} ({HubFileStore.Human(e2.Size)})");
            job.Data = new { path = job.Path, from = job.From, to = job.To, size = e2.Size, uploadedBy = e2.UploadedBy, peer = push.Data };
            Finish(job, true, "pushed", $"{job.Path} ({HubFileStore.Human(e2.Size)}) is now on {job.To}'s hub store{(src.IsSelf ? "" : $" (and kept on {SelfLabel})")} — a repo agent there can hub_download it");
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH] hub_transfer {job.Path} {job.From} → {job.To} failed: {ex.Message}");
            Finish(job, false, "error", ex.Message);
        }
    }

    private void Finish(TransferJob job, bool ok, string status, string detail)
    {
        job.Ok = ok;
        job.Status = status;
        job.Detail = detail;
        job.FinishedAt = Now();
    }

    // ---- the peer side (what a hub calls on this harness) -------------------------------------

    /// <summary>The peer API's file list: this harness's store, as rows a hub can merge.</summary>
    public ToolOutcome PeerHubFiles(string? prefix)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store");
        var rows = _hubFiles.List(prefix).Select(e => FileRow(e, SelfLabel)).ToList();
        return new ToolOutcome(true, "ok", $"{rows.Count} file(s) on {SelfLabel}", rows);
    }

    /// <summary>The peer API's fetch: the entry and its open stream, or the refusal.</summary>
    public (HubFileStore.Entry Entry, FileStream Stream)? PeerHubFileOpen(string? path, out ToolOutcome? refusal)
    {
        refusal = null;
        if (_hubFiles is null) { refusal = new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store"); return null; }
        var opened = _hubFiles.Open(path);
        if (opened is null) { refusal = new ToolOutcome(false, "not-found", $"no file {path} on {SelfLabel}'s hub store"); return null; }
        return opened;
    }

    /// <summary>The peer API's push: a hub streams a file into this store. Behind this harness's
    /// "accept fleet sends" opt-in like every write a fleet arch may do here.</summary>
    public ToolOutcome PeerHubFilePutStream(string? from, string? path, Stream body, long? length, string? uploadedBy, string? machine, string? note, long? uploadedAt, bool overwrite, CancellationToken ct)
    {
        if (_hubFiles is null) return new ToolOutcome(false, "unavailable", $"{SelfLabel} has no hub file store");
        var sender = SanitizeMachine(from);
        if (sender is null) return new ToolOutcome(false, "error", "from (the sending machine's label) is required");
        if (!AcceptFleetSends) return new ToolOutcome(false, "not-accepting", $"{SelfLabel} does not accept fleet sends (its operator has not opted in)");
        var (entry, err) = _hubFiles.PutStream(path, body, length, uploadedBy ?? "unknown", machine ?? sender, note, overwrite, via: $"arch@{sender}", uploadedAt: uploadedAt, ct: ct);
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

    /// <summary>The transfer jobs for the File System tab.</summary>
    public IReadOnlyList<object> HubTransferViews() => TransferViews();

    /// <summary>The Operator's how-to, served with the File System tab so the phrasings and the
    /// tool names on the page are the harness's own, never a copy that drifts.</summary>
    public static object HubFilesHowTo(string selfLabel) => new
    {
        hub = selfLabel,
        rules = new[]
        {
            $"A hub path is a short forward-slash path of plain segments, e.g. fixtures/customers.json or prg/testdata/2026-09.csv — no drive letters, no .., at most {HubFileStore.MaxSegments} segments. Namespace by agent or purpose; every slash is a folder in the tree here.",
            "No size limit: a multi-GB file (a whole database dump) is a normal upload. Everything is streamed to disk — uploads, downloads and transfers between machines never hold a file in memory; the only check is free space on the store's volume.",
            "Uploading to an existing path replaces it and bumps the version (agents pass overwrite to do so knowingly). Nothing expires by itself: files older than " + HubFileStore.StaleDays + " days are marked stale here, and you delete them.",
            "Every harness keeps its own store. A repo agent uploads to and downloads from ITS machine's store; the arch's hub_transfer moves a file between machines as a background job it can poll (a multi-GB move takes minutes). On the hub itself an agent downloads directly.",
            "Sandboxed: the store is a folder under the harness's data dir; agents cannot reach anything else through it. Downloads land inside the agent's own repo folder (hub-downloads/ by default).",
        },
        arch = new[]
        {
            $"arch, have spacex/prg#1 upload its test fixtures (the folder tests/fixtures) to the hub as prg/fixtures/, then have MONSTER/web-flow-autodev#1 download them into its tests/fixtures.",
            "arch, ask MONSTER/prg#1 to upload its 5 GB database dump backups/prod.bak to the hub as prg/db/prod.bak, move it here, and tell spacex/prg#1 to download it into backups/.",
            "arch, what is on the hub file system? (hub_files) — then: move prg/db/prod.bak to MONSTER (hub_transfer) — then: how is that transfer doing? (hub_transfer status).",
        },
        repoAgent = new[]
        {
            "upload tests/fixtures/customers.json to the hub file system as prg/fixtures/customers.json (hub_upload)",
            "upload backups/prod.bak (5 GB) to the hub file system as prg/db/prod.bak (hub_upload — streamed, no size limit)",
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
