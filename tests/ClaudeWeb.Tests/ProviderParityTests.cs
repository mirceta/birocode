using System.Text.Json;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using Xunit;
using System.Diagnostics;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Repositories;
using ClaudeWeb.Services.Tools;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Monitoring;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Tests;

[CollectionDefinition("provider-parity", DisableParallelization = true)]
public class ProviderParityCollection { }

[Collection("provider-parity")]
public sealed class ProviderParityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cw-parity-" + Guid.NewGuid().ToString("N"));
    private readonly string? _oldHome = Environment.GetEnvironmentVariable("CODEX_HOME");
    private readonly string _id = Guid.NewGuid().ToString();
    private readonly SessionService _sessions = new(new Logger());
    private string Cwd => Path.Combine(_root, "repo");
    private string Rollout => Path.Combine(_root, "sessions", "2026", "09", "07", "rollout-" + _id + ".jsonl");
    public ProviderParityTests()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Rollout)!);
        Directory.CreateDirectory(Cwd);
        Environment.SetEnvironmentVariable("CODEX_HOME", _root);
        Append(new { type = "session_meta", payload = new { id = _id, cwd = Cwd }, timestamp = "2026-09-07T10:00:00Z" });
        Message("user", "Remember cobalt");
        Append(new { type = "event_msg", payload = new { type = "user_message", message = "Remember cobalt" } });
        Message("assistant", "I remember cobalt");
        Append(new { type = "response_item", payload = new { type = "function_call", call_id = "call-1", name = "exec_command", arguments = "{\"cmd\":\"echo cobalt\"}" } });
        Append(new { type = "response_item", payload = new { type = "function_call_output", call_id = "call-1", output = "cobalt" } });
    }
    private void Append(object row) => File.AppendAllText(Rollout, JsonSerializer.Serialize(row) + "\n");
    private void Message(string role, string text) => Append(new { type = "response_item", timestamp = "2026-09-07T10:01:00Z",
        payload = new { type = "message", role, content = new[] { new { type = role == "user" ? "input_text" : "output_text", text } } } });

    [Fact]
    public void Codex_reload_lists_scoped_messages_without_duplicate_event_copies()
    {
        Assert.Equal(new[] { "Remember cobalt", "I remember cobalt" }, _sessions.GetMessages(Cwd, _id).Select(m => m.Text));
        var summary = Assert.Single(_sessions.ListSessions(Cwd));
        Assert.Equal(_id, summary.Id);
        Assert.Equal("codex", summary.Provider);
        Assert.Empty(_sessions.ListSessions(Path.Combine(_root, "another-repo")));
        Assert.False(SessionOwnership.BelongsTo("codex", _id, Path.Combine(_root, "another-repo")));
        Assert.True(SessionOwnership.BelongsTo("codex", _id, Cwd));
    }

    [Fact]
    public void Tool_results_survive_reload_and_belong_to_the_user_turn()
    {
        var tool = Assert.Single(_sessions.GetToolCallHistory(Cwd, _id));
        Assert.Equal("cobalt", tool.Result);
        Assert.Equal("echo cobalt", tool.Input!["cmd"]!.GetValue<string>());
        Assert.Equal(1, tool.Turn);
        Assert.Equal("Remember cobalt", tool.TurnPrompt);
        Assert.Equal("cobalt", Assert.Single(_sessions.GetToolCalls(Cwd, _id)).Preview);
    }

    [Fact]
    public void Incremental_reply_reads_recover_after_corruption_and_expose_loop_sentinel()
    {
        _sessions.GetMessages(Cwd, _id);
        var parses = _sessions.MessageParses;
        _sessions.GetMessages(Cwd, _id);
        Assert.Equal(parses, _sessions.MessageParses);
        File.AppendAllText(Rollout, "\0\0broken\n");
        Message("assistant", "LOOP_DONE");
        Assert.Equal("LOOP_DONE", _sessions.GetMessages(Cwd, _id).Last().Text);
        Assert.Equal("LOOP_DONE", _sessions.GetActivity(Cwd, _id)!.Activity);
    }

    [Fact]
    public void Handoff_preserves_display_history_and_hides_injected_prompt_wrapper()
    {
        var before = new List<ChatMessage> { new("user", "Earlier requirement"), new("assistant", "Earlier result") };
        var prompt = ConversationHandoff.BuildPrompt(before, "Continue", out var truncated);
        Assert.False(truncated);
        ConversationHandoff.Save(Cwd, _id, new(Guid.NewGuid().ToString(), "codex", before, [], "Continue", false));
        Message("user", prompt);
        var loaded = new SessionService(new Logger()).GetMessages(Cwd, _id);
        Assert.Equal("Earlier requirement", loaded[0].Text);
        Assert.Contains(loaded, m => m.Synthetic && m.Text.StartsWith("Continuing with codex"));
        Assert.Equal("Continue", loaded.Last().Text);
        Assert.DoesNotContain(loaded, m => m.Text.Contains("<prior_conversation>"));
    }

    [Fact]
    public void Failed_native_tool_result_is_not_reported_as_success_after_reload()
    {
        Append(new { type = "response_item", payload = new { type = "function_call_output", call_id = "call-1", output = "Process exited with code 7" } });
        Assert.False(Assert.Single(_sessions.GetToolCalls(Cwd, _id)).Ok);
    }

    [Fact]
    public async Task Late_process_error_overrides_earlier_done_event()
    {
        var run = new RunSession("fixture");
        await run.EmitAsync(new { type = "done" });
        await run.EmitAsync(new { type = "error", message = "CLI exited unsuccessfully" });
        run.Complete();
        Assert.Equal("error", run.Status);
    }

    [Fact]
    public void Oversized_handoff_is_bounded_and_discloses_omission()
    {
        var prompt = ConversationHandoff.BuildPrompt(new[] { new ChatMessage("user", new string('x', 80000)) }, "Continue", out var truncated);
        Assert.True(truncated);
        Assert.True(prompt.Length < 13000);
        Assert.Contains("Older conversation omitted", prompt);
        Assert.EndsWith("Continue", prompt);
    }

    [Fact]
    public void Mcp_credentials_never_enter_argv_and_names_do_not_collide()
    {
        var json = """{"mcpServers":{"a-b":{"command":"server","env":{"API_KEY":"secret-one"}},"a_b":{"url":"http://localhost/mcp","headers":{"X-Api-Key":"secret-two"}}}}""";
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(new("q", null, Cwd, null, false, json, null, false, null));
        Assert.DoesNotContain(psi.ArgumentList, a => a.Contains("secret-one") || a.Contains("secret-two"));
        Assert.Equal("secret-one", psi.Environment["API_KEY"]);
        Assert.Contains(psi.Environment, p => p.Value == "secret-two");
        Assert.Contains(psi.ArgumentList, a => a.StartsWith("mcp_servers.'a-b'."));
        Assert.Contains(psi.ArgumentList, a => a.StartsWith("mcp_servers.a_b.env_http_headers."));
    }

    [Fact]
    public void Long_handoff_exports_earlier_requirements_without_truncating_current_request()
    {
        var messages = new[] { new ChatMessage("user", "Keep the legacy endpoint." + new string('x', 20000)) };
        var path = ConversationHandoff.Export(Cwd, messages);
        try
        {
            var prompt = ConversationHandoff.BuildPrompt(messages, "Continue with the migration.", out var truncated, path);
            Assert.True(truncated);
            Assert.Contains(JsonSerializer.Serialize(path), prompt);
            Assert.DoesNotContain("Keep the legacy endpoint.", prompt);
            Assert.Contains("Keep the legacy endpoint.", File.ReadAllText(path));
            Assert.Equal("Continue with the migration.", ConversationHandoff.VisiblePrompt(prompt));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task Shared_runner_reconciles_dispatch_model_tools_handoff_and_noisy_stderr()
    {
        var logger = new Logger();
        var repos = new RepositoryRegistry(new AppConfig { WorkingDirectory = Cwd }, logger, _root);
        var repo = repos.GetAll().Single();
        repos.SetProvider(repo.Id, "claude", "claude-fixture");
        var server = Path.Combine(_root, "probe.mjs");
        File.WriteAllText(server, "fixture");
        var tools = new ToolsConfigStore(logger, _root);
        tools.SetHost(server);
        tools.SetBirokrat(repo.Id, true, "fixture-key", "http://localhost", []);
        var adapter = new FixtureAdapter();
        var feed = new HarnessEventFeed();
        var runner = new CliRunnerService(logger, new CallLog(), new ActivityLog(logger, _root), null!, feed,
            new AgentProviderRegistry(new[] { adapter }), _sessions, repos, tools);
        var events = new List<JsonElement>();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        await runner.RunAsync("Continue the task", _id, Cwd, repoId: repo.Id, provider: "codex", ct: timeout.Token,
            emit: e => { events.Add(JsonSerializer.SerializeToElement(e)); return Task.CompletedTask; });
        Assert.NotNull(adapter.Spec);
        Assert.Null(adapter.Spec!.SessionId);
        Assert.Equal("claude-fixture", adapter.Spec.Model);
        Assert.Contains("Remember cobalt", adapter.Spec.Message);
        Assert.Contains("fixture-key", adapter.Spec.McpConfigJson);
        Assert.False(File.Exists(adapter.Spec.McpConfigPath));
        Assert.Contains(events, e => e.GetProperty("type").GetString() == "handoff");
        Assert.Contains(events, e => e.GetProperty("type").GetString() == "done");
        Assert.DoesNotContain(events, e => e.GetProperty("type").GetString() == "error");
        Assert.NotNull(ConversationHandoff.Read(Cwd, adapter.Id));
        Assert.Equal(2, feed.Read(-1).Events.Count);
    }

    private sealed class FixtureAdapter : IAgentCliAdapter
    {
        public string Provider => "claude";
        public string CliLabel => "fixture";
        public TurnSpec? Spec;
        public readonly string Id = Guid.NewGuid().ToString();
        public string DisplayCommand(TurnSpec spec) => "fixture";
        public ProcessStartInfo CreateProcessInfo(TurnSpec spec)
        {
            Spec = spec;
            var psi = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
            psi.ArgumentList.Add("-NoProfile"); psi.ArgumentList.Add("-NonInteractive"); psi.ArgumentList.Add("-Command");
            psi.ArgumentList.Add("[Console]::In.ReadToEnd() | Out-Null; [Console]::Error.Write(('x' * 150000)); [Console]::Out.WriteLine('ready')");
            return psi;
        }
        public async Task TranslateLineAsync(string line, TurnSink sink)
        {
            sink.Record.SessionId = Id; sink.OnSessionId(Id);
            await sink.Emit(new { type = "session", sessionId = Id });
            await sink.Emit(new { type = "done", sessionId = Id });
        }
    }

    [Fact]
    public void Conflicting_environment_uses_private_config_proxy_when_run_by_harness()
    {
        var json = """{"mcpServers":{"one":{"command":"server","env":{"KEY":"a"}},"two":{"command":"server","env":{"KEY":"b"}}}}""";
        var config = Path.Combine(_root, "mcp.json");
        File.WriteAllText(config, json);
        var psi = new CodexCliAdapter(new Logger()).CreateProcessInfo(new("q", null, Cwd, null, false, json, config, false, null));
        Assert.Equal(2, psi.ArgumentList.Count(a => a.Contains("--mcp-stdio-proxy")));
        Assert.Equal("a", McpStdioProxy.CreateProcessInfo(config, "one").Environment["KEY"]);
        Assert.Equal("b", McpStdioProxy.CreateProcessInfo(config, "two").Environment["KEY"]);
    }

    [Fact]
    public void Windows_resolver_finds_vendor_executable_instead_of_multiline_truncating_shim()
    {
        if (!OperatingSystem.IsWindows()) return;
        var oldPath = Environment.GetEnvironmentVariable("PATH");
        var vendor = Path.Combine(_root, "node_modules", "@openai", "codex", "node_modules", "platform", "vendor", "bin", "codex.exe");
        Directory.CreateDirectory(Path.GetDirectoryName(vendor)!);
        File.WriteAllText(vendor, "fixture");
        File.WriteAllText(Path.Combine(_root, "codex.cmd"), "fixture");
        try
        {
            Environment.SetEnvironmentVariable("PATH", _root);
            Assert.Equal(vendor, CliExeResolver.Resolve("codex", Path.Combine("node_modules", "@openai", "codex", "bin", "codex.exe")));
        }
        finally { Environment.SetEnvironmentVariable("PATH", oldPath); }
    }

    [Fact]
    public void Conflicting_mcp_environment_fails_explicitly_instead_of_using_wrong_credentials()
    {
        var json = """{"mcpServers":{"one":{"command":"server","env":{"KEY":"a"}},"two":{"command":"server","env":{"KEY":"b"}}}}""";
        Assert.Throws<InvalidOperationException>(() => new CodexCliAdapter(new Logger()).CreateProcessInfo(new("q", null, Cwd, null, false, json, null, false, null)));
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("CODEX_HOME", _oldHome);
        // _root is an explicitly created GUID-named test workspace under the temp directory.
        Directory.Delete(_root, true);
    }
}
