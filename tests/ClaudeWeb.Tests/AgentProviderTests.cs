using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec provider-agnostic-runner: the provider seam — the Claude
/// adapter's invocation is byte-identical to the pre-change contract (golden
/// argv), the Codex adapter maps lanes/resume/MCP correctly and translates the
/// exec JSONL stream onto the same stable SSE events, and provider resolution
/// defaults to claude. Everything pure — no CLI spawned.</summary>
public class AgentProviderTests
{
    private static TurnSpec Spec(
        string message = "hello", string? sessionId = null, string? model = null,
        bool readOnly = false, string? mcpJson = null, string? mcpPath = null,
        bool browser = false, IReadOnlyList<string>? disallowed = null) =>
        new(message, sessionId, null, model, readOnly, mcpJson, mcpPath, browser, disallowed);

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

    // ---- provider resolution ---------------------------------------------------------

    [Fact]
    public void Registry_defaults_to_claude_and_resolves_codex()
    {
        var logger = new Logger();
        var registry = new AgentProviderRegistry(new IAgentCliAdapter[] { new ClaudeCliAdapter(logger), new CodexCliAdapter(logger) });
        Assert.Equal("claude", registry.Resolve(null).Provider);
        Assert.Equal("claude", registry.Resolve("").Provider);
        Assert.Equal("claude", registry.Resolve("gpt-6").Provider); // unknown degrades safely
        Assert.Equal("codex", registry.Resolve("codex").Provider);
        Assert.Equal("codex", registry.Resolve("CODEX").Provider);
    }

    [Fact]
    public void Normalize_accepts_only_the_two_providers()
    {
        Assert.Equal("claude", AgentProviders.Normalize(null));
        Assert.Equal("claude", AgentProviders.Normalize("Claude"));
        Assert.Equal("claude", AgentProviders.Normalize("anything"));
        Assert.Equal("codex", AgentProviders.Normalize(" codex "));
    }

    // ---- Claude adapter: the pre-change argv contract, golden --------------------------

    [Fact]
    public void Claude_builder_argv_is_the_verified_cli_contract_unchanged()
    {
        var psi = new ClaudeCliAdapter(new Logger()).CreateProcessInfo(Spec("do the thing"));
        Assert.Equal(new[]
        {
            "-p", "do the thing", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
            "--dangerously-skip-permissions",
        }, psi.ArgumentList);
        Assert.False(psi.EnvironmentVariables.ContainsKey("ANTHROPIC_API_KEY")); // CLI auth forced
    }

    [Fact]
    public void Claude_resume_ask_mcp_and_denials_keep_their_order()
    {
        var psi = new ClaudeCliAdapter(new Logger()).CreateProcessInfo(Spec(
            "q", sessionId: "s1", model: "opus", readOnly: true, mcpPath: @"C:\tmp\mcp.json",
            disallowed: new[] { "Edit", "Bash" }));
        Assert.Equal(new[]
        {
            "--resume", "s1",                                   // resume BEFORE -p
            "-p", "q", "--output-format", "stream-json", "--include-partial-messages", "--verbose",
            "--model", "opus",
            "--mcp-config", @"C:\tmp\mcp.json",
            "--permission-mode", "plan",                        // ask lane
            "--disallowedTools", "Edit,Bash",                   // variadic flag LAST
        }, psi.ArgumentList);
    }

    [Fact]
    public async Task Claude_translation_still_maps_the_stream_json_events()
    {
        var adapter = new ClaudeCliAdapter(new Logger());
        var c = NewSink();
        await adapter.TranslateLineAsync("""{"type":"system","subtype":"init","session_id":"sid-1","model":"claude-opus"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"result","session_id":"sid-1","num_turns":2,"total_cost_usd":0.05,"usage":{"input_tokens":10,"output_tokens":4}}""", c.Sink);

        Assert.Equal("sid-1", c.SessionId);
        Assert.Contains(c.Events, e => e.Contains("\"session\"") && e.Contains("sid-1"));
        Assert.Contains(c.Events, e => e.Contains("\"token\"") && e.Contains("Hi"));
        Assert.Contains(c.Events, e => e.Contains("\"done\""));
        Assert.Equal("Hi", c.Record.Output.ToString());
        Assert.Equal(0.05, c.Record.CostUsd);
        Assert.False(c.Errored);
    }

    // ---- Codex adapter: invocation ----------------------------------------------------

