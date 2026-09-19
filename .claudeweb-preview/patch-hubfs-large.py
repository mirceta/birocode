import io, json

def read(p): return io.open(p, encoding='utf-8').read()
def write(p, s): io.open(p, 'w', encoding='utf-8', newline=chr(10)).write(s); print('patched', p)
def rep(s, old, new, p=''):
    assert s.count(old) == 1, (p, old[:80], s.count(old))
    return s.replace(old, new)

# ---- FleetClient: the bulk (streamed, untimed) file routes -------------------------------
p = 'ClaudeWeb.App/Services/Arch/FleetClient.cs'; s = read(p)
s = rep(s, '''    /// <summary>One file's bytes (base64) + provenance from a peer's store.</summary>
    public ArchAgentService.ToolOutcome HubFileGet(string sourceId, string path) =>
        Get(sourceId, $"{PeerPath}/files/content?path={Uri.EscapeDataString(path)}");

    /// <summary>Push a file into a peer's store; the peer applies its own accept-sends opt-in.
    /// The body carries from, path, contentBase64, uploadedBy, machine, note, uploadedAt, overwrite.</summary>
    public ArchAgentService.ToolOutcome HubFilePut(string sourceId, object body) => Post(sourceId, PeerPath + "/files", body);''',
'''    // A second client for file bodies (openspec hubfs-large-files-tree): no timeout — a multi-GB
    // transfer streams for minutes; the peer's request/response data-rate guards and the job's
    // own accounting are the safety net, not a wall clock.
    private static readonly HttpClient Bulk = new() { Timeout = Timeout.InfiniteTimeSpan };

    public sealed record HubFileProvenance(string From, string UploadedBy, string Machine, string? Note, long? UploadedAt, bool Overwrite);

    /// <summary>An open peer file body: dispose it to release the response.</summary>
    public sealed class HubFileBody : IDisposable
    {
        private readonly HttpResponseMessage _resp;
        public Stream Stream { get; }
        public HubFileBody(HttpResponseMessage resp, Stream stream) { _resp = resp; Stream = stream; }
        public void Dispose() { try { Stream.Dispose(); } catch { /* best effort */ } _resp.Dispose(); }
    }

    /// <summary>What a fetch returned: either <c>Error</c> (the peer's refusal or a transport
    /// status) or an open <c>Body</c> with the provenance the peer put in headers.</summary>
    public sealed record HubFilePull(ArchAgentService.ToolOutcome? Error, HubFileBody? Body, long? Length, string UploadedBy, string Machine, string? Note, long? UploadedAt);

    /// <summary>Open a peer's file as a raw stream (headers read, body not yet) — the caller
    /// copies it wherever it goes and disposes the body. A JSON reply is the peer's refusal.</summary>
    public HubFilePull HubFileOpen(string sourceId, string path)
    {
        HubFilePull Fail(string status, string detail) => new(new ArchAgentService.ToolOutcome(false, status, detail), null, null, "", "", null, null);
        var req = _collector.BuildPeerRequest(sourceId, HttpMethod.Get, $"{PeerPath}/files/content?path={Uri.EscapeDataString(path)}");
        if (req is null) return Fail(StatusError, "not a subscribed remote harness");
        HttpResponseMessage resp;
        try { resp = Bulk.SendAsync(req, HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult(); }
        catch (Exception ex) { return Fail(StatusUnreachable, _collector.ScrubFor(sourceId, ReachReason(ex))); }
        var (status, detail) = Classify(resp);
        if (status != StatusOk) { resp.Dispose(); return Fail(status, detail ?? status); }
        var mediaType = resp.Content.Headers.ContentType?.MediaType ?? "";
        if (mediaType.Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            // The peer answered with the envelope: a logical refusal (not-found, unavailable …).
            PeerReply? reply = null;
            try { reply = resp.Content.ReadFromJsonSafeAsync<PeerReply>(Json, CancellationToken.None).GetAwaiter().GetResult(); } catch { /* fall through */ }
            resp.Dispose();
            return Fail(reply?.Status ?? StatusError, _collector.ScrubFor(sourceId, reply?.Detail ?? "unexpected reply body from the peer"));
        }
        string H(string name) => resp.Headers.TryGetValues(name, out var v) ? Uri.UnescapeDataString(v.FirstOrDefault() ?? "") : "";
        long? at = long.TryParse(H("X-Hub-UploadedAt"), out var a) ? a : null;
        Stream stream;
        try { stream = resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult(); }
        catch (Exception ex) { resp.Dispose(); return Fail(StatusUnreachable, _collector.ScrubFor(sourceId, ReachReason(ex))); }
        var note = H("X-Hub-Note");
        return new HubFilePull(null, new HubFileBody(resp, stream), resp.Content.Headers.ContentLength,
            H("X-Hub-UploadedBy") is { Length: > 0 } by ? by : "unknown", H("X-Hub-Machine") is { Length: > 0 } m ? m : "?", note.Length == 0 ? null : note, at);
    }

    /// <summary>Push a file into a peer's store as a raw body straight from a stream (never
    /// buffered); the provenance rides in the query, the peer applies its own accept-sends opt-in.</summary>
    public ArchAgentService.ToolOutcome HubFilePutStream(string sourceId, string path, Stream content, long length, HubFileProvenance prov)
    {
        var q = $"?path={Uri.EscapeDataString(path)}&from={Uri.EscapeDataString(prov.From)}&uploadedBy={Uri.EscapeDataString(prov.UploadedBy)}&machine={Uri.EscapeDataString(prov.Machine)}"
            + (prov.Note is null ? "" : $"&note={Uri.EscapeDataString(prov.Note)}") + (prov.UploadedAt is { } at ? $"&uploadedAt={at}" : "") + (prov.Overwrite ? "&overwrite=true" : "");
        var req = _collector.BuildPeerRequest(sourceId, HttpMethod.Post, PeerPath + "/files" + q);
        if (req is null) return new ArchAgentService.ToolOutcome(false, StatusError, "not a subscribed remote harness");
        var body = new StreamContent(content, 1024 * 1024);
        body.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/octet-stream");
        body.Headers.ContentLength = length;
        req.Content = body;
        try
        {
            using var resp = Bulk.SendAsync(req).GetAwaiter().GetResult();
            var (status, detail) = Classify(resp);
            if (status != StatusOk) return new ArchAgentService.ToolOutcome(false, status, detail ?? status);
            var reply = resp.Content.ReadFromJsonSafeAsync<PeerReply>(Json, CancellationToken.None).GetAwaiter().GetResult();
            if (reply is null) return new ArchAgentService.ToolOutcome(false, StatusError, "unexpected reply body from the peer");
            return new ArchAgentService.ToolOutcome(reply.Ok, reply.Status ?? StatusError, _collector.ScrubFor(sourceId, reply.Detail ?? ""), reply.Data);
        }
        catch (Exception ex)
        {
            var reason = ReachReason(ex);
            _logger.Info($"[FLEET] POST files to source {sourceId}: {reason}");
            return new ArchAgentService.ToolOutcome(false, StatusUnreachable, _collector.ScrubFor(sourceId, reason));
        }
    }

    /// <summary>A read-through stream that reports the bytes read so far (a transfer's progress).</summary>
    public sealed class CountingStream : Stream
    {
        private readonly Stream _inner;
        private readonly Action<long> _onRead;
        private long _read;
        public CountingStream(Stream inner, Action<long> onRead) { _inner = inner; _onRead = onRead; }
        public override bool CanRead => _inner.CanRead;
        public override bool CanSeek => _inner.CanSeek;
        public override bool CanWrite => false;
        public override long Length => _inner.Length;
        public override long Position { get => _inner.Position; set => _inner.Position = value; }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) { var n = _inner.Read(buffer, offset, count); if (n > 0) { _read += n; _onRead(_read); } return n; }
        public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct) { var n = await _inner.ReadAsync(buffer.AsMemory(offset, count), ct); if (n > 0) { _read += n; _onRead(_read); } return n; }
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default) { var n = await _inner.ReadAsync(buffer, ct); if (n > 0) { _read += n; _onRead(_read); } return n; }
        public override long Seek(long offset, SeekOrigin origin) => _inner.Seek(offset, origin);
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }''', p)
write(p, s)

