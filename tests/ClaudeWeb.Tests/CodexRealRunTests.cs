using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec codex-real-run: the Codex adapter pinned to the REAL
/// codex-cli 0.153.4 shapes captured on this box — argv accepted by the binary,
/// the verbatim unauthenticated JSONL stream, the url MCP override keys
/// `codex mcp add` writes, and the `codex login status` outcomes. Pure — no CLI
/// spawned.</summary>
public class CodexRealRunTests
{
    private static TurnSpec Spec(
        string message = "hello", string? sessionId = null, string? model = null,
        bool readOnly = false, string? mcpJson = null, IReadOnlyList<string>? disallowed = null) =>
        new(message, sessionId, null, model, readOnly, mcpJson, null, false, disallowed);

    private sealed class Collected
    {
        public List<string> Events = new();
        public CallRecord Record = new();
        public string? SessionId;
        public bool Errored;
        public TurnSink Sink = null!;
    }

    private static Collected NewSink()
    {
        var c = new Collected();
        c.Sink = new TurnSink
        {
            Emit = o => { c.Events.Add(JsonSerializer.Serialize(o)); return Task.CompletedTask; },
            Record = c.Record,
            Update = _ => { },
            OnSessionId = id => c.SessionId = id,
            OnError = () => c.Errored = true,
        };
        return c;
    }

    // ---- argv: every flag exists on codex-cli 0.153.4 ---------------------------------