    [Fact]
    public void Codex_builder_argv_is_exec_json_with_sandbox_bypass_and_prompt_last()
    {
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("do the thing"));
        Assert.Equal(new[]
        {
            "exec", "--json", "--skip-git-repo-check",
            "-c", "project_doc_fallback_filenames=[\"CLAUDE.md\"]",
            "--dangerously-bypass-approvals-and-sandbox",
            "do the thing",
        }, psi.ArgumentList);
    }

    [Fact]
    public void Codex_resume_and_ask_lane_map_to_resume_subcommand_and_readonly_sandbox()
    {
        // `codex exec resume` has no --sandbox flag (0.153.4); -c sandbox_mode works on
        // both subcommands — pinned in CodexRealRunTests (openspec codex-real-run).
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("q", sessionId: "thread-9", model: "gpt-5-codex", readOnly: true));
        Assert.Equal(new[]
        {
            "exec", "resume", "thread-9", "--json", "--skip-git-repo-check",
            "-c", "project_doc_fallback_filenames=[\"CLAUDE.md\"]",
            "-c", "sandbox_mode=\"read-only\"",
            "--model", "gpt-5-codex",
            "q",
        }, psi.ArgumentList);
    }

    [Fact]
    public void Codex_translates_the_injected_mcp_config_into_config_overrides()
    {
        var json = """{"mcpServers":{"birokrat":{"command":"C:\\srv\\birokrat.exe","args":["--port","5001"],"env":{"API_KEY":"k1"}},"remote":{"url":"http://x/mcp"}}}""";
        var overrides = new CodexCliAdapter(new Logger()).McpOverrides(json);
        Assert.Contains(@"mcp_servers.birokrat.command='C:\srv\birokrat.exe'", overrides);
        Assert.Contains("mcp_servers.birokrat.args=['--port','5001']", overrides);
        Assert.Contains("mcp_servers.birokrat.env_vars=['API_KEY']", overrides);
        // url (streamable-http) servers become url overrides; no headers → no token var
        // (openspec codex-real-run).
        Assert.Contains("mcp_servers.remote.url='http://x/mcp'", overrides);
        Assert.DoesNotContain(overrides, o => o.Contains("remote.bearer_token_env_var"));

        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("q", mcpJson: json));
        Assert.Contains("-c", psi.ArgumentList);
        Assert.Contains(psi.ArgumentList, a => a.StartsWith("mcp_servers.birokrat.command="));
    }

    [Fact]
    public void Codex_refuses_structural_tool_denials_instead_of_running_unfenced()
    {
        // The arch's fence (--disallowedTools) has no Codex equivalent; a management
        // agent must not silently run without it (management-on-codex is deferred).
        Assert.Throws<NotSupportedException>(() =>
            new CodexCliAdapter(new Logger()).CreateProcessInfo(Spec("q", disallowed: new[] { "Edit" })));
    }

    // ---- Codex adapter: JSONL -> stable SSE -------------------------------------------

    [Fact]
    public async Task Codex_turn_translates_end_to_end_onto_the_same_events()
    {
        var adapter = new CodexCliAdapter(new Logger());
        var c = NewSink();

        await adapter.TranslateLineAsync("""{"type":"thread.started","thread_id":"th-42"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"turn.started"}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.started","item":{"id":"i1","item_type":"command_execution","command":"git status"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"i1","item_type":"command_execution","command":"git status","exit_code":0,"aggregated_output":"clean"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.started","item":{"id":"i2","item_type":"mcp_tool_call","server":"birokrat","tool":"simple_get"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"i2","item_type":"mcp_tool_call","server":"birokrat","tool":"simple_get","status":"completed"}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"item.completed","item":{"id":"i3","item_type":"agent_message","text":"All good."}}""", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":9}}""", c.Sink);

        Assert.Equal("th-42", c.SessionId);
        Assert.Equal("th-42", c.Record.SessionId);
        Assert.Contains(c.Events, e => e.Contains("\"session\"") && e.Contains("th-42"));
        Assert.Contains(c.Events, e => e.Contains("\"tool\"") && e.Contains("shell") && e.Contains("start"));
        Assert.Contains(c.Events, e => e.Contains("\"tool\"") && e.Contains("git status"));
        Assert.Contains(c.Events, e => e.Contains("\"tool\"") && e.Contains("\"end\"") && e.Contains("clean"));
        Assert.Contains(c.Events, e => e.Contains("birokrat.simple_get"));
        Assert.Contains(c.Events, e => e.Contains("\"token\"") && e.Contains("All good."));
        Assert.Contains(c.Events, e => e.Contains("\"usage\"") && e.Contains("100")); // cached input is already included
        Assert.Contains(c.Events, e => e.Contains("\"done\"") && e.Contains("th-42"));
        Assert.Equal("All good.", c.Record.Output.ToString());
        Assert.Equal(100, c.Record.InputTokens);
        Assert.Equal(40, c.Record.CacheReadTokens);
        Assert.Equal(9, c.Record.OutputTokens);
        Assert.Null(c.Record.CostUsd); // codex reports tokens, not USD
        Assert.Equal(new[] { "shell", "birokrat.simple_get" }, c.Record.Tools);
        Assert.False(c.Errored);
    }

    [Fact]
    public async Task Codex_failure_and_garbage_lines_degrade_safely()
    {
        var adapter = new CodexCliAdapter(new Logger());
        var c = NewSink();
        await adapter.TranslateLineAsync("not json at all", c.Sink);
        await adapter.TranslateLineAsync("""{"type":"totally.new.event"}""", c.Sink);
        Assert.Empty(c.Events); // logged, skipped, never crashed
        await adapter.TranslateLineAsync("""{"type":"turn.failed","error":{"message":"boom"}}""", c.Sink);
        Assert.True(c.Errored);
        Assert.Contains(c.Events, e => e.Contains("\"error\"") && e.Contains("boom"));
        Assert.Equal("boom", c.Record.ErrorMessage);
    }

    // ---- persistence ------------------------------------------------------------------

    [Fact]
    public void Repository_config_provider_defaults_to_claude_and_round_trips()
    {
        var r = JsonSerializer.Deserialize<RepositoryConfig>("""{"Id":"a","Name":"n","Path":"p"}""")!;
        Assert.Null(r.Provider); // predates the field
        Assert.Equal("claude", AgentProviders.Normalize(r.Provider));
        r.Provider = "codex";
        var again = JsonSerializer.Deserialize<RepositoryConfig>(JsonSerializer.Serialize(r))!;
        Assert.Equal("codex", again.Provider);
    }
}