# ---- ArchPeerController: raw streamed file routes ----------------------------------------
p = 'ClaudeWeb.App/Controllers/ArchPeerController.cs'; s = read(p)
if 'using Microsoft.AspNetCore.Http.Features;' not in s:
    s = rep(s, 'using Microsoft.AspNetCore.Mvc;', 'using Microsoft.AspNetCore.Http.Features;\nusing Microsoft.AspNetCore.Mvc;\nusing System.Text.Json;', p)
s = rep(s, '''    /// <summary>One file's bytes (base64) with its provenance, for a hub's hub_transfer.</summary>
    [HttpGet("files/content")]
    public IActionResult FileContent([FromQuery] string? path)
    {
        _logger.CountRequest();
        var o = _arch.PeerHubFileGet(path);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }

    public sealed record PeerFilePutRequest(string? From, string? Path, string? ContentBase64, string? UploadedBy, string? Machine, string? Note, long? UploadedAt, bool? Overwrite = null);

    /// <summary>A hub pushes a file into this store (hub_transfer): behind the password middleware
    /// AND this harness's "accept fleet sends" opt-in, like every write a fleet arch may do here.</summary>
    [HttpPost("files")]
    public IActionResult FilePut([FromBody] PeerFilePutRequest? req)
    {
        _logger.CountRequest();
        var o = _arch.PeerHubFilePut(req?.From, req?.Path, req?.ContentBase64, req?.UploadedBy, req?.Machine, req?.Note, req?.UploadedAt, req?.Overwrite == true);
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }''',
'''    /// <summary>One file's bytes as a RAW STREAM (openspec hubfs-large-files-tree) with the
    /// provenance in X-Hub-* headers, for a hub's hub_transfer — any size, never buffered. A
    /// refusal (not found, no store) is the usual JSON envelope; the caller tells them apart by
    /// content type. The response data-rate guard is lifted: a slow link must not cut a 5 GB file.</summary>
    [HttpGet("files/content")]
    public IActionResult FileContent([FromQuery] string? path)
    {
        _logger.CountRequest();
        var opened = _arch.PeerHubFileOpen(path, out var refusal);
        if (opened is null) return Ok(new { ok = false, status = refusal!.Status, detail = refusal.Detail, data = (object?)null });
        var (e, stream) = opened.Value;
        var rate = HttpContext.Features.Get<IHttpMinResponseDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        Response.Headers["X-Hub-UploadedBy"] = Uri.EscapeDataString(e.UploadedBy);
        Response.Headers["X-Hub-Machine"] = Uri.EscapeDataString(e.Machine);
        if (e.Note is not null) Response.Headers["X-Hub-Note"] = Uri.EscapeDataString(e.Note);
        Response.Headers["X-Hub-UploadedAt"] = e.UploadedAt.ToString();
        Response.Headers["X-Hub-Sha256"] = e.Sha256;
        Response.Headers["X-Hub-Version"] = e.Version.ToString();
        Response.Headers["X-Hub-Size"] = e.Size.ToString();
        return File(stream, "application/octet-stream");
    }

    public sealed record PeerFilePutRequest(string? From, string? Path, string? ContentBase64, string? UploadedBy, string? Machine, string? Note, long? UploadedAt, bool? Overwrite = null);

    /// <summary>A hub pushes a file into this store (hub_transfer): the body is the RAW file of
    /// any size (openspec hubfs-large-files-tree), streamed straight to the store — the request
    /// size limit and the body data-rate guard are lifted for this route; the provenance rides in
    /// the query. An older hub's JSON body (base64) is still accepted. Behind the password
    /// middleware AND this harness's "accept fleet sends" opt-in, like every write a fleet arch may do here.</summary>
    [HttpPost("files")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> FilePut([FromQuery] string? path, [FromQuery] string? from, [FromQuery] string? uploadedBy, [FromQuery] string? machine,
        [FromQuery] string? note, [FromQuery] long? uploadedAt, [FromQuery] bool overwrite = false)
    {
        _logger.CountRequest();
        var rate = HttpContext.Features.Get<IHttpMinRequestBodyDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        var sync = HttpContext.Features.Get<IHttpBodyControlFeature>();
        if (sync is not null) sync.AllowSynchronousIO = true;   // the store copies the body with a plain buffered loop
        Services.Arch.ArchAgentService.ToolOutcome o;
        if ((Request.ContentType ?? "").Contains("json", StringComparison.OrdinalIgnoreCase))
        {
            PeerFilePutRequest? req = null;
            try { req = await JsonSerializer.DeserializeAsync<PeerFilePutRequest>(Request.Body, new JsonSerializerOptions(JsonSerializerDefaults.Web), HttpContext.RequestAborted); } catch { /* bad body → refused below */ }
            byte[] bytes;
            try { bytes = Convert.FromBase64String(req?.ContentBase64 ?? ""); }
            catch { return Ok(new { ok = false, status = "error", detail = "contentBase64 is not valid base64", data = (object?)null }); }
            using var ms = new MemoryStream(bytes, writable: false);
            o = _arch.PeerHubFilePutStream(req?.From, req?.Path, ms, bytes.LongLength, req?.UploadedBy, req?.Machine, req?.Note, req?.UploadedAt, req?.Overwrite == true, HttpContext.RequestAborted);
        }
        else
        {
            o = _arch.PeerHubFilePutStream(from, path, Request.Body, Request.ContentLength, uploadedBy, machine, note, uploadedAt, overwrite, HttpContext.RequestAborted);
        }
        return Ok(new { ok = o.Ok, status = o.Status, detail = o.Detail, data = o.Data });
    }''', p)
