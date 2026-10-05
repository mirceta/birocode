using ClaudeWeb.Services.Git;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Understanding;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>Pure rules behind openspec board-load-live: the one-process commit-identity read,
/// which bundle files may be cached, and what is (not) compressed.</summary>
public class BoardLoadLiveTests
{
    [Fact]
    public void Identity_global_only()
    {
        var id = GitService.ParseCommitIdentity("global\tuser.name mirceta\nglobal\tuser.email k@example.com\n");
        Assert.Equal("mirceta", id.Name);
        Assert.Equal("k@example.com", id.Email);
        Assert.Equal("global", id.Scope);
    }

    [Fact]
    public void Identity_local_overrides_global_and_the_last_line_wins()
    {
        var id = GitService.ParseCommitIdentity("system\tuser.name Sys\r\nglobal\tuser.name Global Name\r\nglobal\tuser.email g@example.com\r\nlocal\tuser.name Local Name\r\n");
        Assert.Equal("Local Name", id.Name);          // a value with a space survives
        Assert.Equal("g@example.com", id.Email);      // the email still comes from the outer config
        Assert.Equal("local", id.Scope);              // a local user.* means a per-repo override
    }

    [Fact]
    public void Identity_worktree_scope_counts_as_local()
        => Assert.Equal("local", GitService.ParseCommitIdentity("global\tuser.name G\nworktree\tuser.email w@example.com\n").Scope);

    [Theory]
    [InlineData("")]
    [InlineData("global\tcore.editor vim\n")]
    [InlineData("garbage without a tab\n")]
    public void Identity_unset_when_nothing_matches(string stdout)
    {
        var id = GitService.ParseCommitIdentity(stdout);
        Assert.Null(id.Name);
        Assert.Null(id.Email);
        Assert.Equal("unset", id.Scope);
    }

    [Theory]
    [InlineData("manage/assets/manage-CbgGp26m.js", true)]
    [InlineData("manage/assets/manage-BODs7Ow7.css", true)]
    [InlineData("manage/assets/sequenceDiagram-3UESZ5HK-BIiuvex2.js", true)]
    [InlineData("assets/index-BmY44_Lw.js", true)]
    [InlineData("manage\\assets\\katex-C5jXJg4s.js", true)]
    [InlineData("manage/index.html", false)]          // the entry document is never cached
    [InlineData("index.html", false)]
    [InlineData("app.js", false)]                     // a hand-written, build-less app file
    [InlineData("data.js", false)]
    [InlineData("assets/app.js", false)]              // under assets/ but not content-hashed
    [InlineData("manage/assets/manage-CbgGp26m.js.txt", false)]
    public void Only_content_hashed_bundle_files_are_cacheable(string path, bool expected)
        => Assert.Equal(expected, HarnessStaticApp.IsHashedAsset(path));

    [Fact]
    public void Event_streams_and_plain_text_are_never_compressed()
    {
        Assert.DoesNotContain("text/event-stream", EmbeddedApi.CompressedMimeTypes);
        Assert.DoesNotContain("text/plain", EmbeddedApi.CompressedMimeTypes);
        Assert.Contains("application/json", EmbeddedApi.CompressedMimeTypes);
        Assert.Contains("text/javascript", EmbeddedApi.CompressedMimeTypes);
        Assert.Contains("text/css", EmbeddedApi.CompressedMimeTypes);
    }

    [Fact]
    public void ETag_is_stable_for_the_same_bytes_and_changes_with_them()
    {
        var a = ConditionalJson.ETagOf(System.Text.Encoding.UTF8.GetBytes("{\"nodes\":[1,2]}"));
        Assert.Equal(a, ConditionalJson.ETagOf(System.Text.Encoding.UTF8.GetBytes("{\"nodes\":[1,2]}")));
        Assert.NotEqual(a, ConditionalJson.ETagOf(System.Text.Encoding.UTF8.GetBytes("{\"nodes\":[1,3]}")));
        Assert.StartsWith("W/\"", a);
    }

    [Theory]
    [InlineData("W/\"ABC\"", "W/\"ABC\"", true)]
    [InlineData("\"ABC\"", "W/\"ABC\"", true)]                 // a strong spelling of the same tag
    [InlineData("W/\"OLD\", W/\"ABC\"", "W/\"ABC\"", true)]  // a list
    [InlineData("*", "W/\"ABC\"", true)]
    [InlineData("W/\"OLD\"", "W/\"ABC\"", false)]
    [InlineData("", "W/\"ABC\"", false)]
    [InlineData(null, "W/\"ABC\"", false)]
    public void If_None_Match_is_honoured(string? header, string etag, bool expected)
        => Assert.Equal(expected, ConditionalJson.Matches(header, etag));
}