    [Fact]
    public void Builder_argv_redirects_stdin_so_the_prompt_is_exactly_the_argv_one()
    {
        // Codex reads a piped stdin as "additional input" and appends it to the
        // prompt as a <stdin> block; the runner closes the redirected stream at start.
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("do the thing"));
        Assert.True(psi.RedirectStandardInput);
        Assert.Equal(new[]
        {
            "exec", "--json", "--skip-git-repo-check",
            "--dangerously-bypass-approvals-and-sandbox",
            "do the thing",
        }, psi.ArgumentList);
    }

    [Fact]
    public void Ask_lane_on_resume_uses_the_sandbox_mode_override_because_resume_has_no_sandbox_flag()
    {
        // `codex exec resume --help` (0.153.4) lists no --sandbox; -c sandbox_mode is
        // accepted by both `exec` and `exec resume` (a resume with this argv fails on
        // the thread lookup, i.e. past argument parsing).
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("q", sessionId: "thread-9", model: "gpt-5-codex", readOnly: true));
        Assert.Equal(new[]
        {
            "exec", "resume", "thread-9", "--json", "--skip-git-repo-check",
            "-c", "sandbox_mode=\"read-only\"",
            "--model", "gpt-5-codex",
            "q",
        }, psi.ArgumentList);
    }

    // ---- MCP: the harness's own url server --------------------------------------------

    [Fact]
    public void Harness_url_mcp_server_becomes_url_plus_bearer_token_env_var()
    {
        // The exact JSON ArchAgentService.BuildMcpConfigJson injects and the exact
        // TOML keys `codex mcp add --url --bearer-token-env-var` writes to config.toml
        // (0.153.4): url + bearer_token_env_var. The token itself travels ONLY in the
        // child's environment, never on argv.
        var json = """{"mcpServers":{"arch":{"type":"http","url":"http://127.0.0.1:5099/api/arch/mcp","headers":{"Authorization":"Bearer s3cret-token"}}}}""";
        var adapter = new CodexCliAdapter(new Logger());
        var env = new Dictionary<string, string>();
        var overrides = adapter.McpOverrides(json, env);
        Assert.Equal(new[]
        {
            "mcp_servers.arch.url='http://127.0.0.1:5099/api/arch/mcp'",
            "mcp_servers.arch.bearer_token_env_var='CLAUDEWEB_MCP_ARCH_TOKEN'",
        }, overrides);
        Assert.Equal("s3cret-token", env["CLAUDEWEB_MCP_ARCH_TOKEN"]);

        var psi = adapter.CreateProcessInfo(Spec("q", mcpJson: json));
        Assert.Equal("s3cret-token", psi.Environment["CLAUDEWEB_MCP_ARCH_TOKEN"]);
        Assert.DoesNotContain(psi.ArgumentList, a => a.Contains("s3cret-token"));
        Assert.Contains("mcp_servers.arch.bearer_token_env_var='CLAUDEWEB_MCP_ARCH_TOKEN'", psi.ArgumentList);
    }

    // ---- the verbatim unauthenticated stream ------------------------------------------

    [Fact]
    public async Task Real_unauthenticated_stream_fails_once_with_the_turn_failed_message()
    {
        // Event shapes verbatim from `codex exec --json` (0.153.4, no credential):
        // transport notices arrive as {"type":"error"} events and as an item of type
        // "error" (item.type, not item_type) BEFORE turn.failed. Only turn.failed is
        // terminal; the recorded error is its message, not the first "Reconnecting...".
        var adapter = new CodexCliAdapter(new Logger());
        var c = NewSink();
        await adapter.TranslateLineAsync("""{"type":"thread.started","thread_id":"019a1b2c-3d4e-7f80-9a1b-2c3d4e5f6a7b"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"turn.started"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"error","message":"Reconnecting... 2/5 (unexpected status 401 Unauthorized: {\"error\":{\"message\":\"Missing bearer\"}})"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Falling back from WebSockets to HTTPS transport for this session."}}""", c.Sink);
        Assert.False(c.Errored);
        Assert.DoesNotContain(c.Events, e => e.Contains("\"error\""));
        Assert.Null(c.Record.ErrorMessage);
        Assert.Equal("Falling back from WebSockets to HTTPS transport for this session.", c.Sink.LastNotice);

        await adapter.TranslateLineAsync("""{"type":"error","message":"unexpected status 401 Unauthorized: {\"error\":{\"message\":\"Missing bearer\"}}"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"turn.failed","error":{"message":"unexpected status 401 Unauthorized: {\"error\":{\"message\":\"Missing bearer\"}}"}}""", c.Sink);
        Assert.True(c.Errored);
        Assert.Equal("019a1b2c-3d4e-7f80-9a1b-2c3d4e5f6a7b", c.SessionId);
        Assert.StartsWith("unexpected status 401", c.Record.ErrorMessage);
        Assert.Single(c.Events, e => e.Contains("\"error\""));
    }

    [Fact]
    public async Task Items_keyed_by_item_dot_type_translate_like_item_type()
    {
        // 0.153.4 emits item.type; the earlier item_type spelling stays accepted.
        var adapter = new CodexCliAdapter(new Logger());
        var c = NewSink();
        await adapter.TranslateLineAsync("""{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"git status"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"git status","exit_code":0,"aggregated_output":"clean"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"Done."}}""", c.Sink);
        Assert.Contains(c.Events, e => e.Contains("\"tool\"") && e.Contains("git status"));
        Assert.Equal("Done.", c.Record.Output.ToString());
        Assert.Equal(new[] { "shell" }, c.Record.Tools);
    }

    // ---- `codex login status` outcomes --------------------------------------------------

    [Fact]
    public void Login_status_parses_the_real_cli_outcomes()
    {
        // 0.153.4: "Not logged in" on stdout with exit 1.
        var none = CodexAccountService.Parse(1, "Not logged in\n", "", false);
        Assert.True(none.CodexInstalled);
        Assert.False(none.Authenticated);
        Assert.Equal("Not logged in", none.Error);

        var ok = CodexAccountService.Parse(0, "Logged in using an API key\n", "", false);
        Assert.True(ok.Authenticated);
        Assert.Equal("Logged in using an API key", ok.Method);

        var hung = CodexAccountService.Parse(-1, "", "timed out", true);
        Assert.False(hung.Authenticated);
        Assert.Contains("timed out", hung.Error);
    }

    [Fact]
    public void Resolver_clone_keeps_the_repo_provider_so_composer_turns_run_on_it()
    {
        // The chat path reads the repo through RepositoryResolver.Current(), which
        // hands out RepositoryRegistry.Clone(...). The clone dropped Provider (and
        // Handle), so a codex repo ran claude from the composer — found by the first
        // real-binary run (cost $0.09 of Claude). Pinned here.
        var src = new RepositoryConfig { Id = "r1", Name = "n", Path = "C:/x", Handle = "n-1", Provider = "codex" };
        var clone = ClaudeWeb.Services.Repositories.RepositoryRegistry.Clone(src);
        Assert.Equal("codex", clone.Provider);
        Assert.Equal("n-1", clone.Handle);
        Assert.NotSame(src, clone);
    }

    [Fact]
    public void Codex_home_is_where_the_operator_puts_the_credential()
    {
        var home = CodexAccountService.CodexHome();
        var env = Environment.GetEnvironmentVariable("CODEX_HOME");
        if (!string.IsNullOrWhiteSpace(env)) Assert.Equal(env, home);
        else Assert.EndsWith(".codex", home);
    }
}