write(p, s)

# ---- HubFsController: streamed download + transfer jobs in the view ------------------------
p = 'ClaudeWeb.App/Controllers/HubFsController.cs'; s = read(p)
s = rep(s, 'using Microsoft.AspNetCore.Mvc;', 'using Microsoft.AspNetCore.Http.Features;\nusing Microsoft.AspNetCore.Mvc;', p)
s = rep(s, '''            peers = peers ? _arch.PeerHubFileLists() : Array.Empty<object>(),
            howTo = ArchAgentService.HubFilesHowTo(_arch.SelfLabel),''',
'''            peers = peers ? _arch.PeerHubFileLists() : Array.Empty<object>(),
            transfers = _arch.HubTransferViews(),
            howTo = ArchAgentService.HubFilesHowTo(_arch.SelfLabel),''', p)
s = rep(s, '''        var got = _store.Get(path);
        if (got is null) return NotFound(new { error = $"no hub file {path}" });
        var (entry, bytes) = got.Value;
        return File(bytes, entry.ContentType, Path.GetFileName(entry.Path));''',
'''        // Streamed (openspec hubfs-large-files-tree): a FileStream, range requests allowed, the
        // response data-rate guard lifted so a multi-GB download over a slow link completes.
        var opened = _store.Open(path);
        if (opened is null) return NotFound(new { error = $"no hub file {path}" });
        var (entry, stream) = opened.Value;
        var rate = HttpContext.Features.Get<IHttpMinResponseDataRateFeature>();
        if (rate is not null) rate.MinDataRate = null;
        return File(stream, entry.ContentType, Path.GetFileName(entry.Path), enableRangeProcessing: true);''', p)
