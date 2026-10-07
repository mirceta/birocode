using ClaudeWeb.Services.Arch;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec provision-repo-agent: the pure parts of provisioning a repo agent —
/// URL validation (tokens in the URL are refused), the derived name, the sibling folder,
/// remote equality for idempotency, the folder classification, the git-failure vocabulary,
/// the provider default and the hub-side posture.</summary>
public class RepoProvisionTests
{
    // ---- URL validation ----------------------------------------------------------------

    [Theory]
    [InlineData("https://github.com/mirceta/portlistener.git")]
    [InlineData("https://github.com/mirceta/portlistener")]
    [InlineData("http://gitea.lan:3000/org/repo.git")]
    [InlineData("git@github.com:mirceta/portlistener.git")]
    [InlineData("ssh://git@github.com/mirceta/portlistener.git")]
    public void ValidateUrl_accepts_plain_clone_urls(string url) => Assert.Null(RepoProvisionService.ValidateUrl(url));

    [Theory]
    [InlineData("https://x-access-token:ghp_abc123@github.com/org/repo.git", "embeds credentials")]   // the SPACEX4 web-flow-autodev pattern
    [InlineData("https://user@github.com/org/repo.git", "embeds credentials")]
    [InlineData("", "url is required")]
    [InlineData("   ", "url is required")]
    [InlineData("C:\\repos\\thing", "local paths")]
    [InlineData("file:///C:/repos/thing", "local paths")]
    [InlineData("github.com/org/repo", "not a clone URL")]
    [InlineData("https://github.com/org/re po.git", "whitespace")]
    public void ValidateUrl_refuses_with_a_reason(string url, string reason)
    {
        var why = RepoProvisionService.ValidateUrl(url);
        Assert.NotNull(why);
        Assert.Contains(reason, why, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Display_never_echoes_userinfo()
    {
        Assert.Equal("https://github.com/org/repo.git", RepoProvisionService.Display("https://x:ghp_secret@github.com/org/repo.git"));
        Assert.Equal("git@github.com:org/repo.git", RepoProvisionService.Display("git@github.com:org/repo.git"));
    }

    // ---- the name ------------------------------------------------------------------------

    [Theory]
    [InlineData("https://github.com/mirceta/My-Repo.git", "My-Repo")]
    [InlineData("https://github.com/mirceta/My-Repo", "My-Repo")]
    [InlineData("https://github.com/mirceta/My-Repo/", "My-Repo")]
    [InlineData("git@github.com:mirceta/portlistener.git", "portlistener")]
    [InlineData("ssh://git@github.com/mirceta/portlistener.git", "portlistener")]
    public void NameFromUrl_is_the_last_segment_without_dot_git(string url, string expected) =>
        Assert.Equal(expected, RepoProvisionService.NameFromUrl(url));

    [Theory]
    [InlineData("provision-test-20261007", "provision-test-20261007")]
    [InlineData("  spaced name ", "spaced name")]
    [InlineData("bad:name/with*chars?", "bad-name-with-chars")]
    [InlineData("...", "")]
    public void SafeFolderName_drops_what_a_file_system_refuses(string name, string expected) =>
        Assert.Equal(expected, RepoProvisionService.SafeFolderName(name));

    // ---- the sibling folder ----------------------------------------------------------------

    [Fact]
    public void SiblingParent_is_where_most_checkouts_live()
    {
        var parent = RepoProvisionService.SiblingParent(new[]
        {
            @"C:\Users\x\Desktop\playground\birocode",
            @"C:\Users\x\Desktop\playground\prg",
            @"D:\elsewhere\thing",
        }, selfPath: @"C:\Users\x\Desktop\playground\birocode");
        Assert.Equal(@"C:\Users\x\Desktop\playground", parent);
    }

    [Fact]
    public void SiblingParent_tie_goes_to_the_self_repo()
    {
        var parent = RepoProvisionService.SiblingParent(new[] { @"D:\a\one", @"C:\p\birocode" }, selfPath: @"C:\p\birocode");
        Assert.Equal(@"C:\p", parent);
    }

    [Fact]
    public void SiblingParent_is_null_with_nothing_registered() =>
        Assert.Null(RepoProvisionService.SiblingParent(Array.Empty<string>(), null));

    // ---- remote equality (idempotency) --------------------------------------------------------

    [Theory]
    [InlineData("https://github.com/Org/Repo.git", "https://github.com/org/repo", true)]
    [InlineData("https://github.com/org/repo/", "git@github.com:org/repo.git", true)]
    [InlineData("ssh://git@github.com/org/repo.git", "https://github.com/org/repo", true)]
    [InlineData("https://token@github.com/org/repo.git", "https://github.com/org/repo", true)]   // what an older checkout may hold
    [InlineData("https://github.com/org/repo", "https://github.com/org/other", false)]
    [InlineData("", "https://github.com/org/repo", false)]
    public void SameRemote_sees_through_spelling(string a, string b, bool same) =>
        Assert.Equal(same, RepoProvisionService.SameRemote(a, b));

    // ---- the folder ----------------------------------------------------------------------------

    [Fact]
    public void ClassifyFolder_names_every_case()
    {
        const string want = "https://github.com/org/repo.git";
        Assert.Equal(RepoProvisionService.FolderKind.Missing, RepoProvisionService.ClassifyFolder(false, true, null, want));
        Assert.Equal(RepoProvisionService.FolderKind.Empty, RepoProvisionService.ClassifyFolder(true, true, null, want));
        Assert.Equal(RepoProvisionService.FolderKind.NotARepo, RepoProvisionService.ClassifyFolder(true, false, null, want));
        Assert.Equal(RepoProvisionService.FolderKind.SameRepo, RepoProvisionService.ClassifyFolder(true, false, "git@github.com:org/repo.git", want));
        Assert.Equal(RepoProvisionService.FolderKind.DifferentRepo, RepoProvisionService.ClassifyFolder(true, false, "https://github.com/org/other.git", want));
        Assert.Equal(RepoProvisionService.FolderKind.DifferentRepo, RepoProvisionService.ClassifyFolder(true, false, "", want));   // a checkout with no origin
    }

    // ---- git failures --------------------------------------------------------------------------

    [Theory]
    [InlineData("fatal: could not read Username for 'https://github.com': terminal prompts disabled", RepoProvisionService.StatusAuthMissing)]
    [InlineData("remote: Invalid username or token.\nfatal: Authentication failed for 'https://github.com/x/y.git/'", RepoProvisionService.StatusAuthMissing)]
    [InlineData("git@github.com: Permission denied (publickey).", RepoProvisionService.StatusAuthMissing)]
    [InlineData("ERROR: Repository not found.\nfatal: Could not read from remote repository.", RepoProvisionService.StatusNotFound)]
    [InlineData("fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com", RepoProvisionService.StatusUnreachable)]
    [InlineData("fatal: unable to access 'https://x/': Failed to connect to x port 443: Connection refused", RepoProvisionService.StatusUnreachable)]
    [InlineData("error: unable to write file: No space left on device", RepoProvisionService.StatusDiskFull)]
    [InlineData("fatal: something else entirely", RepoProvisionService.StatusCloneFailed)]
    [InlineData("", RepoProvisionService.StatusCloneFailed)]
    public void ClassifyGitFailure_speaks_the_vocabulary(string stderr, string expected) =>
        Assert.Equal(expected, RepoProvisionService.ClassifyGitFailure(stderr));

    // ---- the provider default ----------------------------------------------------------------------

    [Fact]
    public void MostCommonProvider_follows_the_other_agents()
    {
        Assert.Equal("codex", RepoProvisionService.MostCommonProvider(new[] { "codex", "codex", "claude" }));
        Assert.Equal("claude", RepoProvisionService.MostCommonProvider(new[] { "codex", "claude" }));   // tie → claude
        Assert.Equal("claude", RepoProvisionService.MostCommonProvider(Array.Empty<string?>()));
        Assert.Equal("claude", RepoProvisionService.MostCommonProvider(new string?[] { null, "" }));
    }

    // ---- the hub-side posture ------------------------------------------------------------------------

    [Theory]
    [InlineData("ok", true, null)]
    [InlineData("ok", false, "not-accepting")]
    [InlineData("unreachable", true, "unreachable")]
    [InlineData("no-peer-api", true, "no-peer-api")]
    [InlineData("unauthorized", false, "unauthorized")]
    public void ProvisionPosture_refuses_in_order(string status, bool accepts, string? expected) =>
        Assert.Equal(expected, ArchAgentService.ProvisionPosture(status, accepts)?.Status);

    [Fact]
    public void The_arch_role_prompt_teaches_the_tool()
    {
        var prompt = ArchAgentService.RolePrompt();
        Assert.Contains("provision_repo_agent(machine, url, name?,", prompt);
        Assert.Contains("fleet provisioning", prompt);
        Assert.Contains("`exists`", prompt);
    }

    [Fact]
    public void ProvisionedRepoId_reads_a_peer_reply()
    {
        using var doc = System.Text.Json.JsonDocument.Parse("{\"repoId\":\"abc\",\"handle\":\"x\"}");
        Assert.Equal("abc", ArchAgentService.ProvisionedRepoId(doc.RootElement.Clone()));
        using var none = System.Text.Json.JsonDocument.Parse("{\"handle\":\"x\"}");
        Assert.Null(ArchAgentService.ProvisionedRepoId(none.RootElement.Clone()));
        Assert.Null(ArchAgentService.ProvisionedRepoId(null));
    }
}
