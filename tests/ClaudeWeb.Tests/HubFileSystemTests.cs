using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.HubFs;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// The hub file system (openspec hub-file-system): the sandboxed store (path grammar, put /
/// get / list / delete, overwrite + version, limits, provenance, persistence), the repo agent's
/// hub_upload / hub_download / hub_files (local paths kept inside the repo folder, downloads
/// never clobber silently), and the MCP catalogue naming the eight tools.
/// </summary>
public sealed class HubFileSystemTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-hubfs-" + Guid.NewGuid().ToString("N"));
    private long _now = 1_700_000_000_000;

    public HubFileSystemTests() { Directory.CreateDirectory(_dir); }
    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    private HubFileStore Store() => new(new Logger(), Path.Combine(_dir, "data"), () => _now);
    private static JsonElement Json(object? o) => JsonSerializer.SerializeToElement(o);

    [Theory]
    [InlineData("fixtures/customers.json", "fixtures/customers.json")]
    [InlineData("/prg\\testdata\\2026-09.csv/", "prg/testdata/2026-09.csv")]
    [InlineData("  notes/handoff.md ", "notes/handoff.md")]
    public void Paths_are_normalized_to_forward_slash_segments(string given, string expected)
    {
        Assert.Equal(expected, HubFileStore.Normalize(given, out var err));
        Assert.Null(err);
    }

    [Theory]
    [InlineData("../secrets.json")]
    [InlineData("prg/../../x")]
    [InlineData("C:/Windows/system32/x")]
    [InlineData("c:\\x")]
    [InlineData("a/./b")]
    [InlineData("-leading/dash")]
    [InlineData("sp ace/x")]
    [InlineData("")]
    [InlineData("a/b/c/d/e/f/g/h/i")]
    public void Paths_that_could_escape_or_are_malformed_are_refused(string given)
    {
        Assert.Null(HubFileStore.Normalize(given, out var err));
        Assert.False(string.IsNullOrWhiteSpace(err));
    }

    [Fact]
    public void Put_get_list_delete_with_provenance_versions_and_persistence()
    {
        var s = Store();
        var (a, err) = s.Put("prg/fixtures/customers.json", Encoding.UTF8.GetBytes("{\"a\":1}"), "spacex/prg#1", "spacex", "test fixtures");
        Assert.Null(err);
        Assert.Equal("prg/fixtures/customers.json", a!.Path);
        Assert.Equal(7, a.Size);
        Assert.Equal(1, a.Version);
        Assert.Equal("spacex/prg#1", a.UploadedBy);
        Assert.Equal("spacex", a.Machine);
        Assert.Equal("application/json", a.ContentType);
        Assert.Equal(_now, a.UploadedAt);
        Assert.Equal("test fixtures", a.Note);
        Assert.Equal(64, a.Sha256.Length);

        // Overwrite is explicit; a replacement keeps the first upload stamp and bumps the version.
        _now += 1000;
        var (_, refused) = s.Put("prg/fixtures/customers.json", new byte[] { 1, 2, 3 }, "MONSTER/prg#1", "MONSTER", null, overwrite: false);
        Assert.Contains("already exists", refused);
        var (b, _) = s.Put("prg/fixtures/customers.json", new byte[] { 1, 2, 3 }, "MONSTER/prg#1", "MONSTER", null, overwrite: true);
        Assert.Equal(2, b!.Version);
        Assert.Equal(3, b.Size);
        Assert.Equal(a.UploadedAt, b.UploadedAt);
        Assert.Equal(_now, b.UpdatedAt);
        Assert.Equal("test fixtures", b.Note);          // an unnoted replacement keeps the note
        Assert.Equal("MONSTER/prg#1", b.UploadedBy);

        s.Put("prg/readme.md", Encoding.UTF8.GetBytes("# hi"), "spacex/prg#1", "spacex");
        s.Put("webflow/x.bin", new byte[10], "MONSTER/web#1", "MONSTER", via: "arch ← MONSTER");
        Assert.Equal(new[] { "prg/fixtures/customers.json", "prg/readme.md", "webflow/x.bin" }, s.List().Select(e => e.Path));
        Assert.Equal(new[] { "prg/fixtures/customers.json", "prg/readme.md" }, s.List("prg").Select(e => e.Path));
        Assert.Equal(new[] { "prg/fixtures/customers.json" }, s.List("prg/fixtures/").Select(e => e.Path));
        Assert.Equal("arch ← MONSTER", s.Find("webflow/x.bin")!.Via);
        var got = s.Get("prg/fixtures/customers.json")!.Value;
        Assert.Equal(new byte[] { 1, 2, 3 }, got.Bytes);
        Assert.Equal(3, s.GetStats().Files);
        Assert.Equal(3 + 4 + 10, s.GetStats().Bytes);

        // The bytes live under the store only.
        var disk = Path.Combine(_dir, "data", HubFileStore.Folder, "files", "prg", "fixtures", "customers.json");
        Assert.True(File.Exists(disk));

        // Persistence: a new instance over the same folder sees the index.
        var again = Store();
        Assert.Equal(3, again.List().Count);
        Assert.Equal(2, again.Find("prg/fixtures/customers.json")!.Version);

        Assert.True(again.Delete("prg/fixtures/customers.json"));
        Assert.False(again.Delete("prg/fixtures/customers.json"));
        Assert.False(File.Exists(disk));
        Assert.False(Directory.Exists(Path.GetDirectoryName(disk)));   // empty folders pruned
        Assert.Null(again.Get("prg/fixtures/customers.json"));
        Assert.Null(again.Find("../x"));
    }

    [Fact]
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
    }

    // ---- the repo agent's tools ----------------------------------------------------------------

    private (RepoAgentToolbox Tools, HubFileStore Store, string RepoPath) Rig()
    {
        var store = Store();
        var repoPath = Path.Combine(_dir, "repo-prg");
        Directory.CreateDirectory(Path.Combine(repoPath, "tests", "fixtures"));
        File.WriteAllText(Path.Combine(repoPath, "tests", "fixtures", "customers.json"), "{\"customers\":[1,2,3]}");
        var g = new TaskGraphService(new Logger(), Path.Combine(_dir, "graph"));
        var tb = new RepoAgentToolbox(g, (src, repo) => src is null ? "spacex/" + repo + "#1" : src + "/" + repo, () => _now)
        {
            Environment = new RepoAgentEnvironment
            {
                Repo = id => id == "r-prg" ? new RepoFacts("r-prg", "prg", repoPath, "prg#1") : null,
                HubFiles = store, Machine = "spacex",
            },
        };
        return (tb, store, repoPath);
    }

    [Fact]
    public void Hub_upload_reads_only_inside_the_repo_and_records_who_and_where()
    {
        var (tb, store, repoPath) = Rig();
        var up = tb.HubUpload("r-prg", "prg/fixtures/customers.json", "tests/fixtures/customers.json", null, "the fixtures");
        Assert.True(up.Ok);
        Assert.Equal("uploaded", up.Status);
        Assert.Contains("prg/fixtures/customers.json", up.Detail);
        Assert.Contains("as spacex/r-prg#1", up.Detail);
        var e = store.Find("prg/fixtures/customers.json")!;
        Assert.Equal("spacex/r-prg#1", e.UploadedBy);
        Assert.Equal("spacex", e.Machine);
        Assert.Equal("the fixtures", e.Note);
        Assert.Equal(File.ReadAllBytes(Path.Combine(repoPath, "tests", "fixtures", "customers.json")).Length, e.Size);

        // A text upload; a second upload of the same path needs overwrite.
        var txt = tb.HubUpload("r-prg", "notes/handoff.md", null, "# handoff\n", null);
        Assert.True(txt.Ok);
        Assert.Equal("# handoff\n", Encoding.UTF8.GetString(store.Get("notes/handoff.md")!.Value.Bytes));
        Assert.Contains("already exists", tb.HubUpload("r-prg", "notes/handoff.md", null, "v2", null).Detail);
        Assert.Equal(1, store.Find("notes/handoff.md")!.Version);   // the refused upload changed nothing
        Assert.True(tb.HubUpload("r-prg", "notes/handoff.md", null, "v2", null, overwrite: true).Ok);
        Assert.Equal(2, store.Find("notes/handoff.md")!.Version);

        // The sandbox: nothing outside the repo folder, no folders, no absolute paths, no bad hub paths.
        File.WriteAllText(Path.Combine(_dir, "outside.txt"), "secret");
        Assert.Contains("leaves your repo folder", tb.HubUpload("r-prg", "x/outside.txt", "../outside.txt", null, null).Detail);
        Assert.Contains("not absolute", tb.HubUpload("r-prg", "x/abs.txt", Path.Combine(_dir, "outside.txt"), null, null).Detail);
        Assert.Contains("is a folder", tb.HubUpload("r-prg", "x/dir", "tests", null, null).Detail);
        Assert.Contains("no file", tb.HubUpload("r-prg", "x/missing", "tests/nope.json", null, null).Detail);
        Assert.Contains("dot segments", tb.HubUpload("r-prg", "../escape", null, "x", null).Detail);
        Assert.Contains("give localPath", tb.HubUpload("r-prg", "x/y", null, null, null).Detail);
        Assert.Equal("error", tb.HubUpload(null, "x/y", null, "t", null).Status);
        Assert.Equal(2, store.List().Count);
    }

    [Fact]
    public void Hub_download_writes_inside_the_repo_and_never_clobbers_silently()
    {
        var (tb, store, repoPath) = Rig();
        store.Put("prg/fixtures/customers.json", Encoding.UTF8.GetBytes("[42]"), "MONSTER/prg#1", "MONSTER", "from MONSTER", via: "arch ← MONSTER");

        var dl = tb.HubDownload("r-prg", "prg/fixtures/customers.json", null);
        Assert.True(dl.Ok);
        Assert.Equal("downloaded", dl.Status);
        var rel = Json(dl.Data).GetProperty("localPath").GetString()!;
        Assert.Equal(Path.Combine("hub-downloads", "prg", "fixtures", "customers.json"), rel);
        Assert.Equal("[42]", File.ReadAllText(Path.Combine(repoPath, rel)));
        Assert.Contains("uploaded by MONSTER/prg#1 on MONSTER", dl.Detail);

        // Into a chosen folder (an existing folder gets the file name); an existing file needs overwrite.
        var into = tb.HubDownload("r-prg", "prg/fixtures/customers.json", "tests/fixtures");
        Assert.Equal("exists", into.Status);
        Assert.Equal("{\"customers\":[1,2,3]}", File.ReadAllText(Path.Combine(repoPath, "tests", "fixtures", "customers.json")));
        var forced = tb.HubDownload("r-prg", "prg/fixtures/customers.json", "tests/fixtures", overwrite: true);
        Assert.True(forced.Ok);
        Assert.Equal("[42]", File.ReadAllText(Path.Combine(repoPath, "tests", "fixtures", "customers.json")));

        // Sandbox + not found (with a hint that the arch may need to move it).
        Assert.Contains("leaves your repo folder", tb.HubDownload("r-prg", "prg/fixtures/customers.json", "../escape.json").Detail);
        var missing = tb.HubDownload("r-prg", "prg/fixtures/orders.json", null);
        Assert.Equal("not-found", missing.Status);
        Assert.Contains("hub_transfer", missing.Detail);

        var list = tb.HubFilesList("r-prg", null);
        Assert.True(list.Ok);
        Assert.Contains("1 file(s)", list.Detail);
        Assert.Equal("arch ← MONSTER", Json(list.Data).GetProperty("files")[0].GetProperty("via").GetString());
        Assert.Equal("spacex", Json(list.Data).GetProperty("machine").GetString());
        Assert.Contains("nothing on spacex", tb.HubFilesList("r-prg", "webflow").Detail);
    }

    [Fact]
    public void The_server_lists_eight_tools_and_dispatches_the_hub_ones()
    {
        var names = RepoAgentMcpServer.ToolsList().Select(t => t!["name"]!.GetValue<string>()).ToList();
        Assert.Equal(new[] { "my_effort", "report_leg", "harness_help", "stash_prompt", "arm_my_loop", "hub_upload", "hub_download", "hub_files" }, names);
        var up = RepoAgentMcpServer.ToolsList().First(t => t!["name"]!.GetValue<string>() == "hub_upload")!;
        Assert.Equal("path", up["inputSchema"]!["required"]![0]!.GetValue<string>());

        var (tb, store, _) = Rig();
        var server = new RepoAgentMcpServer(tb);
        var call = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hub_upload","arguments":{"path":"prg/fixtures/customers.json","localPath":"tests/fixtures/customers.json","note":"fixtures"}}}"""), "r-prg");
        var outcome = JsonDocument.Parse(call.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>()).RootElement;
        Assert.True(outcome.GetProperty("ok").GetBoolean());
        Assert.Equal("uploaded", outcome.GetProperty("status").GetString());
        Assert.NotNull(store.Find("prg/fixtures/customers.json"));
        var files = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"hub_files","arguments":{"prefix":"prg"}}}"""), "r-prg");
        Assert.Contains("prg/fixtures/customers.json", files.Body!["result"]!["content"]![0]!["text"]!.GetValue<string>());
        var init = server.Handle(JsonNode.Parse("""{"jsonrpc":"2.0","id":3,"method":"initialize","params":{}}"""), "r-prg");
        Assert.Contains("hub_upload", init.Body!["result"]!["instructions"]!.GetValue<string>());
    }
}