s = rep(s, '''///   GET    /api/hubfs                    -> { machine, stats, files[], peers[{ machine, status, detail, files[] }] }
///   GET    /api/hubfs/file?path=         -> the bytes (attachment)''',
'''///   GET    /api/hubfs                    -> { machine, stats, files[], peers[{ machine, status, detail, files[] }], transfers[] }
///   GET    /api/hubfs/file?path=         -> the bytes, streamed (attachment, ranges allowed)''', p)
write(p, s)

# ---- the CLI's MCP tool timeout ----------------------------------------------------------
p = 'ClaudeWeb.App/Services/Chat/ClaudeCliAdapter.cs'; s = read(p)
s = rep(s, '''        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");''',
'''        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        // A harness MCP tool call may run long: a multi-GB hub_upload / hub_download streams for
        // minutes (openspec hubfs-large-files-tree). Give the CLI's per-call tool timeout two
        // hours unless the environment already says otherwise.
        if (!psi.EnvironmentVariables.ContainsKey("MCP_TOOL_TIMEOUT")) psi.EnvironmentVariables["MCP_TOOL_TIMEOUT"] = "7200000";''', p)
write(p, s)

# ---- the arch tool: action + jobId, path no longer required ------------------------------
p = 'ClaudeWeb.App/Services/Arch/ArchMcpServer.cs'; s = read(p)
s = rep(s, '''            "hub_transfer" => _arch.ToolHubTransfer(S("path"), S("from"), S("to"), B("overwrite") == true),''',
'''            "hub_transfer" => _arch.ToolHubTransfer(S("action"), S("path"), S("from"), S("to"), B("overwrite") == true, S("jobId")),''', p)
s = rep(s, '''        Tool("hub_transfer",
            "Move a hub file between machines: from a peer's store to this hub (fetched and kept here), from this hub to a peer's store (pushed), or peer → peer (through this hub). The ritual for A's files reaching B on another machine: send_task A to hub_upload them as <prefix>/<name>, wait for A's reply naming the hub paths, hub_transfer each path from A's machine to B's, then send_task B to hub_download it. A push needs the Operator's allow-sends to that machine and the peer's own accept-fleet-sends; a peer without the file routes answers no-peer-api. overwrite replaces an existing file on the destination.",
            Schema(("path", "string", "the hub path (e.g. prg/fixtures/customers.json)", true),''',
'''        Tool("hub_transfer",
            "Move a hub file between machines: from a peer's store to this hub (fetched and kept here), from this hub to a peer's store (pushed), or peer → peer (through this hub). Any size, streamed — a multi-GB file runs as a background job: the call answers when it finished within ~20 s, else `running` with a jobId you poll with action status (report progress to the Operator, do not re-issue the transfer). The ritual for A's files reaching B on another machine: send_task A to hub_upload them as <prefix>/<name>, wait for A's reply naming the hub paths, hub_transfer each path from A's machine to B's (poll until fetched/pushed), then send_task B to hub_download it. A push needs the Operator's allow-sends to that machine and the peer's own accept-fleet-sends; a peer without the file routes answers no-peer-api. overwrite replaces an existing file on the destination.",
            Schema(("action", "string", "transfer (default) | status (one job by jobId, or every recent job)", false),
                ("jobId", "string", "status: the job to report", false),
                ("path", "string", "the hub path (e.g. prg/fixtures/customers.json); required for a transfer", false),''', p)
write(p, s)

# ---- the repo-agent catalogue: no size limit --------------------------------------------
p = 'ClaudeWeb.App/Services/Agents/RepoAgentMcpServer.cs'; s = read(p)
s = rep(s, 'An existing hub path is replaced only with overwrite (version + 1). One file at a time, up to 64 MB. Reply with the hub path so the arch / the Operator can name it.',
          'An existing hub path is replaced only with overwrite (version + 1). One file at a time, ANY size — streamed to disk, a multi-GB database dump is fine (it takes as long as a disk copy). Reply with the hub path so the arch / the Operator can name it.', p)
write(p, s)

# ---- i18n ----------------------------------------------------------------------------------
for p, pairs in [
    ('client/src/i18n/en.json', [
        ('"fs.stats": "{n} files · {bytes} used · one file up to {maxFile}, a store up to {maxTotal}"', '"fs.stats": "{n} files · {bytes} used · {free} free on the hub\'s volume · no size limit"'),
        ('  "fs.rules": "The rules",', '  "fs.rules": "The rules",\n  "fs.expandAll": "expand all",\n  "fs.collapseAll": "collapse all",\n  "fs.transfers": "Transfers between machines (the arch\'s hub_transfer jobs)",'),
    ]),
    ('client/src/i18n/tr.json', [
        ('"fs.stats": "{n} dosya · {bytes} kullanimda · tek dosya en fazla {maxFile}, depo en fazla {maxTotal}"', '"fs.stats": "{n} dosya · {bytes} kullanimda · hub diskinde {free} bos · boyut siniri yok"'),
        ('  "fs.rules": "Kurallar",', '  "fs.rules": "Kurallar",\n  "fs.expandAll": "tumunu ac",\n  "fs.collapseAll": "tumunu kapat",\n  "fs.transfers": "Makineler arasi aktarimlar (arch\'in hub_transfer isleri)",'),
    ]),
]:
    s = read(p)
    for old, new in pairs: s = rep(s, old, new, p)
    write(p, s)
    json.load(io.open(p, encoding='utf-8'))

# ---- css ---------------------------------------------------------------------------------------
p = 'client/src/manage/fileSystem.css'; s = read(p)
s += '''
/* the tree (openspec hubfs-large-files-tree) */
.fs__treebar { display: flex; gap: 6px; margin: 0 0 6px; }
.fs__row--folder { cursor: pointer; background: rgba(255, 255, 255, .025); }
.fs__row--folder:hover td { background: rgba(94, 160, 239, .08); }
.fs__twisty { background: transparent; border: 0; color: var(--color-text-muted, #9aa); cursor: pointer; font: inherit; font-size: 12px; width: 18px; padding: 0; margin-right: 2px; }
.fs__fname { font-weight: 600; }
.fs__transfers { border: 1px dashed var(--color-accent, #5ea0ef); border-radius: 10px; padding: 6px 10px 8px; margin: 8px 0; font-size: 12.5px; }
.fs__transfers ul { margin: 0; padding-left: 18px; }
.fs__transfers li { margin-bottom: 4px; }
'''
write(p, s)

# ---- client tests -----------------------------------------------------------------------------
p = 'client/package.json'; s = read(p)
s = rep(s, 'src/components/taskgraph/policemanDuties.test.mjs"', 'src/components/taskgraph/policemanDuties.test.mjs src/manage/fileTree.test.mjs"', p)
write(p, s)

# ---- docs -------------------------------------------------------------------------------------
p = 'docs/hub-file-system-convention.md'; s = read(p)
s = rep(s, '''## Limits and retention

- One file up to **64 MB**; a store up to **2 GB** and **5000 files**.
- Nothing expires by itself.''',
'''## Sizes and retention

- **No size limit.** A multi-GB file — a whole database dump — is a normal upload. Every
  upload, download and transfer is **streamed** to disk through a small buffer; nothing is held
  in memory, on either side. The only check is free space on the store's volume.
- A cross-machine `hub_transfer` of a big file runs as a **background job**: the arch's call
  answers `running` with a job id after ~20 s and polls it (`action: status`) until it reads
  `fetched` or `pushed`. Agents' own uploads/downloads take as long as a disk copy.
- Nothing expires by itself.''', p)
s = rep(s, '''- **Namespace** by agent or purpose so the arch can name a file unambiguously:
  `prg/fixtures/customers.json`, `webflow/testdata/2026-09.csv`, `notes/handoff-to-prg.md`.''',
'''- **Namespace** by agent or purpose so the arch can name a file unambiguously:
  `prg/fixtures/customers.json`, `webflow/testdata/2026-09.csv`, `notes/handoff-to-prg.md`.
  Every slash is a folder level on the File System tab's collapsible tree.''', p)
write(p, s)

# ---- xunit: the limits test becomes a streaming test -----------------------------------------
p = 'tests/ClaudeWeb.Tests/HubFileSystemTests.cs'; s = read(p)
s = rep(s, '''    [Fact]
    public void Limits_are_enforced_before_anything_is_written()
    {
        var s = Store();
        var (big, err) = s.Put("big.bin", new byte[HubFileStore.MaxFileBytes + 1], "a", "m");
        Assert.Null(big);
        Assert.Contains("up to 64 MB", err);
        Assert.Empty(s.List());
        Assert.Equal("64 MB", HubFileStore.Human(HubFileStore.MaxFileBytes));
        Assert.Equal("2 GB", HubFileStore.Human(HubFileStore.MaxTotalBytes));
        Assert.Equal("1.5 KB", HubFileStore.Human(1536));
    }''',
'''    /// <summary>A stream that yields N bytes of a pattern without ever holding them: the shape of a
    /// multi-GB upload. Not seekable, so the store must not ask for Length or rewind.</summary>
    private sealed class PatternStream : Stream
    {
        private readonly long _total; private long _pos;
        public PatternStream(long total) { _total = total; }
        public override bool CanRead => true; public override bool CanSeek => false; public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException(); public override long Position { get => _pos; set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override int Read(byte[] buffer, int offset, int count) { var n = (int)Math.Min(count, _total - _pos); for (var i = 0; i < n; i++) buffer[offset + i] = (byte)((_pos + i) % 251); _pos += n; return n; }
        public override long Seek(long o, SeekOrigin s) => throw new NotSupportedException(); public override void SetLength(long v) => throw new NotSupportedException(); public override void Write(byte[] b, int o, int c) => throw new NotSupportedException();
    }

    [Fact]
    public void Streams_of_any_size_are_written_through_a_buffer_hashed_on_the_way_and_read_back_as_streams()
    {
        var s = Store();
        // 7 MB from a non-seekable stream — many buffer rounds, never a byte[] of the whole file; progress reported.
        var size = 7L * 1024 * 1024 + 123;
        var seen = new List<long>();
        var (e, err) = s.PutStream("web/db/prod.bak", new PatternStream(size), size, "MONSTER/web#1", "MONSTER", "a database dump", progress: seen.Add);
        Assert.Null(err);
        Assert.Equal(size, e!.Size);
        Assert.True(seen.Count >= 7 && seen[^1] == size, $"progress reported {seen.Count} times, last {seen[^1]}");
        Assert.Equal("application/octet-stream", e.ContentType);
        Assert.Equal(64, e.Sha256.Length);
        // Read back as a stream and re-hash: the bytes are the pattern, the hash the store recorded.
        var (entry, stream) = s.Open("web/db/prod.bak")!.Value;
        using (stream)
        {
            Assert.Equal(size, stream.Length);
            var sha = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(stream)).ToLowerInvariant();
            Assert.Equal(entry.Sha256, sha);
        }
        // A known length that cannot fit the volume is refused before anything is written.
        var (big, berr) = s.PutStream("web/db/huge.bak", new PatternStream(1), long.MaxValue / 4, "a", "m");
        Assert.Null(big);
        Assert.Contains("not enough free space", berr);
        Assert.Null(s.Find("web/db/huge.bak"));
        // No per-file or per-store limit exists any more; the stats carry the volume's free space.
        var stats = s.GetStats();
        Assert.Equal(1, stats.Files);
        Assert.True(stats.FreeBytes is > 0);
        Assert.Equal("1.5 KB", HubFileStore.Human(1536));
        Assert.Equal("5 GB", HubFileStore.Human(5L * 1024 * 1024 * 1024));
    }''', p)
write(p, s)

# ---- the File System shot: the tree, free space, transfers ----------------------------------
p = 'client/tests/ui/shot-manage-files.mjs'; s = read(p)
s = rep(s, "  stats: { files: hubFiles.length, bytes: hubFiles.reduce((n, f) => n + f.size, 0), maxFileBytes: 64 * 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 * 1024, maxFiles: 5000, staleDays: 30, root: 'C:/x' },",
          "  stats: { files: hubFiles.length, bytes: hubFiles.reduce((n, f) => n + f.size, 0), freeBytes: 812 * 1024 * 1024 * 1024, staleDays: 30, root: 'C:/x' },\n  transfers: [{ jobId: 'j1', path: 'web/db/prod.bak', from: 'MONSTER', to: 'spacex', status: 'running', ok: false, detail: '', bytes: 1_900_000_000, bytesHuman: '1.77 GB', total: 5_000_000_000, percent: 38, startedAt: now - 90_000, finishedAt: null }],", p)
s = rep(s, "  file('spacex', 'old/dump.zip', 'spacex/prg#1', 'spacex', now - 45 * D, 900_000, 1, 'ancient'),\n];",
          "  file('spacex', 'old/dump.zip', 'spacex/prg#1', 'spacex', now - 45 * D, 900_000, 1, 'ancient'),\n  file('spacex', 'prg/fixtures/orders.json', 'spacex/prg#1', 'spacex', now - 7200_000, 3000, 1, null),\n  file('spacex', 'notes.txt', 'spacex/prg#1', 'spacex', now - 60_000, 12, 1, 'a root file'),\n];", p)
s = rep(s, "    rules: ['A hub path is a short forward-slash path of plain segments…', 'One file up to 64 MB; the store up to 2 GB / 5000 files.', 'Nothing expires by itself: files older than 30 days are marked stale here, and you delete them.'],",
          "    rules: ['A hub path is a short forward-slash path of plain segments…', 'No size limit: a multi-GB file is a normal upload; everything is streamed to disk.', 'Nothing expires by itself: files older than 30 days are marked stale here, and you delete them.'],", p)
s = rep(s, '''  hubRows: [...document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]')].map((r) => ({ path: r.dataset.fsFile, stale: r.dataset.fsStale, text: r.textContent })),''',
'''  hubRows: [...document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]')].map((r) => ({ path: r.dataset.fsFile, stale: r.dataset.fsStale, text: r.textContent })),
  hubOrder: [...document.querySelectorAll('[data-fs-table="spacex"] tbody tr')].map((r) => (r.dataset.fsFolder != null ? `D:${r.dataset.fsFolder}:${r.dataset.fsOpen}` : `F:${r.dataset.fsFile}`)),
  folderText: document.querySelector('[data-fs-folder="prg"]')?.textContent,
  transfers: [...document.querySelectorAll('[data-fs-transfer]')].map((e) => e.textContent),''', p)
s = rep(s, '''await shotMain('manage-files.png');

// Delete: confirm names the path''',
'''await shotMain('manage-files.png');

// The tree: collapsing prg hides its files and subfolder; expanding it brings them back;
// collapse all / expand all act on every folder of that machine's tree.
await page.click('[data-fs-toggle="prg"]');
const afterCollapse = await page.evaluate(() => [...document.querySelectorAll('[data-fs-table="spacex"] tbody tr')].map((r) => (r.dataset.fsFolder != null ? `D:${r.dataset.fsFolder}:${r.dataset.fsOpen}` : `F:${r.dataset.fsFile}`)));
await page.click('[data-fs-toggle="prg"]');
const afterExpand = await page.evaluate(() => document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]').length);
await page.click('[data-fs-collapse-all="spacex"]');
const allCollapsed = await page.evaluate(() => ({ files: document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]').length, folders: [...document.querySelectorAll('[data-fs-table="spacex"] [data-fs-folder]')].map((r) => `${r.dataset.fsFolder}:${r.dataset.fsOpen}`) }));
await shotMain('manage-files-collapsed.png');
await page.click('[data-fs-expand-all="spacex"]');
const allExpanded = await page.evaluate(() => document.querySelectorAll('[data-fs-table="spacex"] [data-fs-file]').length);

// Delete: confirm names the path''', p)
s = rep(s, "  hubBlockFirstWithThreeFiles: seen.machines[0]?.self === true && seen.machines[0].rows === 3,",
          "  hubBlockFirstWithFiveFiles: seen.machines[0]?.self === true && seen.machines[0].rows === 5,", p)
s = rep(s, "  statsAndDownload: /4 files/.test(seen.stats || '') && /64\\.0 MB|64 MB/.test(seen.stats || '') && /\\/api\\/hubfs\\/file\\?path=prg%2Ffixtures%2Fcustomers\\.json/.test(seen.download || ''),   // 4 = the fleet's files (hub 3 + MONSTER 1)",
          "  statsAndDownload: /6 files/.test(seen.stats || '') && /812\\.00 GB free/.test(seen.stats || '') && /no size limit/.test(seen.stats || '') && /\\/api\\/hubfs\\/file\\?path=prg%2Ffixtures%2Fcustomers\\.json/.test(seen.download || ''),   // 6 = the fleet's files (hub 5 + MONSTER 1)\n  treeFoldersBeforeFilesFoldersOpenByDefault: seen.hubOrder.join(',') === 'D:old:1,F:old/dump.zip,D:prg:1,D:prg/fixtures:1,F:prg/fixtures/customers.json,F:prg/fixtures/orders.json,D:web:1,F:web/testdata.sql,F:notes.txt',\n  folderRowCarriesCountAndSize: /prg\\//.test(seen.folderText || '') && /2 file/.test(seen.folderText || '') && /17\\.1 KB/.test(seen.folderText || ''),\n  collapseHidesSubtreeExpandRestores: afterCollapse.join(',') === 'D:old:1,F:old/dump.zip,D:prg:0,D:web:1,F:web/testdata.sql,F:notes.txt' && afterExpand === 5,\n  collapseAllExpandAll: allCollapsed.files === 1 && allCollapsed.folders.join(',') === 'old:0,prg:0,web:0' && allExpanded === 5,\n  transferJobShownWithProgress: seen.transfers.length === 1 && /web\\/db\\/prod\\.bak/.test(seen.transfers[0]) && /running/.test(seen.transfers[0]) && /38%/.test(seen.transfers[0]),", p)
s = rep(s, "console.log(JSON.stringify({ seen, confirmText, stillThere, gone, pageErrors: errs, result, out: path.join(OUT, 'manage-files.png') }, null, 1));",
          "console.log(JSON.stringify({ seen, afterCollapse, afterExpand, allCollapsed, allExpanded, confirmText, stillThere, gone, pageErrors: errs, result, out: [path.join(OUT, 'manage-files.png'), path.join(OUT, 'manage-files-collapsed.png')] }, null, 1));", p)
s = rep(s, "// Output: docs/screenshots/manage-files.png", "// Output: docs/screenshots/manage-files.png, manage-files-collapsed.png (tree + transfers since openspec hubfs-large-files-tree)", p)
write(p, s)
print('ALL PATCHED')
